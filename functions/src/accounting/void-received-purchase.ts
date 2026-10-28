import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { requireCompanyRole } from '../utils/callable-auth';
import { closedPeriodReversalError } from './utils/closed-period';
import { JournalEntryLineRaw, invertEntryLines } from './generate-reversal-entry';

// ─── «Anular compra» recibida (2026-10-28) ────────────────────────────────────
//
// Las reglas solo dejan cancelar una compra en borrador o enviada: una
// recibida ya tiene asiento (y quizá stock). El 2026-10-28 la misma factura de
// CONECEL entró dos veces en Weconnect Corp. (C-2026-000004 y C-2026-000005) y
// no había cómo quitar la sobrante. Esta callable la anula:
//
//   - en UNA transacción: la reversa del asiento (líneas invertidas, como
//     processReversal y redoPurchaseEntry), el asiento original pasa a
//     `cancelled` y la compra a `status: 'cancelled'` + `isVoid` con el motivo.
//     El trigger generateReversalFromPurchase ve el asiento ya cancelado y no
//     duplica la reversa.
//
// No anula (lo dice voidPurchaseBlocker): si está pagada, si tiene una
// retención viva, anticipos o comprobantes de egreso aplicados, si ya sumó
// inventario (no hay devolución automática de stock), si el asiento está
// conciliado con el banco o su ejercicio cerrado. Solo admin y contador.

export interface VoidPurchaseFacts {
  status?:              string;
  isVoid?:              boolean;
  isPaid?:              boolean;
  paymentEntryId?:      string | null;
  advancesApplied?:     number;
  cashVouchersApplied?: number;
  /** La retención ligada existe y no está anulada. */
  liveRetention:        boolean;
  /** Movimientos de inventario que salieron de esta compra. */
  stockMovements:       number;
}

/** Por qué no se puede anular, o null si se puede. */
export function voidPurchaseBlocker(f: VoidPurchaseFacts): string | null {
  if (f.isVoid === true || f.status === 'cancelled') return 'La compra ya está anulada.';
  if (f.status === 'paid' || f.isPaid === true || !!f.paymentEntryId) {
    return 'La compra está pagada: no se anula.';
  }
  if (f.status !== 'received') return 'Solo se anula aquí una compra recibida; la de borrador o enviada se cancela.';
  if (f.liveRetention) return 'La compra tiene una retención emitida: anula primero la retención.';
  if (Number(f.advancesApplied ?? 0) > 0) return 'La compra tiene anticipos aplicados: desaplícalos primero.';
  if (Number(f.cashVouchersApplied ?? 0) > 0) return 'La compra tiene comprobantes de egreso: anúlalos primero.';
  if (f.stockMovements > 0) {
    return 'La compra ya sumó inventario y la anulación no lo devuelve: ajusta primero el stock de sus artículos.';
  }
  return null;
}

