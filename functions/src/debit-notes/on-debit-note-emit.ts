import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import axios from 'axios';

import { generateDebitNoteXmlInternal }  from './generate-debit-note-xml';
import { generateDebitNotePdfInternal }  from './generate-debit-note-pdf';
import { sendDebitNoteEmailInternal }    from './send-debit-note-email';
import { signXmlContent }                from '../utils/sign-xml-helper';
import { isElectronicInvoicingEnabled, SRI_NOT_REQUIRED } from '../utils/electronic-invoicing';

// ─── SRI defaults ─────────────────────────────────────────────────────────────

const SRI_DEFAULTS = {
  testing: {
    receptionUrl:    'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    authorizationUrl:'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
  production: {
    receptionUrl:    'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    authorizationUrl:'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
};

// ─── Sign debit note XML ──────────────────────────────────────────────────────

async function signDebitNoteXml(debitNoteId: string, companyId: string): Promise<void> {
  const db     = admin.firestore();
  const bucket = getStorage().bucket();
  const now    = admin.firestore.Timestamp.now();

  // Download unsigned XML
  const xmlPath = `companies/${companyId}/xml/dn-${debitNoteId}.xml`;
  let xmlBuffer: Buffer;
  try {
    [xmlBuffer] = await bucket.file(xmlPath).download();
  } catch {
    throw new Error('XML de nota de débito no encontrado en Storage.');
  }
  const xmlContent = xmlBuffer.toString('utf8');

  // Download .p12 certificate
  const certPath = `companies/${companyId}/certificates/signing.p12`;
  let certBuffer: Buffer;
  try {
    [certBuffer] = await bucket.file(certPath).download();
  } catch {
    throw new Error('Certificado .p12 no encontrado en Storage.');
  }

  // Resolve cert password from company sri config (Secret Manager is a future task)
  const companySnap = await db.doc(`companies/${companyId}`).get();
  const certPassword: string = (companySnap.data() as any)?.['sri']?.['certPassword'] ?? '';
  if (!certPassword) {
    console.warn('[on-debit-note-emit] certPassword no configurado en company.sri — se intenta con contraseña vacía.');
  }

  // Sign using unified XAdES-BES helper
  const signedXml = signXmlContent(xmlContent, certBuffer, certPassword);
  console.log('[on-debit-note-emit] XML firmado, longitud:', signedXml.length);

  // Upload signed XML and update Firestore
  const signedPath = `companies/${companyId}/xml/dn-${debitNoteId}-signed.xml`;
  await bucket.file(signedPath).save(Buffer.from(signedXml, 'utf8'), {
    metadata: { contentType: 'application/xml' },
  });
  const signedFile = bucket.file(signedPath);
  await signedFile.makePublic();
  const url = `https://storage.googleapis.com/${bucket.name}/${signedPath}`;
  await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
    xmlUrl: url, sriStatus: 'signed', updatedAt: now,
  });
}

// ─── Send to SRI ──────────────────────────────────────────────────────────────

