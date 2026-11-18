/**
 * Integración contra el emulador: grupos con cuentas propias y préstamos con
 * cuotas (NOMINA_GRUPOS_PRESTAMOS.md). Empresa propia (c4). No toca producción.
 */
import * as admin from 'firebase-admin';
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-facturaec' });
import { upsertPayrollEmployee } from '../../functions/src/payroll/payroll-employee-callables';
import { createPayrollRun, approvePayrollRun, reversePayrollRun } from '../../functions/src/payroll/payroll-run-callables';
import {
  upsertPayrollGroup, deletePayrollGroup, createPayrollLoan, updatePayrollLoan, cancelPayrollLoan,
} from '../../functions/src/payroll/payroll-group-loan-callables';

const db = admin.firestore();
const C = 'c4';
const call = (fn: any, data: any, token: any = { role: 'admin', companyId: C }) =>
  fn.run({ data: { companyId: C, ...data }, auth: { uid: 'u1', token }, rawRequest: {} as any });
const doc = async (p: string) => (await db.doc(`companies/${C}/${p}`).get()).data()!;

const CODES = ['5.2.01.001', '5.2.02.001', '5.2.01.002', '5.2.01.003', '5.2.01.004', '5.2.01.005', '5.2.01.006', '5.2.01.007',
  '2.1.01.003', '1.1.02.002', '2.1.04.006', '2.1.04.007', '2.1.03.001', '2.1.03.002', '2.1.03.003', '2.1.03.004',
  '1.1.01.002', '1.1.02.005', '2.1.04.010', '2.1.1.06.01'];
const emp = { salaryCents: 100000, hireDate: '2024-03-01', email: 'x@example.com' };

beforeAll(async () => {
  await db.doc(`companies/${C}`).set({ name: 'EMPRESA CUATRO', enabledPackages: ['pkg_base', 'pkg_accounting', 'pkg_hr'],
    planLimits: { masterData: { employeesTotal: 5 } }, sri: { ruc: '1790012345001' } });
  await db.doc(`companies/${C}/configuration/sri`).set({ razonSocial: 'EMPRESA CUATRO S.A.' });
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
});

it('grupo con su cuenta de neto: el rol aprobado la usa; no se borra con empleados', async () => {
  const g = await call(upsertPayrollGroup, { name: 'Ventas', accounts: { netPayable: '2.1.1.06.01' } });
  expect(g.created).toBe(true);
  await expect(call(upsertPayrollGroup, { name: ' VENTAS ' })).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(call(upsertPayrollGroup, { name: 'Otro', accounts: { netPayable: '9.9' } })).rejects.toMatchObject({ code: 'failed-precondition' });
  await call(upsertPayrollEmployee, { personaId: 'p1', employee: { ...emp, groupId: g.groupId } });
  await expect(call(deletePayrollGroup, { groupId: g.groupId })).rejects.toMatchObject({ code: 'failed-precondition' });
  const g2 = await call(upsertPayrollGroup, { groupId: g.groupId, name: 'Ventas', description: 'Quito', accounts: { netPayable: '2.1.1.06.01' } });
  expect(g2.created).toBe(false);
  expect((await doc(`payrollGroups/${g.groupId}`)).createdAt).toBeDefined();
});

it('préstamos: entrega con asiento, empieza en su mes, baja con el rol, vuelve al reversar, cancelar', async () => {
  const bank = { paymentMode: 'bank', bankAccountId: 'b1', paymentMethodCode: '20' };
  await expect(call(createPayrollLoan, { employeeId: 'p1', type: 'companyLoan', amountCents: 30000, installmentCents: 10000,
    startPeriod: '2026-10' })).rejects.toMatchObject({ code: 'failed-precondition' }); // sin cuenta companyLoan
  const l = await call(createPayrollLoan, { employeeId: 'p1', type: 'companyLoan', amountCents: 30000, installmentCents: 10000,
    startPeriod: '2026-10', accountCode: '1.1.02.005', disbursement: { date: '2026-09-25', ...bank } });
  expect(l.number).toBe('PRE-2026-000001');
  const e = await doc(`journal_entries/${l.entryId}`);
  expect(e.lines.map((x: any) => [x.accountCode, x.debit, x.credit])).toEqual([['1.1.02.005', 300, 0], ['1.1.01.002', 0, 300]]);
  expect(JSON.stringify(e)).not.toContain('ANA');
  // IESS: sin entrega, empieza en noviembre.
  const iess = await call(createPayrollLoan, { employeeId: 'p1', type: 'iessQuirografario', amountCents: 200000, balanceCents: 150000,
    installmentCents: 5000, startPeriod: '2026-11', accountCode: '2.1.04.010' });
  expect(iess.entryId).toBeNull();

  await call(createPayrollRun, { period: '2026-10' });
  const a = await call(approvePayrollRun, { runId: '2026-10_v1' });
  const slip = await doc('payslips/2026-10_v1_p1');
  const loans = slip.deductions.filter((d: any) => d.concept === 'loan');
  expect(loans).toHaveLength(1); // el del IESS todavía no empieza
  expect(loans[0]).toMatchObject({ amountCents: 10000, loanId: l.loanId });
  expect(slip.netPayableAccountCode).toBe('2.1.1.06.01');
  const entry = await doc(`journal_entries/${a.accountingEntryId}`);
  expect(entry.accountCodes).toEqual(expect.arrayContaining(['2.1.1.06.01', '1.1.02.005']));
  expect((await doc(`payrollLoans/${l.loanId}`)).balanceCents).toBe(20000);

  // Ya descontó: cancelar no reversa la entrega.
  await expect(call(updatePayrollLoan, { loanId: l.loanId, balanceCents: 1000 })).rejects.toMatchObject({ code: 'failed-precondition' });
  await call(updatePayrollLoan, { loanId: iess.loanId, balanceCents: 140000, installmentCents: 6000 });
  expect(await doc(`payrollLoans/${iess.loanId}`)).toMatchObject({ balanceCents: 140000, installmentCents: 6000 });

  await call(reversePayrollRun, { runId: '2026-10_v1', reason: 'prueba' });
  expect((await doc(`payrollLoans/${l.loanId}`)).balanceCents).toBe(30000);
  const c = await call(cancelPayrollLoan, { loanId: l.loanId, reason: 'el empleado devolvió el dinero' });
  expect(c.reversalEntryId).toBeTruthy();
  expect((await doc(`journal_entries/${l.entryId}`)).status).toBe('cancelled');
  expect((await doc(`payrollLoans/${l.loanId}`)).status).toBe('cancelled');
  await expect(call(cancelPayrollLoan, { loanId: l.loanId, reason: 'otra' })).rejects.toMatchObject({ code: 'failed-precondition' });
});
