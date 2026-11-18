/**
 * Pago de roles (NOMINA_PAGOS.md, 2026-11-18; D-N6 adelantado de E6).
 *
 * Una nómina aprobada deja el neto de cada empleado en «Por pagar empleados».
 * `payPayrollRun` lo descarga para los roles que se elijan, con UN asiento
 * (Debe por pagar empleados / Haber banco o cuenta) y UN registro en
 * `payrollPayments`. Cada rol se paga completo: lo que le falta.
 * `voidPayrollPayment` lo deshace con el asiento invertido. Mientras una
 * nómina tenga pagos vivos no se puede reversar (reverseProblem).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ecuadorDay, ecuadorYearOf } from '../accounting/advances/advance-logic';
import { fail, readCompanyId, readId, requirePayrollModule, requirePayrollRole } from './payroll-auth';
import { loadAccountsFor } from './payroll-compute';
import {
  buildPaymentLines, futureDateProblem, payslipPendingCents, paymentNumber, paymentProblem, paymentStatusFor, validatePaymentInput,
} from './payroll-payment-logic';
import { openPeriodIn, payrollEntryDoc, prepareReversal, requireMovementAccounts, resolveSource } from './payroll-posting';

type Tx = admin.firestore.Transaction;

/** La cuenta del neto de un rol: la que guardó al aprobarse o, si es viejo, la de hoy. */
function netPayableOf(slip: Record<string, any>, accountsFor: Awaited<ReturnType<typeof loadAccountsFor>>): string {
  const saved = String(slip.netPayableAccountCode ?? '');
  if (saved) return saved;
  return accountsFor({ groupId: slip.groupId ?? '', expenseGroup: slip.employee?.expenseGroup } as any).netPayable;
}

// ─── payPayrollRun ───────────────────────────────────────────────────────────

/**
 * Entrada: {companyId, runId, payslipIds: [...], date: 'AAAA-MM-DD',
 * paymentMode?: 'bank' | 'account', bankAccountId, paymentMethodCode,
 * chequeNumber?, creditAccountCode? (con 'account'), reference?, notes?}.
 * Devuelve {paymentId, number, entryId, totalCents}.
 */
export const payPayrollRun = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  const uid = request.auth?.uid ?? 'system';
  const v = validatePaymentInput(data);
  if (!v.ok) throw new HttpsError('invalid-argument', v.error);
  const input = v.value;
  const day = ecuadorDay(input.date);
  const year = ecuadorYearOf(input.date);
  const future = futureDateProblem(day, new Date());
  if (future) fail(future);

  const base = `companies/${companyId}`;
  const source = await resolveSource(db, companyId, input.source);
  const runRef = db.doc(`${base}/payrollRuns/${input.runId}`);
  const slipRefs = input.payslipIds.map((id) => db.doc(`${base}/payslips/${id}`));

  // Las cuentas se validan fuera de la transacción (consultas al plan); dentro
  // se vuelven a leer los roles y se exige que sigan pendientes.
  const accountsFor = await loadAccountsFor(db, companyId);
  const pre = await db.getAll(...slipRefs);
  const accountOf = new Map(pre.map((s) => [s.id, s.exists ? netPayableOf(s.data()!, accountsFor) : '']));
  const names = await requireMovementAccounts(db, companyId,
    [...[...accountOf.values()].filter(Boolean), source.accountCode], 'del pago');

  const paymentRef = db.collection(`${base}/payrollPayments`).doc();
  const entryRef = db.collection(`${base}/journal_entries`).doc();
  const journalCounter = db.doc(`${base}/counters/journal_entries`);
  const payrollCounter = db.doc(`${base}/counters/payroll`);

  return db.runTransaction(async (tx: Tx) => {
    const [runSnap, jc, pc, ...slipSnaps] = await Promise.all([
      tx.get(runRef), tx.get(journalCounter), tx.get(payrollCounter), ...slipRefs.map((r) => tx.get(r)),
    ]);
    const run = runSnap.exists ? runSnap.data() as Record<string, any> : undefined;
    const slips = slipSnaps.map((s) => (s.exists ? s.data() as Record<string, any> : undefined));
    const problem = paymentProblem(run, input.runId, slips, day);
    if (problem) fail(problem);
    const periodId = await openPeriodIn(tx, db, companyId, year);

    const items = slipSnaps.map((s, i) => ({
      payslipId: s.id,
      employeeId: String(slips[i]!.employeeId ?? ''),
      name: String(slips[i]!.employee?.name ?? ''),
      amountCents: payslipPendingCents(slips[i]),
      netPayableAccount: accountOf.get(s.id) || netPayableOf(slips[i]!, accountsFor),
    }));
    const totalCents = items.reduce((s, i) => s + i.amountCents, 0);
    const now = admin.firestore.Timestamp.now();
    const jKey = `journal_${year}`;
    const pKey = `payment_${year}`;
    const entryNumber = ((jc.data()?.[jKey] as number) ?? 0) + 1;
    const seq = ((pc.data()?.[pKey] as number) ?? 0) + 1;
    const number = paymentNumber(year, seq);
    const label = `Pago de nómina ${run!.period} — ${number}`;

    tx.set(journalCounter, { [jKey]: entryNumber }, { merge: true });
    tx.set(payrollCounter, { [pKey]: seq }, { merge: true });
    tx.set(entryRef, payrollEntryDoc({
      number: entryNumber, date: input.date, description: `${label} (${items.length} empleado(s))`,
      periodId, periodYear: year, reference: number, referenceId: paymentRef.id,
      lines: buildPaymentLines(items, source.accountCode), names, label,
    }));
    tx.set(paymentRef, {
      number, runId: input.runId, period: run!.period, date: day, year, status: 'posted',
      paymentMode: input.source.mode, bankAccountId: source.bankAccountId, sourceLabel: source.label,
      sourceAccountCode: source.accountCode, paymentMethodCode: source.paymentMethodCode,
      chequeNumber: source.chequeNumber, reference: input.reference, notes: input.notes,
      lines: items, totalCents, entryId: entryRef.id, createdAt: now, createdBy: uid, updatedAt: now,
    });
    items.forEach((it, i) => {
      tx.update(slipRefs[i], {
        paidCents: Number(slips[i]!.paidCents ?? 0) + it.amountCents,
        paymentStatus: 'paid',
        paymentIds: admin.firestore.FieldValue.arrayUnion(paymentRef.id),
        paidAt: now, updatedAt: now,
      });
    });
    const runPaid = Number(run!.paidCents ?? 0) + totalCents;
    tx.update(runRef, {
      paidCents: runPaid, paymentStatus: paymentStatusFor(Number(run!.totals?.netCents ?? 0), runPaid), updatedAt: now,
    });
    return { paymentId: paymentRef.id, number, entryId: entryRef.id, totalCents };
  });
});

