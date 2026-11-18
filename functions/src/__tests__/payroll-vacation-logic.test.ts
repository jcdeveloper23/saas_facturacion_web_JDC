import {
  calendarDays, daysForServiceYear, overlaps, vacationBalance, vacationProblem, validateVacationInput,
} from '../payroll/payroll-vacation-logic';

describe('días de vacaciones (arts. 69 y 71)', () => {
  it('días corridos, los dos extremos incluidos', () => {
    expect(calendarDays('2026-12-01', '2026-12-15')).toBe(15);
    expect(calendarDays('2026-02-27', '2026-03-02')).toBe(4);
  });
  it('15 por año; desde el sexto, uno más por año, hasta 15 adicionales', () => {
    expect(daysForServiceYear(1, 15)).toBe(15);
    expect(daysForServiceYear(5, 15)).toBe(15);
    expect(daysForServiceYear(6, 15)).toBe(16);
    expect(daysForServiceYear(30, 15)).toBe(30);
  });
  it('saldo: años completos ganados, menos lo gozado; el año en curso es proporcional', () => {
    const b = vacationBalance({ hireDate: '2024-03-01', asOf: '2026-09-01', baseDays: 15, takenDays: 10 });
    expect(b).toMatchObject({ completedYears: 2, earnedDays: 30, takenDays: 10, availableDays: 20, nextAnniversary: '2027-03-01' });
    expect(b.accruingDays).toBeCloseTo(7.56, 1);
  });
  it('en el aniversario se completa el año; los días previos (reingreso) cuentan', () => {
    expect(vacationBalance({ hireDate: '2025-03-01', asOf: '2026-03-01', baseDays: 15, takenDays: 0 }).earnedDays).toBe(15);
    expect(vacationBalance({ hireDate: '2025-03-01', asOf: '2026-02-28', baseDays: 15, takenDays: 0 }).earnedDays).toBe(0);
    expect(vacationBalance({ hireDate: '2026-03-01', priorServiceDays: 365, asOf: '2026-03-02', baseDays: 15, takenDays: 0 }).completedYears).toBe(1);
  });
  it('seis años: 15 × 5 + 16', () => {
    expect(vacationBalance({ hireDate: '2020-01-10', asOf: '2026-01-10', baseDays: 15, takenDays: 0 }).earnedDays).toBe(91);
  });
});

describe('registro', () => {
  it('valida fechas y cuenta los días', () => {
    const r = validateVacationInput({ employeeId: 'e1', from: '2026-12-01', to: '2026-12-15' });
    expect(r.ok && r.value.days).toBe(15);
    expect(validateVacationInput({ employeeId: 'e1', from: '2026-12-15', to: '2026-12-01' }).ok).toBe(false);
    expect(validateVacationInput({ employeeId: 'e1', from: '2026-01-01', to: '2026-04-01' }).ok).toBe(false);
    expect(validateVacationInput({ employeeId: '', from: '2026-12-01', to: '2026-12-02' }).ok).toBe(false);
  });
  it('sin saldo solo como adelanto', () => {
    const b = vacationBalance({ hireDate: '2025-03-01', asOf: '2026-06-01', baseDays: 15, takenDays: 10 });
    expect(vacationProblem(b, 5, false)).toBeNull();
    expect(vacationProblem(b, 6, false)).toMatch(/5 día\(s\) disponibles/);
    expect(vacationProblem(b, 6, true)).toBeNull();
  });
  it('cruce de periodos', () => {
    expect(overlaps({ from: '2026-12-01', to: '2026-12-15' }, { from: '2026-12-15', to: '2026-12-20' })).toBe(true);
    expect(overlaps({ from: '2026-12-01', to: '2026-12-15' }, { from: '2026-12-16', to: '2026-12-20' })).toBe(false);
  });
});
