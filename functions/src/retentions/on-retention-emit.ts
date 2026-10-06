import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { readCertificatePassword } from '../utils/cert-password';
import { getStorage } from 'firebase-admin/storage';

import { generateRetentionXmlInternal } from './generate-retention-xml';
import { generateRetentionPdfInternal } from './generate-retention-pdf';
import { sendRetentionEmailInternal }   from './send-retention-email';
import { signXmlContent }               from '../utils/sign-xml-helper';
import { sendToSriInternal }            from '../invoices/send-to-sri';
import { isElectronicInvoicingEnabled, SRI_NOT_REQUIRED } from '../utils/electronic-invoicing';

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

  // La contraseña del certificado, de Secret Manager. El campo viejo de
  // Firestore va como puente: si esta empresa aún no tiene secreto, se migra.
  const companySnap = await db.doc(`companies/${companyId}`).get();
  const legacy: string | undefined = (companySnap.data() as any)?.['sri']?.['certificatePassword'];
  const certPassword = await readCertificatePassword(companyId, legacy);
  if (!certPassword) {
    console.warn('[on-retention-emit] Sin contraseña de certificado — se intenta con vacía.');
  }

  // Sign using unified XAdES-BES helper
  const signedXml = signXmlContent(xmlContent, certBuffer, certPassword);
  console.log('[on-retention-emit] XML firmado, longitud:', signedXml.length);

  // Upload signed XML and update Firestore
  const signedPath = `companies/${companyId}/xml/ret-${retentionId}-signed.xml`;
  await bucket.file(signedPath).save(Buffer.from(signedXml, 'utf8'), {
    metadata: { contentType: 'application/xml' },
  });

  const signedFile = bucket.file(signedPath);
  await signedFile.makePublic();
  const signedUrl = `https://storage.googleapis.com/${bucket.name}/${signedPath}`;

  await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
    xmlUrl:    signedUrl,
    sriStatus: 'signed',
    updatedAt: now,
  });
  console.log('[on-retention-emit] XML firmado OK.');
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const onRetentionEmit = onDocumentWritten(
  'companies/{companyId}/retentions/{retentionId}',
  async (event) => {
    if (!event.data?.after.exists) return;

    const before = event.data.before.exists ? event.data.before.data() as Record<string, any> : undefined;
    const after  = event.data.after.data() as Record<string, any>;

    // Emitida y sin estado del SRI: se procesa. Igual que onInvoiceEmit desde
    // 2026-09-24: así «Reenviar al SRI» (borrar sriStatus) vuelve a disparar el
    // trámite; antes solo entraba al PASAR a 'issued' y una rechazada no se
    // podía reintentar. Lo primero que se hace es marcarla 'pending', y con eso
    // las escrituras siguientes ya no entran aquí.
    if (after['status'] !== 'issued' || after['sriStatus']) return;
    if (before?.['status'] === 'issued') console.log('[onRetentionEmit] Reintento de una retención ya emitida.');

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

    // ── Contador de uso (no bloqueante) ──────────────────────────────────────
    const usageNow = new Date();
    const period   = `${usageNow.getFullYear()}-${String(usageNow.getMonth() + 1).padStart(2, '0')}`;
    const usageRef = db.doc(`companies/${companyId}/usage/${period}`);

    try {
      await db.runTransaction(async tx => {
        const snap = await tx.get(usageRef);
        const cur  = snap.exists ? snap.data()! : {};
        tx.set(usageRef, {
          retentionsEmitted:   ((cur['retentionsEmitted']   as number) ?? 0) + 1,
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
      console.error('[onRetentionEmit] Error contador retenciones:', e);
    }

    // ── Plan sin facturación electrónica ────────────────────────────────────
    // Antes esta función no verificaba planFeatures.electronicInvoicing en
    // absoluto: siempre intentaba firmar y enviar la retención al SRI, lo
    // que para una empresa sin ese feature terminaba en un 'rejected' real
    // (falla de conexión/certificado) en vez de reconocer que el SRI
    // sencillamente no aplica. generateJournalEntryFromRetention no exige
    // sriStatus === 'authorized' (solo status === 'issued'), así que el
    // asiento contable de la retención no dependía de esto — pero sí se
    // intentaban llamadas SRI innecesarias y el error quedaba mal
    // etiquetado en el documento.
    const companySnap = await db.doc(`companies/${companyId}`).get();
    const sriEnabled  = isElectronicInvoicingEnabled(companySnap.data());

    if (!sriEnabled) {
      console.log('[onRetentionEmit] electronicInvoicing deshabilitado en el plan — modo sin SRI:', { companyId, retentionId });
      await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
        sriStatus: SRI_NOT_REQUIRED, updatedAt: admin.firestore.Timestamp.now(),
      });
      try {
        await generateRetentionPdfInternal(retentionId, companyId);
        console.log('[onRetentionEmit] PDF (modo sin SRI) generado OK.');
      } catch (pdfErr) {
        console.error('[onRetentionEmit] Error generando PDF en modo sin SRI (no crítico):', pdfErr);
      }
      // No se envía email: sendRetentionEmailInternal exige sriStatus === 'authorized'.
      return;
    }

    try {
      console.log('[onRetentionEmit] Paso 1/3 — Generando XML...');
      await generateRetentionXmlInternal(retentionId, companyId);

      console.log('[onRetentionEmit] Paso 2/3 — Firmando XML...');
      await signRetentionXml(retentionId, companyId);

      console.log('[onRetentionEmit] Paso 3/3 — Enviando al SRI...');
      // El envío común (invoices/send-to-sri.ts): ya trata el ambiente '1' como
      // pruebas, la «CLAVE ACCESO REGISTRADA» (43) y los reintentos de red, que
      // la copia propia de este archivo no tenía (2026-10-06).
      const result = await sendToSriInternal(retentionId, companyId, 'retention');
      console.log('[onRetentionEmit] Pipeline completado. sriStatus:', result.sriStatus);

      if (result.sriStatus === 'authorized') {
        // Se espera: una promesa suelta muere cuando la function termina, y el
        // RIDE y el correo quedaban a medias.
        try {
          await generateRetentionPdfInternal(retentionId, companyId);
          await sendRetentionEmailInternal(retentionId, companyId);
        } catch (err) {
          console.warn('[onRetentionEmit] RIDE o correo (no crítico):', err);
        }
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
