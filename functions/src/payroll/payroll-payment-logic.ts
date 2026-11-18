/**
 * payroll-payment-logic.ts — Pago de roles, anticipos a empleados y cuentas de
 * nómina (NOMINA_PAGOS.md, 2026-11-18). Puro: sin Firestore.
 *
 * D-N6 dejaba el pago para E6; se adelanta a pedido del usuario. Cambia solo
 * que el neto que el rol deja en `netPayable` ahora también se puede descargar
 * desde la nómina (antes: comprobante de egreso o asiento manual, que siguen
 * valiendo).
 *
 *   Pago de roles:        DÉBITO Por pagar empleados / CRÉDITO banco o cuenta
 *   Anticipo a empleado:  DÉBITO Anticipos           / CRÉDITO banco o cuenta
 *
 * El anticipo deja además una novedad `advance` en el mes que se descuenta: el
 * rol de ese mes la resta y acredita la misma cuenta de anticipos.
 */

import { SRI_PAYMENT_METHOD_CODES } from '../accounting/cash-vouchers/cash-voucher-logic';
import { parseEcuadorDate, positiveCents } from '../accounting/advances/advance-logic';
import { DEFAULT_PAYROLL_ACCOUNTS, PayrollAccountKey } from './payroll-entry';
import { ecuadorToday, parsePeriod } from './payroll-run-logic';

export type Ok<T> = { ok: true; value: T } | { ok: false; error: string };
const bad = (error: string) => ({ ok: false as const, error });

const isId = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '' && !v.includes('/') && v.trim().length <= 200;
const optText = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max);

// ─── De dónde sale el dinero ────────────────────────────────────────────────

/**
 * Igual que los comprobantes de egreso: 'bank' es una cuenta de bank_accounts
 * (banco o caja) con su forma de pago del SRI; 'account' es «Cargo cuenta
 * contable», el Haber a una cuenta del plan que se elige.
 */
export type MoneySource =
  | { mode: 'bank'; bankAccountId: string; paymentMethodCode: string; chequeNumber: string }
  | { mode: 'account'; creditAccountCode: string };

export function validateMoneySource(raw: Record<string, any>): Ok<MoneySource> {
  const mode = raw?.paymentMode ?? 'bank';
  if (mode === 'account') {
    const code = String(raw.creditAccountCode ?? '').trim();
    if (!code || code.length > 40 || code.includes('/')) return bad('Elige la cuenta contable de donde sale el dinero.');
    return { ok: true, value: { mode: 'account', creditAccountCode: code } };
  }
  if (mode !== 'bank') return bad("La forma de pago es 'bank' o 'account'.");
  if (!isId(raw.bankAccountId)) return bad('Elige la cuenta de banco o caja.');
  const paymentMethodCode = String(raw.paymentMethodCode ?? '').trim();
  if (!(SRI_PAYMENT_METHOD_CODES as readonly string[]).includes(paymentMethodCode)) {
    return bad('La forma de pago tiene que ser un código de la Tabla 24 del SRI.');
  }
  return {
    ok: true,
    value: { mode: 'bank', bankAccountId: raw.bankAccountId.trim(), paymentMethodCode, chequeNumber: optText(raw.chequeNumber, 30) },
  };
}

/** Un pago o un anticipo no se registra con fecha futura (hora de Ecuador). */
export function futureDateProblem(day: string, now: Date): string | null {
  return day > ecuadorToday(now) ? 'La fecha no puede ser futura.' : null;
}

// ─── Pago de roles ──────────────────────────────────────────────────────────

export const MAX_PAYSLIPS_PER_PAYMENT = 200;

export interface PaymentInput {
  runId: string;
  payslipIds: string[];
  date: Date;
  source: MoneySource;
  reference: string;
  notes: string;
}

