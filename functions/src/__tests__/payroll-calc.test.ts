/**
 * Cálculo de la nómina (PLAN_NOMINA.md E2, §4.4 y §4.5): los 15 casos de E2 y
 * los de décimos y préstamos de §3.3. Casos hechos a mano, con la cuenta escrita.
 *
 * ⚠️ L1 y L3 cerrados por criterio, pendientes de Jessica Zari: IECE y SECAP
 * 0,5 % cada uno y divisor de la hora 240. Si ella cambia alguno, se rehacen
 * los casos que lo usan (el 1 y el 11).
 */
import {
  calculatePayslip, missingParameters, PayrollEmployeeDataError, PayrollParametersError, roundCents,
} from '../payroll/payroll-calc';
import { fourteenthPeriod, monthSpan, pickParameters, thirteenthPeriod } from '../payroll/payroll-dates';
import { buildPayrollEntryLines, DEFAULT_PAYROLL_ACCOUNTS, entryTotals, PayrollEntryError } from '../payroll/payroll-entry';
import { bonusLine } from '../payroll/payroll-bonus';
import { employeeLimitDecision } from '../payroll/payroll-limits';
import { PayrollEmployeeInput, PayrollNoveltyInput, PayrollParameters, PayslipResult } from '../payroll/payroll-types';

const P2026: PayrollParameters = {
  year: 2026, version: 1, status: 'published', validFrom: '2026-01-01', validTo: '2026-12-31',
  sbu: 482,
  iess: { personalPct: 9.45, employerPct: 11.15, iecePct: 0.5, secapPct: 0.5 },
  reserveFund: { pct: 8.33 },
  thirteenth: { divisor: 12 },
  fourteenth: { divisor: 12 },
  overtime: { hoursDivisor: 240, supplementaryPct: 50, nightSupplementaryPct: 100, weekendPct: 100,
    nightShiftPct: 25, maxPerDay: 4, maxPerWeek: 12 },
  vacation: { baseDays: 15, divisor: 24 },
  advanceCapPct: 10,
};

const emp = (over: Partial<PayrollEmployeeInput> = {}): PayrollEmployeeInput => ({
  id: 'e1', name: 'ANA', salaryCents: 100000, hireDate: '2024-03-01', endDate: null,
  workdayType: 'full', region: 'sierra', expenseGroup: 'admin',
  thirteenthMode: 'monthly', fourteenthMode: 'accumulated', reserveFundMode: 'monthly', ...over,
});

const calc = (employee: PayrollEmployeeInput, novelties: PayrollNoveltyInput[] = [], month = 11, extra = {}) =>
  calculatePayslip({ params: P2026, year: 2026, month, employee, novelties, ...extra })!;

const amount = (p: PayslipResult, concept: string) =>
  [...p.earnings, ...p.deductions, ...p.employerCosts, ...p.provisions]
    .filter(l => l.concept === concept).reduce((s, l) => s + l.amountCents, 0);

const accounts = () => DEFAULT_PAYROLL_ACCOUNTS;

describe('caso 1 · ejemplo de §4.5 al centavo', () => {
  // Noviembre 2026, Sierra, mes completo, USD 1.000, más de un año, 5 h al 50 %,
  // anticipo 100; 13.º mensual, 14.º acumulado, fondos mensual.
  const r = calc(emp(), [
    { employeeId: 'e1', type: 'overtime50', qty: 5 },
    { employeeId: 'e1', type: 'advance', amountCents: 10000 },
  ]);
  it('ingresos, descuentos y neto', () => {
    expect(r.workedDays).toBe(30);
    expect(amount(r, 'salary')).toBe(100000);
    expect(amount(r, 'overtime50')).toBe(3125);          // 5 × (1000/240) × 1,5
    expect(r.taxableCents).toBe(103125);
    expect(amount(r, 'thirteenthMonthly')).toBe(8594);   // 1031,25 / 12
    expect(amount(r, 'reserveFundMonthly')).toBe(8590);  // 1031,25 × 8,33 %
    expect(amount(r, 'iessPersonal')).toBe(9745);        // 1031,25 × 9,45 %
    expect(amount(r, 'advance')).toBe(10000);
    expect(r.netCents).toBe(100564);
    expect(r.errors).toEqual([]);
  });
  it('costo del empleador y provisiones', () => {
    expect(amount(r, 'iessEmployer')).toBe(11498);       // 11,15 %
    expect(amount(r, 'iece') + amount(r, 'secap')).toBe(1032);
    expect(amount(r, 'fourteenthAccrued')).toBe(4017);   // 482 / 12
    expect(amount(r, 'vacationAccrued')).toBe(4297);     // 1031,25 / 24
  });
  it('el asiento de §5.2: 1.411,53 a cada lado', () => {
    const lines = buildPayrollEntryLines([r], accounts);
    const t = entryTotals(lines);
    expect(t.debitCents).toBe(141153);
    expect(t.creditCents).toBe(141153);
    const of = (code: string) => lines.find(l => l.accountCode === code)!;
    expect(of('5.2.01.001').debitCents).toBe(100000);
    expect(of('5.2.01.007').debitCents).toBe(12530);
    expect(of('2.1.01.003').creditCents).toBe(100564);
    expect(of('2.1.04.007').creditCents).toBe(12530);
  });
});

