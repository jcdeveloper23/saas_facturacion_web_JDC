import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { requireCompanyRole } from '../../utils/callable-auth';
import { getAccountMapping } from '../utils/get-account-mapping';
import { receivableFromSaleEntry } from '../utils/received-retention';
import { closedPeriodReversalError } from '../utils/closed-period';
import {
  AccountRef, ADVANCES_FROM_CUSTOMERS, EntryLineDraft, advanceAvailableCents, advanceNumber,
  advanceStatusFor, applicationProblem, buildApplicationLines, buildRegisterLines, ecuadorYearOf,
  invertLines, invoicePatchFor, parseEcuadorDate, positiveCents, sumSide, unapplyProblem,
  validateRegister, voidProblem,
} from './advance-logic';

// ─── Anticipos de clientes: callables (E1, 2026-10-14) ────────────────────────
//
// Cada operación escribe el documento, los acumulados (anticipo y factura) y
// su asiento en UNA transacción: o queda todo o no queda nada. Las reglas no
// dejan escribir `advances`, `advanceApplications` ni `invoices.advancesApplied`
// desde el cliente. Lo hacen el administrador y el contador de la empresa.
//
// Las anulaciones (desaplicar, anular) generan la reversa dentro de la misma
// transacción —la misma inversión de debe y haber que processReversal
// (generate-reversal-entry.ts)—, pero antes miran lo que processReversal no
// mira: que el ejercicio del asiento no esté cerrado y que el asiento no esté
// conciliado con el banco.

const ROLES = ['admin', 'accountant'];
const MAX_APPLICATIONS = 20;

type Tx = admin.firestore.Transaction;
type DocRef = admin.firestore.DocumentReference;

function readCompanyId(data: any): string {
  const companyId = typeof data?.companyId === 'string' ? data.companyId.trim() : '';
  if (!companyId) throw new HttpsError('invalid-argument', 'Falta la empresa.');
  return companyId;
}

function readId(data: any, key: string, label: string): string {
  const v = typeof data?.[key] === 'string' ? data[key].trim() : '';
  if (!v || v.includes('/')) throw new HttpsError('invalid-argument', `Falta ${label}.`);
  return v;
}

