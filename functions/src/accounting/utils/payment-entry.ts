import * as admin from 'firebase-admin';
import { getAccountMapping } from './get-account-mapping';

// ─── Asientos de cobro y de pago (2026-10-05) ─────────────────────────────────
//
// La lógica que antes vivía dentro de los triggers
// generate-journal-entry-from-invoice-payment.ts y
// generate-journal-entry-from-purchase-payment.ts, sacada aquí para que la use
// también regenerateJournalEntries: un cobro registrado sin ejercicio abierto
// (o sin cuenta bancaria) se quedaba sin asiento para siempre, porque el
// trigger solo mira el instante en que isPaid pasa a true.
//
//   Cobro de factura:  DÉBITO banco             / CRÉDITO Cuentas por cobrar
//   Pago de compra:    DÉBITO Cuentas por pagar / CRÉDITO banco
//
// El asiento, el contador y el back-reference (paymentEntryId) se escriben en
// UNA transacción que antes vuelve a mirar paymentEntryId: si el trigger y la
// recuperación corren a la vez, solo uno crea el asiento.

export type PaymentKind = 'invoice' | 'purchase';

export interface EntryResult {
  created: boolean;
  reason?: string;
  entryId?: string;
}

// Mismo código fijo que usa generate-journal-entry-from-purchase.ts.
const ACCOUNTS_PAYABLE = { code: '2.1.01.001', name: 'Cuentas por Pagar Proveedores' };

export function round2(n: number): number { return Math.round(n * 100) / 100; }

/** El año en hora de Ecuador (UTC-5), que es el año contable del documento. */
export function ecuadorYear(d: Date): number {
  return new Date(d.getTime() - 5 * 3600 * 1000).getUTCFullYear();
}

/** [desde, hasta) del año en hora de Ecuador, en UTC. */
export function ecuadorYearRange(year: number): { from: Date; to: Date } {
  return { from: new Date(Date.UTC(year, 0, 1, 5)), to: new Date(Date.UTC(year + 1, 0, 1, 5)) };
}

/** Cobrada o pagada, con cuenta, viva y sin su asiento de cobro o pago. */
export function paymentNeedsEntry(d: Record<string, any>): boolean {
  return d.isPaid === true
    && !d.paymentEntryId
    && typeof d.paymentBankAccountId === 'string' && d.paymentBankAccountId.trim() !== ''
    && d.isVoid !== true
    && round2(Number(d.total ?? 0)) > 0;
}

/** Recibida (subió el stock), viva y sin su asiento. */
export function purchaseNeedsEntry(d: Record<string, any>): boolean {
  return d.stockProcessed === true
    && !d.accountingEntryId
    && d.isVoid !== true
    && d.status !== 'cancelled';
}

interface JournalEntryLine {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  costCenterId: string | null;
  costCenterName: string | null;
  description: string;
}

export async function generatePaymentEntryInternal(
  companyId: string,
  kind: PaymentKind,
  docId: string,
): Promise<EntryResult> {
  const db = admin.firestore();
  const col = kind === 'invoice' ? 'invoices' : 'purchases';
  const docRef = db.doc(`companies/${companyId}/${col}/${docId}`);
  const snap = await docRef.get();
  if (!snap.exists) return { created: false, reason: 'not_found' };
  const d = snap.data() as Record<string, any>;

  if (d.paymentEntryId) return { created: false, reason: 'already_exists', entryId: d.paymentEntryId };
  if (d.isPaid !== true) return { created: false, reason: 'not_ready' };
  const total = round2(Number(d.total ?? 0));
  if (total <= 0) return { created: false, reason: 'zero_total' };
  const bankId = typeof d.paymentBankAccountId === 'string' ? d.paymentBankAccountId.trim() : '';
  if (!bankId) return { created: false, reason: 'no_bank_account' };

  const bankSnap = await db.doc(`companies/${companyId}/bank_accounts/${bankId}`).get();
  if (!bankSnap.exists) return { created: false, reason: 'bank_not_found' };
  const bank = bankSnap.data() as { linkedGlCode?: string; linkedGlName?: string };
  if (!bank.linkedGlCode) return { created: false, reason: 'bank_without_account' };

  const now = admin.firestore.Timestamp.now();
  const paidDate: admin.firestore.Timestamp = d.paidAt ?? now;
  const periodYear = ecuadorYear(paidDate.toDate());

  const periodsSnap = await db.collection(`companies/${companyId}/accounting_periods`)
    .where('year', '==', periodYear).where('status', '==', 'open').limit(1).get();
  if (periodsSnap.empty) return { created: false, reason: 'no_open_period' };
  const periodId = periodsSnap.docs[0].id;

  const ref = d.fullNumber ?? docId;
  const bankLine = { code: bank.linkedGlCode, name: bank.linkedGlName ?? bank.linkedGlCode };
  let debitAcc: { code: string; name: string };
  let creditAcc: { code: string; name: string };
  let description: string;
  if (kind === 'invoice') {
    const mapping = await getAccountMapping(companyId);
    debitAcc = bankLine;
    creditAcc = mapping.accountsReceivable;
    description = `Cobro factura ${ref} — ${d.customerName ?? 'Cliente'}`;
  } else {
    debitAcc = ACCOUNTS_PAYABLE;
    creditAcc = bankLine;
    description = `Pago compra ${ref} — ${d.supplierName ?? 'Proveedor'}`;
  }

  const line = (acc: { code: string; name: string }, debit: number, credit: number): JournalEntryLine => ({
    id: crypto.randomUUID(),
    accountCode: acc.code,
    accountName: acc.name,
    debit,
    credit,
    costCenterId: null,
    costCenterName: null,
    description,
  });
  const lines = [line(debitAcc, total, 0), line(creditAcc, 0, total)];

  const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  const key = `journal_${periodYear}`;

  const created = await db.runTransaction(async (tx) => {
    const [fresh, counter] = await Promise.all([tx.get(docRef), tx.get(counterRef)]);
    if (fresh.get('paymentEntryId')) return false;
    const number = ((counter.data()?.[key] as number) ?? 0) + 1;
    tx.set(counterRef, { [key]: number }, { merge: true });
    tx.set(entryRef, {
      number,
      date: paidDate,
      description,
      periodId,
      periodYear,
      type: 'automatic',
      status: 'posted',
      reference: ref,
      referenceId: docId,
      lines,
      accountCodes: [...new Set(lines.map((l) => l.accountCode))],
      totalDebit: total,
      totalCredit: total,
      isBalanced: true,
      createdBy: 'system',
      createdAt: now,
      updatedAt: now,
    });
    tx.update(docRef, { paymentEntryId: entryRef.id, updatedAt: now });
    return true;
  });

  return created ? { created: true, entryId: entryRef.id } : { created: false, reason: 'already_exists' };
}