describe('casos 2 a 4 · días del mes (L4)', () => {
  it('2 · mes completo sin novedades, sueldo = SBU', () => {
    const r = calc(emp({ salaryCents: 48200 }));
    expect(amount(r, 'salary')).toBe(48200);
    expect(amount(r, 'iessPersonal')).toBe(4555);        // 4554,90 → 4555
    expect(r.errors).toEqual([]);
  });
  it('3 · ingreso el día 16: 15 días', () => {
    const r = calc(emp({ salaryCents: 48200, hireDate: '2026-11-16' }));
    expect(r.workedDays).toBe(15);
    expect(amount(r, 'salary')).toBe(24100);
    expect(amount(r, 'fourteenthAccrued')).toBe(2008);   // 482/12 × 15/30 = 20,083
    expect(amount(r, 'reserveFundMonthly')).toBe(0);     // primer año
  });
  it('4 · salida el día 10: 10 días', () => {
    const r = calc(emp({ endDate: '2026-11-10' }));
    expect(r.workedDays).toBe(10);
    expect(amount(r, 'salary')).toBe(33333);
  });
  it('febrero completo cuenta 30 días; quien ingresa el 31 trabaja 1', () => {
    expect(monthSpan(2026, 2, '2025-01-01', '2026-02-28')).toEqual({ startDay: 1, endDay: 30 });
    expect(monthSpan(2026, 3, '2026-03-31')).toEqual({ startDay: 30, endDay: 30 });
    expect(monthSpan(2026, 11, '2026-12-01')).toBeNull();
  });
  it('quien no trabajó en el mes no lleva rol', () => {
    expect(calculatePayslip({ params: P2026, year: 2026, month: 11,
      employee: emp({ endDate: '2026-10-31' }), novelties: [] })).toBeNull();
  });
  it('permiso sin sueldo resta días', () => {
    const r = calc(emp(), [{ employeeId: 'e1', type: 'unpaidLeave', qty: 3 }]);
    expect(r.workedDays).toBe(27);
    expect(amount(r, 'salary')).toBe(90000);
  });
});

describe('casos 5 y 6 · décimos acumulados o mensuales', () => {
  it('5 · acumulados: no suman al neto, sí a provisión', () => {
    const r = calc(emp({ salaryCents: 48200, thirteenthMode: 'accumulated', fourteenthMode: 'accumulated' }));
    expect(amount(r, 'thirteenthMonthly')).toBe(0);
    expect(amount(r, 'thirteenthAccrued')).toBe(4017);
    expect(amount(r, 'fourteenthAccrued')).toBe(4017);
    expect(r.netCents).toBe(48200 + 4015 - 4555);        // + fondos mensual (8,33 % = 40,15)
  });
  it('6 · mensuales: suman al neto, sin provisión', () => {
    const r = calc(emp({ salaryCents: 48200, thirteenthMode: 'monthly', fourteenthMode: 'monthly' }));
    expect(amount(r, 'thirteenthAccrued') + amount(r, 'fourteenthAccrued')).toBe(0);
    expect(r.netCents).toBe(48200 + 4017 + 4017 + 4015 - 4555);
  });
});

