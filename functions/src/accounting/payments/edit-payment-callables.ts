import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { requireCompanyRole } from '../../utils/callable-auth';
import { ROLES, fail, readCompanyId, readId, text } from '../advances/advance-callables';
import { ecuadorDay, parseEcuadorDate } from '../advances/advance-logic';
import { PAID_BY_CASH_VOUCHER } from '../cash-vouchers/cash-voucher-logic';
import {
  PAYMENT_SOURCES, PaymentSource, editableProblem, newDateProblem, sourceFields, targetDate, toDate,
} from './edit-payment-logic';

// ─── editPaymentDetails (2026-11-16) ──────────────────────────────────────────

/**
 * Corrige la fecha, la referencia o las notas de un cobro o pago ya
 * registrado: factura cobrada o compra pagada a mano, recibo de caja o
 * comprobante de egreso, anticipo (de cliente o a proveedor) o devolución de
 * anticipo. La forma de pago no se cambia. Ver edit-payment-logic.ts.
 *
 * Entrada: {companyId, source, id, date?: 'AAAA-MM-DD', reference?, notes?}.
 * Solo se cambia lo que llega. Con fecha distinta, el asiento del documento
 * (y la fecha de pago de las facturas o compras que saldó un comprobante) se
 * mueven en la misma transacción. Devuelve {ok: true, dateChanged}.
 */
export const editPaymentDetails = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth?.uid ?? 'system';

  const source = String(data.source ?? '') as PaymentSource;
  if (!PAYMENT_SOURCES.includes(source)) throw new HttpsError('invalid-argument', 'Tipo de documento desconocido.');
  const id = readId(data, 'id', 'el documento');
  const f = sourceFields(source);

  let nextDate: Date | null = null;
  if (data.date !== undefined && data.date !== null) {
    nextDate = parseEcuadorDate(data.date);
    if (!nextDate) throw new HttpsError('invalid-argument', 'La fecha va como AAAA-MM-DD.');
  }
  const hasReference = typeof data.reference === 'string';
  const hasNotes = typeof data.notes === 'string';
  if (!nextDate && !hasReference && !hasNotes) throw new HttpsError('invalid-argument', 'No hay nada que cambiar.');
  const reference = text(data.reference, 120);
  const notes = text(data.notes, 500);

  const company = db.doc(`companies/${companyId}`);
  const docRef = company.collection(f.collection).doc(id);

  return db.runTransaction(async (tx) => {
    // ── Lecturas (todas antes de escribir) ──
    const snap = await tx.get(docRef);
    const doc = snap.exists ? snap.data() as Record<string, any> : undefined;
    const problem = editableProblem(source, doc);
    if (problem) fail(problem);

    const current = toDate(doc![f.date]);
    const dateChanged = !!nextDate && (!current || ecuadorDay(current) !== ecuadorDay(nextDate));

    // Facturas o compras que saldó el comprobante: su fecha de pago lo sigue.
    const targets: Array<{ ref: admin.firestore.DocumentReference; doc: Record<string, any> | undefined;
      kind: 'invoice' | 'purchase' }> = [];
    let entryRef: admin.firestore.DocumentReference | null = null;
    const notBefore: Array<{ date: Date | null; label: string }> = [];
    const notAfter: Array<{ date: Date | null; label: string }> = [];

    if (dateChanged) {
      const entryId = typeof doc![f.entry] === 'string' ? doc![f.entry] as string : '';
      if (entryId && !entryId.includes('/')) {
        entryRef = company.collection('journal_entries').doc(entryId);
        const [entrySnap, reconciled] = await Promise.all([
          tx.get(entryRef), tx.get(company.collection('bank_reconciled_entries').doc(entryId)),
        ]);
        if (reconciled.exists) fail('El asiento está conciliado con el banco: primero deshaz la conciliación.');
        if (!entrySnap.exists) {
          entryRef = null;
        } else {
          const entry = entrySnap.data() as Record<string, any>;
          if (entry.status === 'cancelled' || entry.reversalEntryId) fail('El asiento está anulado: la fecha no se mueve.');
          const periodId = typeof entry.periodId === 'string' ? entry.periodId : '';
          if (periodId && !periodId.includes('/')) {
            const period = await tx.get(company.collection('accounting_periods').doc(periodId));
            const status = period.exists ? String(period.get('status') ?? '') : '';
            if (status && status !== 'open') {
              fail(`El ejercicio ${period.get('year') ?? ''} está ${status === 'closed' ? 'cerrado' : 'bloqueado'}: `
                + 'la fecha ya no se cambia.');
            }
          }
        }
      }

      if (source === 'invoice' || source === 'purchase') {
        notBefore.push({ date: targetDate(source, doc), label: source === 'invoice' ? 'la factura' : 'la compra' });
      } else if (source === 'cashVoucher') {
        for (const a of (doc!.applications as any[] | undefined) ?? []) {
          const kind = a?.targetType === 'purchase' ? 'purchase' : 'invoice';
          const tid = typeof a?.targetId === 'string' ? a.targetId : '';
          if (!tid || tid.includes('/')) continue;
          const ref = company.collection(kind === 'purchase' ? 'purchases' : 'invoices').doc(tid);
          const t = await tx.get(ref);
          const tdoc = t.exists ? t.data() as Record<string, any> : undefined;
          targets.push({ ref, doc: tdoc, kind });
          const num = String(tdoc?.fullNumber ?? a?.targetNumber ?? '');
          notBefore.push({ date: targetDate(kind, tdoc), label: `${kind === 'purchase' ? 'la compra' : 'la factura'} ${num}`.trim() });
        }
      } else if (source === 'advance') {
        // Lo que ya se hizo con el anticipo (aplicaciones, cruces, devoluciones).
        const moves = await tx.get(company.collection('advanceApplications').where('advanceId', '==', id));
        for (const m of moves.docs) {
          const md = m.data();
          if (md.isVoid === true || md.status === 'void') continue;
          const label = md.kind === 'refund' ? 'su devolución' : `su aplicación a ${md.targetNumber ?? 'un documento'}`;
          notAfter.push({ date: toDate(md.date), label });
        }
      } else if (source === 'refund') {
        const adv = typeof doc!.advanceId === 'string' && doc!.advanceId && !doc!.advanceId.includes('/')
          ? await tx.get(company.collection('advances').doc(doc!.advanceId)) : null;
        notBefore.push({ date: toDate(adv?.get('date')), label: `el anticipo ${doc!.advanceNumber ?? ''}`.trim() });
      }

      const dp = newDateProblem({ current, next: nextDate!, today: new Date(), notBefore, notAfter });
      if (dp) fail(dp);
    }

    // ── Escrituras ──
    const now = admin.firestore.Timestamp.now();
    const patch: Record<string, unknown> = { updatedAt: now, updatedBy: uid, lastEditedAt: now, lastEditedBy: uid };
    if (dateChanged) patch[f.date] = admin.firestore.Timestamp.fromDate(nextDate!);
    if (hasReference) patch[f.reference] = reference;
    if (hasNotes) patch[f.notes] = notes;
    tx.update(docRef, patch);

    if (dateChanged) {
      const ts = admin.firestore.Timestamp.fromDate(nextDate!);
      if (entryRef) tx.update(entryRef, { date: ts, updatedAt: now });
      for (const t of targets) {
        if (t.doc && t.doc.paymentVoucherId === id && t.doc.paidBy === PAID_BY_CASH_VOUCHER) {
          tx.update(t.ref, { paidAt: ts, updatedAt: now, updatedBy: uid });
        }
      }
    }
    return { ok: true, dateChanged };
  });
});
