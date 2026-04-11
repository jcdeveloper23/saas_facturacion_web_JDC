import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import axios from 'axios';

import { generateRetentionXmlInternal } from './generate-retention-xml';
import { generateRetentionPdfInternal } from './generate-retention-pdf';
import { sendRetentionEmailInternal }   from './send-retention-email';
import { signXmlContent }               from '../utils/sign-xml-helper';

// ─── Shared SRI helpers (duplicated from invoices to keep modules independent) ─

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

async function signRetentionXml(retentionId: string, companyId: string): Promise<void> {
  const db     = admin.firestore();
  const bucket = getStorage().bucket();
  const now    = admin.firestore.Timestamp.now();

  // Download unsigned XML
  const xmlPath = `companies/${companyId}/xml/ret-${retentionId}.xml`;
  let xmlBuffer: Buffer;
  try {
    [xmlBuffer] = await bucket.file(xmlPath).download();
  } catch {
    throw new Error('XML de retención no encontrado en Storage.');
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
    console.warn('[on-retention-emit] certPassword no configurado en company.sri — se intenta con contraseña vacía.');
  }

  // Sign using unified XAdES-BES helper
  const signedXml = signXmlContent(xmlContent, certBuffer, certPassword);
  console.log('[on-retention-emit] XML firmado, longitud:', signedXml.length);

  // Upload signed XML and update Firestore
  const signedPath = `companies/${companyId}/xml/ret-${retentionId}-signed.xml`;
  await bucket.file(signedPath).save(Buffer.from(signedXml, 'utf8'), {
    metadata: { contentType: 'application/xml' },
  });

  const [signedUrl] = await bucket.file(signedPath).getSignedUrl({
    action:  'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
    xmlUrl:    signedUrl,
    sriStatus: 'signed',
    updatedAt: now,
  });
  console.log('[on-retention-emit] XML firmado OK.');
}

async function sendRetentionToSri(retentionId: string, companyId: string): Promise<{ sriStatus: string }> {
  const db     = admin.firestore();
  const bucket = getStorage().bucket();
  const now    = admin.firestore.Timestamp.now();

  const retSnap = await db.doc(`companies/${companyId}/retentions/${retentionId}`).get();
  if (!retSnap.exists) throw new Error(`Retención no encontrada: ${retentionId}`);
  const accessKey: string = (retSnap.data() as any)['accessKey'];
  if (!accessKey) throw new Error('Retención sin clave de acceso.');

  const companySnap = await db.doc(`companies/${companyId}`).get();
  const environment: 'testing' | 'production' = (companySnap.data() as any)?.['sri']?.['environment'] ?? 'testing';

  const platformSnap  = await db.doc('platform/defaults/sriConfig/data').get();
  const platformData  = platformSnap.exists ? (platformSnap.data() as any) : null;
  const endpoints     = platformData?.endpoints?.[environment] ?? SRI_DEFAULTS[environment];

  // Download signed XML
  const signedPath = `companies/${companyId}/xml/ret-${retentionId}-signed.xml`;
  let signedBuffer: Buffer;
  try {
    [signedBuffer] = await bucket.file(signedPath).download();
  } catch {
    throw new Error('XML firmado de retención no encontrado en Storage.');
  }
  const xmlBase64 = signedBuffer.toString('base64');

  // SOAP reception
  const receptionUrl = endpoints.receptionUrl.replace('?wsdl', '');
  const receptionSoap = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion"><xml>${xmlBase64}</xml></ns2:validarComprobante></soap:Body></soap:Envelope>`;

  const receptionRes = await axios.post(receptionUrl, receptionSoap, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' }, timeout: 30000,
  });
  const receptionStr = String(receptionRes.data);

  if (receptionStr.includes('DEVUELTA')) {
    const mensajes = receptionStr.match(/<mensaje>(.*?)<\/mensaje>/g)?.map(m => m.replace(/<\/?mensaje>/g, '')).join('; ') ?? 'Comprobante devuelto por SRI';
    await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
      sriStatus: 'rejected', sriError: mensajes, updatedAt: now,
    });
    return { sriStatus: 'rejected' };
  }

  // SOAP authorization
  const authUrl  = endpoints.authorizationUrl.replace('?wsdl', '');
  const authSoap = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${accessKey}</claveAccesoComprobante></ns2:autorizacionComprobante></soap:Body></soap:Envelope>`;

  const authRes = await axios.post(authUrl, authSoap, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' }, timeout: 30000,
  });
  const authStr = String(authRes.data);
  const authNumMatch = authStr.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/);
  const estadoMatch  = authStr.match(/<estado>(.*?)<\/estado>/);
  const estado       = estadoMatch?.[1]?.toUpperCase() ?? '';

  if (estado === 'AUTORIZADO') {
    const authNumber = authNumMatch?.[1] ?? '';
    const authDateMatch = authStr.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/);
    const authorizedAt  = authDateMatch?.[1] ? new Date(authDateMatch[1]) : new Date();
    await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
      sriStatus: 'authorized', authorizationNumber: authNumber,
      authorizedAt: admin.firestore.Timestamp.fromDate(authorizedAt), sriError: null, updatedAt: now,
    });
    return { sriStatus: 'authorized' };
  }

  const sriMsg = authStr.match(/<mensaje>(.*?)<\/mensaje>/)?.[1] ?? `Estado SRI: ${estado}`;
  await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
    sriStatus: 'rejected', sriError: sriMsg, updatedAt: now,
  });
  return { sriStatus: 'rejected' };
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const onRetentionEmit = onDocumentUpdated(
  'companies/{companyId}/retentions/{retentionId}',
  async (event) => {
    const before = event.data?.before.data() as Record<string, any> | undefined;
    const after  = event.data?.after.data()  as Record<string, any> | undefined;
    if (!before || !after) return;

    const statusChangedToIssued = before['status'] !== 'issued' && after['status'] === 'issued';
    const sriNotYetStarted      = !after['sriStatus'];
    if (!statusChangedToIssued || !sriNotYetStarted) return;

    const { companyId, retentionId } = event.params;
    const db = admin.firestore();
    console.log('[onRetentionEmit] Nueva emisión:', { companyId, retentionId });

    try {
      await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
        sriStatus: 'pending', updatedAt: admin.firestore.Timestamp.now(),
      });
    } catch (err) {
      console.error('[onRetentionEmit] Error marcando pending:', err);
      return;
    }

    try {
      console.log('[onRetentionEmit] Paso 1/3 — Generando XML...');
      await generateRetentionXmlInternal(retentionId, companyId);

      console.log('[onRetentionEmit] Paso 2/3 — Firmando XML...');
      await signRetentionXml(retentionId, companyId);

      console.log('[onRetentionEmit] Paso 3/3 — Enviando al SRI...');
      const result = await sendRetentionToSri(retentionId, companyId);
      console.log('[onRetentionEmit] Pipeline completado. sriStatus:', result.sriStatus);

      if (result.sriStatus === 'authorized') {
        // Generate PDF and send email in parallel (non-blocking for main pipeline)
        Promise.all([
          generateRetentionPdfInternal(retentionId, companyId)
            .then(() => sendRetentionEmailInternal(retentionId, companyId))
            .catch(err => console.warn('[onRetentionEmit] Post-auth tasks error:', err)),
        ]);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      console.error('[onRetentionEmit] Error en pipeline:', err);
      try {
        await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
          sriStatus: 'rejected', sriError: msg, updatedAt: admin.firestore.Timestamp.now(),
        });
      } catch {}
    }
  }
);