describe('casos 7 a 9 · fondos de reserva (art. 196-197, L8)', () => {
  it('7 · con 11 meses no hay fondos; con 13, el mes entero', () => {
    expect(amount(calc(emp({ hireDate: '2025-12-01' })), 'reserveFundMonthly')).toBe(0);
    expect(amount(calc(emp({ hireDate: '2025-10-01' })), 'reserveFundMonthly')).toBe(8330);
  });
  it('el mes en que cumple el año, solo los días con derecho (desde el aniversario)', () => {
    // Ingreso 2025-11-16 → derecho desde 2026-11-16: 15 de 30 días.
    const r = calc(emp({ hireDate: '2025-11-16' }));
    expect(amount(r, 'reserveFundMonthly')).toBe(4165);  // 1000 × 8,33 % × 15/30
  });
  it('8 · reingreso: suma el tiempo anterior', () => {
    // Reingresó hace 3 meses, pero ya había trabajado 300 días: pasa el año.
    const r = calc(emp({ hireDate: '2026-08-01', priorServiceDays: 300 }));
    expect(amount(r, 'reserveFundMonthly')).toBe(8330);
  });
  it('9 · depositados en el IESS: provisión a 2.1.03.004, no van al neto', () => {
    const r = calc(emp({ reserveFundMode: 'accumulated' }));
    expect(amount(r, 'reserveFundMonthly')).toBe(0);
    expect(amount(r, 'reserveFundIess')).toBe(8330);
    const lines = buildPayrollEntryLines([r], accounts);
    expect(lines.find(l => l.accountCode === '2.1.03.004')!.creditCents).toBe(8330);
  });
});

describe('caso 10 · periodos de los décimos', () => {
  it('14.º: Sierra ago-jul, Costa mar-feb; 13.º dic-nov', () => {
    expect(fourteenthPeriod('sierra', 2026)).toEqual({ from: '2025-08-01', to: '2026-07-31' });
    expect(fourteenthPeriod('costa', 2026)).toEqual({ from: '2025-03-01', to: '2026-02-28' });
    expect(fourteenthPeriod('costa', 2028)).toEqual({ from: '2027-03-01', to: '2028-02-29' });
    expect(thirteenthPeriod(2026)).toEqual({ from: '2025-12-01', to: '2026-11-30' });
  });
});

describe('caso 11 · horas extra', () => {
  const r = calc(emp({ salaryCents: 120000 }), [   // hora = 1200 / 240 = 5,00
    { employeeId: 'e1', type: 'overtime50', qty: 2 },
    { employeeId: 'e1', type: 'overtime100', qty: 2 },
    { employeeId: 'e1', type: 'weekend', qty: 4 },
    { employeeId: 'e1', type: 'nightShift', qty: 8 },
  ]);
  it('50 %, 100 %, sábado o domingo y recargo nocturno', () => {
    expect(amount(r, 'overtime50')).toBe(1500);   // 2 × 5 × 1,5
    expect(amount(r, 'overtime100')).toBe(2000);  // 2 × 5 × 2
    expect(amount(r, 'weekend')).toBe(4000);      // 4 × 5 × 2
    expect(amount(r, 'nightShift')).toBe(1000);   // 8 × 5 × 0,25: solo el recargo (art. 49)
  });
  it('sobre el tope semanal: aviso, no rechazo', () => {
    const t = calc(emp(), [{ employeeId: 'e1', type: 'overtime50', qty: 60 }]);
    expect(t.warnings.length).toBe(1);
    expect(t.errors).toEqual([]);
  });
});

describe('caso 12 y reglas de rechazo', () => {
  it('12 · anticipo sobre el 10 %: rechazo con mensaje', () => {
    const r = calc(emp(), [{ employeeId: 'e1', type: 'advance', amountCents: 10001 }]);
    expect(r.errors.join(' ')).toMatch(/superan el 10 %/);
    expect(calc(emp(), [{ employeeId: 'e1', type: 'advance', amountCents: 10000 }]).errors).toEqual([]);
  });
  it('sueldo bajo el SBU a jornada completa: rechazo', () => {
    expect(calc(emp({ salaryCents: 48199 })).errors.join(' ')).toMatch(/salario básico/);
  });
  it('jornada parcial: rechazo (L7)', () => {
    expect(calc(emp({ workdayType: 'partial' })).errors.join(' ')).toMatch(/jornada parcial/);
  });
  it('la jornada eficiente es jornada completa', () => {
    expect(calc(emp({ workdayType: 'efficient' })).errors).toEqual([]);
  });
});