// ─── voidPayrollPayment ──────────────────────────────────────────────────────

/**
 * Anula un pago de roles: asiento invertido y los roles vuelven a quedar por
 * pagar. Entrada: {companyId, paymentId, reason}. Devuelve {paymentId, reversalEntryId}.
 */
export const voidPayrollPayment = onCall(async (request) => {
  const data = request.data ?? {};
  const companyId = readCompanyId(data);
  requirePayrollRole(request, companyId);
  const db = admin.firestore();
  await requirePayrollModule(db, companyId);
  const uid = request.auth?.uid ?? 'system';
  const paymentId = readId(data, 'paymentId', 'el pago');
  const reason = String(data.reason ?? '').trim().slice(0, 300);
  if (!reason) throw new HttpsError('invalid-argument', 'Escribe el motivo de la anulación.');
  const base = `companies/${companyId}`;
  const paymentRef = db.doc(`${base}/payrollPayments/${paymentId}`);

  return db.runTransaction(async (tx: Tx) => {
    const paySnap = await tx.get(paymentRef);
    if (!paySnap.exists) fail('El pago no existe.');
    const pay = paySnap.data() as Record<string, any>;
    if (pay.status === 'voided') fail('El pago ya está anulado.');
    const lines: Array<{ payslipId: string; amountCents: number }> = Array.isArray(pay.lines) ? pay.lines : [];
    const runRef = db.doc(`${base}/payrollRuns/${pay.runId}`);
    const slipRefs = lines.map((l) => db.doc(`${base}/payslips/${l.payslipId}`));
    const [runSnap, ...slipSnaps] = await Promise.all([tx.get(runRef), ...slipRefs.map((r) => tx.get(r))]);
    const writeReversal = await prepareReversal(tx, db, companyId, String(pay.entryId ?? ''), 'El pago de nómina');

    const now = admin.firestore.Timestamp.now();
    const reversalEntryId = writeReversal(reason, uid, paymentId);
    slipSnaps.forEach((s, i) => {
      if (!s.exists) return;
      const paid = Math.max(0, Number(s.get('paidCents') ?? 0) - Number(lines[i].amountCents ?? 0));
      tx.update(slipRefs[i], {
        paidCents: paid,
        paymentStatus: paymentStatusFor(Number(s.get('netCents') ?? 0), paid),
        paymentIds: admin.firestore.FieldValue.arrayRemove(paymentId),
        updatedAt: now,
      });
    });
    if (runSnap.exists) {
      const paid = Math.max(0, Number(runSnap.get('paidCents') ?? 0) - Number(pay.totalCents ?? 0));
      tx.update(runRef, {
        paidCents: paid, paymentStatus: paymentStatusFor(Number(runSnap.get('totals.netCents') ?? 0), paid), updatedAt: now,
      });
    }
    tx.update(paymentRef, {
      status: 'voided', voidReason: reason, voidedAt: now, voidedBy: uid, reversalEntryId, updatedAt: now,
    });
    return { paymentId, reversalEntryId };
  });
});
