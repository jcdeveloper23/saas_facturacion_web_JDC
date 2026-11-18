/**
 * payroll-vacation-logic.ts — Días de vacaciones (Código del Trabajo, arts. 69
 * y 71; NOMINA_DECIMOS.md §vacaciones, 2026-11-18). Puro.
 *
 * Primera versión: un REGISTRO de días, sin asiento. El sueldo de los días de
 * vacaciones se paga en el rol del mes como siempre (la provisión de 1/24 ya
 * existe, D-N7); pagar vacaciones no gozadas va con la liquidación (después).
 *
 *   Por cada año completo de servicio: 15 días (baseDays de los parámetros)
 *   + 1 por cada año después del quinto, hasta 15 adicionales (art. 69).
 *   Del año en curso, la parte proporcional (informativa: no se puede gozar aún).
 *   Los días son corridos: incluyen sábados, domingos y feriados.
 */

import { parseEcuadorDate } from '../accounting/advances/advance-logic';

export type Ok<T> = { ok: true; value: T } | { ok: false; error: string };
const bad = (error: string) => ({ ok: false as const, error });
const DAY = 86_400_000;

const toUtc = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const addYears = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y + n, m - 1, d));
  // 29-feb en un año no bisiesto → 28-feb.
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0);
  return t.toISOString().slice(0, 10);
};

/** Días corridos de `from` a `to`, los dos incluidos. */
export const calendarDays = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY) + 1;

/** Los días que da el año de servicio n (1 = el primero). */
export const daysForServiceYear = (n: number, baseDays: number) => baseDays + Math.min(15, Math.max(0, n - 5));

export interface VacationBalance {
  /** Inicio del servicio que cuenta (ingreso menos días previos, art. 197). */
  serviceStart: string;
  completedYears: number;
  /** Ganados por años completos: se pueden gozar. */
  earnedDays: number;
  /** Proporcional del año en curso (informativo). */
  accruingDays: number;
  takenDays: number;
  /** earned − taken: lo disponible hoy. */
  availableDays: number;
  /** Cuándo se completa el año en curso. */
  nextAnniversary: string;
}

export function vacationBalance(p: {
  hireDate: string; priorServiceDays?: number; asOf: string; baseDays: number; takenDays: number;
}): VacationBalance {
  const start = new Date(toUtc(p.hireDate) - (p.priorServiceDays ?? 0) * DAY).toISOString().slice(0, 10);
  let completed = 0;
  while (addYears(start, completed + 1) <= p.asOf) completed += 1;
  let earned = 0;
  for (let n = 1; n <= completed; n++) earned += daysForServiceYear(n, p.baseDays);
  const yearStart = addYears(start, completed);
  const next = addYears(start, completed + 1);
  const elapsed = Math.max(0, calendarDays(yearStart, p.asOf) - 1);
  const yearLen = calendarDays(yearStart, next) - 1;
  const accruing = Math.round(daysForServiceYear(completed + 1, p.baseDays) * elapsed / yearLen * 100) / 100;
  return {
    serviceStart: start, completedYears: completed, earnedDays: earned, accruingDays: accruing,
    takenDays: p.takenDays, availableDays: earned - p.takenDays, nextAnniversary: next,
  };
}

export interface VacationInput { employeeId: string; from: string; to: string; days: number; allowAdvance: boolean; notes: string }

/** Hasta 60 días en un registro (los 15 + adicionales acumulados de varios años). */
export function validateVacationInput(raw: Record<string, any>): Ok<VacationInput> {
  const employeeId = typeof raw?.employeeId === 'string' ? raw.employeeId.trim() : '';
  if (!employeeId || employeeId.includes('/')) return bad('Elige el empleado.');
  if (!parseEcuadorDate(raw.from) || !parseEcuadorDate(raw.to)) return bad('Las fechas van como AAAA-MM-DD.');
  const from = String(raw.from).trim();
  const to = String(raw.to).trim();
  if (to < from) return bad('La fecha de regreso no puede ser antes de la salida.');
  const days = calendarDays(from, to);
  if (days > 60) return bad('Un registro de vacaciones tiene hasta 60 días.');
  return { ok: true, value: { employeeId, from, to, days, allowAdvance: raw.allowAdvance === true,
    notes: String(raw.notes ?? '').trim().slice(0, 500) } };
}

/** Sin saldo: solo con `allowAdvance` (vacaciones adelantadas por acuerdo). */
export function vacationProblem(b: VacationBalance, days: number, allowAdvance: boolean): string | null {
  if (days <= b.availableDays || allowAdvance) return null;
  return `El empleado tiene ${b.availableDays} día(s) disponibles y pide ${days}. ` +
    'Si es un adelanto acordado, márcalo como adelanto.';
}

/** Se cruza con otras vacaciones vivas del mismo empleado. */
export const overlaps = (a: { from: string; to: string }, b: { from: string; to: string }) => a.from <= b.to && b.from <= a.to;