describe('caso 13 · parámetro null: no calcula', () => {
  it('lanza y dice cuáles faltan', () => {
    const sinL1 = { ...P2026, iess: { ...P2026.iess, iecePct: null, secapPct: null } };
    expect(missingParameters(sinL1)).toEqual(['iess.iecePct', 'iess.secapPct']);
    expect(() => calculatePayslip({ params: sinL1, year: 2026, month: 11, employee: emp(), novelties: [] }))
      .toThrow(PayrollParametersError);
  });
});

describe('caso 14 · cambio de año', () => {
  const v2027: PayrollParameters = { ...P2026, year: 2027, validFrom: '2027-01-01', validTo: '2027-12-31', sbu: 500 };
  it('diciembre usa 2026 y enero 2027; sin versión publicada, nada', () => {
    expect(pickParameters([P2026, v2027], 2026, 12)!.year).toBe(2026);
    expect(pickParameters([P2026, v2027], 2027, 1)!.year).toBe(2027);
    expect(pickParameters([P2026, { ...v2027, status: 'draft' }], 2027, 1)).toBeNull();
  });
  it('dentro del año manda la versión más alta vigente el último día del mes', () => {
    const v2 = { ...P2026, version: 2, validFrom: '2026-06-01' };
    expect(pickParameters([P2026, v2], 2026, 5)!.version).toBe(1);
    expect(pickParameters([P2026, v2], 2026, 6)!.version).toBe(2);
  });
});

describe('caso 15 · el asiento cuadra con cientos de empleados', () => {
  it('300 empleados con sueldos y novedades variadas: debe = haber', () => {
    const roles: PayslipResult[] = [];
    for (let i = 0; i < 300; i++) {
      const e = emp({
        id: `e${i}`, salaryCents: 48200 + i * 1337, hireDate: i % 3 ? '2020-01-15' : '2026-11-07',
        expenseGroup: i % 2 ? 'sales' : 'admin', thirteenthMode: i % 4 ? 'monthly' : 'accumulated',
        reserveFundMode: i % 5 ? 'monthly' : 'accumulated',
      });
      const r = calc(e, [
        { employeeId: e.id, type: 'overtime50', qty: (i % 7) + 0.5 },
        { employeeId: e.id, type: 'commission', amountCents: i * 13 },
        { employeeId: e.id, type: 'otherDeduction', amountCents: i % 9 ? 0 : 777, accountCode: '2.1.04.099' },
      ]);
      roles.push({ ...r, expenseGroup: e.expenseGroup } as PayslipResult);
    }
    const lines = buildPayrollEntryLines(roles, accounts);
    const t = entryTotals(lines);
    expect(t.debitCents).toBe(t.creditCents);
    expect(t.debitCents).toBeGreaterThan(0);
    // Cada cuenta lleva exactamente la suma de sus conceptos en los roles.
    const total = (concepts: string[]) => roles.reduce((s, r) => s + concepts.reduce((x, c) => x + amount(r, c), 0), 0);
    const salesSalary = roles.filter(r => (r as any).expenseGroup === 'sales').reduce((s, r) => s + amount(r, 'salary'), 0);
    const of = (code: string) => lines.find(l => l.accountCode === code)!;
    expect(of('5.2.02.001').debitCents).toBe(salesSalary);
    expect(of('5.2.01.001').debitCents).toBe(total(['salary']) - salesSalary);
    expect(of('5.2.01.002').debitCents).toBe(total(['overtime50', 'commission']));
    expect(of('5.2.01.003').debitCents).toBe(total(['thirteenthMonthly', 'thirteenthAccrued']));
    expect(of('5.2.01.005').debitCents).toBe(total(['reserveFundMonthly', 'reserveFundIess']));
    expect(of('5.2.01.007').debitCents).toBe(total(['iessEmployer', 'iece', 'secap']));
    expect(of('2.1.01.003').creditCents).toBe(roles.reduce((s, r) => s + r.netCents, 0));
    expect(of('2.1.04.006').creditCents).toBe(total(['iessPersonal']));
    expect(of('2.1.03.001').creditCents).toBe(total(['thirteenthAccrued']));
    expect(of('2.1.04.099').creditCents).toBe(total(['otherDeduction']));
  });
  it('sin cuenta para una otra deducción: no arma el asiento', () => {
    const r = calc(emp(), [{ employeeId: 'e1', type: 'otherDeduction', amountCents: 500 }]);
    expect(() => buildPayrollEntryLines([r], accounts)).toThrow(PayrollEntryError);
  });
  it('redondeo mitad hacia arriba', () => {
    expect(roundCents(515.625)).toBe(516);
    expect(roundCents(8593.75)).toBe(8594);
    expect(roundCents(4554.9)).toBe(4555);
    expect(roundCents(974.4999999999)).toBe(975);
  });
});