export function validatePaymentInput(raw: Record<string, any>): Ok<PaymentInput> {
  if (!isId(raw?.runId)) return bad('Falta la nómina.');
  const ids = Array.isArray(raw.payslipIds) ? raw.payslipIds : [];
  if (ids.length === 0) return bad('Elige al menos un empleado a pagar.');
  if (ids.length > MAX_PAYSLIPS_PER_PAYMENT) return bad(`Hasta ${MAX_PAYSLIPS_PER_PAYMENT} roles por pago.`);
  if (!ids.every(isId)) return bad('Un rol de la lista no es válido.');
  const payslipIds = ids.map((s: string) => s.trim());
  if (new Set(payslipIds).size !== payslipIds.length) return bad('Un rol aparece dos veces.');
  const date = parseEcuadorDate(raw.date);
  if (!date) return bad('La fecha va como AAAA-MM-DD.');
  const source = validateMoneySource(raw);
  if (!source.ok) return source;
  return {
    ok: true,
    value: { runId: raw.runId.trim(), payslipIds, date, source: source.value,
      reference: optText(raw.reference, 120), notes: optText(raw.notes, 500) },
  };
}

/** Lo que falta pagar de un rol. */
export function payslipPendingCents(slip: Record<string, any> | undefined): number {
  if (!slip) return 0;
  return Math.max(0, Number(slip.netCents ?? 0) - Number(slip.paidCents ?? 0));
}