function text(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
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

/** El asiento automático tal como lo escriben los demás generadores. */
function entryDoc(p: {
  number: number; date: Date; description: string; periodId: string; periodYear: number;
  reference: string; referenceId: string; lines: EntryLineDraft[]; type?: string; reversalOf?: string;
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
    type: p.type ?? 'automatic',
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

/**
 * Lee lo necesario para revertir un asiento y deja preparada la escritura.
 * Falla si el ejercicio está cerrado o si el asiento está conciliado.
 */
async function prepareReversal(tx: Tx, db: admin.firestore.Firestore, companyId: string, entryId: string) {
  const entryRef = db.doc(`companies/${companyId}/journal_entries/${entryId}`);
  const [entry, reconciled] = await Promise.all([
    tx.get(entryRef),
    tx.get(db.doc(`companies/${companyId}/bank_reconciled_entries/${entryId}`)),
  ]);
  if (!entry.exists) return null;
  const e = entry.data() as Record<string, any>;
  if (e.status === 'cancelled') return null;
  if (reconciled.exists) fail('El asiento está conciliado con el banco: primero deshaz la conciliación.');
  const period = e.periodId ? await tx.get(db.doc(`companies/${companyId}/accounting_periods/${e.periodId}`)) : null;
  const blocked = closedPeriodReversalError(period?.exists ? period.data() as any : null, e.periodYear);
  if (blocked) fail(blocked);
  return { entryRef, entry: e };
}

/** La fecha de la reversa: hoy, o el 31 de diciembre si el asiento es de un año anterior aún abierto. */
function reversalDate(periodYear: number): Date {
  const now = new Date();
  return ecuadorYearOf(now) === periodYear ? now : new Date(Date.UTC(periodYear, 11, 31, 17));
}

function writeReversal(
  tx: Tx, db: admin.firestore.Firestore, companyId: string, number: number,
  prep: { entryRef: DocRef; entry: Record<string, any> }, label: string, referenceId: string, by: string,
): string {
  const e = prep.entry;
  const ref = db.collection(`companies/${companyId}/journal_entries`).doc();
  const doc = entryDoc({
    number,
    date: reversalDate(Number(e.periodYear)),
    description: `[REVERSA] ${e.description ?? ''} — ${label}`,
    periodId: e.periodId,
    periodYear: Number(e.periodYear),
    reference: e.reference ?? referenceId,
    referenceId,
    lines: invertLines(e.lines ?? []),
    type: 'adjustment',
    reversalOf: prep.entryRef.id,
  });
  tx.set(ref, doc);
  tx.update(prep.entryRef, {
    status: 'cancelled',
    reversalEntryId: ref.id,
    cancelledAt: admin.firestore.Timestamp.now(),
    cancelledBy: by,
    cancelReason: label,
    updatedAt: admin.firestore.Timestamp.now(),
  });
  return ref.id;
}

/**
 * El documento de un anticipo recién registrado (versión 2). Lo usan
 * registerAdvance y el cobro con excedente de collectInvoicePayment
 * (2026-10-29), para que los dos queden iguales.
 */
export function advanceRecord(p: {
  number: string; partyId: string | null; partyName: string; partyTaxId: string;
  date: Date; year: number; bankAccountId: string; bankAccountName: string;
  paymentMethodCode: string | null; reference: string; notes: string;
  amountCents: number; advancesAccount: AccountRef; entryId: string; uid: string;
  now: admin.firestore.Timestamp; extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    version: 2,
    number: p.number,
    partyType: 'customer',
    partyId: p.partyId,
    partyName: p.partyName,
    partyTaxId: p.partyTaxId,
    date: admin.firestore.Timestamp.fromDate(p.date),
    fiscalYear: String(p.year),
    bankAccountId: p.bankAccountId,
    bankAccountName: p.bankAccountName,
    paymentMethodCode: p.paymentMethodCode,
    reference: p.reference,
    notes: p.notes,
    amountCents: p.amountCents,
    appliedCents: 0,
    refundedCents: 0,
    availableCents: p.amountCents,
    applicationsCount: 0,
    status: 'open',
    isVoid: false,
    advancesAccount: p.advancesAccount,
    accountingEntryId: p.entryId,
    ...(p.extra ?? {}),
    createdBy: p.uid,
    createdAt: p.now,
    updatedAt: p.now,
    updatedBy: p.uid,
  };
}

// ─── registerAdvance ──────────────────────────────────────────────────────────

/**
 * Registra un anticipo de un cliente: el dinero que entró al banco antes de la
 * factura. Entrada: {companyId, partyId?, partyName, partyTaxId, amountCents,
 * date: 'AAAA-MM-DD', bankAccountId, paymentMethodCode?, reference?, notes?}.
 * Si `partyId` es una persona de la empresa, el nombre y la identificación
 * salen de ella.
 */
export const registerAdvance = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth?.uid ?? 'system';

  let partyName = data.partyName;
  let partyTaxId = data.partyTaxId;
  const partyId = typeof data.partyId === 'string' && data.partyId.trim() && !data.partyId.includes('/')
    ? data.partyId.trim() : '';
  if (partyId) {
    const p = await db.doc(`companies/${companyId}/personas/${partyId}`).get();
    if (!p.exists) throw new HttpsError('invalid-argument', 'El cliente elegido ya no existe.');
    partyName = p.get('legalName') || p.get('name') || partyName;
    partyTaxId = p.get('taxId') || partyTaxId;
  }
  const v = validateRegister({ partyName, partyTaxId, amountCents: data.amountCents, date: data.date });
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const { amountCents, date } = v.value;
  const year = ecuadorYearOf(date);

  const bankAccountId = readId(data, 'bankAccountId', 'la cuenta bancaria');
  const bankSnap = await db.doc(`companies/${companyId}/bank_accounts/${bankAccountId}`).get();
  if (!bankSnap.exists) throw new HttpsError('invalid-argument', 'La cuenta bancaria no existe.');
  const bankGl = String(bankSnap.get('linkedGlCode') ?? '');
  if (!bankGl) fail('La cuenta bancaria no tiene cuenta contable: configúrala en Cuentas bancarias.');
  const bank: AccountRef = { code: bankGl, name: String(bankSnap.get('linkedGlName') ?? bankGl) };
  const acct = String(bankSnap.get('accountNumber') ?? '');
  const bankName = text(`${bankSnap.get('bankName') ?? ''}${acct ? ` ****${acct.slice(-4)}` : ''}`, 120);

  const mapping = await getAccountMapping(companyId);
  const advancesAcc = mapping.advancesFromCustomers ?? ADVANCES_FROM_CUSTOMERS;

  const advanceRef = db.collection(`companies/${companyId}/advances`).doc();
  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  const journalCounter = db.doc(`companies/${companyId}/counters/journal_entries`);
  const advanceCounter = db.doc(`companies/${companyId}/counters/advances`);

  const result = await db.runTransaction(async (tx) => {
    const periodId = await openPeriodId(tx, db, companyId, year);
    const [jc, ac] = await Promise.all([tx.get(journalCounter), tx.get(advanceCounter)]);
    const jKey = `journal_${year}`;
    const aKey = `ANT_${year}`;
    const entryNumber = ((jc.data()?.[jKey] as number) ?? 0) + 1;
    const seq = ((ac.data()?.[aKey] as number) ?? 0) + 1;
    const number = advanceNumber(year, seq);
    const label = `Anticipo ${number} — ${v.value.partyName}`;
    const now = admin.firestore.Timestamp.now();

    tx.set(journalCounter, { [jKey]: entryNumber }, { merge: true });
    tx.set(advanceCounter, { [aKey]: seq }, { merge: true });
    tx.set(entryRef, entryDoc({
      number: entryNumber, date, description: label, periodId, periodYear: year,
      reference: number, referenceId: advanceRef.id,
      lines: buildRegisterLines(amountCents, bank, advancesAcc, label),
    }));
    tx.set(advanceRef, advanceRecord({
      number, partyId: partyId || null, partyName: v.value.partyName, partyTaxId: v.value.partyTaxId,
      date, year, bankAccountId, bankAccountName: bankName,
      paymentMethodCode: text(data.paymentMethodCode, 2) || null,
      reference: text(data.reference, 120), notes: text(data.notes, 500),
      amountCents, advancesAccount: advancesAcc, entryId: entryRef.id, uid, now,
    }));
    return { advanceId: advanceRef.id, number, entryId: entryRef.id };
  });
  return result;
});

// ─── applyAdvance ─────────────────────────────────────────────────────────────

/**
 * Aplica un anticipo a una o varias facturas del mismo cliente. Entrada:
 * {companyId, advanceId, date: 'AAAA-MM-DD', applications: [{invoiceId,
 * amountCents}]}. Una aplicación y un asiento por factura; la factura que
 * queda sin saldo pasa a cobrada (`paidBy: 'advances'`).
 */
export const applyAdvance = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth?.uid ?? 'system';

  const advanceId = readId(data, 'advanceId', 'el anticipo');
  const date = parseEcuadorDate(data.date);
  if (!date) throw new HttpsError('invalid-argument', 'La fecha va como AAAA-MM-DD.');
  const year = ecuadorYearOf(date);
  const raw = Array.isArray(data.applications) ? data.applications : [];
  if (raw.length === 0) throw new HttpsError('invalid-argument', 'Elige al menos una factura.');
  if (raw.length > MAX_APPLICATIONS) throw new HttpsError('invalid-argument', `Hasta ${MAX_APPLICATIONS} facturas a la vez.`);
  const items = raw.map((x: any) => ({
    invoiceId: readId(x, 'invoiceId', 'la factura'),
    amountCents: positiveCents(x?.amountCents),
  }));
  if (items.some((i: { amountCents: number | null }) => i.amountCents === null)) {
    throw new HttpsError('invalid-argument', 'Cada valor a aplicar tiene que ser mayor que cero.');
  }
  if (new Set(items.map((i: { invoiceId: string }) => i.invoiceId)).size !== items.length) {
    throw new HttpsError('invalid-argument', 'Una factura aparece dos veces.');
  }

  const mapping = await getAccountMapping(companyId);
  const advanceRef = db.doc(`companies/${companyId}/advances/${advanceId}`);
  const journalCounter = db.doc(`companies/${companyId}/counters/journal_entries`);

  return db.runTransaction(async (tx) => {
    const advSnap = await tx.get(advanceRef);
    if (!advSnap.exists) throw new HttpsError('not-found', 'El anticipo no existe.');
    const adv = advSnap.data() as Record<string, any>;
    const invRefs = items.map((i: { invoiceId: string }) => db.doc(`companies/${companyId}/invoices/${i.invoiceId}`));
    const invSnaps = await Promise.all(invRefs.map((r: DocRef) => tx.get(r)));
    const saleRefs = invSnaps.map((s) => {
      const id = s.exists ? s.get('accountingEntryId') : null;
      return typeof id === 'string' && id ? db.doc(`companies/${companyId}/journal_entries/${id}`) : null;
    });
    const saleSnaps = await Promise.all(saleRefs.map((r) => (r ? tx.get(r) : Promise.resolve(null))));
    const periodId = await openPeriodId(tx, db, companyId, year);
    const jc = await tx.get(journalCounter);

    const advancesAcc: AccountRef = adv.advancesAccount?.code ? adv.advancesAccount : mapping.advancesFromCustomers;
    let used = 0;
    const plans = items.map((it: { invoiceId: string; amountCents: number }, k: number) => {
      if (!invSnaps[k].exists) fail('Una de las facturas ya no existe.');
      const inv = invSnaps[k].data() as Record<string, any>;
      const problem = applicationProblem(adv, inv, it.amountCents, date, used);
      if (problem) fail(problem);
      used += it.amountCents;
      const receivable = receivableFromSaleEntry(saleSnaps[k]?.get('lines')) ?? mapping.accountsReceivable;
      return { ...it, inv, ref: invRefs[k], receivable };
    });

    const jKey = `journal_${year}`;
    let entryNumber = (jc.data()?.[jKey] as number) ?? 0;
    const now = admin.firestore.Timestamp.now();
    const out: Array<{ applicationId: string; invoiceId: string; entryId: string; paid: boolean }> = [];
    for (const p of plans) {
      const appRef = db.collection(`companies/${companyId}/advanceApplications`).doc();
      const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
      entryNumber += 1;
      const label = `Aplicación anticipo ${adv.number} a factura ${p.inv.fullNumber ?? p.invoiceId} — ${adv.partyName ?? ''}`.trim();
      tx.set(entryRef, entryDoc({
        number: entryNumber, date, description: label, periodId, periodYear: year,
        reference: `${adv.number} → ${p.inv.fullNumber ?? p.invoiceId}`, referenceId: appRef.id,
        lines: buildApplicationLines(p.amountCents, advancesAcc, p.receivable, label),
      }));
      tx.set(appRef, {
        kind: 'application',
        advanceId,
        advanceNumber: adv.number ?? '',
        partyName: adv.partyName ?? '',
        partyTaxId: adv.partyTaxId ?? '',
        targetType: 'invoice',
        targetId: p.invoiceId,
        targetNumber: p.inv.fullNumber ?? '',
        amountCents: p.amountCents,
        date: admin.firestore.Timestamp.fromDate(date),
        fiscalYear: String(year),
        status: 'applied',
        isVoid: false,
        accountingEntryId: entryRef.id,
        createdBy: uid,
        createdAt: now,
        updatedAt: now,
      });
      const patch = invoicePatchFor(p.inv, appRef.id, p.amountCents, date);
      tx.update(p.ref, { ...toFirestore(patch), updatedAt: now, updatedBy: uid });
      out.push({ applicationId: appRef.id, invoiceId: p.invoiceId, entryId: entryRef.id, paid: patch.paidBy === 'advances' });
    }
    tx.set(journalCounter, { [jKey]: entryNumber }, { merge: true });

    const applied = Number(adv.appliedCents ?? 0) + used;
    const available = advanceAvailableCents({ ...adv, appliedCents: applied });
    tx.update(advanceRef, {
      appliedCents: applied,
      availableCents: available,
      applicationsCount: Number(adv.applicationsCount ?? 0) + plans.length,
      status: advanceStatusFor(available),
      updatedAt: now,
      updatedBy: uid,
    });
    return { applications: out, availableCents: available };
  });
});

