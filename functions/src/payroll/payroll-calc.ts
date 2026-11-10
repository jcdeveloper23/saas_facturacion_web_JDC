/**
 * payroll-calc.ts — El rol de pago de un empleado en un mes (PLAN_NOMINA.md §4.4).
 *
 * Función PURA: sin Firestore, sin fecha del sistema, sin porcentajes escritos
 * aquí (todo sale de `payrollParameters`). La usan las callables de E3; si
 * Conecta alguna vez muestra una vista previa, llama al servidor (regla 8).
 *
 * Todo en centavos enteros. Cada concepto se redondea a centavos por empleado
 * (mitad hacia arriba) y los totales suman valores ya redondeados: así el
 * asiento cuadra por construcción (payroll-entry.ts).
 */

import { monthSpan, parseYmd, reserveFundDays } from './payroll-dates';
import {
  CONCEPT_LABELS, Concept, PayrollEmployeeInput, PayrollLoanInput, PayrollNoveltyInput, PayrollParameters,
  PayslipLine, PayslipResult,
} from './payroll-types';

/** Mitad hacia arriba, con margen para el error de coma flotante (x.4999999 → x.5). */
export const roundCents = (x: number): number => Math.floor(x + 0.5 + 1e-9);

/** Los campos sin valor. Con alguno, no se calcula (§4.3, caso 13). */
export function missingParameters(p: PayrollParameters): string[] {
  const campos: [string, unknown][] = [
    ['sbu', p.sbu],
    ['iess.personalPct', p.iess?.personalPct], ['iess.employerPct', p.iess?.employerPct],
    ['iess.iecePct', p.iess?.iecePct], ['iess.secapPct', p.iess?.secapPct],
    ['reserveFund.pct', p.reserveFund?.pct],
    ['thirteenth.divisor', p.thirteenth?.divisor], ['fourteenth.divisor', p.fourteenth?.divisor],
    ['overtime.hoursDivisor', p.overtime?.hoursDivisor],
    ['overtime.supplementaryPct', p.overtime?.supplementaryPct],
    ['overtime.nightSupplementaryPct', p.overtime?.nightSupplementaryPct],
    ['overtime.weekendPct', p.overtime?.weekendPct], ['overtime.nightShiftPct', p.overtime?.nightShiftPct],
    ['overtime.maxPerDay', p.overtime?.maxPerDay], ['overtime.maxPerWeek', p.overtime?.maxPerWeek],
    ['vacation.baseDays', p.vacation?.baseDays], ['vacation.divisor', p.vacation?.divisor],
    ['advanceCapPct', p.advanceCapPct],
  ];
  return campos.filter(([, v]) => typeof v !== 'number' || !Number.isFinite(v)).map(([k]) => k);
}

