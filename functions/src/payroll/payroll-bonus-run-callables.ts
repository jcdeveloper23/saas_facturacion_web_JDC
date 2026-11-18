/**
 * Lotes de décimos acumulados (D-N11, NOMINA_DECIMOS.md, 2026-11-18).
 *
 *   createPayrollBonusRun      borrador con una línea por empleado que lo acumuló
 *   recalculatePayrollBonusRun vuelve a calcular el borrador
 *   payPayrollBonusRun         recalcula con la fecha del pago, crea el asiento
 *                              (descarga la provisión) y marca los meses cubiertos
 *   voidPayrollBonusRun        descarta un borrador o reversa un pago
 *
 * El candado vive en `counters/payroll.bonusLocks.{clave}`: un solo lote vivo
 * por décimo, año (y región en el 14.º). Los meses de un lote pagado guardan
 * `bonusRunIds` en `payrollPeriods/{AAAA-MM}`: reversePayrollRun los rechaza.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ecuadorYearOf } from '../accounting/advances/advance-logic';
import { fail, readCompanyId, readId, requirePayrollModule, requirePayrollRole } from './payroll-auth';
import { bonusLine, ApprovedPayslipForBonus } from './payroll-bonus';
import {
  BonusRunKeyInput, BonusRunLine, bonusKey, bonusLabel, bonusMonths, bonusOpenProblem, bonusPayProblem, bonusRunId,
  bonusTotals, buildBonusPaymentLines, validateBonusKey,
} from './payroll-bonus-run-logic';
import { loadAccountsFor, loadAllParameters, stripUndefined } from './payroll-compute';
import { pickParameters } from './payroll-dates';
import { futureDateProblem, validateMoneySource } from './payroll-payment-logic';
import { openPeriodIn, payrollEntryDoc, prepareReversal, requireMovementAccounts, resolveSource } from './payroll-posting';
import { ecuadorToday } from './payroll-run-logic';
import { parseEcuadorDate } from '../accounting/advances/advance-logic';

type Db = admin.firestore.Firestore;
type Tx = admin.firestore.Transaction;

async function guard(request: any) {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  return { data, companyId, db, uid: request.auth?.uid ?? 'system', base: `companies/${companyId}` };
}

/** Las líneas del décimo: de los roles aprobados de los meses que cubre. */
async function computeLines(db: Db, companyId: string, k: BonusRunKeyInput, payDay: string): Promise<BonusRunLine[]> {
  const base = `companies/${companyId}`;
  const { months } = bonusMonths(k);
  const snap = await db.collection(`${base}/payslips`)
    .where('period', '>=', months[0]).where('period', '<=', months[months.length - 1]).get();
  const byEmp = new Map<string, Array<Record<string, any>>>();
  for (const d of snap.docs) {
    const s = d.data();
    if (s.status !== 'approved') continue;
    if (k.region && (s.employee?.region ?? 'sierra') !== k.region) continue;
    byEmp.set(String(s.employeeId), [...(byEmp.get(String(s.employeeId)) ?? []), s]);
  }
  let sbuCents = 0;
  if (k.kind === 'fourteenth') {
    const [y, m] = payDay.split('-').map(Number);
    const p = pickParameters((await loadAllParameters(db)).map((x) => x.p), y, m);
    if (!p?.sbu) fail(`No hay parámetros de nómina publicados para ${payDay.slice(0, 7)} (el SBU del pago).`);
    sbuCents = Math.round(p.sbu * 100);
  }
  const empRefs = [...byEmp.keys()].map((id) => db.doc(`${base}/payrollEmployees/${id}`));
  const emps = new Map((empRefs.length ? await db.getAll(...empRefs) : []).map((e) => [e.id, e.data() ?? {}]));
  const lines: BonusRunLine[] = [];
  for (const [employeeId, slips] of byEmp) {
    const input: ApprovedPayslipForBonus[] = slips.map((s) => ({
      period: s.period, taxableCents: Number(s.taxableCents ?? 0), workedDays: Number(s.workedDays ?? 0),
      provisions: Array.isArray(s.provisions) ? s.provisions : [],
    }));
    const l = bonusLine({ kind: k.kind, year: k.year, region: k.region ?? undefined, payslips: input, sbuCentsAtPayment: sbuCents });
    if (l.monthsAccumulated === 0) continue; // lo cobró mensual: nada que pagar
    const e = emps.get(employeeId) ?? {};
    const last = slips[slips.length - 1];
    lines.push({
      ...l, employeeId, employeeName: String(e.name ?? last.employee?.name ?? ''),
      groupId: String(e.groupId ?? last.groupId ?? ''), expenseGroup: (e.expenseGroup ?? last.employee?.expenseGroup ?? 'admin'),
    });
  }
  return lines.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

const lockPath = (k: BonusRunKeyInput) => `bonusLocks.${bonusKey(k)}`;

// ─── createPayrollBonusRun / recalculatePayrollBonusRun ───────────────────────

/** Entrada: {companyId, kind, year, region?}. Devuelve {bonusRunId, version, totals}. */
export const createPayrollBonusRun = onCall(async (request) => {
  const { data, companyId, db, uid, base } = await guard(request);
  const v = validateBonusKey(data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const k = v.value;
  const today = ecuadorToday(new Date());
  const lines = await computeLines(db, companyId, k, today);
  const counter = db.doc(`${base}/counters/payroll`);
  return db.runTransaction(async (tx: Tx) => {
    const c = await tx.get(counter);
    const lock = c.get(lockPath(k)) as Record<string, any> | undefined;
    const problem = bonusOpenProblem(k, today, lock);
    if (problem) fail(problem);
    const version = Number(lock?.lastVersion ?? 0) + 1;
    const id = bonusRunId(k, version);
    const now = admin.firestore.Timestamp.now();
    const { from, to } = bonusMonths(k);
    tx.set(db.doc(`${base}/payrollBonusRuns/${id}`), stripUndefined({
      key: bonusKey(k), kind: k.kind, year: k.year, region: k.region, version, from, to, label: bonusLabel(k),
      status: 'draft', lines, totals: bonusTotals(lines), calculatedFor: today,
      createdAt: now, createdBy: uid, updatedAt: now,
    }));
    tx.set(counter, { bonusLocks: { [bonusKey(k)]: { status: 'draft', activeRunId: id, lastVersion: version } } }, { merge: true });
    return { bonusRunId: id, version, totals: bonusTotals(lines) };
  });
});

/** Entrada: {companyId, bonusRunId}. Devuelve {bonusRunId, totals}. */
export const recalculatePayrollBonusRun = onCall(async (request) => {
  const { data, companyId, db, base } = await guard(request);
  const id = readId(data, 'bonusRunId', 'el lote de décimos');
  const ref = db.doc(`${base}/payrollBonusRuns/${id}`);
  const pre = await ref.get();
  if (!pre.exists) fail('El lote de décimos no existe.');
  const k = validateBonusKey(pre.data()!);
  if (!k.ok) fail(k.error);
  const today = ecuadorToday(new Date());
  const lines = await computeLines(db, companyId, k.value, today);
  return db.runTransaction(async (tx: Tx) => {
    const s = await tx.get(ref);
    if (s.get('status') !== 'draft') fail('Solo se recalcula un lote en borrador.');
    tx.update(ref, stripUndefined({ lines, totals: bonusTotals(lines), calculatedFor: today, updatedAt: admin.firestore.Timestamp.now() }));
    return { bonusRunId: id, totals: bonusTotals(lines) };
  });
});

// ─── payPayrollBonusRun ──────────────────────────────────────────────────────

/**
 * Entrada: {companyId, bonusRunId, date, …origen del dinero, reference?, notes?}.
 * Paga a todos los del lote con saldo. Devuelve {bonusRunId, entryId, totalCents}.
 */
export const payPayrollBonusRun = onCall(async (request) => {
  const { data, companyId, db, uid, base } = await guard(request);
  const id = readId(data, 'bonusRunId', 'el lote de décimos');
  const date = parseEcuadorDate(data.date);
  if (!date) throw new HttpsError('invalid-argument', 'La fecha va como AAAA-MM-DD.');
  const day = String(data.date).trim();
  const future = futureDateProblem(day, new Date());
  if (future) fail(future);
  const src = validateMoneySource(data);
  if (!src.ok) throw new HttpsError('invalid-argument', src.error);
  const ref = db.doc(`${base}/payrollBonusRuns/${id}`);
  const pre = await ref.get();
  if (!pre.exists) fail('El lote de décimos no existe.');
  const k = validateBonusKey(pre.data()!);
  if (!k.ok) fail(k.error);

  // Se paga lo que da el cálculo con la fecha del pago (el SBU del 14.º es el de ese día).
  const lines = await computeLines(db, companyId, k.value, day);
  const draftCheck = bonusPayProblem({ status: pre.get('status'), lines });
  if (draftCheck) fail(draftCheck);
  const source = await resolveSource(db, companyId, src.value);
  const accountsFor = await loadAccountsFor(db, companyId);
  const accountsOf = (l: BonusRunLine) => accountsFor({ groupId: l.groupId, expenseGroup: l.expenseGroup } as any);
  const entryLines = buildBonusPaymentLines(k.value.kind, lines, accountsOf, source.accountCode);
  const names = await requireMovementAccounts(db, companyId, entryLines.map((l) => l.accountCode), 'del pago del décimo');
  const year = ecuadorYearOf(date);
  const { months } = bonusMonths(k.value);
  const periodRefs = months.map((m) => db.doc(`${base}/payrollPeriods/${m}`));
  const entryRef = db.collection(`${base}/journal_entries`).doc();
  const journalCounter = db.doc(`${base}/counters/journal_entries`);
  const counter = db.doc(`${base}/counters/payroll`);
  const totals = bonusTotals(lines);
  const paidCents = lines.filter((l) => l.balanceCents > 0).reduce((s, l) => s + l.balanceCents, 0);

  return db.runTransaction(async (tx: Tx) => {
    const [s, jc] = await Promise.all([tx.get(ref), tx.get(journalCounter)]);
    if (s.get('status') !== 'draft') fail('Este lote ya no está en borrador (¿otra persona lo pagó?).');
    const periodId = await openPeriodIn(tx, db, companyId, year);
    const now = admin.firestore.Timestamp.now();
    const jKey = `journal_${year}`;
    const number = ((jc.data()?.[jKey] as number) ?? 0) + 1;
    const label = `Pago ${bonusLabel(k.value)}`;
    tx.set(journalCounter, { [jKey]: number }, { merge: true });
    tx.set(entryRef, payrollEntryDoc({
      number, date, description: `${label} (${lines.filter((l) => l.balanceCents > 0).length} empleado(s))`,
      periodId, periodYear: year, reference: id, referenceId: id, lines: entryLines, names, label,
    }));
    tx.update(ref, stripUndefined({
      status: 'paid', lines, totals, paidCents, paymentDate: day, entryId: entryRef.id,
      paymentMode: src.value.mode, bankAccountId: source.bankAccountId, sourceLabel: source.label,
      sourceAccountCode: source.accountCode, paymentMethodCode: source.paymentMethodCode, chequeNumber: source.chequeNumber,
      reference: String(data.reference ?? '').trim().slice(0, 120), notes: String(data.notes ?? '').trim().slice(0, 500),
      paidAt: now, paidBy: uid, updatedAt: now,
    }));
    for (const r of periodRefs) tx.set(r, { bonusRunIds: admin.firestore.FieldValue.arrayUnion(id) }, { merge: true });
    tx.set(counter, { bonusLocks: { [bonusKey(k.value)]: { status: 'paid' } } }, { merge: true });
    return { bonusRunId: id, entryId: entryRef.id, totalCents: paidCents };
  });
});

// ─── voidPayrollBonusRun ─────────────────────────────────────────────────────

/** Descarta un borrador o reversa un pago. Entrada: {companyId, bonusRunId, reason}. */
export const voidPayrollBonusRun = onCall(async (request) => {
  const { data, companyId, db, uid, base } = await guard(request);
  const id = readId(data, 'bonusRunId', 'el lote de décimos');
  const reason = String(data.reason ?? '').trim().slice(0, 300);
  if (!reason) throw new HttpsError('invalid-argument', 'Escribe el motivo.');
  const ref = db.doc(`${base}/payrollBonusRuns/${id}`);
  const counter = db.doc(`${base}/counters/payroll`);
  return db.runTransaction(async (tx: Tx) => {
    const s = await tx.get(ref);
    if (!s.exists) fail('El lote de décimos no existe.');
    const run = s.data() as Record<string, any>;
    if (run.status !== 'draft' && run.status !== 'paid') fail('El lote ya está anulado.');
    const k = validateBonusKey(run);
    if (!k.ok) fail(k.error);
    const writeReversal = run.status === 'paid'
      ? await prepareReversal(tx, db, companyId, String(run.entryId ?? ''), 'El pago del décimo') : null;
    const now = admin.firestore.Timestamp.now();
    const reversalEntryId = writeReversal ? writeReversal(reason, uid, id) : null;
    if (run.status === 'paid') {
      for (const m of bonusMonths(k.value).months) {
        tx.set(db.doc(`${base}/payrollPeriods/${m}`), { bonusRunIds: admin.firestore.FieldValue.arrayRemove(id) }, { merge: true });
      }
    }
    tx.update(ref, { status: 'voided', voidReason: reason, voidedAt: now, voidedBy: uid, reversalEntryId, updatedAt: now });
    tx.set(counter, { bonusLocks: { [bonusKey(k.value)]: { status: 'voided', activeRunId: null } } }, { merge: true });
    return { bonusRunId: id, reversalEntryId };
  });
});
