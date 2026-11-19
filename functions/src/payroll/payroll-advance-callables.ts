/**
 * Anticipos a empleados y cuentas de nómina (NOMINA_PAGOS.md, 2026-11-18).
 *
 * Un anticipo es dinero que sale ANTES del rol y se descuenta en él:
 *   registerPayrollAdvance: asiento Debe Anticipos / Haber banco o cuenta, el
 *     registro `payrollAdvances/{id}` y la novedad `advance` del mes del
 *     descuento (con `advanceId`), en UNA transacción.
 *   voidPayrollAdvance: asiento invertido, novedad borrada; solo mientras la
 *     nómina de ese mes no esté aprobada.
 * La novedad ligada no se borra desde Novedades (savePayrollNovelties).
 *
 * Los anticipos a largo plazo (con cuotas) van con los préstamos, en
 * `payrollLoans` (D-N12): no son esto.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ecuadorYearOf } from '../accounting/advances/advance-logic';
import { fail, readCompanyId, readId, requirePayrollModule, requirePayrollRole } from './payroll-auth';
import { INPUTS_SEQ_INCREMENT, loadAccountsFor, loadAllParameters } from './payroll-compute';
import { pickParameters } from './payroll-dates';
import { DEFAULT_PAYROLL_ACCOUNTS } from './payroll-entry';
import {
  PAYROLL_ACCOUNT_KEYS, advanceCapProblem, futureDateProblem, advanceNumber, validateAccountsInput, validateAdvanceInput, voidAdvanceProblem,
} from './payroll-payment-logic';
import { openPeriodIn, payrollEntryDoc, prepareReversal, requireMovementAccounts, resolveSource } from './payroll-posting';
import { companyRegionOf, lastDayOfPeriod, parsePeriod, salaryAt } from './payroll-run-logic';

type Tx = admin.firestore.Transaction;

// ─── registerPayrollAdvance ──────────────────────────────────────────────────

/**
 * Entrada: {companyId, employeeId, amountCents, date: 'AAAA-MM-DD', period?:
 * 'AAAA-MM' (el del descuento; por defecto el de la fecha, o el siguiente),
 * paymentMode?, bankAccountId, paymentMethodCode, chequeNumber?,
 * creditAccountCode?, reference?, notes?}. Devuelve {advanceId, number, entryId}.
 */
