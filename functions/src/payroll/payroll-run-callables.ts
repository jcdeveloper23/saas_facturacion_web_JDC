/**
 * El ciclo de la nómina del mes (PLAN_NOMINA.md §5.3, §5.4, E3):
 *
 *   (sin nómina) ─createPayrollRun─► draft ─approvePayrollRun─► approved ─reversePayrollRun─► reversed
 *                                     ▲ recalculatePayrollRun                     │
 *                                     └──────────────────── nueva versión vN+1 ───┘
 *
 * El candado del mes es `payrollPeriods/{AAAA-MM}`: impide dos nóminas vivas.
 * Aprobar congela los roles y crea el asiento en UNA transacción, con contador,
 * asiento y estado juntos (patrón de cash-voucher-callables.ts). Reversar
 * invierte el asiento, marca el original `cancelled` y devuelve el saldo de los
 * préstamos, también en una transacción.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { closedPeriodReversalError } from '../accounting/utils/closed-period';
import { invertLines, sumSide } from '../accounting/advances/advance-logic';
import { buildPayrollEntryLines, PayrollEntryError } from './payroll-entry';
import { fail, readCompanyId, readId, requirePayrollModule, requirePayrollRole } from './payroll-auth';
import { ComputedRun, computeRun, inputsSeqOf, loadAccountsFor, payslipDoc, readChart, stripUndefined } from './payroll-compute';
import {
  approveProblem, createRunProblem, futurePeriodProblem, lastDayOfPeriod, nextVersion, parsePeriod, payslipId, reverseProblem,
  reversalDate, runId as makeRunId, runTotals, toJournalLines,
} from './payroll-run-logic';

type Db = admin.firestore.Firestore;
type Tx = admin.firestore.Transaction;
const ENTRY_TYPE = 'automatic';

/** Ecuador UTC-5: mediodía local, para que la fecha no cambie de día. */
const ecuadorNoon = (iso: string) => new Date(`${iso}T17:00:00Z`);

function runFields(c: ComputedRun) {
  return {
    totals: runTotals(c.payslips.map((p) => p.result)),
    warnings: c.warnings.map((message) => ({ message })),
    blockingErrors: c.blockingErrors,
    parametersId: c.parametersId,
  };
}

/**
 * Los roles del borrador, en la MISMA transacción que la nómina: se vuelve a
 * leer la nómina y se exige que siga en borrador, para que un recálculo lento
 * no pise una aprobación hecha entretanto. También falla si cambiaron
 * novedades o empleados desde que se calculó (payrollInputsSeq).
 */
async function writeDraftPayslips(tx: Tx, db: Db, companyId: string, run: string, period: string, c: ComputedRun) {
  const col = db.collection(`companies/${companyId}/payslips`);
  const old = await tx.get(col.where('runId', '==', run));
  const now = admin.firestore.Timestamp.now();
  return () => {
    const keep = new Set(c.payslips.map((p) => payslipId(run, p.result.employeeId)));
    for (const d of old.docs) if (!keep.has(d.id)) tx.delete(d.ref);
    for (const p of c.payslips) {
      tx.set(col.doc(payslipId(run, p.result.employeeId)),
        payslipDoc({ runId: run, period, c: p, status: 'draft', params: c.params, parametersId: c.parametersId, now }));
    }
  };
}

const CHANGED_WHILE_CALCULATING =
  'Cambiaron novedades o empleados mientras se calculaba la nómina: vuelve a intentarlo.';

// ─── createPayrollRun ────────────────────────────────────────────────────────

