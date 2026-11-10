/**
 * payroll-run-logic.ts — Lo puro de las callables de nómina (PLAN_NOMINA.md
 * §5.3, §5.4): validar lo que llega, los ids, los totales, los estados y las
 * líneas del asiento con su forma de journal_entries. Sin Firestore: se prueba
 * con Jest (__tests__/payroll-run-logic.test.ts).
 */

import { parseYmd } from './payroll-dates';
import { EntryLine } from './payroll-entry';
import { NoveltyType, PayrollEmployeeInput, PayslipResult } from './payroll-types';

export type Ok<T> = { ok: true; value: T } | { ok: false; error: string };

// ─── Periodo e ids ───────────────────────────────────────────────────────────

/** 'AAAA-MM' → {year, month}, o null. */
export function parsePeriod(s: unknown): { year: number; month: number; period: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(typeof s === 'string' ? s.trim() : '');
  if (!m) return null;
  const year = +m[1];
  const month = +m[2];
  if (year < 2020 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month, period: `${m[1]}-${m[2]}` };
}

/** `2026-11_v1`: el id de la nómina (§5.1). */
export const runId = (period: string, version: number) => `${period}_v${version}`;

/** `2026-11_v1_{employeeId}`: el id del rol (§5.1). */
export const payslipId = (run: string, employeeId: string) => `${run}_${employeeId}`;

/** 'AAAA-MM-DD' de [now] en Ecuador (UTC-5, sin horario de verano). */
export const ecuadorToday = (now: Date) => new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

/**
 * Una nómina de un mes que todavía no empieza no se abre ni se aprueba: el
 * asiento saldría con fecha futura y los préstamos se descontarían antes.
 */
export function futurePeriodProblem(period: string, now: Date): string | null {
  return period > ecuadorToday(now).slice(0, 7) ? 'Todavía no se puede hacer la nómina de un mes que no ha empezado.' : null;
}

/**
 * Fecha de la reversa: hoy si es del mismo año del asiento (y nunca antes que
 * el asiento original); si el año ya pasó, el 31 de diciembre de ese año.
 * Mediodía de Ecuador, para que el día no cambie.
 */
export function reversalDate(periodYear: number, now: Date, original: Date | null): Date {
  const hoy = ecuadorToday(now);
  if (Number(hoy.slice(0, 4)) !== periodYear) return new Date(Date.UTC(periodYear, 11, 31, 17));
  const today = new Date(`${hoy}T17:00:00Z`);
  return original && original.getTime() > today.getTime() ? original : today;
}

