import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { readCertificatePassword } from '../utils/cert-password';
import { getStorage } from 'firebase-admin/storage';

import { generateDebitNoteXmlInternal }  from './generate-debit-note-xml';
import { generateDebitNotePdfInternal }  from './generate-debit-note-pdf';
import { sendDebitNoteEmailInternal }    from './send-debit-note-email';
import { signXmlContent }                from '../utils/sign-xml-helper';
import { sendToSriInternal }             from '../invoices/send-to-sri';
import { isElectronicInvoicingEnabled, SRI_NOT_REQUIRED } from '../utils/electronic-invoicing';

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
  // Ojo: hasta el 2026-09-23 esto leía `sri.certPassword`, un campo que no
  // existe —el que se guardaba era `certificatePassword`—, así que firmaba
  // siempre con contraseña vacía. Ahora sale de Secret Manager.
  const legacy: string | undefined = (companySnap.data() as any)?.['sri']?.['certificatePassword'];
  const certPassword = await readCertificatePassword(companyId, legacy);
  if (!certPassword) {
    console.warn('[on-debit-note-emit] Sin contraseña de certificado — se intenta con vacía.');
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

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const onDebitNoteEmit = onDocumentWritten(
  'companies/{companyId}/debitNotes/{debitNoteId}',
  async (event) => {
    if (!event.data?.after.exists) return;

    const before = event.data.before.exists ? event.data.before.data() as Record<string, any> : undefined;
    const after  = event.data.after.data() as Record<string, any>;

    // Emitida y sin estado del SRI: la emisión nueva y también el reintento
    // (borrar sriStatus vuelve a disparar el envío), como en las retenciones.
    if (after['status'] !== 'issued' || after['sriStatus']) return;
    if (before?.['status'] === 'issued') console.log('[onDebitNoteEmit] Reintento de una nota ya emitida.');

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
      // El envío común (send-to-sri.ts): reintentos, «CLAVE ACCESO REGISTRADA»
      // y mensajes del SRI, igual que facturas, NC y retenciones.
      const result = await sendToSriInternal(debitNoteId, companyId, 'debitNote');
      console.log('[onDebitNoteEmit] Completado. sriStatus:', result.sriStatus);

      if (result.sriStatus === 'authorized') {
        // Se espera: una promesa suelta muere cuando la function termina.
        try {
          await generateDebitNotePdfInternal(debitNoteId, companyId);
          await sendDebitNoteEmailInternal(debitNoteId, companyId);
        } catch (err) {
          console.warn('[onDebitNoteEmit] RIDE o correo (no crítico):', err);
        }
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
