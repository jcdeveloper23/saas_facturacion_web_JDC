/**
 * Integración contra el emulador: anticipos a empleados, pago de roles y
 * cuentas de nómina (NOMINA_PAGOS.md). Empresa propia (c3) para no cruzarse
 * con payroll-cycle.it.test.ts. No toca producción.
 */
import * as admin from 'firebase-admin';
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-facturaec' });
import { upsertPayrollEmployee, savePayrollNovelties } from '../../functions/src/payroll/payroll-employee-callables';
import { createPayrollRun, approvePayrollRun, reversePayrollRun } from '../../functions/src/payroll/payroll-run-callables';
import { payPayrollRun, voidPayrollPayment } from '../../functions/src/payroll/payroll-payment-callables';
import {
  registerPayrollAdvance, voidPayrollAdvance, getPayrollAccounts, savePayrollAccounts,
} from '../../functions/src/payroll/payroll-advance-callables';

const db = admin.firestore();
const C = 'c3';
const call = (fn: any, data: any, token: any = { role: 'admin', companyId: C }) =>
  fn.run({ data: { companyId: C, ...data }, auth: { uid: 'u1', token }, rawRequest: {} as any });
const conta = { role: 'accountant', companyId: C };
const doc = async (p: string) => (await db.doc(`companies/${C}/${p}`).get()).data()!;

const CODES = ['5.2.01.001', '5.2.02.001', '5.2.01.002', '5.2.01.003', '5.2.01.004', '5.2.01.005', '5.2.01.006', '5.2.01.007',
  '2.1.01.003', '1.1.02.002', '2.1.04.006', '2.1.04.007', '2.1.03.001', '2.1.03.002', '2.1.03.003', '2.1.03.004',
  '1.1.01.001', '1.1.01.002'];
const bank = { paymentMode: 'bank', bankAccountId: 'b1', paymentMethodCode: '20' };

beforeAll(async () => {
  await db.doc(`companies/${C}`).set({ name: 'EMPRESA TRES', enabledPackages: ['pkg_base', 'pkg_accounting', 'pkg_hr'],
    planLimits: { masterData: { employeesTotal: 5 } }, sri: { ruc: '1790012345001' } });
  await db.doc(`companies/${C}/configuration/sri`).set({ razonSocial: 'EMPRESA TRES S.A.' });
  for (const [id, name, taxId] of [['p1', 'ANA PÉREZ', '0102030405'], ['p3', 'JUAN ROJAS', '0102030407']]) {
    await db.doc(`companies/${C}/personas/${id}`).set({ name, taxId, roles: ['employee'], employeeData: { position: 'Asistente' } });
  }
  await db.doc(`companies/${C}/accounting_periods/2026`).set({ year: 2026, status: 'open' });
  for (const code of CODES) {
    await db.collection(`companies/${C}/chart_of_accounts`).add({ code, name: `Cuenta ${code}`, isActive: true, allowsMovement: true });
  }
  await db.collection(`companies/${C}/chart_of_accounts`).add({ code: '1.1', name: 'Activo corriente', isActive: true, allowsMovement: false });
  await db.doc(`companies/${C}/bank_accounts/b1`).set({ bankName: 'Banco Pichincha', accountNumber: '2200112233',
    linkedGlCode: '1.1.01.002', linkedGlName: 'Bancos', isActive: true });
  await db.doc('payrollParameters/2026_v1').set({ year: 2026, version: 1, status: 'published', validFrom: '2026-01-01', validTo: '2026-12-31',
    sbu: 482, iess: { personalPct: 9.45, employerPct: 11.15, iecePct: 0.5, secapPct: 0.5 }, reserveFund: { pct: 8.33 },
    thirteenth: { divisor: 12 }, fourteenth: { divisor: 12 },
    overtime: { hoursDivisor: 240, supplementaryPct: 50, nightSupplementaryPct: 100, weekendPct: 100, nightShiftPct: 25, maxPerDay: 4, maxPerWeek: 12 },
    vacation: { baseDays: 15, divisor: 24 }, advanceCapPct: 10 });
  const emp = { salaryCents: 100000, hireDate: '2024-03-01', email: 'x@example.com' };
  await call(upsertPayrollEmployee, { personaId: 'p1', employee: emp });
  await call(upsertPayrollEmployee, { personaId: 'p3', employee: { ...emp, salaryCents: 60000 } });
});