export const registerPayrollAdvance = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  const uid = request.auth?.uid ?? 'system';
  const v = validateAdvanceInput(data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const input = v.value;
  const year = ecuadorYearOf(input.date);
  const p = parsePeriod(input.period)!;
  const future = futureDateProblem(input.day, new Date());
  if (future) fail(future);

  const base = `companies/${companyId}`;
  const empRef = db.doc(`${base}/payrollEmployees/${input.employeeId}`);
  const empPre = await empRef.get();
  if (!empPre.exists) fail('El empleado no está en la nómina.');
  const emp = empPre.data() as Record<string, any>;
  if (emp.isActive !== true) fail('El empleado está inactivo en la nómina.');

  const params = pickParameters((await loadAllParameters(db)).map((x) => x.p), p.year, p.month);
  if (!params) fail(`No hay parámetros de nómina publicados y vigentes para ${input.period}.`);
  const capPct = Number(params.advanceCapPct ?? 0);

  const source = await resolveSource(db, companyId, input.source);
  const accountsFor = await loadAccountsFor(db, companyId);
  const advancesAccount = accountsFor({ groupId: emp.groupId ?? '', expenseGroup: emp.expenseGroup } as any).advances;
  if (!advancesAccount) fail('Falta la cuenta de anticipos en las cuentas de nómina.');
  if (advancesAccount === source.accountCode) fail('La cuenta de anticipos no puede ser la misma de donde sale el dinero.');
  const names = await requireMovementAccounts(db, companyId, [advancesAccount, source.accountCode], 'del anticipo');

  const advanceRef = db.collection(`${base}/payrollAdvances`).doc();
  const noveltyRef = db.collection(`${base}/payrollNovelties`).doc();
  const entryRef = db.collection(`${base}/journal_entries`).doc();
  const periodRef = db.doc(`${base}/payrollPeriods/${input.period}`);
  const journalCounter = db.doc(`${base}/counters/journal_entries`);
  const payrollCounter = db.doc(`${base}/counters/payroll`);
  const monthNovelties = db.collection(`${base}/payrollNovelties`).where('period', '==', input.period);

  return db.runTransaction(async (tx: Tx) => {
    const [periodSnap, empSnap, novSnap, jc, pc] = await Promise.all([
      tx.get(periodRef), tx.get(empRef), tx.get(monthNovelties), tx.get(journalCounter), tx.get(payrollCounter),
    ]);
    if (periodSnap.get('status') === 'approved') {
      fail('La nómina de ese mes ya está aprobada: el anticipo se descontaría en el mes siguiente.');
    }
    if (!empSnap.exists || empSnap.get('isActive') !== true) fail('El empleado ya no está activo en la nómina.');
    const already = novSnap.docs
      .filter((d) => d.get('employeeId') === input.employeeId && d.get('type') === 'advance')
      .reduce((s, d) => s + Number(d.get('amountCents') ?? 0), 0);
    const salary = salaryAt(empSnap.data()!, lastDayOfPeriod(p.year, p.month));
    const cap = advanceCapProblem(salary, capPct, already, input.amountCents);
    if (cap) fail(cap);
    const periodId = await openPeriodIn(tx, db, companyId, year);

    const now = admin.firestore.Timestamp.now();
    const jKey = `journal_${year}`;
    const aKey = `advance_${year}`;
    const entryNumber = ((jc.data()?.[jKey] as number) ?? 0) + 1;
    const seq = ((pc.data()?.[aKey] as number) ?? 0) + 1;
    const number = advanceNumber(year, seq);
    // Sin el nombre del empleado en el libro (§5.2): solo el número del anticipo.
    const label = `Anticipo a empleado ${number}`;

    tx.set(journalCounter, { [jKey]: entryNumber }, { merge: true });
    tx.set(payrollCounter, { [aKey]: seq }, { merge: true });
    tx.set(entryRef, payrollEntryDoc({
      number: entryNumber, date: input.date, description: `${label} (se descuenta en ${input.period})`,
      periodId, periodYear: year, reference: number, referenceId: advanceRef.id,
      lines: [
        { accountCode: advancesAccount, debitCents: input.amountCents, creditCents: 0 },
        { accountCode: source.accountCode, debitCents: 0, creditCents: input.amountCents },
      ],
      names, label,
    }));
    tx.set(advanceRef, {
      number, employeeId: input.employeeId, employeeName: String(emp.name ?? ''), date: input.day, year,
      period: input.period, amountCents: input.amountCents, status: 'posted',
      paymentMode: input.source.mode, bankAccountId: source.bankAccountId, sourceLabel: source.label,
      sourceAccountCode: source.accountCode, paymentMethodCode: source.paymentMethodCode,
      chequeNumber: source.chequeNumber, advancesAccountCode: advancesAccount,
      reference: input.reference, notes: input.notes, noveltyId: noveltyRef.id, entryId: entryRef.id,
      createdAt: now, createdBy: uid, updatedAt: now,
    });
    tx.set(noveltyRef, {
      period: input.period, employeeId: input.employeeId, type: 'advance', amountCents: input.amountCents,
      accountCode: '', note: `Anticipo ${number}`, advanceId: advanceRef.id, createdAt: now, createdBy: uid,
    });
    tx.update(db.doc(base), { payrollInputsSeq: INPUTS_SEQ_INCREMENT() });
    return { advanceId: advanceRef.id, number, entryId: entryRef.id };
  });
});

// ─── voidPayrollAdvance ──────────────────────────────────────────────────────

