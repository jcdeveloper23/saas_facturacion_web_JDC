import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { requireCompanyRole } from '../../utils/callable-auth';
import { getAccountMapping } from '../utils/get-account-mapping';
import { receivableFromSaleEntry } from '../utils/received-retention';
import { closedPeriodReversalError } from '../utils/closed-period';
import { AccountRef, EntryLineDraft, ecuadorYearOf, invertLines, sumSide } from '../advances/advance-logic';
import {
  ACCOUNTS_PAYABLE, ChartAccount, VoucherLinePlan, VoucherTargetType, buildVoucherEntryLines, docParty,
  invoiceVoucherPendingCents, payableFromPurchaseEntry, purchasePendingCents, resolveAccountLines,
  resolveParty, retentionHeldCents, validateVoucherInput, voidTargetProblem, voidVoucherProblem,
  voucherCounterKey, voucherNumber, voucherTargetPatch, voucherTargetProblem,
} from './cash-voucher-logic';

// ─── Comprobantes de egreso y recibos de caja: callables (2026-10-16) ─────────
//
// Cada operación escribe el comprobante, los acumulados de las compras o
// facturas y su asiento en UNA transacción: o queda todo o no queda nada. Las
// reglas no dejan escribir `cashVouchers` ni `cashVouchersApplied` desde el
// cliente. Lo hacen el administrador y el contador de la empresa.
//
// El asiento lleva `type: 'cash_voucher'`: las reglas de journal_entries no
// dejan que un cliente anule a mano un asiento de ese tipo (se anula
// anulando el comprobante). La anulación genera la reversa dentro de la misma
// transacción —la misma inversión que processReversal—, después de mirar que
// el ejercicio no esté cerrado y que el asiento no esté conciliado.

const ROLES = ['admin', 'accountant'];
const ENTRY_TYPE = 'cash_voucher';

type Tx = admin.firestore.Transaction;
type DocRef = admin.firestore.DocumentReference;

function readCompanyId(data: any): string {
  const companyId = typeof data?.companyId === 'string' ? data.companyId.trim() : '';
  if (!companyId || companyId.includes('/')) throw new HttpsError('invalid-argument', 'Falta la empresa.');
  return companyId;
}

function readId(data: any, key: string, label: string): string {
  const v = typeof data?.[key] === 'string' ? data[key].trim() : '';
  if (!v || v.includes('/')) throw new HttpsError('invalid-argument', `Falta ${label}.`);
  return v;
}

function fail(msg: string): never {
  throw new HttpsError('failed-precondition', msg);
}

async function openPeriodId(tx: Tx, db: admin.firestore.Firestore, companyId: string, year: number): Promise<string> {
  const snap = await tx.get(db.collection(`companies/${companyId}/accounting_periods`)
    .where('year', '==', year).where('status', '==', 'open').limit(1));
  if (snap.empty) fail(`No hay un ejercicio contable abierto para ${year}.`);
  return snap.docs[0].id;
}

/** El asiento tal como lo escriben los demás generadores. */
function entryDoc(p: {
  number: number; date: Date; description: string; periodId: string; periodYear: number;
  reference: string; referenceId: string; lines: EntryLineDraft[]; reversalOf?: string;
}) {
  const now = admin.firestore.Timestamp.now();
  const lines = p.lines.map((l) => ({ id: crypto.randomUUID(), costCenterId: null, costCenterName: null, ...l }));
  const { debit, credit } = sumSide(lines);
  return {
    number: p.number,
    date: admin.firestore.Timestamp.fromDate(p.date),
    description: p.description,
    periodId: p.periodId,
    periodYear: p.periodYear,
    type: ENTRY_TYPE,
    status: 'posted',
    reference: p.reference,
    referenceId: p.referenceId,
    ...(p.reversalOf ? { reversalOf: p.reversalOf } : {}),
    lines,
    accountCodes: [...new Set(lines.map((l) => l.accountCode))],
    totalDebit: debit,
    totalCredit: credit,
    isBalanced: Math.abs(debit - credit) < 0.005,
    createdBy: 'system',
    createdAt: now,
    updatedAt: now,
  };
}

