/**
 * payroll-bonus-run-logic.ts — Generar y pagar los décimos acumulados (D-N11,
 * NOMINA_DECIMOS.md, 2026-11-18). Puro. El valor de cada empleado sale de
 * payroll-bonus.ts (bonusLine); aquí van la identidad del lote, los estados y
 * el asiento del pago.
 *
 *   Pago del décimo:  DÉBITO Provisión 13.º/14.º (lo provisionado)
 *                     DÉBITO Gasto 13.º/14.º     (ajuste, si el valor legal es mayor)
 *                     CRÉDITO Gasto 13.º/14.º    (ajuste, si es menor)
 *                     CRÉDITO banco o cuenta     (lo pagado)
 *
 * Ciclo: draft ─pagar─► paid ─anular─► voided; con el lote vivo (draft o paid)
 * no se abre otro del mismo décimo. Un lote pagado bloquea reversar las
 * nóminas de los meses que cubre (reverseProblem).
 */

import { Region } from './payroll-types';
import { BonusKind, BonusLine } from './payroll-bonus';
import { fourteenthPeriod, thirteenthPeriod } from './payroll-dates';
import { CentsLine } from './payroll-payment-logic';
import { PayrollAccountKey } from './payroll-entry';

export type Ok<T> = { ok: true; value: T } | { ok: false; error: string };
const bad = (error: string) => ({ ok: false as const, error });

export interface BonusRunKeyInput { kind: BonusKind; year: number; region: Region | null }

export function validateBonusKey(raw: Record<string, any>): Ok<BonusRunKeyInput> {
  const kind = raw?.kind;
  if (kind !== 'thirteenth' && kind !== 'fourteenth') return bad("El décimo es 'thirteenth' o 'fourteenth'.");
  const year = Number(raw.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return bad('El año no es válido.');
  let region: Region | null = null;
  if (kind === 'fourteenth') {
    if (raw.region !== 'sierra' && raw.region !== 'costa') return bad("El décimo cuarto necesita la región: 'sierra' o 'costa'.");
    region = raw.region;
  }
  return { ok: true, value: { kind, year, region } };
}

/** thirteenth_2026, fourteenth_2026_sierra */
export const bonusKey = (k: BonusRunKeyInput) => `${k.kind}_${k.year}${k.region ? `_${k.region}` : ''}`;
export const bonusRunId = (k: BonusRunKeyInput, version: number) => `${bonusKey(k)}_v${version}`;

/** Los meses ('AAAA-MM') que cubre el décimo. */
export function bonusMonths(k: BonusRunKeyInput): { from: string; to: string; months: string[] } {
  const { from, to } = k.kind === 'thirteenth' ? thirteenthPeriod(k.year) : fourteenthPeriod(k.region!, k.year);
  const months: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const last = to.slice(0, 7);
  for (;;) {
    const p = `${y}-${String(m).padStart(2, '0')}`;
    months.push(p);
    if (p >= last) break;
    m += 1; if (m === 13) { m = 1; y += 1; }
  }
  return { from, to, months };
}

/** El lote se abre cuando el periodo ya terminó o está en su último mes. */
export function bonusOpenProblem(k: BonusRunKeyInput, todayIso: string, lock: Record<string, any> | undefined): string | null {
  const { months } = bonusMonths(k);
  if (todayIso.slice(0, 7) < months[months.length - 1]) {
    return `El periodo de este décimo termina en ${months[months.length - 1]}: todavía no se puede generar.`;
  }
  if (lock?.status === 'draft') return 'Ya hay un lote de este décimo en borrador: ábrelo y recalcula.';
  if (lock?.status === 'paid') return 'Este décimo ya está pagado. Para cambiarlo, anula el pago.';
  return null;
}

export interface BonusRunLine extends BonusLine {
  employeeId: string;
  employeeName: string;
  groupId: string;
  expenseGroup: 'admin' | 'sales';
}

export interface BonusRunTotals { employees: number; amountCents: number; provisionedCents: number; adjustmentCents: number; balanceCents: number }

export function bonusTotals(lines: BonusRunLine[]): BonusRunTotals {
  const s = (f: (l: BonusRunLine) => number) => lines.reduce((a, l) => a + f(l), 0);
  return {
    employees: lines.length, amountCents: s((l) => l.amountCents), provisionedCents: s((l) => l.provisionedCents),
    adjustmentCents: s((l) => l.adjustmentCents), balanceCents: s((l) => l.balanceCents),
  };
}

/** Qué impide pagar el lote. */
export function bonusPayProblem(run: Record<string, any> | undefined): string | null {
  if (!run) return 'El lote de décimos no existe.';
  if (run.status !== 'draft') return 'Solo se paga un lote en borrador.';
  const lines: BonusRunLine[] = Array.isArray(run.lines) ? run.lines : [];
  const errs = lines.flatMap((l) => (l.errors ?? []).map((e) => `${l.employeeName}: ${e}`));
  if (errs.length) return `No se puede pagar: ${errs.join(' ')}`;
  if (!lines.some((l) => l.balanceCents > 0)) return 'No hay nada que pagar en este lote.';
  return null;
}

/**
 * El asiento del pago. `accountsOf(line)` da las cuentas de su grupo o de la
 * empresa. Solo las líneas con saldo.
 */
export function buildBonusPaymentLines(
  kind: BonusKind, lines: BonusRunLine[],
  accountsOf: (l: BonusRunLine) => Record<PayrollAccountKey, string>, creditAccount: string,
): CentsLine[] {
  const provKey: PayrollAccountKey = kind === 'thirteenth' ? 'thirteenthProvision' : 'fourteenthProvision';
  const expKey: PayrollAccountKey = kind === 'thirteenth' ? 'thirteenthExpense' : 'fourteenthExpense';
  const debit = new Map<string, number>();
  const credit = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, c: number) => { if (c) m.set(k, (m.get(k) ?? 0) + c); };
  let total = 0;
  for (const l of lines.filter((x) => x.balanceCents > 0)) {
    const a = accountsOf(l);
    add(debit, a[provKey], l.provisionedCents);
    if (l.adjustmentCents > 0) add(debit, a[expKey], l.adjustmentCents);
    if (l.adjustmentCents < 0) add(credit, a[expKey], -l.adjustmentCents);
    total += l.balanceCents;
  }
  add(credit, creditAccount, total);
  // Una cuenta en los dos lados (gasto con ajustes de signo distinto): se netea.
  for (const [k, c] of credit) {
    const d = debit.get(k) ?? 0;
    if (d && c) {
      if (d >= c) { debit.set(k, d - c); credit.delete(k); } else { credit.set(k, c - d); debit.delete(k); }
    }
  }
  return [
    ...[...debit].filter(([, c]) => c > 0).map(([accountCode, c]) => ({ accountCode, debitCents: c, creditCents: 0 })),
    ...[...credit].filter(([, c]) => c > 0).map(([accountCode, c]) => ({ accountCode, debitCents: 0, creditCents: c })),
  ];
}

/** Rótulos para la pantalla y el asiento. */
export const bonusLabel = (k: BonusRunKeyInput) =>
  `${k.kind === 'thirteenth' ? 'Décimo tercero' : 'Décimo cuarto'} ${k.year}${k.region ? ` (${k.region === 'sierra' ? 'Sierra' : 'Costa'})` : ''}`;
