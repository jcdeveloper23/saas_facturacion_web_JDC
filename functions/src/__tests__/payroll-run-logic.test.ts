/**
 * Lo puro de las callables de nómina (PLAN_NOMINA.md E3): quién entra, qué se
 * acepta, los estados del ciclo y la forma del asiento.
 */
import { hasPayrollModule, payrollRoleProblem } from '../payroll/payroll-auth';
import {
  approveProblem, createRunProblem, ecuadorToday, futurePeriodProblem, lastDayOfPeriod, nextVersion, parsePeriod,
  payslipId, reversalDate, reverseProblem, runId, runTotals, salaryAt, toEmployeeInput, toJournalLines,
  validateEmployee, validateNovelty,
} from '../payroll/payroll-run-logic';
import { payslipFileName, periodName } from '../payroll/payroll-pdf';
import { stripUndefined } from '../payroll/payroll-compute';
import { calculatePayslip } from '../payroll/payroll-calc';
import { buildPayrollEntryLines, DEFAULT_PAYROLL_ACCOUNTS } from '../payroll/payroll-entry';
import { PayrollParameters } from '../payroll/payroll-types';

describe('requirePayrollRole (D-N2): sin la excepción del super admin', () => {
  it('solo admin y contador de ESA empresa', () => {
    expect(payrollRoleProblem({ role: 'admin', companyId: 'c1' }, 'c1')).toBeNull();
    expect(payrollRoleProblem({ role: 'accountant', companyId: 'c1' }, 'c1')).toBeNull();
    for (const role of ['seller', 'cashier', 'read_only']) {
      expect(payrollRoleProblem({ role, companyId: 'c1' }, 'c1')!.code).toBe('permission-denied');
    }
  });
  it('super admin, admin del canal y otra empresa: denegado', () => {
    expect(payrollRoleProblem({ role: 'super_admin' }, 'c1')!.code).toBe('permission-denied');
    expect(payrollRoleProblem({ role: 'channel_admin', channelId: 'conecta-app' }, 'c1')!.code).toBe('permission-denied');
    expect(payrollRoleProblem({ role: 'admin', companyId: 'c2' }, 'c1')!.code).toBe('permission-denied');
    expect(payrollRoleProblem(null, 'c1')!.code).toBe('unauthenticated');
  });
  it('el módulo: payroll en enabledModules o pkg_hr en enabledPackages', () => {
    expect(hasPayrollModule({ enabledModules: ['accounting', 'payroll'] })).toBe(true);
    expect(hasPayrollModule({ enabledPackages: ['pkg_hr'] })).toBe(true);
    expect(hasPayrollModule({ enabledModules: ['accounting'], enabledPackages: ['pkg_accounting'] })).toBe(false);
    expect(hasPayrollModule(undefined)).toBe(false);
  });
});

describe('ids y fechas', () => {
  it('periodo, ids y último día', () => {
    expect(parsePeriod('2026-11')).toEqual({ year: 2026, month: 11, period: '2026-11' });
    expect(parsePeriod('2026-13')).toBeNull();
    expect(parsePeriod('11/2026')).toBeNull();
    expect(runId('2026-11', 2)).toBe('2026-11_v2');
    expect(payslipId('2026-11_v2', 'p9')).toBe('2026-11_v2_p9');
    expect(lastDayOfPeriod(2026, 2)).toBe('2026-02-28');
    expect(lastDayOfPeriod(2028, 2)).toBe('2028-02-29');
  });
  it('PDF: nombre sin montos ni nombres, mes en palabras', () => {
    expect(payslipFileName('2026-11', '0102030405')).toBe('rol-2026-11-0102030405.pdf');
    expect(payslipFileName('2026-11', '')).toBe('rol-2026-11-empleado.pdf');
    expect(periodName('2026-11')).toBe('noviembre de 2026');
  });
});

