/**
 * Pago de décimos acumulados y registro de vacaciones — modelos de la web
 * (NOMINA_DECIMOS.md, 2026-11-18). Todo lo escribe el servidor
 * (payroll-bonus-run-callables.ts, payroll-vacation-callables.ts).
 */

export type BonusKind = 'thirteenth' | 'fourteenth';
export type BonusRegion = 'sierra' | 'costa';
export type BonusRunStatus = 'draft' | 'paid' | 'voided';

export interface BonusRunLine {
  employeeId: string;
  employeeName: string;
  from: string;
  to: string;
  totalIncomeCents: number;
  monthsWorked: number;
  monthsAccumulated: number;
  amountCents: number;
  provisionedCents: number;
  adjustmentCents: number;
  alreadyPaidCents: number;
  balanceCents: number;
  errors: string[];
}

export interface BonusRunTotals {
  employees: number;
  amountCents: number;
  provisionedCents: number;
  adjustmentCents: number;
  balanceCents: number;
}

export interface PayrollBonusRun {
  id: string;
  kind: BonusKind;
  year: number;
  region: BonusRegion | null;
  version: number;
  from: string;
  to: string;
  label: string;
  status: BonusRunStatus;
  lines: BonusRunLine[];
  totals: BonusRunTotals;
  /** La fecha con que se calculó (el SBU del 14.º es el del día del pago). */
  calculatedFor: string;
  paidCents: number;
  paymentDate: string;
  entryId: string;
  sourceLabel: string;
  chequeNumber: string;
  reference: string;
  notes: string;
  voidReason: string;
  reversalEntryId: string;
}

export const BONUS_STATUS: Record<BonusRunStatus, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'secondary' },
  paid: { label: 'Pagado', color: 'success' },
  voided: { label: 'Anulado', color: 'danger' },
};

export const BONUS_KIND_LABELS: Record<BonusKind, string> = { thirteenth: 'Décimo tercero', fourteenth: 'Décimo cuarto' };

/** El periodo legal y el plazo de pago (arts. 111 y 113 del Código del Trabajo). */
export function bonusPeriodHint(kind: BonusKind, year: number, region: BonusRegion): string {
  if (kind === 'thirteenth') return `Periodo: 1 de diciembre de ${year - 1} al 30 de noviembre de ${year}. Se paga hasta el 24 de diciembre de ${year}.`;
  if (region === 'sierra') return `Sierra y Amazonía · periodo: 1 de agosto de ${year - 1} al 31 de julio de ${year}. Se paga hasta el 15 de agosto de ${year}.`;
  return `Costa e Insular · periodo: 1 de marzo de ${year - 1} al último día de febrero de ${year}. Se paga hasta el 15 de marzo de ${year}.`;
}

/** El último mes del periodo ('AAAA-MM'): el lote se genera desde ese mes (bonusOpenProblem). */
export function bonusLastMonth(kind: BonusKind, year: number, region: BonusRegion): string {
  const m = kind === 'thirteenth' ? 11 : region === 'sierra' ? 7 : 2;
  return `${year}-${String(m).padStart(2, '0')}`;
}

// ─── Vacaciones ──────────────────────────────────────────────────────────────

export interface VacationBalance {
  serviceStart: string;
  completedYears: number;
  earnedDays: number;
  accruingDays: number;
  takenDays: number;
  availableDays: number;
  nextAnniversary: string;
}

export interface PayrollVacation {
  id: string;
  employeeId: string;
  employeeName: string;
  from: string;
  to: string;
  days: number;
  isAdvance: boolean;
  status: 'posted' | 'voided';
  notes: string;
  voidReason: string;
}

const toUtc = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };

/** Días corridos entre dos fechas, ambas incluidas (como payroll-vacation-logic.ts). 0 si no son válidas. */
export function calendarDays(from: string, to: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return 0;
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000) + 1;
}

export const MAX_VACATION_DAYS = 60;