it('cuentas de nómina: valida el plan y guarda solo lo que cambia', async () => {
  const before = await call(getPayrollAccounts, {});
  expect(before.defaults.netPayable).toBe('2.1.01.003');
  expect(before.saved).toEqual({});
  await expect(call(savePayrollAccounts, { accounts: { netPayable: '9.9.9' } })).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(call(savePayrollAccounts, { accounts: { netPayable: '1.1' } })).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(call(savePayrollAccounts, { accounts: { sueldo: '2.1.01.003' } })).rejects.toMatchObject({ code: 'invalid-argument' });
  const r = await call(savePayrollAccounts, { accounts: { advances: '1.1.02.002', commissions: '5.2.01.002' } }, conta);
  expect(r.saved).toEqual({ advances: '1.1.02.002', commissions: '5.2.01.002' });
  const r2 = await call(savePayrollAccounts, { accounts: { commissions: '' } });
  expect(r2.saved).toEqual({ advances: '1.1.02.002' });
  await expect(call(getPayrollAccounts, {}, { role: 'seller', companyId: C })).rejects.toMatchObject({ code: 'permission-denied' });
});

it('anticipo: asiento, novedad bloqueada, tope del 10 % y anulación', async () => {
  const a = await call(registerPayrollAdvance, { employeeId: 'p1', amountCents: 5000, date: '2026-10-15', ...bank });
  expect(a.number).toBe('ANE-2026-000001');
  const entry = await doc(`journal_entries/${a.entryId}`);
  expect(entry.lines.map((l: any) => [l.accountCode, l.debit, l.credit])).toEqual([['1.1.02.002', 50, 0], ['1.1.01.002', 0, 50]]);
  expect(entry.source).toBe('payroll');
  expect(JSON.stringify(entry)).not.toContain('ANA');
  const adv = await doc(`payrollAdvances/${a.advanceId}`);
  expect(adv.period).toBe('2026-10');
  const nov = await doc(`payrollNovelties/${adv.noveltyId}`);
  expect(nov).toMatchObject({ type: 'advance', amountCents: 5000, advanceId: a.advanceId, period: '2026-10' });

  await expect(call(savePayrollNovelties, { period: '2026-10', delete: [adv.noveltyId] })).rejects.toMatchObject({ code: 'failed-precondition' });
  // Tope 10 % de 1.000,00 = 100,00: con 50 ya dados, 60 no entra.
  await expect(call(registerPayrollAdvance, { employeeId: 'p1', amountCents: 6000, date: '2026-10-20', ...bank }))
    .rejects.toMatchObject({ code: 'failed-precondition' });

  await expect(call(voidPayrollAdvance, { advanceId: a.advanceId, reason: '' })).rejects.toMatchObject({ code: 'failed-precondition' });
  const v = await call(voidPayrollAdvance, { advanceId: a.advanceId, reason: 'se registró dos veces' });
  expect((await doc(`journal_entries/${a.entryId}`)).status).toBe('cancelled');
  expect((await doc(`journal_entries/${v.reversalEntryId}`)).reversalOf).toBe(a.entryId);
  expect((await db.doc(`companies/${C}/payrollNovelties/${adv.noveltyId}`).get()).exists).toBe(false);
  expect((await doc(`payrollAdvances/${a.advanceId}`)).status).toBe('voided');

  // Desde caja (cargo a cuenta contable), para el rol de octubre.
  const b = await call(registerPayrollAdvance, { employeeId: 'p1', amountCents: 5000, date: '2026-10-16',
    paymentMode: 'account', creditAccountCode: '1.1.01.001' });
  expect(b.number).toBe('ANE-2026-000002');
});