/** El motivo, obligatorio y corto. */
export function readVoidReason(raw: unknown): string {
  const r = typeof raw === 'string' ? raw.trim() : '';
  if (!r) throw new HttpsError('invalid-argument', 'Escribe el motivo de la anulación.');
  if (r.length > 300) throw new HttpsError('invalid-argument', 'El motivo no puede pasar de 300 caracteres.');
  return r;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

export const voidReceivedPurchase = onCall(async (request) => {
  const { companyId, purchaseId, reason } = (request.data ?? {}) as { companyId?: string; purchaseId?: string; reason?: unknown };
  if (!companyId || typeof companyId !== 'string') throw new HttpsError('invalid-argument', 'companyId es requerido.');
  if (!purchaseId || typeof purchaseId !== 'string') throw new HttpsError('invalid-argument', 'purchaseId es requerido.');
  requireCompanyRole(request, companyId, ['admin', 'accountant']);
  const motivo = readVoidReason(reason);

  const db = admin.firestore();
  const purchaseRef = db.doc(`companies/${companyId}/purchases/${purchaseId}`);
  const snap = await purchaseRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'La compra no existe.');
  const purchase = snap.data() as Record<string, any>;

  // Fuera de la transacción: lo que no cambia en un instante y necesita consultas.
  const retentionId = typeof purchase.retentionId === 'string' ? purchase.retentionId : '';
  let liveRetention = false;
  if (retentionId) {
    const ret = await db.doc(`companies/${companyId}/retentions/${retentionId}`).get();
    liveRetention = ret.exists && ret.get('isVoid') !== true && ret.get('status') !== 'void';
  }
  const moves = await db.collection(`companies/${companyId}/stock-movements`)
    .where('sourceDocId', '==', purchaseId).limit(1).get();

  const bloqueo = voidPurchaseBlocker({ ...purchase, liveRetention, stockMovements: moves.size } as VoidPurchaseFacts);
  if (bloqueo) throw new HttpsError('failed-precondition', bloqueo);

  const entryId: string = purchase.accountingEntryId ?? '';
  const entryRef = entryId ? db.doc(`companies/${companyId}/journal_entries/${entryId}`) : null;
  let periodClosed: string | null = null;
  if (entryRef) {
    const e = await entryRef.get();
    const periodId = e.get('periodId');
    if (e.exists && periodId) {
      const per = await db.doc(`companies/${companyId}/accounting_periods/${periodId}`).get();
      periodClosed = closedPeriodReversalError(per.exists ? per.data() as { status?: string; year?: number } : null, e.get('periodYear'));
    }
  }
  if (periodClosed) {
    throw new HttpsError('failed-precondition', 'El ejercicio del asiento está cerrado: corrige con un asiento en el ejercicio abierto.');
  }

  const now = admin.firestore.Timestamp.now();
  const uid = request.auth?.uid ?? 'system';
  const ref = purchase.fullNumber ?? purchaseId;
  const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
  const reversalRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  const reconciledRef = entryId ? db.doc(`companies/${companyId}/bank_reconciled_entries/${entryId}`) : null;
  let reversalEntryId: string | null = null;

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(purchaseRef);
    const entry = entryRef ? await tx.get(entryRef) : null;
    const reconciled = reconciledRef ? await tx.get(reconciledRef) : null;
    const counter = entry?.exists && entry.get('status') === 'posted' ? await tx.get(counterRef) : null;

    const otra = voidPurchaseBlocker({ ...(fresh.data() ?? {}), liveRetention, stockMovements: moves.size } as VoidPurchaseFacts);
    if (otra) throw new HttpsError('failed-precondition', otra);
    if ((fresh.get('accountingEntryId') ?? '') !== entryId) {
      throw new HttpsError('aborted', 'La compra cambió de asiento mientras tanto: vuelve a intentarlo.');
    }
    if (reconciled?.exists) {
      throw new HttpsError('failed-precondition', 'El asiento de la compra está conciliado con el banco: no se anula.');
    }

    // Reversa del asiento contabilizado. Sin asiento (o ya cancelado), solo se anula la compra.
    if (entry?.exists && entry.get('status') === 'posted' && counter) {
      const old = entry.data() as Record<string, any>;
      const counters = (counter.data() ?? {}) as Record<string, number>;
      const k = `journal_${old.periodYear}`;
      counters[k] = (counters[k] ?? 0) + 1;
      tx.set(counterRef, counters, { merge: true });

      const lines = invertEntryLines((old.lines ?? []) as JournalEntryLineRaw[]);
      const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
      const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
      tx.set(reversalRef, {
        number:      counters[k],
        date:        now,
        description: `[REVERSA] ${old.description ?? ''} — Compra ${ref} anulada: ${motivo}`,
        periodId:    old.periodId,
        periodYear:  old.periodYear,
        type:        'adjustment',
        status:      'posted',
        reference:   ref,
        referenceId: purchaseId,
        reversalOf:  entryId,
        lines,
        accountCodes: [...new Set(lines.map((l) => l.accountCode))],
        totalDebit,
        totalCredit,
        isBalanced:  Math.abs(totalDebit - totalCredit) < 0.01,
        createdBy:   'system',
        createdAt:   now,
        updatedAt:   now,
      });
      tx.update(entryRef!, {
        status:          'cancelled',
        reversalEntryId: reversalRef.id,
        cancelledAt:     now,
        cancelledBy:     uid,
        cancelReason:    `Compra ${ref} anulada: ${motivo}`,
        updatedAt:       now,
      });
      reversalEntryId = reversalRef.id;
    }

    tx.update(purchaseRef, {
      status:          'cancelled',
      isVoid:          true,
      voidedAt:        now,
      voidedBy:        uid,
      voidReason:      motivo,
      ...(reversalEntryId ? { reversalEntryId } : {}),
      updatedAt:       now,
      updatedBy:       uid,
    });
  });

  logger.info('[voidReceivedPurchase] Compra anulada', { companyId, purchaseId, entryId, reversalEntryId });
  return { ok: true, reversalEntryId };
});