// ─── unapplyAdvance ───────────────────────────────────────────────────────────

/**
 * Deshace una aplicación: reversa su asiento, devuelve el valor al anticipo y
 * a la factura (si estaba cobrada solo con anticipos, vuelve a emitida).
 * Entrada: {companyId, applicationId, reason?}.
 */
export const unapplyAdvance = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth?.uid ?? 'system';
  const applicationId = readId(data, 'applicationId', 'la aplicación');
  const reason = text(data.reason, 300);

  const appRef = db.doc(`companies/${companyId}/advanceApplications/${applicationId}`);
  const journalCounter = db.doc(`companies/${companyId}/counters/journal_entries`);

  return db.runTransaction(async (tx) => {
    const appSnap = await tx.get(appRef);
    if (!appSnap.exists) throw new HttpsError('not-found', 'La aplicación no existe.');
    const app = appSnap.data() as Record<string, any>;
    const advanceRef = db.doc(`companies/${companyId}/advances/${app.advanceId}`);
    const invRef = db.doc(`companies/${companyId}/invoices/${app.targetId}`);
    const [advSnap, invSnap] = await Promise.all([tx.get(advanceRef), tx.get(invRef)]);
    if (!advSnap.exists) fail('El anticipo ya no existe.');
    const inv = invSnap.exists ? invSnap.data() as Record<string, any> : undefined;
    const problem = unapplyProblem(app, inv);
    if (problem) fail(problem);
    const prep = app.accountingEntryId ? await prepareReversal(tx, db, companyId, app.accountingEntryId) : null;
    const jc = await tx.get(journalCounter);

    const adv = advSnap.data() as Record<string, any>;
    const now = admin.firestore.Timestamp.now();
    let reversalEntryId: string | null = null;
    if (prep) {
      const jKey = `journal_${prep.entry.periodYear}`;
      const n = ((jc.data()?.[jKey] as number) ?? 0) + 1;
      tx.set(journalCounter, { [jKey]: n }, { merge: true });
      reversalEntryId = writeReversal(tx, db, companyId, n, prep,
        `Aplicación deshecha: anticipo ${adv.number} / factura ${app.targetNumber || app.targetId}`, applicationId, uid);
    }
    tx.update(appRef, {
      status: 'void', isVoid: true, voidedAt: now, voidedBy: uid, voidReason: reason,
      reversalEntryId, updatedAt: now,
    });
    const patch = invoicePatchFor(inv!, applicationId, -Number(app.amountCents), new Date());
    tx.update(invRef, { ...toFirestore(patch), updatedAt: now, updatedBy: uid });
    const applied = Number(adv.appliedCents ?? 0) - Number(app.amountCents);
    const available = advanceAvailableCents({ ...adv, appliedCents: applied });
    tx.update(advanceRef, {
      appliedCents: applied,
      availableCents: available,
      applicationsCount: Math.max(0, Number(adv.applicationsCount ?? 0) - 1),
      status: adv.isVoid === true ? 'void' : advanceStatusFor(available),
      updatedAt: now,
      updatedBy: uid,
    });
    return { reversalEntryId, availableCents: available };
  });
});

