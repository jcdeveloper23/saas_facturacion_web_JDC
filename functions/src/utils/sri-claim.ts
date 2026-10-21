import * as admin from 'firebase-admin';

/**
 * Reclama un comprobante para enviarlo al SRI, en una transacción.
 *
 * Los triggers de emisión (`onInvoiceEmit`, `onRetentionEmit`,
 * `onDebitNoteEmit`) se disparan con cada escritura del documento. Si dos
 * escrituras llegan seguidas antes de que se marque `pending` —la creación y
 * un update inmediato, por ejemplo—, las dos ejecuciones ven el documento sin
 * `sriStatus` y las dos lo mandaban al SRI (factura 001-002-000001957 de
 * Weconnect Corp., 2026-10-21: dos envíos en paralelo y el uso del mes contado
 * dos veces). Marcar `pending` con un update suelto no lo evitaba: el update no
 * mira lo que hay.
 *
 * Aquí se relee el documento DENTRO de la transacción y solo se marca
 * `pending` si [canProcess] sigue siendo cierto sobre el dato fresco. Si dos
 * ejecuciones compiten, Firestore reintenta la segunda, que ya ve `pending` y
 * devuelve `false`.
 */
export async function claimSriProcessing(
  db: admin.firestore.Firestore,
  path: string,
  canProcess: (data: Record<string, any>) => boolean,
): Promise<boolean> {
  const ref = db.doc(path);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as Record<string, any>) : null;
    if (!data || !canProcess(data)) return false;
    tx.update(ref, { sriStatus: 'pending', updatedAt: admin.firestore.Timestamp.now() });
    return true;
  });
}

/** Emitido y sin estado del SRI: lo que exigen retenciones y notas de débito. */
export function isIssuedWithoutSriStatus(data: Record<string, any>): boolean {
  return data['status'] === 'issued' && !data['sriStatus'];
}
