/**
 * Integración contra el emulador de Firestore: el ciclo completo de la nómina
 * llamando a las callables de verdad (handler v2 con .run). No toca producción.
 */
import * as admin from 'firebase-admin';
admin.initializeApp({ projectId: 'demo-facturaec' });
import { upsertPayrollEmployee, savePayrollNovelties } from '../../functions/src/payroll/payroll-employee-callables';
import { createPayrollRun, approvePayrollRun, reversePayrollRun, recalculatePayrollRun } from '../../functions/src/payroll/payroll-run-callables';
import { getPayslipPdf } from '../../functions/src/payroll/payroll-pdf';

const db = admin.firestore();
const C = 'c1';
const call = (fn: any, data: any, token: any) => fn.run({ data: { companyId: C, ...data }, auth: { uid: 'u1', token }, rawRequest: {} as any });
const admin1 = { role: 'admin', companyId: C };
const conta = { role: 'accountant', companyId: C };

const CODES = ['5.2.01.001','5.2.02.001','5.2.01.002','5.2.01.003','5.2.01.004','5.2.01.005','5.2.01.006','5.2.01.007',
  '2.1.01.003','1.1.02.002','2.1.04.006','2.1.04.007','2.1.03.001','2.1.03.002','2.1.03.003','2.1.03.004'];

beforeAll(async () => {
  await db.doc(`companies/${C}`).set({ name: 'EMPRESA UNO', enabledPackages: ['pkg_base','pkg_accounting','pkg_hr'],
    planLimits: { masterData: { employeesTotal: 2 } }, sri: { ruc: '1790012345001' } });
  await db.doc(`companies/${C}/configuration/sri`).set({ razonSocial: 'EMPRESA UNO S.A.' });
  await db.doc(`companies/${C}/personas/p1`).set({ name: 'ANA PÉREZ', taxId: '0102030405', roles: ['employee'], employeeData: { position: 'Asistente' } });
  await db.doc(`companies/${C}/personas/p2`).set({ name: 'LUIS', taxId: '0102030406', roles: ['customer'] });
  await db.doc(`companies/${C}/accounting_periods/2026`).set({ year: 2026, status: 'open' });
  for (const code of CODES) await db.collection(`companies/${C}/chart_of_accounts`).add({ code, name: `Cuenta ${code}`, isActive: true, allowsMovement: true });
  await db.doc('payrollParameters/2026_v1').set({ year: 2026, version: 1, status: 'published', validFrom: '2026-01-01', validTo: '2026-12-31',
    sbu: 482, iess: { personalPct: 9.45, employerPct: 11.15, iecePct: 0.5, secapPct: 0.5 }, reserveFund: { pct: 8.33 },
    thirteenth: { divisor: 12 }, fourteenth: { divisor: 12 },
    overtime: { hoursDivisor: 240, supplementaryPct: 50, nightSupplementaryPct: 100, weekendPct: 100, nightShiftPct: 25, maxPerDay: 4, maxPerWeek: 12 },
    vacation: { baseDays: 15, divisor: 24 }, advanceCapPct: 10 });
});

const emp = { salaryCents: 100000, hireDate: '2024-03-01', fourteenthMode: 'accumulated', email: 'ana@example.com' };

it('roles: vendedor, super admin y otra empresa reciben denegado', async () => {
  for (const t of [{ role: 'seller', companyId: C }, { role: 'super_admin' }, { role: 'admin', companyId: 'c2' }]) {
    await expect(call(upsertPayrollEmployee, { personaId: 'p1', employee: emp }, t)).rejects.toMatchObject({ code: 'permission-denied' });
  }
});

it('empleado: solo si la persona es empleado; lleva el contador', async () => {
  await expect(call(upsertPayrollEmployee, { personaId: 'p2', employee: emp }, admin1)).rejects.toMatchObject({ code: 'failed-precondition' });
  const r = await call(upsertPayrollEmployee, { personaId: 'p1', employee: emp }, conta);
  expect(r).toEqual({ employeeId: 'p1', created: true });
  const e = (await db.doc(`companies/${C}/payrollEmployees/p1`).get()).data()!;
  expect(e.name).toBe('ANA PÉREZ');
  expect(e.salaryHistory).toHaveLength(1);
  expect((await db.doc(`companies/${C}`).get()).get('totalPayrollEmployeesActive')).toBe(1);
});