describe('validar lo que manda Conecta', () => {
  const base = { salaryCents: 48200, hireDate: '2026-01-15' };
  it('empleado mínimo y valores por defecto', () => {
    const r = validateEmployee(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.workdayType).toBe('full');
      expect(r.value.thirteenthMode).toBe('monthly');
      expect(r.value.region).toBe('sierra');
      expect(r.value.isActive).toBe(true);
    }
  });
  it('rechaza jornada parcial, fechas al revés, sueldo en dólares y correo inválido', () => {
    const err = (e: any) => { const r = validateEmployee(e); return r.ok ? null : r.error; };
    expect(err({ ...base, workdayType: 'partial' })).toMatch(/jornada parcial/);
    expect(err({ ...base, endDate: '2025-12-31' })).toMatch(/anterior/);
    expect(err({ ...base, salaryCents: 482.5 })).toMatch(/centavos/);
    expect(err({ ...base, hireDate: '15/01/2026' })).toMatch(/AAAA-MM-DD/);
    expect(err({ ...base, email: 'no-es' })).toMatch(/correo/);
    expect(err({ ...base, groupId: 'a/b' })).toMatch(/Grupo/);
  });
  it('novedades: valor o cantidad según el tipo', () => {
    expect(validateNovelty({ employeeId: 'e', type: 'overtime50', qty: 5 }).ok).toBe(true);
    expect(validateNovelty({ employeeId: 'e', type: 'advance', amountCents: 5000 }).ok).toBe(true);
    expect(validateNovelty({ employeeId: 'e', type: 'advance', qty: 5 }).ok).toBe(false);
    expect(validateNovelty({ employeeId: 'e', type: 'unpaidLeave', qty: 31 }).ok).toBe(false);
    expect(validateNovelty({ employeeId: 'e', type: 'overtime50', qty: 1.234 }).ok).toBe(false);
    expect(validateNovelty({ employeeId: 'e', type: 'inventado', qty: 1 }).ok).toBe(false);
    expect(validateNovelty({ employeeId: 'a/b', type: 'overtime50', qty: 1 }).ok).toBe(false);
  });
});