/** Entrada: {companyId, advanceId, reason}. Devuelve {advanceId, reversalEntryId}. */
export const voidPayrollAdvance = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  const uid = request.auth?.uid ?? 'system';
  const advanceId = readId(data, 'advanceId', 'el anticipo');
  const reason = String(data.reason ?? '').trim().slice(0, 300);
  const base = `companies/${companyId}`;
  const advanceRef = db.doc(`${base}/payrollAdvances/${advanceId}`);

  return db.runTransaction(async (tx: Tx) => {
    const advSnap = await tx.get(advanceRef);
    const adv = advSnap.exists ? advSnap.data() as Record<string, any> : undefined;
    const periodSnap = adv ? await tx.get(db.doc(`${base}/payrollPeriods/${adv.period}`)) : null;
    const problem = voidAdvanceProblem(adv, periodSnap?.get('status'), reason);
    if (problem) fail(problem);
    const writeReversal = await prepareReversal(tx, db, companyId, String(adv!.entryId ?? ''), 'El anticipo');

    const now = admin.firestore.Timestamp.now();
    const reversalEntryId = writeReversal(reason, uid, advanceId);
    if (adv!.noveltyId) tx.delete(db.doc(`${base}/payrollNovelties/${adv!.noveltyId}`));
    tx.update(advanceRef, { status: 'voided', voidReason: reason, voidedAt: now, voidedBy: uid, reversalEntryId, updatedAt: now });
    tx.update(db.doc(base), { payrollInputsSeq: INPUTS_SEQ_INCREMENT() });
    return { advanceId, reversalEntryId };
  });
});

// ─── Cuentas de nómina ───────────────────────────────────────────────────────

async function payrollAccountsView(db: admin.firestore.Firestore, companyId: string) {
  const snap = await db.doc(`companies/${companyId}/settings/accounting`).get();
  const raw = (snap.get('payrollAccounts') ?? {}) as Record<string, unknown>;
  const saved = Object.fromEntries(PAYROLL_ACCOUNT_KEYS
    .map((k) => [k, typeof raw[k] === 'string' ? String(raw[k]).trim() : ''])
    .filter(([, v]) => v));
  return { defaults: DEFAULT_PAYROLL_ACCOUNTS, saved, region: companyRegionOf(snap.data()) };
}

/**
 * La región de la empresa para el décimo cuarto (NOMINA_COLABORADOR.md §6):
 * una sola para todos los colaboradores. Entrada: {companyId, region:
 * 'sierra'|'costa'}. Devuelve lo mismo que getPayrollAccounts.
 */
export const savePayrollRegion = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  if (data.region !== 'sierra' && data.region !== 'costa') {
    throw new HttpsError('invalid-argument', "La región es 'sierra' (Sierra y Amazonía) o 'costa' (Costa e Insular).");
  }
  await db.doc(`companies/${companyId}/settings/accounting`).set({
    payrollRegion: data.region, payrollRegionUpdatedAt: admin.firestore.Timestamp.now(),
    payrollRegionUpdatedBy: request.auth?.uid ?? 'system',
  }, { merge: true });
  // Cambia el periodo del 14.º de los borradores: que se recalculen.
  await db.doc(`companies/${companyId}`).update({ payrollInputsSeq: INPUTS_SEQ_INCREMENT() });
  return payrollAccountsView(db, companyId);
});

/**
 * Las cuentas de nómina de la empresa: las sugeridas y las que guardó.
 * Entrada: {companyId}. Devuelve {defaults, saved}.
 */
export const getPayrollAccounts = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  return payrollAccountsView(db, companyId);
});

/**
 * Guarda las cuentas de nómina en `settings/accounting.payrollAccounts`. Las
 * claves que no vienen no cambian; una vacía vuelve a la sugerida. Cada
 * código tiene que ser una cuenta de movimiento activa. Entrada: {companyId,
 * accounts: {clave: código}}. Devuelve {defaults, saved}.
 */
export const savePayrollAccounts = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  const v = validateAccountsInput(data.accounts);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const codes = Object.values(v.value).filter(Boolean);
  if (codes.length) await requireMovementAccounts(db, companyId, codes, 'de nómina');
  const patch = Object.fromEntries(Object.entries(v.value)
    .map(([k, code]) => [k, code ? code : admin.firestore.FieldValue.delete()]));
  await db.doc(`companies/${companyId}/settings/accounting`).set({
    payrollAccounts: patch,
    payrollAccountsUpdatedAt: admin.firestore.Timestamp.now(),
    payrollAccountsUpdatedBy: request.auth?.uid ?? 'system',
  }, { merge: true });
  return payrollAccountsView(db, companyId);
});