export class PayrollParametersError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Faltan parámetros de nómina: ${missing.join(', ')}. No se calcula hasta tenerlos.`);
  }
}

/** Un dato del empleado que impide calcular (fecha vacía o mal escrita). */
export class PayrollEmployeeDataError extends Error {}

const line = (concept: Concept, amountCents: number, extra: Partial<PayslipLine> = {}): PayslipLine =>
  ({ concept, label: CONCEPT_LABELS[concept], amountCents, ...extra });

const sum = (lines: PayslipLine[]) => lines.reduce((s, l) => s + l.amountCents, 0);

/**
 * Calcula el rol de [emp] en [year]/[month]. Devuelve null si no trabajó ningún
 * día del mes (ingresó después o salió antes): no lleva rol.
 * Lanza [PayrollParametersError] si falta un parámetro.
 */
export function calculatePayslip(input: {
  params: PayrollParameters;
  year: number;
  month: number;
  employee: PayrollEmployeeInput;
  novelties: PayrollNoveltyInput[];
  loans?: PayrollLoanInput[];
}): PayslipResult | null {
  const { params: p, year, month, employee: e } = input;
  const faltan = missingParameters(p);
  if (faltan.length) throw new PayrollParametersError(faltan);
  // Fechas 'AAAA-MM-DD' válidas: una vacía se compararía como «ya trabajaba».
  if (!parseYmd(e.hireDate)) {
    throw new PayrollEmployeeDataError(`${e.name}: la fecha de ingreso falta o no es AAAA-MM-DD.`);
  }
  if (e.endDate && !parseYmd(e.endDate)) {
    throw new PayrollEmployeeDataError(`${e.name}: la fecha de salida no es AAAA-MM-DD.`);
  }
  const n = input.novelties.filter(x => x.employeeId === e.id);
  const loans = (input.loans ?? []).filter(l => l.employeeId === e.id && l.balanceCents > 0);
  const warnings: string[] = [];
  const errors: string[] = [];

  // Regla 5 y L7: solo jornada completa (la eficiente también lo es).
  if (e.workdayType === 'partial') errors.push('La jornada parcial todavía no se calcula en este módulo.');
  const sbuCents = roundCents(p.sbu! * 100);
  if (e.workdayType !== 'partial' && e.salaryCents < sbuCents) {
    errors.push(`El sueldo de ${e.name} es menor al salario básico unificado.`);
  }

  // ── Días (L4) ──────────────────────────────────────────────────────────
  const span = monthSpan(year, month, e.hireDate, e.endDate);
  if (!span) return null;
  const unpaid = n.filter(x => x.type === 'unpaidLeave').reduce((s, x) => s + (x.qty ?? 0), 0);
  const spanDays = span.endDay - span.startDay + 1;
  const workedDays = Math.max(0, spanDays - unpaid);

  // ── Ingresos gravados ──────────────────────────────────────────────────
  const earnings: PayslipLine[] = [line('salary', roundCents(e.salaryCents * workedDays / 30))];
  const hour = e.salaryCents / p.overtime.hoursDivisor!;
  // Suplementarias, extraordinarias y fin de semana: hora × (1 + recargo), art. 55.
  // Nocturna: las horas ya están en el sueldo, se paga solo el recargo (art. 49).
  const factor: Partial<Record<Concept, number>> = {
    overtime50: 1 + p.overtime.supplementaryPct! / 100,
    overtime100: 1 + p.overtime.nightSupplementaryPct! / 100,
    weekend: 1 + p.overtime.weekendPct! / 100,
    nightShift: p.overtime.nightShiftPct! / 100,
  };
  for (const c of ['overtime50', 'overtime100', 'weekend', 'nightShift'] as const) {
    const qty = n.filter(x => x.type === c).reduce((s, x) => s + (x.qty ?? 0), 0);
    if (qty > 0) earnings.push(line(c, roundCents(qty * hour * factor[c]!), { qty }));
  }
  for (const c of ['commission', 'bonusTaxable'] as const) {
    const v = n.filter(x => x.type === c).reduce((s, x) => s + (x.amountCents ?? 0), 0);
    if (v > 0) earnings.push(line(c, v));
  }
  const taxable = sum(earnings);

  // Regla 4: horas sobre el tope → aviso, no rechazo.
  const supplementary = n.filter(x => x.type === 'overtime50' || x.type === 'overtime100')
    .reduce((s, x) => s + (x.qty ?? 0), 0);
  const weeklyCap = p.overtime.maxPerWeek! * workedDays / 7;
  if (supplementary > weeklyCap + 1e-9) {
    warnings.push(`${e.name}: ${supplementary} horas suplementarias superan el tope del art. 55 ` +
      `(${p.overtime.maxPerWeek} por semana).`);
  }

  // ── Aportes y provisiones sobre lo gravado ─────────────────────────────
  const pct = (base: number, v: number) => roundCents(base * v / 100);
  const employerCosts = [
    line('iessEmployer', pct(taxable, p.iess.employerPct!)),
    line('iece', pct(taxable, p.iess.iecePct!)),
    line('secap', pct(taxable, p.iess.secapPct!)),
  ].filter(l => l.amountCents > 0);
  const thirteenth = roundCents(taxable / p.thirteenth.divisor!);
  const fourteenth = roundCents(sbuCents / p.fourteenth.divisor! * workedDays / 30);
  const fundDays = Math.min(workedDays, reserveFundDays(year, month, span, e.hireDate, e.priorServiceDays));
  const reserveFund = workedDays > 0 ? roundCents(taxable * p.reserveFund.pct! / 100 * fundDays / workedDays) : 0;
  const vacation = roundCents(taxable / p.vacation.divisor!);

  // Regla 1: lo acumulado va a provisión y no suma al neto.
  const provisions: PayslipLine[] = [];
  if (e.thirteenthMode === 'monthly') earnings.push(line('thirteenthMonthly', thirteenth));
  else provisions.push(line('thirteenthAccrued', thirteenth));
  if (e.fourteenthMode === 'monthly') earnings.push(line('fourteenthMonthly', fourteenth));
  else provisions.push(line('fourteenthAccrued', fourteenth));
  if (reserveFund > 0) {
    if (e.reserveFundMode === 'monthly') earnings.push(line('reserveFundMonthly', reserveFund));
    else provisions.push(line('reserveFundIess', reserveFund));
  }
  provisions.push(line('vacationAccrued', vacation));
  const nonTaxable = n.filter(x => x.type === 'bonusNonTaxable').reduce((s, x) => s + (x.amountCents ?? 0), 0);
  if (nonTaxable > 0) earnings.push(line('bonusNonTaxable', nonTaxable));

  // ── Descuentos ─────────────────────────────────────────────────────────
  const deductions: PayslipLine[] = [line('iessPersonal', pct(taxable, p.iess.personalPct!))];
  const advances = n.filter(x => x.type === 'advance').reduce((s, x) => s + (x.amountCents ?? 0), 0);
  // Regla 3: tope del art. 90 sobre la remuneración del mes → rechazo con mensaje.
  // Cuenta también la cuota de los anticipos a largo plazo (D-N12: el tope sigue
  // aplicando). Si vale para los demás préstamos, pendiente de §9 (Jessica Zari).
  const longTermInstallments = loans.filter(l => l.type === 'longTermAdvance')
    .reduce((s, l) => s + Math.min(l.installmentCents, l.balanceCents), 0);
  const advanceCap = Math.floor(taxable * p.advanceCapPct! / 100);
  if (advances + longTermInstallments > advanceCap) {
    errors.push(`${e.name}: los anticipos del mes (${((advances + longTermInstallments) / 100).toFixed(2)}) ` +
      `superan el ${p.advanceCapPct} % de la remuneración (${(advanceCap / 100).toFixed(2)}).`);
  }
  if (advances > 0) deductions.push(line('advance', advances));
  for (const x of n.filter(y => y.type === 'otherDeduction' && (y.amountCents ?? 0) > 0)) {
    deductions.push(line('otherDeduction', x.amountCents!, { accountCode: x.accountCode }));
  }
  const loanBalances: { loanId: string; balanceCents: number }[] = [];
  for (const l of loans) {
    const cuota = Math.min(l.installmentCents, l.balanceCents);
    deductions.push(line('loan', cuota, { loanId: l.id, loanType: l.type, accountCode: l.accountCode }));
    loanBalances.push({ loanId: l.id, balanceCents: l.balanceCents - cuota });
  }

  const netCents = sum(earnings) - sum(deductions);
  if (netCents < 0) errors.push(`${e.name}: los descuentos superan los ingresos del mes.`);

  return {
    employeeId: e.id, workedDays, taxableCents: taxable,
    earnings, deductions, employerCosts, provisions, netCents, warnings, errors, loanBalances,
  };
}