/** Firestore: null → borrar el campo; Date → Timestamp. */
function toFirestore(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v === null ? admin.firestore.FieldValue.delete()
      : v instanceof Date ? admin.firestore.Timestamp.fromDate(v) : v;
  }
  return out;
}

function collectionFor(t: VoucherTargetType): string {
  return t === 'purchase' ? 'purchases' : 'invoices';
}

/** Las cuentas del plan con esos códigos (de 30 en 30, el tope de `in`). */
async function readChart(db: admin.firestore.Firestore, companyId: string, codes: string[]): Promise<Map<string, ChartAccount>> {
  const out = new Map<string, ChartAccount>();
  const unique = [...new Set(codes)];
  for (let i = 0; i < unique.length; i += 30) {
    const snap = await db.collection(`companies/${companyId}/chart_of_accounts`)
      .where('code', 'in', unique.slice(i, i + 30)).get();
    for (const d of snap.docs) {
      const c = d.data();
      out.set(String(c.code), { name: c.name, allowsMovement: c.allowsMovement, isActive: c.isActive });
    }
  }
  return out;
}

// ─── registerCashVoucher ──────────────────────────────────────────────────────

/**
 * Registra un comprobante de egreso (paga compras) o un recibo de caja (cobra
 * facturas), con o sin líneas a cuentas del plan. Entrada: {companyId, kind,
 * date: 'AAAA-MM-DD', partyId?, partyName, partyTaxId?, bankAccountId,
 * paymentMethodCode, chequeNumber?, reference?, concept, notes?,
 * applications: [{targetType, targetId, amountCents}], accountLines:
 * [{accountCode, amountCents, description?}]}. Devuelve {voucherId, number,
 * accountingEntryId}.
 */