describe('correcciones de la revisión de E3', () => {
  it('no se abre ni aprueba un mes que no empezó (hora de Ecuador)', () => {
    const nov10 = new Date('2026-11-10T15:00:00Z');
    expect(futurePeriodProblem('2026-11', nov10)).toBeNull();
    expect(futurePeriodProblem('2026-10', nov10)).toBeNull();
    expect(futurePeriodProblem('2026-12', nov10)).toMatch(/no ha empezado/);
    // 1 de diciembre a las 02:00 UTC todavía es 30 de noviembre en Ecuador.
    expect(futurePeriodProblem('2026-12', new Date('2026-12-01T02:00:00Z'))).toMatch(/no ha empezado/);
    expect(ecuadorToday(new Date('2027-01-01T03:00:00Z'))).toBe('2026-12-31');
  });
  it('fecha de la reversa: hoy, nunca antes que el asiento; otro año → 31 de diciembre', () => {
    const asiento = new Date('2026-11-30T17:00:00Z');
    expect(reversalDate(2026, new Date('2026-11-10T15:00:00Z'), asiento).toISOString()).toBe('2026-11-30T17:00:00.000Z');
    expect(reversalDate(2026, new Date('2026-12-05T15:00:00Z'), asiento).toISOString()).toBe('2026-12-05T17:00:00.000Z');
    // 31-dic 22:00 en Ecuador ya es 2027 en UTC, pero sigue siendo 2026 allá.
    expect(reversalDate(2026, new Date('2027-01-01T03:00:00Z'), asiento).toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(reversalDate(2025, new Date('2026-02-01T15:00:00Z'), null).toISOString()).toBe('2025-12-31T17:00:00.000Z');
  });
  it('el sueldo del mes sale del historial vigente al cierre', () => {
    const d = { salaryCents: 120000, salaryHistory: [
      { salaryCents: 100000, validFrom: '2024-03-01' }, { salaryCents: 120000, validFrom: '2026-11-15' }] };
    expect(salaryAt(d, '2026-10-31')).toBe(100000);
    expect(salaryAt(d, '2026-11-30')).toBe(120000);
    expect(salaryAt({ salaryCents: 50000 }, '2026-10-31')).toBe(50000);
    expect(toEmployeeInput('e', d, '2026-10-31').salaryCents).toBe(100000);
  });
  it('editar sin priorServiceDays ni groupId no los borra', () => {
    const r = validateEmployee({ salaryCents: 48200, hireDate: '2026-01-15' });
    expect(r.ok && 'priorServiceDays' in r.value).toBe(false);
    expect(r.ok && 'groupId' in r.value).toBe(false);
    const r2 = validateEmployee({ salaryCents: 48200, hireDate: '2026-01-15', priorServiceDays: 30, groupId: 'g1' });
    expect(r2.ok && r2.value.priorServiceDays).toBe(30);
    expect(r2.ok && r2.value.groupId).toBe('g1');
  });
});

describe('ciclo de la nómina (§5.3)', () => {
  it('el candado del mes', () => {
    expect(createRunProblem(undefined)).toBeNull();
    expect(createRunProblem({ status: 'reversed' })).toBeNull();
    expect(createRunProblem({ status: 'draft' })).toMatch(/borrador/);
    expect(createRunProblem({ status: 'approved' })).toMatch(/revérsala/);
    expect(nextVersion(undefined)).toBe(1);
    expect(nextVersion({ lastVersion: 2 })).toBe(3);
  });
  it('aprobar: solo borrador, sin errores y con roles', () => {
    expect(approveProblem({ status: 'draft', totals: { employees: 3 }, blockingErrors: [] })).toBeNull();
    expect(approveProblem({ status: 'approved', totals: { employees: 3 } })).toMatch(/borrador/);
    expect(approveProblem({ status: 'draft', totals: { employees: 3 }, blockingErrors: ['ANA: sueldo bajo'] }))
      .toMatch(/ANA: sueldo bajo/);
    expect(approveProblem({ status: 'draft', totals: { employees: 0 } })).toMatch(/no tiene roles/);
  });
  it('reversar: solo aprobada y con motivo', () => {
    expect(reverseProblem({ status: 'approved' }, 'faltaron horas')).toBeNull();
    expect(reverseProblem({ status: 'approved' }, '  ')).toMatch(/motivo/);
    expect(reverseProblem({ status: 'draft' }, 'x')).toMatch(/aprobada/);
  });
});

describe('totales y asiento con la forma de journal_entries', () => {
  const P: PayrollParameters = {
    year: 2026, version: 1, status: 'published', validFrom: '2026-01-01', validTo: '2026-12-31', sbu: 482,
    iess: { personalPct: 9.45, employerPct: 11.15, iecePct: 0.5, secapPct: 0.5 }, reserveFund: { pct: 8.33 },
    thirteenth: { divisor: 12 }, fourteenth: { divisor: 12 },
    overtime: { hoursDivisor: 240, supplementaryPct: 50, nightSupplementaryPct: 100, weekendPct: 100,
      nightShiftPct: 25, maxPerDay: 4, maxPerWeek: 12 },
    vacation: { baseDays: 15, divisor: 24 }, advanceCapPct: 10,
  };
  const emp = toEmployeeInput('e1', { name: 'ANA', salaryCents: 100000, hireDate: '2024-03-01',
    fourteenthMode: 'accumulated' });
  const r = calculatePayslip({ params: P, year: 2026, month: 11, employee: emp, novelties: [
    { employeeId: 'e1', type: 'overtime50', qty: 5 }, { employeeId: 'e1', type: 'advance', amountCents: 10000 },
  ] })!;
  it('el ejemplo de §4.5 en totales', () => {
    const t = runTotals([r]);
    expect(t.employees).toBe(1);
    expect(t.netCents).toBe(100564);
    expect(t.grossCents - t.deductionsCents).toBe(t.netCents);
  });
  it('en dólares, sin nombres de empleados, y cuadra', () => {
    const lines = toJournalLines(buildPayrollEntryLines([r], () => DEFAULT_PAYROLL_ACCOUNTS), new Map(), 'Nómina 2026-11');
    const debe = lines.reduce((s, l) => s + l.debit, 0);
    const haber = lines.reduce((s, l) => s + l.credit, 0);
    expect(Math.round(debe * 100)).toBe(141153);
    expect(Math.round(haber * 100)).toBe(141153);
    expect(lines.every((l) => !l.description.includes('ANA'))).toBe(true);
  });
  it('stripUndefined: Firestore no acepta undefined', () => {
    expect(stripUndefined({ a: 1, b: undefined, c: [{ d: undefined, e: 2 }] })).toEqual({ a: 1, c: [{ e: 2 }] });
  });
});
