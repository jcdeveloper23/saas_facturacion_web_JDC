/**
 * payroll-bonus.ts — Décimos acumulados y su pago (PLAN_NOMINA.md §3.3, D-N11).
 * Puro.
 *
 * Quien pidió acumular el 13.º o el 14.º no lo cobra cada mes: cada rol aprobado
 * deja su provisión (thirteenthAccrued / fourteenthAccrued) y, al final del
 * periodo legal, `payrollBonusRuns` paga lo acumulado y descarga la provisión
 * (2.1.03.001 / 2.1.03.002).
 *
 * El valor a pagar NO es la suma de las provisiones (cada una redondeada y con el
 * SBU de su mes), sino el de la ley sobre los meses acumulados:
 *   13.º = lo percibido en esos meses / 12                      (art. 111)
 *   14.º = SBU vigente al pagar × días trabajados en esos meses / 360   (art. 113)
 * La diferencia con lo provisionado es `adjustmentCents`: el asiento del pago
 * la lleva al gasto. ⚠️ Por criterio, a confirmar con Jessica Zari (§9).
 */

import { fourteenthPeriod, thirteenthPeriod } from './payroll-dates';
import { roundCents } from './payroll-calc';
import { PayslipLine, Region } from './payroll-types';

export type BonusKind = 'thirteenth' | 'fourteenth';

/** Lo que aporta un rol aprobado al cálculo del décimo. */
export interface ApprovedPayslipForBonus {
  /** 'AAAA-MM' */
  period: string;
  taxableCents: number;
  workedDays: number;
  provisions: PayslipLine[];
}

export interface BonusLine {
  kind: BonusKind;
  year: number;
  region?: Region;
  from: string;
  to: string;
  totalIncomeCents: number;
  monthsWorked: number;
  monthsAccumulated: number;
  amountCents: number;
  provisionedCents: number;
  /** amount − provisioned: lo que el pago lleva al gasto (o devuelve). */
  adjustmentCents: number;
  /** Lo ya pagado a cuenta (anticipos del décimo). */
  alreadyPaidCents: number;
  balanceCents: number;
  errors: string[];
}

/** 'AAAA-MM' dentro del periodo [from, to] ('AAAA-MM-DD'; los periodos empiezan el día 1). */
const inPeriod = (period: string, from: string, to: string) => `${period}-01` >= from && `${period}-01` <= to;

/**
 * La línea del décimo de un empleado. Solo cuentan los meses en que lo acumuló
 * (los que lo cobró mensual ya lo recibieron). Saldo negativo: bloqueado hasta
 * responder §9 (D-N11).
 */
export function bonusLine(input: {
  kind: BonusKind;
  year: number;
  region?: Region;
  payslips: ApprovedPayslipForBonus[];
  /** Solo para el 14.º: el SBU vigente el día del pago, en centavos. */
  sbuCentsAtPayment?: number;
  alreadyPaidCents?: number;
}): BonusLine {
  const { kind, year } = input;
  const region = kind === 'fourteenth' ? (input.region ?? 'sierra') : undefined;
  const { from, to } = kind === 'thirteenth' ? thirteenthPeriod(year) : fourteenthPeriod(region!, year);
  const concept = kind === 'thirteenth' ? 'thirteenthAccrued' : 'fourteenthAccrued';
  const delPeriodo = input.payslips.filter(p => inPeriod(p.period, from, to));
  const errors: string[] = [];

  const provisionOf = (p: ApprovedPayslipForBonus) =>
    p.provisions.filter(l => l.concept === concept).reduce((s, l) => s + l.amountCents, 0);
  const acumulados = delPeriodo.filter(p => provisionOf(p) > 0);
  const provisioned = acumulados.reduce((s, p) => s + provisionOf(p), 0);

  let amount: number;
  if (kind === 'thirteenth') {
    amount = roundCents(acumulados.reduce((s, p) => s + p.taxableCents, 0) / 12);
  } else {
    const sbu = input.sbuCentsAtPayment ?? 0;
    if (sbu <= 0) errors.push('Falta el salario básico vigente a la fecha del pago del décimo cuarto.');
    amount = roundCents(sbu * acumulados.reduce((s, p) => s + p.workedDays, 0) / 360);
  }
  const paid = input.alreadyPaidCents ?? 0;
  const balance = amount - paid;
  if (balance < 0) errors.push('Lo pagado a cuenta supera el décimo acumulado: revísalo con el contador.');
  return {
    kind, year, region, from, to,
    totalIncomeCents: delPeriodo.reduce((s, p) => s + p.taxableCents, 0),
    monthsWorked: delPeriodo.length,
    monthsAccumulated: acumulados.length,
    amountCents: amount,
    provisionedCents: provisioned,
    adjustmentCents: amount - provisioned,
    alreadyPaidCents: paid,
    balanceCents: balance,
    errors,
  };
}