export const registerCashVoucher = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth?.uid ?? 'system';

  const v = validateVoucherInput(data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const input = v.value;
  const year = ecuadorYearOf(input.date);
  const targetType: VoucherTargetType = input.kind === 'egreso' ? 'purchase' : 'invoice';

  // Banco o caja.
  const bankSnap = await db.doc(`companies/${companyId}/bank_accounts/${input.bankAccountId}`).get();
  if (!bankSnap.exists) throw new HttpsError('invalid-argument', 'La cuenta de banco o caja no existe.');
  if (bankSnap.get('isActive') === false) fail('La cuenta de banco o caja está inactiva.');
  const bankGl = String(bankSnap.get('linkedGlCode') ?? '');
  if (!bankGl) fail('La cuenta de banco o caja no tiene cuenta contable: configúrala en Cuentas bancarias.');
  const bank: AccountRef = { code: bankGl, name: String(bankSnap.get('linkedGlName') ?? bankGl) };
  const acct = String(bankSnap.get('accountNumber') ?? '');
  const bankAccountName = `${bankSnap.get('bankName') ?? bankSnap.get('name') ?? ''}${acct ? ` ****${acct.slice(-4)}` : ''}`
    .trim().slice(0, 120) || bank.name;

  // Cuentas de las líneas sin documento.
  const chart = input.accountLines.length
    ? await readChart(db, companyId, input.accountLines.map((l) => l.accountCode)) : new Map();
  const acc = resolveAccountLines(input.accountLines, chart, bankGl);
  if (!acc.ok) fail(acc.error);

  // La persona elegida, si la hay.
  let persona: { name?: string; taxId?: string } | null = null;
  if (input.partyId) {
    const p = await db.doc(`companies/${companyId}/personas/${input.partyId}`).get();
    if (!p.exists) throw new HttpsError('invalid-argument', 'La persona elegida ya no existe.');
    persona = { name: p.get('legalName') || p.get('name'), taxId: p.get('taxId') };
  }

  const mapping = targetType === 'invoice' ? await getAccountMapping(companyId) : null;
  const voucherRef = db.collection(`companies/${companyId}/cashVouchers`).doc();
  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  const journalCounter = db.doc(`companies/${companyId}/counters/journal_entries`);
  const voucherCounter = db.doc(`companies/${companyId}/counters/cashVouchers`);

  return db.runTransaction(async (tx) => {
    // Lecturas (todas antes de escribir).
    const targetRefs = input.applications.map((a) => db.doc(`companies/${companyId}/${collectionFor(targetType)}/${a.targetId}`));
    const targetSnaps = await Promise.all(targetRefs.map((r: DocRef) => tx.get(r)));
    const docs = targetSnaps.map((s) => (s.exists ? s.data() as Record<string, any> : undefined));
    const sourceSnaps = await Promise.all(docs.map((d) => {
      const id = d?.accountingEntryId;
      return typeof id === 'string' && id ? tx.get(db.doc(`companies/${companyId}/journal_entries/${id}`)) : Promise.resolve(null);
    }));
    const retentionSnaps = await Promise.all(docs.map((d) => {
      const id = targetType === 'purchase' ? d?.retentionId : null;
      return typeof id === 'string' && id && !id.includes('/')
        ? tx.get(db.doc(`companies/${companyId}/retentions/${id}`)) : Promise.resolve(null);
    }));
    const periodId = await openPeriodId(tx, db, companyId, year);
    const [jc, vc] = await Promise.all([tx.get(journalCounter), tx.get(voucherCounter)]);

    // Validaciones.
    const party = resolveParty(input.kind, input, persona,
      docs.filter((d): d is Record<string, any> => !!d).map((d) => docParty(targetType, d)));
    const plans = input.applications.map((a, k) => {
      const doc = docs[k];
      const pending = !doc ? 0 : targetType === 'purchase'
        ? purchasePendingCents(doc, retentionHeldCents(retentionSnaps[k]?.exists ? retentionSnaps[k]!.data() : null))
        : invoiceVoucherPendingCents(doc);
      const problem = voucherTargetProblem(targetType, doc, a.amountCents, input.date, pending);
      if (problem) fail(problem);
      const sourceLines = sourceSnaps[k]?.exists ? sourceSnaps[k]!.get('lines') : undefined;
      const account = targetType === 'purchase'
        ? payableFromPurchaseEntry(sourceLines) ?? ACCOUNTS_PAYABLE
        : receivableFromSaleEntry(sourceLines) ?? mapping!.accountsReceivable;
      return { ...a, doc: doc!, ref: targetRefs[k], pending, account };
    });
    if (!party.ok) fail(party.error);

    // Número y asiento.
    const jKey = `journal_${year}`;
    const vKey = voucherCounterKey(input.kind, year);
    const entryNumber = ((jc.data()?.[jKey] as number) ?? 0) + 1;
    const seq = ((vc.data()?.[vKey] as number) ?? 0) + 1;
    const number = voucherNumber(input.kind, year, seq);
    const label = `${input.kind === 'egreso' ? 'Comprobante de egreso' : 'Recibo de caja'} ${number} — ${party.partyName}`;
    const docLines: VoucherLinePlan[] = plans.map((p) => ({
      account: p.account,
      amountCents: p.amountCents,
      description: `${input.kind === 'egreso' ? 'Pago compra' : 'Cobro factura'} ${p.doc.fullNumber ?? p.targetId} — ${number}`,
    }));
    const lineMemo = input.accountLines.map((l) => ({
      account: { code: l.accountCode, name: acc.names.get(l.accountCode) ?? l.accountCode },
      amountCents: l.amountCents,
      description: l.description ?? `${input.concept} — ${number}`,
    }));
    const lines = buildVoucherEntryLines(input.kind, bank, docLines, lineMemo, label);
    const now = admin.firestore.Timestamp.now();

    tx.set(journalCounter, { [jKey]: entryNumber }, { merge: true });
    tx.set(voucherCounter, { [vKey]: seq }, { merge: true });
    tx.set(entryRef, entryDoc({
      number: entryNumber, date: input.date, description: `${label}: ${input.concept}`.slice(0, 500),
      periodId, periodYear: year, reference: number, referenceId: voucherRef.id, lines,
    }));
    tx.set(voucherRef, {
      version: 1,
      kind: input.kind,
      number,
      date: admin.firestore.Timestamp.fromDate(input.date),
      fiscalYear: String(year),
      partyId: input.partyId,
      partyName: party.partyName,
      partyTaxId: party.partyTaxId,
      bankAccountId: input.bankAccountId,
      bankAccountName,
      glCode: bankGl,
      paymentMethodCode: input.paymentMethodCode,
      chequeNumber: input.chequeNumber,
      reference: input.reference,
      concept: input.concept,
      notes: input.notes,
      applications: plans.map((p) => ({
        targetType, targetId: p.targetId, targetNumber: String(p.doc.fullNumber ?? ''), amountCents: p.amountCents,
      })),
      accountLines: input.accountLines.map((l) => ({
        accountCode: l.accountCode, accountName: acc.names.get(l.accountCode) ?? l.accountCode,
        amountCents: l.amountCents, description: l.description,
      })),
      totalCents: input.totalCents,
      status: 'posted',
      isVoid: false,
      voidReason: null,
      voidedAt: null,
      voidedBy: null,
      accountingEntryId: entryRef.id,
      reversalEntryId: null,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      updatedBy: uid,
    });
    for (const p of plans) {
      const patch = voucherTargetPatch(targetType, p.doc, voucherRef.id, p.amountCents, p.pending - p.amountCents,
        { date: input.date, bankAccountId: input.bankAccountId, entryId: entryRef.id });
      tx.update(p.ref, { ...toFirestore(patch), updatedAt: now, updatedBy: uid });
    }
    return { voucherId: voucherRef.id, number, accountingEntryId: entryRef.id };
  });
});