it('ciclo: novedades → crear → aprobar (asiento 1.411,53) → reversar → v2', async () => {
  await call(savePayrollNovelties, { period: '2026-11', add: [
    { employeeId: 'p1', type: 'overtime50', qty: 5 }, { employeeId: 'p1', type: 'advance', amountCents: 10000 }] }, admin1);
  const c = await call(createPayrollRun, { period: '2026-11' }, admin1);
  expect(c).toEqual({ runId: '2026-11_v1', version: 1 });
  await expect(call(createPayrollRun, { period: '2026-11' }, admin1)).rejects.toMatchObject({ code: 'failed-precondition' });
  const run = (await db.doc(`companies/${C}/payrollRuns/2026-11_v1`).get()).data()!;
  expect(run.status).toBe('draft');
  expect(run.totals.netCents).toBe(100564);
  await expect(call(getPayslipPdf, { payslipId: '2026-11_v1_p1' }, admin1)).rejects.toMatchObject({ code: 'failed-precondition' });

  const a = await call(approvePayrollRun, { runId: '2026-11_v1' }, conta);
  const entry = (await db.doc(`companies/${C}/journal_entries/${a.accountingEntryId}`).get()).data()!;
  expect(entry.totalDebit).toBe(1411.53);
  expect(entry.totalCredit).toBe(1411.53);
  expect(entry.type).toBe('automatic');
  expect(entry.source).toBe('payroll');
  expect(JSON.stringify(entry.lines)).not.toContain('ANA');
  const slip = (await db.doc(`companies/${C}/payslips/2026-11_v1_p1`).get()).data()!;
  expect(slip.status).toBe('approved');
  expect(slip.parametersSnapshot.sbu).toBe(482);
  await expect(call(approvePayrollRun, { runId: '2026-11_v1' }, conta)).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(call(savePayrollNovelties, { period: '2026-11', add: [{ employeeId: 'p1', type: 'commission', amountCents: 100 }] }, admin1))
    .rejects.toMatchObject({ code: 'failed-precondition' });

  const pdf = await call(getPayslipPdf, { payslipId: '2026-11_v1_p1' }, admin1);
  expect(Buffer.from(pdf.base64, 'base64').subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.fileName).toBe('rol-2026-11-0102030405.pdf');

  await expect(call(reversePayrollRun, { runId: '2026-11_v1', reason: '' }, admin1)).rejects.toMatchObject({ code: 'failed-precondition' });
  const rv = await call(reversePayrollRun, { runId: '2026-11_v1', reason: 'faltaron horas' }, admin1);
  const orig = (await db.doc(`companies/${C}/journal_entries/${a.accountingEntryId}`).get()).data()!;
  const rev = (await db.doc(`companies/${C}/journal_entries/${rv.reversalEntryId}`).get()).data()!;
  expect(orig.status).toBe('cancelled');
  expect(rev.totalDebit).toBe(1411.53);
  expect(rev.reversalOf).toBe(a.accountingEntryId);
  expect((await db.doc(`companies/${C}/payrollRuns/2026-11_v1`).get()).get('status')).toBe('reversed');

  const c2 = await call(createPayrollRun, { period: '2026-11' }, admin1);
  expect(c2).toEqual({ runId: '2026-11_v2', version: 2 });
  expect((await db.doc(`companies/${C}/payrollRuns/2026-11_v2`).get()).get('supersedesRunId')).toBe('2026-11_v1');
  const re = await call(recalculatePayrollRun, { runId: '2026-11_v2' }, admin1);
  expect(re.totals.netCents).toBe(100564);
});

it('ejercicio cerrado: no se reversa', async () => {
  const a = await call(approvePayrollRun, { runId: '2026-11_v2' }, admin1);
  await db.doc(`companies/${C}/accounting_periods/2026`).update({ status: 'closed' });
  await expect(call(reversePayrollRun, { runId: '2026-11_v2', reason: 'x' }, admin1)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect((await db.doc(`companies/${C}/journal_entries/${a.accountingEntryId}`).get()).get('status')).toBe('posted');
});

it('editar desde Conecta no borra los días previos ni el grupo; diciembre todavía no se abre', async () => {
  await db.doc(`companies/${C}/payrollEmployees/p1`).update({ priorServiceDays: 120, groupId: 'g1' });
  await call(upsertPayrollEmployee, { personaId: 'p1', employee: { ...emp, bankAccount: 'Pichincha 123' } }, admin1);
  const e = (await db.doc(`companies/${C}/payrollEmployees/p1`).get()).data()!;
  expect(e.priorServiceDays).toBe(120);
  expect(e.groupId).toBe('g1');
  expect(e.bankAccount).toBe('Pichincha 123');
  await expect(call(createPayrollRun, { period: '2026-12' }, admin1)).rejects.toMatchObject({ code: 'failed-precondition' });
});