describe('§3.3 · préstamos con cuotas (D-N12)', () => {
  it('descuenta la cuota y deja el saldo; la última cuota no pasa del saldo', () => {
    const r = calc(emp(), [], 11, { loans: [
      { id: 'L1', employeeId: 'e1', type: 'companyLoan', installmentCents: 5000, balanceCents: 12000, accountCode: '1.1.02.005' },
      { id: 'L2', employeeId: 'e1', type: 'iessQuirografario', installmentCents: 5000, balanceCents: 3000 },
      { id: 'L3', employeeId: 'otro', type: 'companyLoan', installmentCents: 5000, balanceCents: 5000 },
    ] });
    expect(amount(r, 'loan')).toBe(8000);
    expect(r.loanBalances).toEqual([{ loanId: 'L1', balanceCents: 7000 }, { loanId: 'L2', balanceCents: 0 }]);
    // L2 es del IESS: sin cuenta propia ni cuenta iessQuirografario, el asiento lo rechaza.
    expect(() => buildPayrollEntryLines([r], accounts)).toThrow(PayrollEntryError);
    // Ni la cuenta de préstamos de la empresa le sirve: es una deuda con el IESS.
    expect(() => buildPayrollEntryLines([r], () => ({ ...DEFAULT_PAYROLL_ACCOUNTS, companyLoan: '1.1.02.006' })))
      .toThrow(PayrollEntryError);
    const conCuenta = () => ({ ...DEFAULT_PAYROLL_ACCOUNTS, iessQuirografario: '2.1.04.010' });
    const lines = buildPayrollEntryLines([r], conCuenta);
    expect(lines.find(l => l.accountCode === '2.1.04.010')!.creditCents).toBe(3000);
    expect(lines.find(l => l.accountCode === '1.1.02.005')!.creditCents).toBe(5000);
    const t = entryTotals(lines);
    expect(t.debitCents).toBe(t.creditCents);
  });
  it('el anticipo a largo plazo cuenta para el tope del 10 % y cae en la cuenta de anticipos', () => {
    const largo = { id: 'A1', employeeId: 'e1', type: 'longTermAdvance' as const, installmentCents: 8000, balanceCents: 40000 };
    const r = calc(emp(), [{ employeeId: 'e1', type: 'advance', amountCents: 5000 }], 11, { loans: [largo] });
    expect(r.errors.join(' ')).toMatch(/superan el 10 %/);
    const ok = calc(emp(), [], 11, { loans: [largo] });
    expect(ok.errors).toEqual([]);
    expect(buildPayrollEntryLines([ok], accounts).find(l => l.accountCode === '1.1.02.002')!.creditCents).toBe(8000);
  });
});

