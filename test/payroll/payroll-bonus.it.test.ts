/**
 * Integración contra el emulador: lote del décimo tercero acumulado
 * (NOMINA_DECIMOS.md). Empresa propia (c5). No toca producción.
 * ⚠️ Usa el reloj real: el 13.º 2026 se abre desde noviembre de 2026.
 */
import * as admin from 'firebase-admin';
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-facturaec' });
import { upsertPayrollEmployee } from '../../functions/src/payroll/payroll-employee-callables';
import { createPayrollRun, approvePayrollRun, reversePayrollRun } from '../../functions/src/payroll/payroll-run-callables';
import {
  createPayrollBonusRun, recalculatePayrollBonusRun, payPayrollBonusRun, voidPayrollBonusRun,
} from '../../functions/src/payroll/payroll-bonus-run-callables';
import { createPayrollLoan } from '../../functions/src/payroll/payroll-group-loan-callables';
import { ecuadorToday } from '../../functions/src/payroll/payroll-run-logic';

const db = admin.firestore();
const C = 'c5';
const call = (fn: any, data: any, token: any = { role: 'admin', companyId: C }) =>
  fn.run({ data: { companyId: C, ...data }, auth: { uid: 'u1', token }, rawRequest: {} as any });
const doc = async (p: string) => (await db.doc(`companies/${C}/${p}`).get()).data()!;
const CODES = ['5.2.01.001', '5.2.02.001', '5.2.01.002', '5.2.01.003', '5.2.01.004', '5.2.01.005', '5.2.01.006', '5.2.01.007',
  '2.1.01.003', '1.1.02.002', '2.1.04.006', '2.1.04.007', '2.1.03.001', '2.1.03.002', '2.1.03.003', '2.1.03.004', '1.1.01.002'];
const bank = { paymentMode: 'bank', bankAccountId: 'b1', paymentMethodCode: '20' };

beforeAll(async () => {
  await db.doc(`companies/${C}`).set({ name: 'EMPRESA CINCO', enabledPackages: ['pkg_base', 'pkg_accounting', 'pkg_hr'],
    planLimits: { masterData: { employeesTotal: 5 } }, sri: { ruc: '1790012345001' } });
  await db.doc(`companies/${C}/configuration/sri`).set({ razonSocial: 'EMPRESA CINCO S.A.' });
  await db.doc(`companies/${C}/personas/p1`).set({ name: 'ANA PÉREZ', taxId: '0102030405', roles: ['employee'] });
  await db.doc(`companies/${C}/accounting_periods/2026`).set({ year: 2026, status: 'open' });
  for (const code of CODES) {
    await db.collection(`companies/${C}/chart_of_accounts`).add({ code, name: `Cuenta ${code}`, isActive: true, allowsMovement: true });
  }
  await db.doc(`companies/${C}/bank_accounts/b1`).set({ bankName: 'Banco Pichincha', accountNumber: '2200112233',
    linkedGlCode: '1.1.01.002', linkedGlName: 'Bancos', isActive: true });
  await db.doc('payrollParameters/2026_v1').set({ year: 2026, version: 1, status: 'published', validFrom: '2026-01-01', validTo: '2026-12-31',
    sbu: 482, iess: { personalPct: 9.45, employerPct: 11.15, iecePct: 0.5, secapPct: 0.5 }, reserveFund: { pct: 8.33 },
    thirteenth: { divisor: 12 }, fourteenth: { divisor: 12 },
    overtime: { hoursDivisor: 240, supplementaryPct: 50, nightSupplementaryPct: 100, weekendPct: 100, nightShiftPct: 25, maxPerDay: 4, maxPerWeek: 12 },
    vacation: { baseDays: 15, divisor: 24 }, advanceCapPct: 10 });
  await call(upsertPayrollEmployee, { personaId: 'p1', employee: { salaryCents: 120000, hireDate: '2024-03-01',
    thirteenthMode: 'accumulated', email: 'x@example.com' } });
  for (const period of ['2026-09', '2026-10']) {
    const r = await call(createPayrollRun, { period });
    await call(approvePayrollRun, { runId: r.runId });
  }
});