// ─── voidCashVoucher ──────────────────────────────────────────────────────────

/** La fecha de la reversa: hoy, o el 31 de diciembre si el asiento es de un año anterior aún abierto. */
function reversalDate(periodYear: number): Date {
  const now = new Date();
  return ecuadorYearOf(now) === periodYear ? now : new Date(Date.UTC(periodYear, 11, 31, 17));
}

/**
 * Anula un comprobante: reversa su asiento y devuelve lo aplicado a cada
 * compra o factura (si estaba saldada por comprobantes, vuelve a no pagada).
 * No se anula con el asiento conciliado con el banco ni en un ejercicio
 * cerrado. Entrada: {companyId, voucherId, reason}. Devuelve {ok: true,
 * reversalEntryId}.
 */
export const voidCashVoucher = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth?.uid ?? 'system';
  const voucherId = readId(data, 'voucherId', 'el comprobante');
  const reason = String(data.reason ?? '').trim().slice(0, 300);
  if (!reason) throw new HttpsError('invalid-argument', 'Escribe el motivo de la anulación.');

  const voucherRef = db.doc(`companies/${companyId}/cashVouchers/${voucherId}`);
  const journalCounter = db.doc(`companies/${companyId}/counters/journal_entries`);

  return db.runTransaction(async (tx) => {
    const vSnap = await tx.get(voucherRef);
    if (!vSnap.exists) throw new HttpsError('not-found', 'El comprobante no existe.');
    const voucher = vSnap.data() as Record<string, any>;
    const problem = voidVoucherProblem(voucher);
    if (problem) fail(problem);

    const apps: Array<{ targetType: VoucherTargetType; targetId: string; amountCents: number }> =
      Array.isArray(voucher.applications) ? voucher.applications : [];
    const targetRefs = apps.map((a) => db.doc(`companies/${companyId}/${collectionFor(a.targetType)}/${a.targetId}`));
    const targetSnaps = await Promise.all(targetRefs.map((r: DocRef) => tx.get(r)));
    const retentionSnaps = await Promise.all(targetSnaps.map((s, k) => {
      const id = apps[k].targetType === 'purchase' && s.exists ? s.get('retentionId') : null;
      return typeof id === 'string' && id && !id.includes('/')
        ? tx.get(db.doc(`companies/${companyId}/retentions/${id}`)) : Promise.resolve(null);
    }));

    const entryId = typeof voucher.accountingEntryId === 'string' ? voucher.accountingEntryId : '';
    const entryRef = entryId ? db.doc(`companies/${companyId}/journal_entries/${entryId}`) : null;
    const [entrySnap, reconciled] = entryRef
      ? await Promise.all([tx.get(entryRef), tx.get(db.doc(`companies/${companyId}/bank_reconciled_entries/${entryId}`))])
      : [null, null];
    const entry = entrySnap?.exists ? entrySnap.data() as Record<string, any> : null;
    if (reconciled?.exists) fail('El asiento está conciliado con el banco: primero deshaz la conciliación.');
    const periodSnap = entry?.periodId
      ? await tx.get(db.doc(`companies/${companyId}/accounting_periods/${entry.periodId}`)) : null;
    const closed = closedPeriodReversalError(periodSnap?.exists ? periodSnap.data() as any : null,
      entry?.periodYear ?? voucher.fiscalYear);
    if (closed) fail(closed);
    const jc = await tx.get(journalCounter);

    targetSnaps.forEach((s, k) => {
      const p = voidTargetProblem(apps[k].targetType, s.exists ? s.data() : undefined);
      if (p) fail(p);
    });

    const now = admin.firestore.Timestamp.now();
    let reversalEntryId: string | null = null;
    if (entry && entryRef && entry.status !== 'cancelled') {
      const periodYear = Number(entry.periodYear);
      const jKey = `journal_${periodYear}`;
      const n = ((jc.data()?.[jKey] as number) ?? 0) + 1;
      const revRef = db.collection(`companies/${companyId}/journal_entries`).doc();
      tx.set(journalCounter, { [jKey]: n }, { merge: true });
      tx.set(revRef, entryDoc({
        number: n,
        date: reversalDate(periodYear),
        description: `[REVERSA] ${entry.description ?? ''} — ${voucher.number} anulado`.slice(0, 600),
        periodId: entry.periodId,
        periodYear,
        reference: entry.reference ?? voucher.number,
        referenceId: voucherId,
        lines: invertLines(entry.lines ?? []),
        reversalOf: entryRef.id,
      }));
      tx.update(entryRef, {
        status: 'cancelled',
        reversalEntryId: revRef.id,
        cancelledAt: now,
        cancelledBy: uid,
        cancelReason: `${voucher.number} anulado: ${reason}`,
        updatedAt: now,
      });
      reversalEntryId = revRef.id;
    }

    targetSnaps.forEach((s, k) => {
      if (!s.exists) return;
      const doc = s.data() as Record<string, any>;
      const a = apps[k];
      const retention = retentionSnaps[k]?.exists ? retentionSnaps[k]!.data() : null;
      const pendingNow = a.targetType === 'purchase'
        ? purchasePendingCents(doc, retentionHeldCents(retention)) : invoiceVoucherPendingCents(doc);
      const patch = voucherTargetPatch(a.targetType, doc, voucherId, -Number(a.amountCents),
        pendingNow + Number(a.amountCents), null);
      tx.update(targetRefs[k], { ...toFirestore(patch), updatedAt: now, updatedBy: uid });
    });

    tx.update(voucherRef, {
      status: 'void', isVoid: true, voidReason: reason, voidedAt: now, voidedBy: uid,
      reversalEntryId, updatedAt: now, updatedBy: uid,
    });
    return { ok: true, reversalEntryId };
  });
});