// ─── voidAdvance ──────────────────────────────────────────────────────────────

/**
 * Anula un anticipo sin aplicaciones (registrado por error): reversa su
 * asiento. Entrada: {companyId, advanceId, reason}.
 */
export const voidAdvance = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth?.uid ?? 'system';
  const advanceId = readId(data, 'advanceId', 'el anticipo');
  const reason = text(data.reason, 300);
  if (!reason) throw new HttpsError('invalid-argument', 'Escribe el motivo de la anulación.');

  const advanceRef = db.doc(`companies/${companyId}/advances/${advanceId}`);
  const journalCounter = db.doc(`companies/${companyId}/counters/journal_entries`);

  return db.runTransaction(async (tx) => {
    const advSnap = await tx.get(advanceRef);
    if (!advSnap.exists) throw new HttpsError('not-found', 'El anticipo no existe.');
    const adv = advSnap.data() as Record<string, any>;
    const problem = voidProblem(adv);
    if (problem) fail(problem);
    const prep = adv.accountingEntryId ? await prepareReversal(tx, db, companyId, adv.accountingEntryId) : null;
    const jc = await tx.get(journalCounter);

    const now = admin.firestore.Timestamp.now();
    let reversalEntryId: string | null = null;
    if (prep) {
      const jKey = `journal_${prep.entry.periodYear}`;
      const n = ((jc.data()?.[jKey] as number) ?? 0) + 1;
      tx.set(journalCounter, { [jKey]: n }, { merge: true });
      reversalEntryId = writeReversal(tx, db, companyId, n, prep, `Anticipo ${adv.number} anulado`, advanceId, uid);
    }
    tx.update(advanceRef, {
      status: 'void', isVoid: true, availableCents: 0,
      voidedAt: now, voidedBy: uid, voidReason: reason,
      reversalEntryId, updatedAt: now, updatedBy: uid,
    });
    return { reversalEntryId };
  });
});
