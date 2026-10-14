import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { requireCompanyRole } from '../utils/callable-auth';
import { closedPeriodReversalError } from './utils/closed-period';
import { JournalEntryLineRaw, invertEntryLines } from './generate-reversal-entry';
import {
  PurchaseDoc, generateJournalEntryFromPurchaseInternal, preparePurchaseEntry, purchaseEntryDoc,
} from './generate-journal-entry-from-purchase';

// ─── «Rehacer asiento» de una compra (2026-10-14) ─────────────────────────────
//
// Cuando se corrige algo que cambia el asiento de una compra ya contabilizada
// (el sustento tributario, sobre todo: decide si el IVA va a crédito tributario
// o a la cuenta de la base), el asiento viejo se queda como estaba. Esta
// callable lo rehace:
//
//   1. Arma el asiento nuevo con la lógica de hoy (preparePurchaseEntry, la
//      misma del trigger generateJournalEntryFromPurchase).
//   2. Si sale igual al que ya tiene, no toca nada.
//   3. Si no, en UNA transacción: la reversa del viejo (líneas invertidas, como
//      processReversal), el viejo pasa a `cancelled`, el nuevo se contabiliza y
//      la compra apunta al nuevo (y guarda el viejo en
//      `previousAccountingEntryIds`).
//
// Solo admin y contador. No si la compra está anulada, ni si el asiento viejo
// está conciliado con el banco (bank_reconciled_entries) o su ejercicio está
// cerrado, ni si el ejercicio de la compra no está abierto.

export interface RedoLine { accountCode: string; debit: number; credit: number }

