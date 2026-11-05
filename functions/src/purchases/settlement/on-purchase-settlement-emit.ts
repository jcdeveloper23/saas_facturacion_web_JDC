// ─── onPurchaseSettlementEmit: XML → firma → SRI de la liquidación de compra ─
//
// 2026-11-05. Mismo patrón que `onDebitNoteEmit`. Se dispara con cada escritura
// de una compra, pero solo actúa sobre una liquidación nuestra (`issuedByCompany`,
// `sriDocumentType '03'`), en `status: 'sent'` y sin `sriStatus`: la emisión
// nueva y el reintento (borrar `sriStatus` vuelve a disparar el envío).
//
// Autorizada (o sin facturación electrónica en el plan) → `status: 'received'`.
// Desde ahí siguen los triggers de cualquier compra: `onPurchaseReceive` (las
// líneas no traen productId: no mueve stock, D-LC5) y el asiento de la compra.
// Rechazada → queda en `sent` con `sriStatus: 'rejected'` y no genera asiento.
//
// Pendiente (E1, siguiente paso): RIDE y correo al proveedor.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { claimSriProcessing } from '../../utils/sri-claim';
import { readCertificatePassword } from '../../utils/cert-password';
import { signXmlContent } from '../../utils/sign-xml-helper';
import { sendToSriInternal } from '../../invoices/send-to-sri';
import { isElectronicInvoicingEnabled, SRI_NOT_REQUIRED } from '../../utils/electronic-invoicing';
import { generateSettlementXmlInternal } from './generate-settlement-xml';
import { isSettlementReadyToEmit } from './settlement-logic';

async function signSettlementXml(purchaseId: string, companyId: string): Promise<void> {
  const db = admin.firestore();
  const bucket = getStorage().bucket();

  let xmlBuffer: Buffer;
  try {
    [xmlBuffer] = await bucket.file(`companies/${companyId}/xml/lc-${purchaseId}.xml`).download();
  } catch {
    throw new Error('XML de la liquidación no encontrado en Storage.');
  }
  let certBuffer: Buffer;
  try {
    [certBuffer] = await bucket.file(`companies/${companyId}/certificates/signing.p12`).download();
  } catch {
    throw new Error('Certificado .p12 no encontrado en Storage.');
  }
  const companySnap = await db.doc(`companies/${companyId}`).get();
  const legacy: string | undefined = (companySnap.data() as any)?.['sri']?.['certificatePassword'];
  const certPassword = await readCertificatePassword(companyId, legacy);
  if (!certPassword) console.warn('[onPurchaseSettlementEmit] Sin contraseña de certificado — se intenta con vacía.');

  const signedXml = signXmlContent(xmlBuffer.toString('utf8'), certBuffer, certPassword);
  const signedPath = `companies/${companyId}/xml/lc-${purchaseId}-signed.xml`;
  const signedFile = bucket.file(signedPath);
  await signedFile.save(Buffer.from(signedXml, 'utf8'), { metadata: { contentType: 'application/xml' } });
  await signedFile.makePublic(); // como el resto de comprobantes (decisión D4, abierta)
  await db.doc(`companies/${companyId}/purchases/${purchaseId}`).update({
    xmlUrl: `https://storage.googleapis.com/${bucket.name}/${signedPath}`,
    sriStatus: 'signed',
    updatedAt: admin.firestore.Timestamp.now(),
  });
}

/** Cuenta la liquidación en el uso del mes (no bloquea). */
async function countUsage(db: admin.firestore.Firestore, companyId: string): Promise<void> {
  const d = new Date();
  const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const ref = db.doc(`companies/${companyId}/usage/${period}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data()! : {};
    tx.set(ref, {
      purchaseSettlementsEmitted: ((cur['purchaseSettlementsEmitted'] as number) ?? 0) + 1,
      totalSriDocsEmitted: ((cur['totalSriDocsEmitted'] as number) ?? 0) + 1,
      updatedAt: admin.firestore.Timestamp.now(),
      ...(snap.exists ? {} : {
        period, year: d.getFullYear(), month: d.getMonth() + 1, createdAt: admin.firestore.Timestamp.now(),
      }),
    }, { merge: true });
  });
}

export const onPurchaseSettlementEmit = onDocumentWritten(
  'companies/{companyId}/purchases/{purchaseId}',
  async (event) => {
    if (!event.data?.after.exists) return;
    const after = event.data.after.data() as Record<string, any>;
    if (!isSettlementReadyToEmit(after)) return;

    const { companyId, purchaseId } = event.params;
    const db = admin.firestore();
    const path = `companies/${companyId}/purchases/${purchaseId}`;
    console.log('[onPurchaseSettlementEmit] Emisión:', { companyId, purchaseId });

    try {
      if (!(await claimSriProcessing(db, path, isSettlementReadyToEmit))) {
        console.log('[onPurchaseSettlementEmit] Ya la procesa otra ejecución — se omite.');
        return;
      }
    } catch (err) {
      console.error('[onPurchaseSettlementEmit] Error marcando pending:', err);
      return;
    }

    try {
      await countUsage(db, companyId);
    } catch (e) {
      console.error('[onPurchaseSettlementEmit] Error en el contador de uso:', e);
    }

    const companySnap = await db.doc(`companies/${companyId}`).get();
    if (!isElectronicInvoicingEnabled(companySnap.data())) {
      console.log('[onPurchaseSettlementEmit] Plan sin facturación electrónica — modo sin SRI.');
      await db.doc(path).update({
        sriStatus: SRI_NOT_REQUIRED, status: 'received', updatedAt: admin.firestore.Timestamp.now(),
      });
      return;
    }

    try {
      await generateSettlementXmlInternal(purchaseId, companyId);
      await signSettlementXml(purchaseId, companyId);
      const result = await sendToSriInternal(purchaseId, companyId, 'purchaseSettlement');
      console.log('[onPurchaseSettlementEmit] sriStatus:', result.sriStatus);
      if (result.sriStatus === 'authorized') {
        // Recibida: dispara onPurchaseReceive y, tras él, el asiento.
        await db.doc(path).update({ status: 'received', updatedAt: admin.firestore.Timestamp.now() });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      console.error('[onPurchaseSettlementEmit] Error en el pipeline:', err);
      try {
        await db.doc(path).update({ sriStatus: 'rejected', sriError: msg, updatedAt: admin.firestore.Timestamp.now() });
      } catch { /* nada más que hacer */ }
    }
  },
);