/** El último día del mes: la fecha del asiento. */
export function lastDayOfPeriod(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ─── Empleado ────────────────────────────────────────────────────────────────

const CONTRACT_TYPES = ['indefinite', 'fixedTerm', 'occasional', 'seasonal', 'eventual'];
const WORKDAY_TYPES = ['full', 'efficient', 'partial'];
const MODES = ['monthly', 'accumulated'];

export interface EmployeeWrite {
  name: string;
  taxId: string;
  email: string;
  iessNumber: string;
  hireDate: string;
  endDate: string | null;
  contractType: string;
  salaryCents: number;
  workdayType: 'full' | 'efficient';
  region: 'sierra' | 'costa';
  expenseGroup: 'admin' | 'sales';
  /** Solo si vino en la entrada: si no, se conserva lo guardado. */
  groupId?: string;
  thirteenthMode: 'monthly' | 'accumulated';
  fourteenthMode: 'monthly' | 'accumulated';
  reserveFundMode: 'monthly' | 'accumulated';
  /** Solo si vino en la entrada: si no, se conserva lo guardado. */
  priorServiceDays?: number;
  bankAccount: string;
  isActive: boolean;
}

const text = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Lo que manda Conecta en `employee` (payroll_service.dart). */
export function validateEmployee(e: any): Ok<EmployeeWrite> {
  if (!e || typeof e !== 'object') return { ok: false, error: 'Faltan los datos del empleado.' };
  const salaryCents = e.salaryCents;
  if (!Number.isInteger(salaryCents) || salaryCents <= 0 || salaryCents > 100_000_000) {
    return { ok: false, error: 'El sueldo tiene que ser un valor en centavos mayor que cero.' };
  }
  const hireDate = text(e.hireDate, 10);
  if (!parseYmd(hireDate)) return { ok: false, error: 'La fecha de ingreso tiene que ser AAAA-MM-DD.' };
  const endDate = e.endDate == null || e.endDate === '' ? null : text(e.endDate, 10);
  if (endDate !== null && !parseYmd(endDate)) return { ok: false, error: 'La fecha de salida tiene que ser AAAA-MM-DD.' };
  if (endDate !== null && endDate < hireDate) {
    return { ok: false, error: 'La fecha de salida no puede ser anterior a la de ingreso.' };
  }
  const workdayType = text(e.workdayType) || 'full';
  if (!WORKDAY_TYPES.includes(workdayType)) return { ok: false, error: 'Tipo de jornada desconocido.' };
  // L7 y §4.4 regla 5: se rechaza crear el empleado.
  if (workdayType === 'partial') return { ok: false, error: 'La jornada parcial todavía no se calcula en este módulo.' };
  const contractType = text(e.contractType) || 'indefinite';
  if (!CONTRACT_TYPES.includes(contractType)) return { ok: false, error: 'Tipo de contrato desconocido.' };
  const region = text(e.region) || 'sierra';
  if (region !== 'sierra' && region !== 'costa') return { ok: false, error: 'La región tiene que ser Sierra o Costa.' };
  const expenseGroup = text(e.expenseGroup) || 'admin';
  if (expenseGroup !== 'admin' && expenseGroup !== 'sales') return { ok: false, error: 'El gasto tiene que ser de administración o de ventas.' };
  const modes: Record<string, string> = {};
  for (const k of ['thirteenthMode', 'fourteenthMode', 'reserveFundMode']) {
    const v = text(e[k]) || 'monthly';
    if (!MODES.includes(v)) return { ok: false, error: 'Forma de pago de décimos o fondos desconocida.' };
    modes[k] = v;
  }
  const email = text(e.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'El correo no es válido.' };
  // Conecta no manda estos dos: si no vienen, no se tocan (no se borran al editar).
  const prior = e.priorServiceDays;
  if (prior !== undefined && (!Number.isInteger(prior) || prior < 0 || prior > 20000)) {
    return { ok: false, error: 'Los días trabajados antes tienen que ser un número entero.' };
  }
  const groupId = e.groupId === undefined ? undefined : text(e.groupId, 80);
  if (groupId?.includes('/')) return { ok: false, error: 'Grupo de colaboradores inválido.' };
  return { ok: true, value: {
    name: text(e.name), taxId: text(e.taxId, 20), email, iessNumber: text(e.iessNumber, 30),
    hireDate, endDate, contractType, salaryCents,
    workdayType: workdayType as 'full' | 'efficient', region: region as 'sierra' | 'costa',
    expenseGroup: expenseGroup as 'admin' | 'sales',
    thirteenthMode: modes.thirteenthMode as any, fourteenthMode: modes.fourteenthMode as any,
    reserveFundMode: modes.reserveFundMode as any,
    ...(prior !== undefined ? { priorServiceDays: prior } : {}),
    ...(groupId !== undefined ? { groupId } : {}),
    bankAccount: text(e.bankAccount, 120), isActive: e.isActive !== false,
  } };
}

/**
 * El sueldo vigente el último día del mes, según `salaryHistory` (validFrom
 * 'AAAA-MM-DD'). Así, reversar y volver a emitir un mes pasado usa el sueldo de
 * ese mes, no el de hoy. Sin historial, el sueldo actual.
 */
export function salaryAt(d: Record<string, any>, lastDay: string | null): number {
  const current = Number(d.salaryCents ?? 0);
  if (!lastDay || !Array.isArray(d.salaryHistory) || !d.salaryHistory.length) return current;
  const vigentes = (d.salaryHistory as any[])
    .filter((h) => typeof h?.validFrom === 'string' && h.validFrom <= lastDay && Number.isInteger(h.salaryCents))
    .sort((a, b) => (a.validFrom < b.validFrom ? -1 : a.validFrom > b.validFrom ? 1 : 0));
  return vigentes.length ? Number(vigentes[vigentes.length - 1].salaryCents) : current;
}

/** El documento de payrollEmployees → lo que necesita el cálculo del mes que cierra en [lastDay]. */
export function toEmployeeInput(id: string, d: Record<string, any>, lastDay: string | null = null): PayrollEmployeeInput {
  return {
    id,
    name: String(d.name ?? ''),
    salaryCents: salaryAt(d, lastDay),
    hireDate: String(d.hireDate ?? ''),
    endDate: d.endDate ? String(d.endDate) : null,
    workdayType: (d.workdayType ?? 'full') as PayrollEmployeeInput['workdayType'],
    region: (d.region ?? 'sierra') as PayrollEmployeeInput['region'],
    expenseGroup: (d.expenseGroup ?? 'admin') as PayrollEmployeeInput['expenseGroup'],
    thirteenthMode: d.thirteenthMode ?? 'monthly',
    fourteenthMode: d.fourteenthMode ?? 'monthly',
    reserveFundMode: d.reserveFundMode ?? 'monthly',
    priorServiceDays: Number(d.priorServiceDays ?? 0),
  };
}

// ─── Novedades ───────────────────────────────────────────────────────────────

const NOVELTY_TYPES: NoveltyType[] = ['overtime50', 'overtime100', 'weekend', 'nightShift',
  'commission', 'bonusTaxable', 'bonusNonTaxable', 'advance', 'otherDeduction', 'unpaidLeave'];
const BY_AMOUNT: NoveltyType[] = ['commission', 'bonusTaxable', 'bonusNonTaxable', 'advance', 'otherDeduction'];

export interface NoveltyWrite {
  employeeId: string;
  type: NoveltyType;
  qty: number | null;
  amountCents: number | null;
  accountCode: string;
  note: string;
}

export function validateNovelty(n: any): Ok<NoveltyWrite> {
  const employeeId = text(n?.employeeId, 80);
  if (!employeeId || employeeId.includes('/')) return { ok: false, error: 'Falta el empleado de la novedad.' };
  const type = text(n?.type) as NoveltyType;
  if (!NOVELTY_TYPES.includes(type)) return { ok: false, error: 'Tipo de novedad desconocido.' };
  const accountCode = text(n?.accountCode, 30);
  const note = text(n?.note, 200);
  if (BY_AMOUNT.includes(type)) {
    const c = n?.amountCents;
    if (!Number.isInteger(c) || c <= 0 || c > 100_000_000) return { ok: false, error: 'El valor de la novedad tiene que ser mayor que cero.' };
    // Otra deducción sin cuenta: cae a otherDeductions de la empresa; si tampoco
    // hay, el asiento lo rechaza al aprobar (PayrollEntryError).
    return { ok: true, value: { employeeId, type, qty: null, amountCents: c, accountCode, note } };
  }
  const q = n?.qty;
  if (typeof q !== 'number' || !Number.isFinite(q) || q <= 0) return { ok: false, error: 'La cantidad tiene que ser mayor que cero.' };
  if (Math.round(q * 100) !== q * 100) return { ok: false, error: 'La cantidad admite hasta dos decimales.' };
  if (type === 'unpaidLeave' && q > 30) return { ok: false, error: 'Un mes de nómina tiene 30 días.' };
  if (type !== 'unpaidLeave' && q > 300) return { ok: false, error: 'Demasiadas horas para un mes.' };
  return { ok: true, value: { employeeId, type, qty: q, amountCents: null, accountCode, note } };
}

// ─── Estados (§5.3) ──────────────────────────────────────────────────────────

/** Qué impide abrir una nómina nueva del mes, según su candado `payrollPeriods`. */
export function createRunProblem(periodDoc: Record<string, any> | undefined): string | null {
  const status = periodDoc?.status;
  if (status === 'draft') return 'Ya hay una nómina en borrador para este mes: ábrela y recalcula.';
  if (status === 'approved') return 'La nómina de este mes ya está aprobada. Para cambiarla, revérsala.';
  return null;
}

/** La versión de la nómina nueva: la siguiente a la última del mes. */
export const nextVersion = (periodDoc: Record<string, any> | undefined) => Number(periodDoc?.lastVersion ?? 0) + 1;

export function approveProblem(run: Record<string, any> | undefined): string | null {
  if (!run) return 'La nómina no existe.';
  if (run.status !== 'draft') return 'Solo se aprueba una nómina en borrador.';
  const errores = Array.isArray(run.blockingErrors) ? run.blockingErrors : [];
  if (errores.length) return `No se puede aprobar: ${errores.join(' ')}`;
  if (!Number(run.totals?.employees)) return 'La nómina no tiene roles: no hay empleados que trabajaran en el mes.';
  return null;
}

export function reverseProblem(run: Record<string, any> | undefined, reason: string): string | null {
  if (!run) return 'La nómina no existe.';
  if (run.status !== 'approved') return 'Solo se reversa una nómina aprobada.';
  if (!reason.trim()) return 'Escribe el motivo de la reversa.';
  return null;
}

// ─── Totales y asiento ───────────────────────────────────────────────────────

export interface RunTotals {
  employees: number;
  grossCents: number;
  deductionsCents: number;
  netCents: number;
  employerCostsCents: number;
  provisionsCents: number;
}

const sum = (xs: { amountCents: number }[]) => xs.reduce((s, x) => s + x.amountCents, 0);

/** Los totales que muestra Conecta (payroll_run.dart, PayrollTotals). */
export function runTotals(payslips: PayslipResult[]): RunTotals {
  return {
    employees: payslips.length,
    grossCents: payslips.reduce((s, p) => s + sum(p.earnings), 0),
    deductionsCents: payslips.reduce((s, p) => s + sum(p.deductions), 0),
    netCents: payslips.reduce((s, p) => s + p.netCents, 0),
    employerCostsCents: payslips.reduce((s, p) => s + sum(p.employerCosts), 0),
    provisionsCents: payslips.reduce((s, p) => s + sum(p.provisions), 0),
  };
}

/**
 * Las líneas en la forma de journal_entries (en DÓLARES, como el resto de
 * asientos). Sin nombres de empleados (§5.2).
 */
export function toJournalLines(lines: EntryLine[], names: Map<string, string>, label: string) {
  return lines.map((l) => ({
    accountCode: l.accountCode,
    accountName: names.get(l.accountCode) ?? l.accountCode,
    debit: l.debitCents / 100,
    credit: l.creditCents / 100,
    description: label,
  }));
}