/** Abre y calcula la nómina del mes. Entrada: {companyId, period}. Devuelve {runId, version}. */
export const createPayrollRun = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  const uid = request.auth?.uid ?? 'system';
  const p = parsePeriod(data.period);
  if (!p) throw new HttpsError('invalid-argument', 'El mes tiene que ser AAAA-MM.');
  const future = futurePeriodProblem(p.period, new Date());
  if (future) fail(future);

  const computed = await computeRun(db, companyId, p.year, p.month);
  const base = `companies/${companyId}`;
  const periodRef = db.doc(`${base}/payrollPeriods/${p.period}`);
  const companyRef = db.doc(base);

  // El candado: solo una nómina viva por mes. La versión sale del candado.
  return db.runTransaction(async (tx) => {
    const [ps, company] = await Promise.all([tx.get(periodRef), tx.get(companyRef)]);
    if (inputsSeqOf(company.data()) !== computed.inputsSeq) fail(CHANGED_WHILE_CALCULATING);
    const problem = createRunProblem(ps.exists ? ps.data() : undefined);
    if (problem) fail(problem);
    const v = nextVersion(ps.exists ? ps.data() : undefined);
    const id = makeRunId(p.period, v);
    const writeSlips = await writeDraftPayslips(tx, db, companyId, id, p.period, computed);
    const prev = ps.get('activeRunId') ?? ps.get('lastRunId') ?? null;
    const now = admin.firestore.Timestamp.now();
    tx.set(periodRef, { status: 'draft', activeRunId: id, lastRunId: id, lastVersion: v, updatedAt: now }, { merge: true });
    tx.set(db.doc(`${base}/payrollRuns/${id}`), stripUndefined({
      period: p.period, version: v, status: 'draft', ...runFields(computed),
      supersedesRunId: v > 1 ? prev : null,
      accountingEntryId: null, reversalEntryId: null,
      calculatedAt: now, createdAt: now, createdBy: uid, updatedAt: now,
    }));
    writeSlips();
    return { runId: id, version: v };
  });
});

// ─── recalculatePayrollRun ───────────────────────────────────────────────────

/** Vuelve a calcular un borrador (cambiaron novedades o empleados). Entrada: {companyId, runId}. */
export const recalculatePayrollRun = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  const id = readId(data, 'runId', 'la nómina');
  const runRef = db.doc(`companies/${companyId}/payrollRuns/${id}`);
  const snap = await runRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'La nómina no existe.');
  if (snap.get('status') !== 'draft') fail('Solo se recalcula una nómina en borrador.');
  const p = parsePeriod(snap.get('period'))!;
  const computed = await computeRun(db, companyId, p.year, p.month);
  const companyRef = db.doc(`companies/${companyId}`);
  await db.runTransaction(async (tx) => {
    const [r, company] = await Promise.all([tx.get(runRef), tx.get(companyRef)]);
    if (r.get('status') !== 'draft') fail('Esta nómina ya no está en borrador (¿otra persona la aprobó?).');
    if (inputsSeqOf(company.data()) !== computed.inputsSeq) fail(CHANGED_WHILE_CALCULATING);
    const writeSlips = await writeDraftPayslips(tx, db, companyId, id, p.period, computed);
    const now = admin.firestore.Timestamp.now();
    tx.update(runRef, stripUndefined({ ...runFields(computed), calculatedAt: now, updatedAt: now }));
    writeSlips();
  });
  return { runId: id, totals: runFields(computed).totals, blockingErrors: computed.blockingErrors };
});

// ─── approvePayrollRun ───────────────────────────────────────────────────────

/**
 * Aprueba: recalcula, valida cuentas y parámetros, y en UNA transacción
 * congela los roles (con su copia de parámetros), crea el asiento, mueve el
 * saldo de los préstamos y cierra el candado del mes. Solo una aprobación gana.
 * Entrada: {companyId, runId}. Devuelve {runId, accountingEntryId, number}.
 */