async function sendDebitNoteToSri(debitNoteId: string, companyId: string): Promise<{ sriStatus: string }> {
  const db     = admin.firestore();
  const bucket = getStorage().bucket();
  const now    = admin.firestore.Timestamp.now();

  const dnSnap = await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).get();
  if (!dnSnap.exists) throw new Error(`Nota de débito no encontrada: ${debitNoteId}`);
  const accessKey: string = (dnSnap.data() as any)['accessKey'];
  if (!accessKey) throw new Error('Nota sin clave de acceso.');

  const companySnap = await db.doc(`companies/${companyId}`).get();
  const environment: 'testing' | 'production' = (companySnap.data() as any)?.['sri']?.['environment'] ?? 'testing';
  const platformSnap = await db.doc('platform/defaults/sriConfig/data').get();
  const platformData = platformSnap.exists ? (platformSnap.data() as any) : null;
  const endpoints    = platformData?.endpoints?.[environment] ?? SRI_DEFAULTS[environment];

  const signedPath = `companies/${companyId}/xml/dn-${debitNoteId}-signed.xml`;
  let buf: Buffer;
  try { [buf] = await bucket.file(signedPath).download(); }
  catch { throw new Error('XML firmado de nota de débito no encontrado.'); }
  const xmlBase64 = buf.toString('base64');

  // Reception
  const recUrl  = endpoints.receptionUrl.replace('?wsdl', '');
  const recSoap = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion"><xml>${xmlBase64}</xml></ns2:validarComprobante></soap:Body></soap:Envelope>`;
  const recRes  = await axios.post(recUrl, recSoap, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' }, timeout: 30000,
  });
  const recStr = String(recRes.data);
  if (recStr.includes('DEVUELTA')) {
    const msg = recStr.match(/<mensaje>(.*?)<\/mensaje>/g)?.map(m => m.replace(/<\/?mensaje>/g, '')).join('; ') ?? 'Devuelta por SRI';
    await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
      sriStatus: 'rejected', sriError: msg, updatedAt: now,
    });
    return { sriStatus: 'rejected' };
  }

  // Authorization
  const authUrl  = endpoints.authorizationUrl.replace('?wsdl', '');
  const authSoap = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${accessKey}</claveAccesoComprobante></ns2:autorizacionComprobante></soap:Body></soap:Envelope>`;
  const authRes  = await axios.post(authUrl, authSoap, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' }, timeout: 30000,
  });
  const authStr  = String(authRes.data);
  const estado   = (authStr.match(/<estado>(.*?)<\/estado>/)?.[1] ?? '').toUpperCase();

  if (estado === 'AUTORIZADO') {
    const authNum  = authStr.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/)?.[1] ?? '';
    const authDate = authStr.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/)?.[1];
    await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
      sriStatus: 'authorized', authorizationNumber: authNum,
      authorizedAt: admin.firestore.Timestamp.fromDate(authDate ? new Date(authDate) : new Date()),
      sriError: null, updatedAt: now,
    });
    return { sriStatus: 'authorized' };
  }

  const sriMsg = authStr.match(/<mensaje>(.*?)<\/mensaje>/)?.[1] ?? `Estado: ${estado}`;
  await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
    sriStatus: 'rejected', sriError: sriMsg, updatedAt: now,
  });
  return { sriStatus: 'rejected' };
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const onDebitNoteEmit = onDocumentWritten(
  'companies/{companyId}/debitNotes/{debitNoteId}',
  async (event) => {
    if (!event.data?.after.exists) return;

    const before = event.data.before.exists ? event.data.before.data() as Record<string, any> : undefined;
    const after  = event.data.after.data() as Record<string, any>;

    const statusChangedToIssued = before?.['status'] !== 'issued' && after['status'] === 'issued';
    const sriNotYetStarted      = !after['sriStatus'];
    if (!statusChangedToIssued || !sriNotYetStarted) return;

    const { companyId, debitNoteId } = event.params;
    const db = admin.firestore();
    console.log('[onDebitNoteEmit] Nueva emisión:', { companyId, debitNoteId });

    try {
      await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
        sriStatus: 'pending', updatedAt: admin.firestore.Timestamp.now(),
      });
    } catch (err) {
      console.error('[onDebitNoteEmit] Error marcando pending:', err); return;
    }

    // ── Contador de uso (no bloqueante) ──────────────────────────────────────
    const usageNow = new Date();
    const period   = `${usageNow.getFullYear()}-${String(usageNow.getMonth() + 1).padStart(2, '0')}`;
    const usageRef = db.doc(`companies/${companyId}/usage/${period}`);

    try {
      await db.runTransaction(async tx => {
        const snap = await tx.get(usageRef);
        const cur  = snap.exists ? snap.data()! : {};
        tx.set(usageRef, {
          debitNotesEmitted:   ((cur['debitNotesEmitted']   as number) ?? 0) + 1,
          totalSriDocsEmitted: ((cur['totalSriDocsEmitted'] as number) ?? 0) + 1,
          updatedAt: admin.firestore.Timestamp.now(),
          ...(snap.exists ? {} : {
            period,
            year:      usageNow.getFullYear(),
            month:     usageNow.getMonth() + 1,
            createdAt: admin.firestore.Timestamp.now(),
          }),
        }, { merge: true });
      });
    } catch (e) {
      console.error('[onDebitNoteEmit] Error contador notas de débito:', e);
    }

    // ── Plan sin facturación electrónica ────────────────────────────────────
    // Igual que en facturas y retenciones: si el plan tiene electronicInvoicing
    // en false, la nota de débito NO debe intentar firmar/enviar al SRI. Antes
    // este trigger no tenía ningún chequeo de plan y siempre intentaba el
    // pipeline SRI completo, que además de innecesario terminaba en
    // sriStatus: 'rejected' (falla real de conexión/certificado) — y
    // generateJournalEntryFromDebitNoteInternal exige sriStatus === 'authorized'
    // || 'not_required', así que el asiento contable tampoco se generaba.
    const companySnap = await db.doc(`companies/${companyId}`).get();
    const sriEnabled  = isElectronicInvoicingEnabled(companySnap.data());

    if (!sriEnabled) {
      console.log('[onDebitNoteEmit] electronicInvoicing deshabilitado en el plan — modo sin SRI:', { companyId, debitNoteId });
      await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
        sriStatus: SRI_NOT_REQUIRED, updatedAt: admin.firestore.Timestamp.now(),
      });
      try {
        await generateDebitNotePdfInternal(debitNoteId, companyId);
        console.log('[onDebitNoteEmit] PDF (modo sin SRI) generado OK.');
      } catch (pdfErr) {
        console.error('[onDebitNoteEmit] Error generando PDF en modo sin SRI (no crítico):', pdfErr);
      }
      // No se envía email: sendDebitNoteEmailInternal exige sriStatus === 'authorized'.
      return;
    }

    try {
      console.log('[onDebitNoteEmit] Paso 1/3 — XML...');
      await generateDebitNoteXmlInternal(debitNoteId, companyId);

      console.log('[onDebitNoteEmit] Paso 2/3 — Firma...');
      await signDebitNoteXml(debitNoteId, companyId);

      console.log('[onDebitNoteEmit] Paso 3/3 — SRI...');
      const result = await sendDebitNoteToSri(debitNoteId, companyId);
      console.log('[onDebitNoteEmit] Completado. sriStatus:', result.sriStatus);

      if (result.sriStatus === 'authorized') {
        // PDF + email en paralelo, no bloqueante para el trigger principal
        Promise.all([
          generateDebitNotePdfInternal(debitNoteId, companyId)
            .then(() => sendDebitNoteEmailInternal(debitNoteId, companyId))
            .catch(err => console.warn('[onDebitNoteEmit] Post-auth tasks error:', err)),
        ]);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      console.error('[onDebitNoteEmit] Error en pipeline:', err);
      try {
        await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
          sriStatus: 'rejected', sriError: msg, updatedAt: admin.firestore.Timestamp.now(),
        });
      } catch {}
    }
  }
);