it('pago de roles: parcial, sin pagar dos veces, anular, completo; con pagos no se reversa', async () => {
  await call(createPayrollRun, { period: '2026-10' });
  await call(approvePayrollRun, { runId: '2026-10_v1' }, conta);
  const s1 = await doc('payslips/2026-10_v1_p1');
  expect(s1).toMatchObject({ netPayableAccountCode: '2.1.01.003', paidCents: 0, paymentStatus: 'unpaid' });
  expect(s1.deductions.find((d: any) => d.concept === 'advance').amountCents).toBe(5000);

  // Ya aprobada: ni anticipos nuevos para octubre ni anular los descontados.
  await expect(call(registerPayrollAdvance, { employeeId: 'p1', amountCents: 1000, date: '2026-10-20', ...bank }))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  const advs = await db.collection(`companies/${C}/payrollAdvances`).where('status', '==', 'posted').get();
  await expect(call(voidPayrollAdvance, { advanceId: advs.docs[0].id, reason: 'x' })).rejects.toMatchObject({ code: 'failed-precondition' });

  await expect(call(payPayrollRun, { runId: '2026-10_v1', payslipIds: ['2026-10_v1_p1'], date: '2026-09-30', ...bank }))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  const p = await call(payPayrollRun, { runId: '2026-10_v1', payslipIds: ['2026-10_v1_p1'], date: '2026-10-31', ...bank });
  expect(p.number).toBe('PNO-2026-000001');
  expect(p.totalCents).toBe(s1.netCents);
  const pe = await doc(`journal_entries/${p.entryId}`);
  expect(pe.lines.map((l: any) => [l.accountCode, l.debit, l.credit]))
    .toEqual([['2.1.01.003', s1.netCents / 100, 0], ['1.1.01.002', 0, s1.netCents / 100]]);
  expect(JSON.stringify(pe)).not.toContain('ANA');
  expect(await doc('payslips/2026-10_v1_p1')).toMatchObject({ paidCents: s1.netCents, paymentStatus: 'paid' });
  expect((await doc('payrollRuns/2026-10_v1')).paymentStatus).toBe('partial');

  await expect(call(payPayrollRun, { runId: '2026-10_v1', payslipIds: ['2026-10_v1_p1'], date: '2026-10-31', ...bank }))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(call(reversePayrollRun, { runId: '2026-10_v1', reason: 'error' })).rejects.toMatchObject({ code: 'failed-precondition' });

  const v = await call(voidPayrollPayment, { paymentId: p.paymentId, reason: 'banco devolvió la transferencia' });
  expect((await doc(`journal_entries/${p.entryId}`)).status).toBe('cancelled');
  expect((await doc(`journal_entries/${v.reversalEntryId}`)).totalDebit).toBe(s1.netCents / 100);
  expect(await doc('payslips/2026-10_v1_p1')).toMatchObject({ paidCents: 0, paymentStatus: 'unpaid', paymentIds: [] });
  expect((await doc('payrollRuns/2026-10_v1')).paymentStatus).toBe('unpaid');
  await expect(call(voidPayrollPayment, { paymentId: p.paymentId, reason: 'otra vez' })).rejects.toMatchObject({ code: 'failed-precondition' });

  const all = await call(payPayrollRun, { runId: '2026-10_v1', payslipIds: ['2026-10_v1_p1', '2026-10_v1_p3'],
    date: '2026-11-02', paymentMode: 'account', creditAccountCode: '1.1.01.001' }, conta);
  const run = await doc('payrollRuns/2026-10_v1');
  expect(all.totalCents).toBe(run.totals.netCents);
  expect(run).toMatchObject({ paymentStatus: 'paid', paidCents: run.totals.netCents });
});