export const approvePayrollRun = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  const uid = request.auth?.uid ?? 'system';
  const id = readId(data, 'runId', 'la nómina');
  const base = `companies/${companyId}`;
  const runRef = db.doc(`${base}/payrollRuns/${id}`);

  const pre = await runRef.get();
  if (!pre.exists) throw new HttpsError('not-found', 'La nómina no existe.');
  const p = parsePeriod(pre.get('period'))!;
  const future = futurePeriodProblem(p.period, new Date());
  if (future) fail(future);

  // Se aprueba lo que da el cálculo ahora, no un borrador viejo.
  const computed = await computeRun(db, companyId, p.year, p.month);
  const problem = approveProblem({ status: pre.get('status'), ...runFields(computed) });
  if (problem) fail(problem);

  // Cuentas: las del grupo o la empresa; existen, activas y de movimiento (§5.2).
  const accountsFor = await loadAccountsFor(db, companyId);
  let lines;
  try {
    lines = buildPayrollEntryLines(computed.payslips.map((x) => x.result), accountsFor);
  } catch (e) {
    if (e instanceof PayrollEntryError) fail(e.message);
    throw e;
  }
  const chart = await readChart(db, companyId, lines.map((l) => l.accountCode));
  for (const l of lines) {
    const c = chart.get(l.accountCode);
    const why = !c ? 'no existe en el plan de cuentas' : !c.isActive ? 'está inactiva'
      : !c.allowsMovement ? 'es agrupadora: no admite movimientos' : null;
    if (why) fail(`La cuenta ${l.accountCode} de la nómina ${why}. Revisa las cuentas de nómina.`);
  }
  const names = new Map([...chart].map(([k, v]) => [k, v.name]));
  const label = `Nómina ${p.period}`;
  const journalLines = toJournalLines(lines, names, label);
  const { debit, credit } = sumSide(journalLines);
  if (Math.abs(debit - credit) >= 0.005) fail('El asiento de la nómina no cuadra: no se aprobó.');

  const periodRef = db.doc(`${base}/payrollPeriods/${p.period}`);
  const journalCounter = db.doc(`${base}/counters/journal_entries`);
  const entryRef = db.collection(`${base}/journal_entries`).doc();
  const date = ecuadorNoon(lastDayOfPeriod(p.year, p.month));
  const loanIds = [...new Set(computed.payslips.flatMap((x) => x.result.loanBalances.map((b) => b.loanId)))];
  // Roles del borrador que ya no corresponden (el empleado salió de la nómina).
  const keep = new Set(computed.payslips.map((x) => payslipId(id, x.result.employeeId)));
  const stale = (await db.collection(`${base}/payslips`).where('runId', '==', id).get())
    .docs.filter((d) => !keep.has(d.id)).map((d) => d.ref);

  return db.runTransaction(async (tx: Tx) => {
    const [runSnap, periodSnap, jc, company] = await Promise.all([
      tx.get(runRef), tx.get(periodRef), tx.get(journalCounter), tx.get(db.doc(base)),
    ]);
    if (runSnap.get('status') !== 'draft') fail('Esta nómina ya no está en borrador (¿otra persona la aprobó?).');
    // Una novedad o un empleado guardados durante el cálculo no se pierden.
    if (inputsSeqOf(company.data()) !== computed.inputsSeq) fail(CHANGED_WHILE_CALCULATING);
    if (periodSnap.get('activeRunId') !== id) fail('Esta nómina ya no es la vigente del mes.');
    const ejercicio = await tx.get(db.collection(`${base}/accounting_periods`)
      .where('year', '==', p.year).where('status', '==', 'open').limit(1));
    if (ejercicio.empty) fail(`No hay un ejercicio contable abierto para ${p.year}.`);
    const loanRefs = loanIds.map((l) => db.doc(`${base}/payrollLoans/${l}`));
    const loanSnaps = loanRefs.length ? await tx.getAll(...loanRefs) : [];
    const balanceNow = new Map(loanSnaps.map((s) => [s.id, Number(s.get('balanceCents') ?? 0)]));

    const now = admin.firestore.Timestamp.now();
    const jKey = `journal_${p.year}`;
    const number = ((jc.data()?.[jKey] as number) ?? 0) + 1;
    const entryLines = journalLines.map((l) => ({ id: crypto.randomUUID(), costCenterId: null, costCenterName: null, ...l }));
    tx.set(journalCounter, { [jKey]: number }, { merge: true });
    tx.set(entryRef, {
      number, date: admin.firestore.Timestamp.fromDate(date),
      description: `${label} (${computed.payslips.length} empleado(s))`,
      periodId: ejercicio.docs[0].id, periodYear: p.year,
      type: ENTRY_TYPE, source: 'payroll', status: 'posted',
      reference: id, referenceId: id,
      lines: entryLines, accountCodes: [...new Set(entryLines.map((l) => l.accountCode))],
      totalDebit: debit, totalCredit: credit, isBalanced: true,
      createdBy: 'system', createdAt: now, updatedAt: now,
    });
    // Roles congelados, con lo calculado ahora.
    for (const ref of stale) tx.delete(ref);
    for (const x of computed.payslips) {
      tx.set(db.doc(`${base}/payslips/${payslipId(id, x.result.employeeId)}`), payslipDoc({
        runId: id, period: p.period, c: x, status: 'approved', params: computed.params,
        parametersId: computed.parametersId, now,
      }));
    }
    // Préstamos: baja la cuota; si ya llegó a cero, se cierra (D-N12).
    for (const x of computed.payslips) {
      for (const lb of x.result.loanBalances) {
        const cuota = x.result.deductions.find((d) => d.loanId === lb.loanId)?.amountCents ?? 0;
        const nuevo = (balanceNow.get(lb.loanId) ?? 0) - cuota;
        if (nuevo < 0) fail('El saldo de un préstamo cambió mientras se aprobaba: recalcula y vuelve a aprobar.');
        balanceNow.set(lb.loanId, nuevo);
        tx.update(db.doc(`${base}/payrollLoans/${lb.loanId}`), {
          balanceCents: nuevo, status: nuevo === 0 ? 'paid' : 'active', updatedAt: now,
        });
      }
    }
    tx.update(runRef, stripUndefined({
      ...runFields(computed), status: 'approved', accountingEntryId: entryRef.id,
      parametersSnapshot: computed.params, approvedAt: now, approvedBy: uid, updatedAt: now,
    }));
    tx.set(periodRef, { status: 'approved', updatedAt: now }, { merge: true });
    return { runId: id, accountingEntryId: entryRef.id, number };
  });
});