describe('§3.3 · décimos acumulados y su pago (D-N11)', () => {
  const rol = (period: string, accrued: number, workedDays = 30, taxableCents = 48200) => ({
    period, taxableCents, workedDays,
    provisions: [{ concept: 'fourteenthAccrued' as const, label: '', amountCents: accrued }],
  });
  it('14.º Sierra 2026: solo ago-2025 a jul-2026, SBU al pagar × días / 360', () => {
    const roles = ['2025-07', '2025-08', '2025-12', '2026-07', '2026-08'].map(p => rol(p, 4017));
    const l = bonusLine({ kind: 'fourteenth', year: 2026, region: 'sierra', payslips: roles, sbuCentsAtPayment: 48200 });
    expect(l.monthsWorked).toBe(3);
    expect(l.amountCents).toBe(12050);                 // 482 × 90 / 360
    expect(l.provisionedCents).toBe(3 * 4017);
    expect(l.adjustmentCents).toBe(12050 - 12051);
    expect(l.errors).toEqual([]);
  });
  it('12 meses completos pagan un SBU exacto, no 12 × 40,17', () => {
    const roles = Array.from({ length: 12 }, (_, i) => rol(`2025-${String(i + 1).padStart(2, '0')}`, 4017))
      .map((r, i) => ({ ...r, period: i < 5 ? `2025-${String(i + 8).padStart(2, '0')}` : `2026-${String(i - 4).padStart(2, '0')}` }));
    const l = bonusLine({ kind: 'fourteenth', year: 2026, region: 'sierra', payslips: roles, sbuCentsAtPayment: 48200 });
    expect(l.monthsAccumulated).toBe(12);
    expect(l.amountCents).toBe(48200);
    expect(l.adjustmentCents).toBe(-4);
  });
  it('13.º: lo percibido en los meses acumulados / 12', () => {
    const r13 = (period: string, taxable: number) => ({ period, taxableCents: taxable, workedDays: 30,
      provisions: [{ concept: 'thirteenthAccrued' as const, label: '', amountCents: roundCents(taxable / 12) }] });
    const l = bonusLine({ kind: 'thirteenth', year: 2026, payslips: [r13('2025-12', 100001), r13('2026-01', 100001)] });
    expect(l.amountCents).toBe(16667);                 // 2000,02 / 12 = 166,668
    expect(l.provisionedCents).toBe(2 * 8333);
  });
  it('saldo negativo y SBU faltante: bloqueado', () => {
    const l = bonusLine({ kind: 'fourteenth', year: 2026, region: 'costa', payslips: [rol('2025-03', 4017)],
      sbuCentsAtPayment: 48200, alreadyPaidCents: 5000 });
    expect(l.balanceCents).toBe(4017 - 5000);
    expect(l.errors.length).toBe(1);
    expect(bonusLine({ kind: 'fourteenth', year: 2026, payslips: [rol('2025-08', 4017)] }).errors.length).toBe(1);
  });
});