/** Mismas cuentas con los mismos importes (sin importar el orden ni las glosas). */
export function sameEntryLines(a: RedoLine[], b: RedoLine[]): boolean {
  const key = (l: RedoLine) => `${l.accountCode}|${Math.round((l.debit ?? 0) * 100)}|${Math.round((l.credit ?? 0) * 100)}`;
  const ka = a.map(key).sort();
  const kb = b.map(key).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

const MOTIVOS: Record<string, string> = {
  no_open_period: 'El ejercicio de la compra no está abierto.',
  bad_accounts:   'Una cuenta de la línea o del artículo no existe, está inactiva o es agrupadora.',
  unbalanced:     'El asiento nuevo no cuadra: no se tocó nada.',
  not_ready:      'La compra todavía no está recibida.',
};

function round2(n: number): number { return Math.round(n * 100) / 100; }

export const redoPurchaseEntry = onCall(async (request) => {
  const { companyId, purchaseId } = (request.data ?? {}) as { companyId?: string; purchaseId?: string };
  if (!companyId || typeof companyId !== 'string') throw new HttpsError('invalid-argument', 'companyId es requerido.');
  if (!purchaseId || typeof purchaseId !== 'string') throw new HttpsError('invalid-argument', 'purchaseId es requerido.');
  requireCompanyRole(request, companyId, ['admin', 'accountant']);

  const db = admin.firestore();
  const purchaseRef = db.doc(`companies/${companyId}/purchases/${purchaseId}`);
  const snap = await purchaseRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'La compra no existe.');
  const purchase = snap.data() as PurchaseDoc & Record<string, any>;
  if (purchase.isVoid === true || purchase.status === 'cancelled') {
    throw new HttpsError('failed-precondition', 'La compra está anulada.');
  }
  if (purchase.stockProcessed !== true) throw new HttpsError('failed-precondition', MOTIVOS.not_ready);

  const oldId = purchase.accountingEntryId;
  if (!oldId) {
    // Sin asiento: es lo mismo que contabilizarla por primera vez.
    const r = await generateJournalEntryFromPurchaseInternal(companyId, purchaseId);
    if (!r.created) throw new HttpsError('failed-precondition', MOTIVOS[r.reason ?? ''] ?? `No se pudo contabilizar (${r.reason}).`);
    return { changed: true, entryId: r.entryId, reversalEntryId: null };
  }

  const oldRef = db.doc(`companies/${companyId}/journal_entries/${oldId}`);
  const oldSnap = await oldRef.get();
  if (!oldSnap.exists) throw new HttpsError('failed-precondition', 'El asiento de la compra ya no existe.');
  const old = oldSnap.data() as Record<string, any>;
  if (old.status !== 'posted') throw new HttpsError('failed-precondition', 'El asiento de la compra no está contabilizado.');
  if (old.periodId) {
    const per = await db.doc(`companies/${companyId}/accounting_periods/${old.periodId}`).get();
    const cerrado = closedPeriodReversalError(per.exists ? per.data() as { status?: string; year?: number } : null, old.periodYear);
    if (cerrado) throw new HttpsError('failed-precondition', `El ejercicio ${old.periodYear ?? ''} del asiento está cerrado: corrige con un asiento en el ejercicio abierto.`);
  }

  const prep = await preparePurchaseEntry(companyId, purchaseId, purchase);
  if (!prep.ok) throw new HttpsError('failed-precondition', MOTIVOS[prep.reason] ?? `No se pudo armar el asiento (${prep.reason}).`);

  if (sameEntryLines(old.lines ?? [], prep.entryLines)) {
    return { changed: false, entryId: oldId, reversalEntryId: null };
  }

  const now = admin.firestore.Timestamp.now();
  const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
  const reconciledRef = db.doc(`companies/${companyId}/bank_reconciled_entries/${oldId}`);
  const reversalRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  const newRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  const uid = request.auth?.uid ?? 'system';
  const ref = purchase.fullNumber ?? purchaseId;

  await db.runTransaction(async (tx) => {
    const [fresh, oldFresh, counter, reconciled] = await Promise.all([
      tx.get(purchaseRef), tx.get(oldRef), tx.get(counterRef), tx.get(reconciledRef),
    ]);
    if (fresh.get('accountingEntryId') !== oldId) {
      throw new HttpsError('aborted', 'La compra cambió de asiento mientras tanto: vuelve a intentarlo.');
    }
    if (fresh.get('isVoid') === true || fresh.get('status') === 'cancelled') {
      throw new HttpsError('failed-precondition', 'La compra está anulada.');
    }
    if (oldFresh.get('status') !== 'posted') {
      throw new HttpsError('failed-precondition', 'El asiento de la compra ya no está contabilizado.');
    }
    if (reconciled.exists) {
      throw new HttpsError('failed-precondition', 'El asiento de la compra está conciliado con el banco: no se rehace.');
    }

    const counters = (counter.data() ?? {}) as Record<string, number>;
    const next = (year: number | string) => {
      const k = `journal_${year}`;
      counters[k] = (counters[k] ?? 0) + 1;
      return counters[k];
    };
    const reversalNumber = next(old.periodYear);
    const newNumber = next(prep.periodYear);
    tx.set(counterRef, counters, { merge: true });

    const lines = invertEntryLines((old.lines ?? []) as JournalEntryLineRaw[]);
    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    tx.set(reversalRef, {
      number:      reversalNumber,
      date:        now,
      description: `[REVERSA] ${old.description ?? ''} — Asiento rehecho de la compra ${ref}`,
      periodId:    old.periodId,
      periodYear:  old.periodYear,
      type:        'adjustment',
      status:      'posted',
      reference:   ref,
      referenceId: purchaseId,
      reversalOf:  oldId,
      lines,
      accountCodes: [...new Set(lines.map((l) => l.accountCode))],
      totalDebit,
      totalCredit,
      isBalanced:  Math.abs(totalDebit - totalCredit) < 0.01,
      createdBy:   'system',
      createdAt:   now,
      updatedAt:   now,
    });
    tx.update(oldRef, {
      status:          'cancelled',
      reversalEntryId: reversalRef.id,
      cancelledAt:     now,
      cancelledBy:     uid,
      cancelReason:    `Asiento rehecho: compra ${ref}`,
      updatedAt:       now,
    });
    tx.set(newRef, purchaseEntryDoc(prep, purchaseId, newNumber, now));
    tx.update(purchaseRef, {
      accountingEntryId: newRef.id,
      previousAccountingEntryIds: admin.firestore.FieldValue.arrayUnion(oldId),
      accountingError: admin.firestore.FieldValue.delete(),
      entryRedoneAt: now,
      entryRedoneBy: uid,
      updatedAt: now,
    });
  });

  logger.info('[redoPurchaseEntry] Asiento rehecho', { companyId, purchaseId, oldId, reversal: reversalRef.id, nuevo: newRef.id });
  return { changed: true, entryId: newRef.id, reversalEntryId: reversalRef.id };
});