// ─── reversePayrollRun ───────────────────────────────────────────────────────

/**
 * Reversa la nómina completa (D-N5): asiento invertido, original `cancelled`,
 * roles `reversed`, saldo de préstamos devuelto y el mes libre para la versión
 * siguiente. Exige motivo; se rechaza con el ejercicio cerrado o el asiento
 * conciliado. Entrada: {companyId, runId, reason}. Devuelve {runId, reversalEntryId}.
 */
export const reversePayrollRun = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  const uid = request.auth?.uid ?? 'system';
  const id = readId(data, 'runId', 'la nómina');
  const reason = String(data.reason ?? '').trim().slice(0, 300);
  const base = `companies/${companyId}`;
  const runRef = db.doc(`${base}/payrollRuns/${id}`);
  const slips = await db.collection(`${base}/payslips`).where('runId', '==', id).get();
  const journalCounter = db.doc(`${base}/counters/journal_entries`);

  return db.runTransaction(async (tx: Tx) => {
    const runSnap = await tx.get(runRef);
    const run = runSnap.exists ? runSnap.data() as Record<string, any> : undefined;
    const problem = reverseProblem(run, reason);
    if (problem) fail(problem);
    const entryId = String(run!.accountingEntryId ?? '');
    if (!entryId || entryId.includes('/')) fail('La nómina no tiene asiento: no se puede reversar.');
    const entryRef = db.doc(`${base}/journal_entries/${entryId}`);
    const [entrySnap, reconciled, jc] = await Promise.all([
      tx.get(entryRef), tx.get(db.doc(`${base}/bank_reconciled_entries/${entryId}`)), tx.get(journalCounter),
    ]);
    if (reconciled.exists) fail('El asiento de la nómina está conciliado con el banco: primero deshaz la conciliación.');
    const entry = entrySnap.exists ? entrySnap.data() as Record<string, any> : null;
    if (!entry) fail('El asiento de la nómina ya no existe.');
    if (entry.status !== 'posted') fail('El asiento de la nómina ya no está contabilizado: no se puede reversar.');
    const periodSnap = entry.periodId ? await tx.get(db.doc(`${base}/accounting_periods/${entry.periodId}`)) : null;
    const closed = closedPeriodReversalError(periodSnap?.exists ? periodSnap.data() as any : null, entry.periodYear);
    if (closed) fail(closed);

    // Lo que cada rol descontó de cada préstamo vuelve al saldo.
    const devolver = new Map<string, number>();
    for (const s of slips.docs) {
      for (const d of (s.get('deductions') ?? []) as any[]) {
        if (d?.concept === 'loan' && d.loanId) devolver.set(d.loanId, (devolver.get(d.loanId) ?? 0) + Number(d.amountCents ?? 0));
      }
    }
    const loanRefs = [...devolver.keys()].map((l) => db.doc(`${base}/payrollLoans/${l}`));
    const loanSnaps = loanRefs.length ? await tx.getAll(...loanRefs) : [];

    const now = admin.firestore.Timestamp.now();
    const periodYear = Number(entry.periodYear);
    const jKey = `journal_${periodYear}`;
    const n = ((jc.data()?.[jKey] as number) ?? 0) + 1;
    const revRef = db.collection(`${base}/journal_entries`).doc();
    const revLines = invertLines(entry.lines ?? []).map((l: any) => ({ ...l, id: crypto.randomUUID() }));
    const { debit, credit } = sumSide(revLines);
    const original = entry.date?.toDate ? entry.date.toDate() as Date : null;
    const revDate = reversalDate(periodYear, new Date(), original);
    tx.set(journalCounter, { [jKey]: n }, { merge: true });
    tx.set(revRef, {
      number: n, date: admin.firestore.Timestamp.fromDate(revDate),
      description: `[REVERSA] ${entry.description ?? ''} — ${reason}`.slice(0, 600),
      periodId: entry.periodId, periodYear, type: ENTRY_TYPE, source: 'payroll', status: 'posted',
      reference: entry.reference ?? id, referenceId: id, reversalOf: entryId,
      lines: revLines, accountCodes: [...new Set(revLines.map((l: any) => l.accountCode))],
      totalDebit: debit, totalCredit: credit, isBalanced: Math.abs(debit - credit) < 0.005,
      createdBy: 'system', createdAt: now, updatedAt: now,
    });
    tx.update(entryRef, {
      status: 'cancelled', reversalEntryId: revRef.id, cancelledAt: now, cancelledBy: uid,
      cancelReason: `Nómina ${id} reversada: ${reason}`, updatedAt: now,
    });
    loanSnaps.forEach((s, i) => {
      if (!s.exists) return;
      // Solo vuelve a activo el que esta nómina dejó pagado; uno cancelado a mano sigue cancelado.
      const status = s.get('status') === 'paid' ? 'active' : s.get('status');
      tx.update(loanRefs[i], {
        balanceCents: Number(s.get('balanceCents') ?? 0) + (devolver.get(s.id) ?? 0), status, updatedAt: now,
      });
    });
    for (const s of slips.docs) tx.update(s.ref, { status: 'reversed', updatedAt: now });
    tx.update(runRef, {
      status: 'reversed', reversalEntryId: revRef.id, reversalReason: reason,
      reversedAt: now, reversedBy: uid, updatedAt: now,
    });
    // El mes queda libre para la versión siguiente (supersedesRunId).
    tx.set(db.doc(`${base}/payrollPeriods/${run!.period}`), {
      status: 'reversed', activeRunId: null, lastRunId: id, updatedAt: now,
    }, { merge: true });
    return { runId: id, reversalEntryId: revRef.id };
  });
});