it('anticipo a largo plazo: la cuota sobre el 10 % se rechaza al crearlo', async () => {
  await expect(call(createPayrollLoan, { employeeId: 'p1', type: 'longTermAdvance', amountCents: 100000,
    installmentCents: 20000, startPeriod: '2026-12', accountCode: '1.1.02.002' })).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('13.º 2026: borrador → pagar (descarga la provisión) → bloquea reversar el mes → anular → v2', async () => {
  const c = await call(createPayrollBonusRun, { kind: 'thirteenth', year: 2026 });
  expect(c.bonusRunId).toBe('thirteenth_2026_v1');
  await expect(call(createPayrollBonusRun, { kind: 'thirteenth', year: 2026 })).rejects.toMatchObject({ code: 'failed-precondition' });
  const run = await doc('payrollBonusRuns/thirteenth_2026_v1');
  expect(run.lines).toHaveLength(1);
  const l = run.lines[0];
  expect(l).toMatchObject({ employeeId: 'p1', monthsAccumulated: 2, amountCents: 20000 }); // 2 × 1.200 / 12
  expect(l.provisionedCents).toBe(20000);
  await call(recalculatePayrollBonusRun, { bonusRunId: c.bonusRunId });

  const today = ecuadorToday(new Date());
  const p = await call(payPayrollBonusRun, { bonusRunId: c.bonusRunId, date: today, ...bank });
  expect(p.totalCents).toBe(20000);
  const e = await doc(`journal_entries/${p.entryId}`);
  expect(e.lines.map((x: any) => [x.accountCode, x.debit, x.credit])).toEqual([['2.1.03.001', 200, 0], ['1.1.01.002', 0, 200]]);
  expect(JSON.stringify(e)).not.toContain('ANA');
  expect((await doc('payrollBonusRuns/thirteenth_2026_v1')).status).toBe('paid');
  expect((await doc('payrollPeriods/2026-10')).bonusRunIds).toEqual(['thirteenth_2026_v1']);
  await expect(call(payPayrollBonusRun, { bonusRunId: c.bonusRunId, date: today, ...bank })).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(call(reversePayrollRun, { runId: '2026-10_v1', reason: 'x' })).rejects.toMatchObject({ code: 'failed-precondition' });

  const v = await call(voidPayrollBonusRun, { bonusRunId: c.bonusRunId, reason: 'se pagó mal' });
  expect((await doc(`journal_entries/${v.reversalEntryId}`)).reversalOf).toBe(p.entryId);
  expect((await doc('payrollPeriods/2026-10')).bonusRunIds).toEqual([]);
  await call(reversePayrollRun, { runId: '2026-10_v1', reason: 'ahora sí' });
  const c2 = await call(createPayrollBonusRun, { kind: 'thirteenth', year: 2026 });
  expect(c2.bonusRunId).toBe('thirteenth_2026_v2');
  expect((await doc('payrollBonusRuns/thirteenth_2026_v2')).lines[0].monthsAccumulated).toBe(1);
  await call(voidPayrollBonusRun, { bonusRunId: c2.bonusRunId, reason: 'descartar borrador' });
});

it('vacaciones: saldo, registro, cruce, sin saldo solo como adelanto, anular', async () => {
  const { getPayrollVacationBalance, registerPayrollVacation, voidPayrollVacation } =
    await import('../../functions/src/payroll/payroll-vacation-callables');
  const b = await call(getPayrollVacationBalance, { employeeId: 'p1', asOf: '2026-12-01' });
  expect(b).toMatchObject({ completedYears: 2, earnedDays: 30, availableDays: 30 });
  const r = await call(registerPayrollVacation, { employeeId: 'p1', from: '2026-12-01', to: '2026-12-15' });
  expect(r.days).toBe(15);
  await expect(call(registerPayrollVacation, { employeeId: 'p1', from: '2026-12-10', to: '2026-12-12' }))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(call(registerPayrollVacation, { employeeId: 'p1', from: '2027-01-02', to: '2027-01-17' }))
    .rejects.toMatchObject({ code: 'failed-precondition' }); // 16 > 15 disponibles
  const adv = await call(registerPayrollVacation, { employeeId: 'p1', from: '2027-01-02', to: '2027-01-17', allowAdvance: true });
  expect((await doc(`payrollVacations/${adv.vacationId}`)).isAdvance).toBe(true);
  await call(voidPayrollVacation, { vacationId: adv.vacationId, reason: 'se canceló el viaje' });
  expect((await call(getPayrollVacationBalance, { employeeId: 'p1', asOf: '2026-12-01' })).availableDays).toBe(15);
});