describe('revisión independiente: bordes', () => {
  it('fecha de ingreso vacía o con hora: error legible, no «ya trabajaba»', () => {
    expect(() => calc(emp({ hireDate: '' }))).toThrow(PayrollEmployeeDataError);
    expect(() => calc(emp({ hireDate: '2026-11-16T00:00' }))).toThrow(PayrollEmployeeDataError);
    expect(() => calc(emp({ endDate: '30/11/2026' }))).toThrow(PayrollEmployeeDataError);
  });
  it('ingresar el último día de un mes corto cuenta 1 día (30/360)', () => {
    expect(monthSpan(2026, 2, '2026-02-28')).toEqual({ startDay: 30, endDay: 30 });
    expect(monthSpan(2028, 2, '2028-02-29')).toEqual({ startDay: 30, endDay: 30 });
    expect(monthSpan(2026, 2, '2026-02-28', '2026-02-28')).toEqual({ startDay: 30, endDay: 30 });
    expect(calc(emp({ hireDate: '2026-02-28' }), [], 2).workedDays).toBe(1);
  });
  it('reingreso con el derecho a mitad de mes', () => {
    // Reingresó el 2026-08-01 con 290 días previos: derecho desde 2027-08-01 − 290 días = 2026-10-15.
    const r = calc(emp({ hireDate: '2026-08-01', priorServiceDays: 290 }), [], 10);
    expect(amount(r, 'reserveFundMonthly')).toBe(roundCents(100000 * 0.0833 * 16 / 30));
  });
  it('enero de 2027 con SBU 500: 14.º 41,67 y el sueldo de 482 se rechaza', () => {
    const p27: PayrollParameters = { ...P2026, year: 2027, validFrom: '2027-01-01', validTo: '2027-12-31', sbu: 500 };
    const params = pickParameters([P2026, p27], 2027, 1)!;
    const r = calculatePayslip({ params, year: 2027, month: 1, employee: emp(), novelties: [] })!;
    expect(amount(r, 'fourteenthAccrued')).toBe(4167);
    const bajo = calculatePayslip({ params, year: 2027, month: 1, employee: emp({ salaryCents: 48200 }), novelties: [] })!;
    expect(bajo.errors.join(' ')).toMatch(/salario básico/);
  });
  it('otra deducción sin cuenta propia usa la de la empresa; el bono no gravado cae a 5.2.01.002 si no se separa', () => {
    const r = calc(emp(), [
      { employeeId: 'e1', type: 'otherDeduction', amountCents: 500 },
      { employeeId: 'e1', type: 'bonusNonTaxable', amountCents: 2000 },
    ]);
    const lines = buildPayrollEntryLines([r], () => ({ ...DEFAULT_PAYROLL_ACCOUNTS, otherDeductions: '2.1.04.099' }));
    expect(lines.find(l => l.accountCode === '2.1.04.099')!.creditCents).toBe(500);
    expect(lines.find(l => l.accountCode === '5.2.01.002')!.debitCents).toBe(2000);
    const separado = buildPayrollEntryLines([r], () => ({ ...DEFAULT_PAYROLL_ACCOUNTS, otherDeductions: '2.1.04.099',
      nonTaxableIncome: '5.2.01.009' }));
    expect(separado.find(l => l.accountCode === '5.2.01.009')!.debitCents).toBe(2000);
  });
  it('(k) aniversario y permiso sin sueldo en el mismo mes: aviso, el monto no cambia', () => {
    const r = calc(emp({ hireDate: '2025-11-16' }), [{ employeeId: 'e1', type: 'unpaidLeave', qty: 10 }]);
    expect(r.warnings.join(' ')).toMatch(/primer año este mes/);
    expect(amount(r, 'reserveFundMonthly')).toBe(roundCents(66667 * 0.0833 * 15 / 20));   // 41,65
    expect(r.errors).toEqual([]);
    // Sin permiso, o con el derecho ya cumplido, no hay aviso.
    expect(calc(emp({ hireDate: '2025-11-16' })).warnings).toEqual([]);
    expect(calc(emp(), [{ employeeId: 'e1', type: 'unpaidLeave', qty: 10 }]).warnings).toEqual([]);
  });
  it('(l) préstamos sobre el 10 %: aviso, no rechazo', () => {
    const r = calc(emp(), [{ employeeId: 'e1', type: 'advance', amountCents: 5000 }], 11, { loans: [
      { id: 'L1', employeeId: 'e1', type: 'companyLoan', installmentCents: 8000, balanceCents: 80000 },
      { id: 'L2', employeeId: 'e1', type: 'iessQuirografario', installmentCents: 6000, balanceCents: 60000 },
    ] });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/suman el 19 %/);
    // Bajo el 10 % no avisa.
    expect(calc(emp(), [{ employeeId: 'e1', type: 'advance', amountCents: 5000 }]).warnings).toEqual([]);
  });
  it('missingParameters exige también maxPerDay y vacation.baseDays', () => {
    const p = { ...P2026, overtime: { ...P2026.overtime, maxPerDay: null }, vacation: { ...P2026.vacation, baseDays: null } };
    expect(missingParameters(p)).toEqual(['overtime.maxPerDay', 'vacation.baseDays']);
  });
});

describe('cupo de empleados (D-N9)', () => {
  it('sin planLimits NO pasa (a diferencia de checkPlanLimit); 0 deshabilita; -1 ilimitado', () => {
    expect(employeeLimitDecision(null, 0).allowed).toBe(false);
    expect(employeeLimitDecision({ masterData: { employeesTotal: 0 } }, 0).allowed).toBe(false);
    expect(employeeLimitDecision({ masterData: { employeesTotal: -1 } }, 999).allowed).toBe(true);
    expect(employeeLimitDecision({ masterData: { employeesTotal: 5 } }, 4).allowed).toBe(true);
    expect(employeeLimitDecision({ masterData: { employeesTotal: 5 } }, 5).allowed).toBe(false);
  });
});