/** Qué impide pagar. `slips` en el mismo orden que los ids pedidos. */
export function paymentProblem(
  run: Record<string, any> | undefined, runId: string,
  slips: Array<Record<string, any> | undefined>, paymentDay: string,
): string | null {
  if (!run) return 'La nómina no existe.';
  if (run.status !== 'approved') return 'Solo se paga una nómina aprobada.';
  if (typeof run.period === 'string' && paymentDay.slice(0, 7) < run.period) {
    return 'La fecha del pago no puede ser anterior al mes de la nómina.';
  }
  for (const s of slips) {
    if (!s) return 'Un rol ya no existe: vuelve a abrir la nómina.';
    if (s.runId !== runId) return 'Un rol es de otra nómina.';
    if (s.status !== 'approved') return 'Un rol no está aprobado.';
    if (payslipPendingCents(s) <= 0) return `El rol de ${s.employee?.name ?? 'un empleado'} ya está pagado.`;
  }
  return null;
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export function paymentStatusFor(netCents: number, paidCents: number): PaymentStatus {
  if (paidCents <= 0) return 'unpaid';
  return paidCents >= netCents ? 'paid' : 'partial';
}

export interface CentsLine { accountCode: string; debitCents: number; creditCents: number }

/**
 * Asiento del pago: un Debe por cuenta de «Por pagar empleados» (cada grupo
 * puede tener la suya) y un Haber al banco o la cuenta, por el total.
 */
export function buildPaymentLines(
  items: Array<{ netPayableAccount: string; amountCents: number }>, creditAccount: string,
): CentsLine[] {
  const byAccount = new Map<string, number>();
  for (const i of items) byAccount.set(i.netPayableAccount, (byAccount.get(i.netPayableAccount) ?? 0) + i.amountCents);
  const total = items.reduce((s, i) => s + i.amountCents, 0);
  return [
    ...[...byAccount].map(([accountCode, c]) => ({ accountCode, debitCents: c, creditCents: 0 })),
    { accountCode: creditAccount, debitCents: 0, creditCents: total },
  ];
}

// ─── Anticipos a empleados ──────────────────────────────────────────────────

export interface AdvanceInput {
  employeeId: string;
  amountCents: number;
  date: Date;
  day: string;
  /** El mes en que se descuenta (AAAA-MM). */
  period: string;
  source: MoneySource;
  reference: string;
  notes: string;
}

/** El mes siguiente a 'AAAA-MM'. */
export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * El anticipo se descuenta en el mes en que se entrega o en el siguiente (la
 * quincena de fin de mes): nunca en uno anterior, ni más lejos.
 */
export function validateAdvanceInput(raw: Record<string, any>): Ok<AdvanceInput> {
  if (!isId(raw?.employeeId)) return bad('Elige el empleado.');
  const amountCents = positiveCents(raw.amountCents);
  if (amountCents === null || amountCents > 100_000_000) return bad('El valor del anticipo tiene que ser mayor que cero.');
  const date = parseEcuadorDate(raw.date);
  if (!date) return bad('La fecha va como AAAA-MM-DD.');
  const day = String(raw.date).trim();
  const own = day.slice(0, 7);
  const p = raw.period === undefined || raw.period === null || raw.period === '' ? { period: own } : parsePeriod(raw.period);
  if (!p) return bad('El mes del descuento tiene que ser AAAA-MM.');
  if (p.period !== own && p.period !== nextPeriod(own)) {
    return bad('El anticipo se descuenta en el mes en que se entrega o en el siguiente.');
  }
  const source = validateMoneySource(raw);
  if (!source.ok) return source;
  return {
    ok: true,
    value: { employeeId: raw.employeeId.trim(), amountCents, date, day, period: p.period, source: source.value,
      reference: optText(raw.reference, 120), notes: optText(raw.notes, 500) },
  };
}

/**
 * Tope del art. 90 al registrar: los anticipos del mes no pasan del % del
 * sueldo. Es un aviso temprano sobre el sueldo; el cálculo del rol vuelve a
 * medir contra la remuneración real del mes y bloquea la aprobación si se pasa.
 */
export function advanceCapProblem(salaryCents: number, capPct: number, alreadyCents: number, newCents: number): string | null {
  const cap = Math.floor(salaryCents * capPct / 100);
  if (alreadyCents + newCents <= cap) return null;
  const free = Math.max(0, cap - alreadyCents);
  return `Supera el tope del ${capPct} % del sueldo para anticipos (${(cap / 100).toFixed(2)}): ` +
    `en este mes quedan ${(free / 100).toFixed(2)} disponibles.`;
}

/** Qué impide anular un anticipo. */
export function voidAdvanceProblem(adv: Record<string, any> | undefined, periodStatus: unknown, reason: string): string | null {
  if (!adv) return 'El anticipo no existe.';
  if (adv.status === 'voided') return 'El anticipo ya está anulado.';
  if (periodStatus === 'approved') {
    return 'La nómina del mes en que se descuenta ya está aprobada: revérsala antes de anular el anticipo.';
  }
  if (!reason.trim()) return 'Escribe el motivo de la anulación.';
  return null;
}

/** ANE-2026-000001 (anticipo a empleado) y PNO-2026-000001 (pago de nómina). */
export const advanceNumber = (year: number, seq: number) => `ANE-${year}-${String(seq).padStart(6, '0')}`;
export const paymentNumber = (year: number, seq: number) => `PNO-${year}-${String(seq).padStart(6, '0')}`;

// ─── Cuentas de nómina ──────────────────────────────────────────────────────

export const PAYROLL_ACCOUNT_KEYS = Object.keys(DEFAULT_PAYROLL_ACCOUNTS) as PayrollAccountKey[];

/**
 * Las cuentas que guarda la empresa en `settings/accounting.payrollAccounts`.
 * Una clave vacía vuelve a la sugerida (o a su caída). Solo claves conocidas.
 */
export function validateAccountsInput(raw: unknown): Ok<Record<PayrollAccountKey, string>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('Las cuentas van como un objeto clave → código.');
  const out: Partial<Record<PayrollAccountKey, string>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(PAYROLL_ACCOUNT_KEYS as string[]).includes(k)) return bad(`Concepto de nómina desconocido: ${k}.`);
    const code = String(v ?? '').trim();
    if (code.length > 40 || code.includes('/')) return bad(`El código de ${k} no es válido.`);
    out[k as PayrollAccountKey] = code;
  }
  return { ok: true, value: out as Record<PayrollAccountKey, string> };
}
