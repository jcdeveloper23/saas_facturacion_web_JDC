/**
 * Punto 4 (NOMINA_COLABORADOR.md): aporte personal asumido por la empresa y la
 * ficha del colaborador.
 */
import { calculatePayslip } from '../payroll/payroll-calc';
import { buildPayrollEntryLines, DEFAULT_PAYROLL_ACCOUNTS, entryTotals } from '../payroll/payroll-entry';
import { toEmployeeInput, validateEmployee, validateProfile } from '../payroll/payroll-run-logic';
import { PayrollEmployeeInput, PayrollParameters, PayslipResult } from '../payroll/payroll-types';

const P: PayrollParameters = {
  year: 2026, version: 1, status: 'published', validFrom: '2026-01-01', validTo: '2026-12-31', sbu: 482,
  iess: { personalPct: 9.45, employerPct: 11.15, iecePct: 0.5, secapPct: 0.5 }, reserveFund: { pct: 8.33 },
  thirteenth: { divisor: 12 }, fourteenth: { divisor: 12 },
  overtime: { hoursDivisor: 240, supplementaryPct: 50, nightSupplementaryPct: 100, weekendPct: 100, nightShiftPct: 25, maxPerDay: 4, maxPerWeek: 12 },
  vacation: { baseDays: 15, divisor: 24 }, advanceCapPct: 10,
};
const emp = (o: Partial<PayrollEmployeeInput> = {}): PayrollEmployeeInput => ({
  id: 'e1', name: 'ANA', salaryCents: 100000, hireDate: '2024-03-01', endDate: null, workdayType: 'full',
  region: 'sierra', expenseGroup: 'admin', thirteenthMode: 'monthly', fourteenthMode: 'accumulated', reserveFundMode: 'monthly', ...o,
});
const calc = (e: PayrollEmployeeInput) => calculatePayslip({ params: P, year: 2026, month: 11, employee: e, novelties: [] })!;
const amount = (p: PayslipResult, c: string) =>
  [...p.earnings, ...p.deductions, ...p.employerCosts, ...p.provisions].filter((l) => l.concept === c).reduce((s, l) => s + l.amountCents, 0);

describe('aporte personal asumido', () => {
  const normal = calc(emp());
  const asumido = calc(emp({ assumesIessPersonal: true }));
  it('no se descuenta al empleado: el neto sube en el 9,45 %', () => {
    expect(amount(normal, 'iessPersonal')).toBe(9450);
    expect(amount(asumido, 'iessPersonal')).toBe(0);
    expect(asumido.netCents - normal.netCents).toBe(9450);
  });
  it('es costo de la empresa', () => {
    expect(amount(asumido, 'iessPersonalAssumed')).toBe(9450);
    expect(asumido.employerCosts.find((l) => l.concept === 'iessPersonalAssumed')!.label).toMatch(/asumido/);
  });
  it('asiento: gasto (cae al de aporte patronal) contra aporte personal por pagar; cuadra', () => {
    const lines = buildPayrollEntryLines([asumido], () => DEFAULT_PAYROLL_ACCOUNTS);
    const t = entryTotals(lines);
    expect(t.debitCents).toBe(t.creditCents);
    const iessPayable = lines.find((l) => l.accountCode === DEFAULT_PAYROLL_ACCOUNTS.iessPersonalPayable)!;
    expect(iessPayable.creditCents).toBe(9450);
    const normalLines = buildPayrollEntryLines([normal], () => DEFAULT_PAYROLL_ACCOUNTS);
    const exp = (ls: typeof lines) => ls.find((l) => l.accountCode === DEFAULT_PAYROLL_ACCOUNTS.employerCostExpense)!.debitCents;
    expect(exp(lines) - exp(normalLines)).toBe(9450);
  });
  it('con cuenta propia de gasto, la usa', () => {
    const a = { ...DEFAULT_PAYROLL_ACCOUNTS, assumedIessExpense: '5.2.01.099' };
    const lines = buildPayrollEntryLines([asumido], () => a);
    expect(lines.find((l) => l.accountCode === '5.2.01.099')!.debitCents).toBe(9450);
  });
  it('toEmployeeInput lo lee del documento', () => {
    expect(toEmployeeInput('e1', { assumesIessPersonal: true, salaryCents: 1 }).assumesIessPersonal).toBe(true);
    expect(toEmployeeInput('e1', { salaryCents: 1 }).assumesIessPersonal).toBe(false);
  });
});

describe('ficha del colaborador', () => {
  it('solo trae lo que vino (editar desde una pantalla vieja no borra nada)', () => {
    expect(validateProfile({})).toEqual({ ok: true, value: {} });
    expect(validateProfile({ disabilityPct: 40, familyDependents: 2, sex: 'F', maritalStatus: 'married', address: ' Av. 1 ' }))
      .toEqual({ ok: true, value: { disabilityPct: 40, familyDependents: 2, sex: 'F', maritalStatus: 'married', address: 'Av. 1' } });
  });
  it('vacío borra; valores fuera de lista o de rango se rechazan', () => {
    expect(validateProfile({ education: '' })).toEqual({ ok: true, value: { education: '' } });
    expect(validateProfile({ disabilityPct: 120 }).ok).toBe(false);
    expect(validateProfile({ familyDependents: -1 }).ok).toBe(false);
    expect(validateProfile({ maritalStatus: 'soltero' }).ok).toBe(false);
    expect(validateProfile({ assumesIessPersonal: 'si' }).ok).toBe(false);
    expect(validateProfile({ birthDate: '1990-02-30' }).ok).toBe(false);
  });
  it('validateEmployee lleva la ficha aparte', () => {
    const r = validateEmployee({ salaryCents: 100000, hireDate: '2024-03-01', assumesIessPersonal: true, bankAccountType: 'savings' });
    expect(r.ok && r.value.profile).toEqual({ assumesIessPersonal: true, bankAccountType: 'savings' });
  });
});
