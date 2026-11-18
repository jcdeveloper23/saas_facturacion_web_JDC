/**
 * payroll-loan-logic.ts — Grupos de colaboradores (D-N10) y préstamos con
 * cuotas (D-N12): validación pura (NOMINA_GRUPOS_PRESTAMOS.md, 2026-11-18).
 *
 * Tipos de préstamo (los que ya descuenta el cálculo, payroll-calc.ts):
 *   companyLoan        préstamo de la empresa: sale dinero → asiento de entrega opcional
 *   longTermAdvance    anticipo a largo plazo: igual, y cuenta en el tope del art. 90
 *   iessQuirografario  los presta el IESS: la empresa solo retiene la cuota → sin entrega
 *   iessHipotecario    ídem
 * Criterio provisional mientras Jessica Zari responde §9 punto 18.
 */

import { validateAccountsInput, validateMoneySource, MoneySource, Ok } from './payroll-payment-logic';
import { parseEcuadorDate, positiveCents } from '../accounting/advances/advance-logic';
import { PayrollAccountKey } from './payroll-entry';
import { parsePeriod } from './payroll-run-logic';

const bad = (error: string) => ({ ok: false as const, error });
const isId = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '' && !v.includes('/') && v.trim().length <= 200;
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

// ─── Grupos ─────────────────────────────────────────────────────────────────

export interface GroupInput {
  groupId: string | null;
  name: string;
  description: string;
  /** Solo las cuentas propias del grupo; lo que falte cae a las de la empresa. */
  accounts: Partial<Record<PayrollAccountKey, string>>;
  isActive: boolean;
}

export function validateGroupInput(raw: Record<string, any>): Ok<GroupInput> {
  const groupId = raw?.groupId === undefined || raw?.groupId === null || raw?.groupId === '' ? null
    : isId(raw.groupId) ? raw.groupId.trim() : undefined;
  if (groupId === undefined) return bad('Grupo inválido.');
  const name = text(raw?.name, 80);
  if (!name) return bad('Escribe el nombre del grupo.');
  const a = validateAccountsInput(raw.accounts ?? {});
  if (!a.ok) return a;
  const accounts = Object.fromEntries(Object.entries(a.value).filter(([, code]) => code)) as GroupInput['accounts'];
  return {
    ok: true,
    value: { groupId, name, description: text(raw.description, 200), accounts, isActive: raw.isActive !== false },
  };
}

/** El nombre no se repite (sin mayúsculas ni espacios de más). */
export function duplicateGroupName(name: string, others: Array<{ id: string; name: string }>, selfId: string | null): boolean {
  const norm = (s: string) => s.trim().toLocaleLowerCase('es').replace(/\s+/g, ' ');
  return others.some((g) => g.id !== selfId && norm(g.name) === norm(name));
}

// ─── Préstamos ──────────────────────────────────────────────────────────────

export const LOAN_TYPES = ['companyLoan', 'longTermAdvance', 'iessQuirografario', 'iessHipotecario'] as const;
export type LoanType = typeof LOAN_TYPES[number];
/** Los que entrega la empresa (pueden llevar asiento de entrega). */
export const DISBURSED_TYPES: LoanType[] = ['companyLoan', 'longTermAdvance'];
export const isIessLoan = (t: unknown) => t === 'iessQuirografario' || t === 'iessHipotecario';

export interface LoanInput {
  employeeId: string;
  type: LoanType;
  amountCents: number;
  /** Lo que falta cobrar hoy: = amountCents salvo un préstamo que ya venía descontándose. */
  balanceCents: number;
  installmentCents: number;
  /** Primer mes en que se descuenta (AAAA-MM). */
  startPeriod: string;
  /** Cuenta propia del préstamo (D-N10); vacía = la del concepto en Cuentas de nómina. */
  accountCode: string;
  notes: string;
  /** Asiento de entrega: solo companyLoan / longTermAdvance. */
  disbursement: { date: Date; day: string; source: MoneySource; reference: string } | null;
}

export function validateLoanInput(raw: Record<string, any>): Ok<LoanInput> {
  if (!isId(raw?.employeeId)) return bad('Elige el empleado.');
  const type = raw.type as LoanType;
  if (!LOAN_TYPES.includes(type)) return bad('Tipo de préstamo desconocido.');
  const amountCents = positiveCents(raw.amountCents);
  if (amountCents === null || amountCents > 100_000_000) return bad('El monto del préstamo tiene que ser mayor que cero.');
  const balanceCents = raw.balanceCents === undefined || raw.balanceCents === null ? amountCents : positiveCents(raw.balanceCents);
  if (balanceCents === null) return bad('El saldo tiene que ser mayor que cero.');
  if (balanceCents > amountCents) return bad('El saldo no puede ser mayor que el monto.');
  const installmentCents = positiveCents(raw.installmentCents);
  if (installmentCents === null) return bad('La cuota tiene que ser mayor que cero.');
  if (installmentCents > balanceCents) return bad('La cuota no puede ser mayor que el saldo.');
  const p = parsePeriod(raw.startPeriod);
  if (!p) return bad('El mes del primer descuento tiene que ser AAAA-MM.');
  const accountCode = text(raw.accountCode, 40);
  if (accountCode.includes('/')) return bad('La cuenta del préstamo no es válida.');

  let disbursement: LoanInput['disbursement'] = null;
  if (raw.disbursement) {
    if (!DISBURSED_TYPES.includes(type)) {
      return bad('Un préstamo del IESS no tiene entrega: lo paga el IESS y la empresa solo retiene la cuota.');
    }
    if (balanceCents !== amountCents) return bad('Un préstamo con saldo ya descontado no lleva asiento de entrega.');
    const d = raw.disbursement as Record<string, any>;
    const date = parseEcuadorDate(d.date);
    if (!date) return bad('La fecha de la entrega va como AAAA-MM-DD.');
    const day = String(d.date).trim();
    if (p.period < day.slice(0, 7)) return bad('El primer descuento no puede ser antes del mes de la entrega.');
    const source = validateMoneySource(d);
    if (!source.ok) return source;
    disbursement = { date, day, source: source.value, reference: text(d.reference, 120) };
  }
  return {
    ok: true,
    value: { employeeId: raw.employeeId.trim(), type, amountCents, balanceCents, installmentCents,
      startPeriod: p.period, accountCode, notes: text(raw.notes, 500), disbursement },
  };
}

export interface LoanUpdate { installmentCents: number | null; balanceCents: number | null; notes: string | null }

/** Cambiar la cuota (cualquiera) o el saldo (solo los del IESS: lo dice el IESS). */
export function validateLoanUpdate(loan: Record<string, any> | undefined, raw: Record<string, any>): Ok<LoanUpdate> {
  if (!loan) return bad('El préstamo no existe.');
  if (loan.status !== 'active') return bad('Solo se cambia un préstamo activo.');
  const installment = raw.installmentCents === undefined ? null : positiveCents(raw.installmentCents);
  if (raw.installmentCents !== undefined && installment === null) return bad('La cuota tiene que ser mayor que cero.');
  const balance = raw.balanceCents === undefined ? null : positiveCents(raw.balanceCents);
  if (raw.balanceCents !== undefined && balance === null) return bad('El saldo tiene que ser mayor que cero.');
  if (balance !== null && !isIessLoan(loan.type)) {
    return bad('El saldo de un préstamo de la empresa solo cambia con los descuentos del rol.');
  }
  const notes = raw.notes === undefined ? null : text(raw.notes, 500);
  if (installment === null && balance === null && notes === null) return bad('No hay cambios.');
  const newBalance = balance ?? Number(loan.balanceCents ?? 0);
  if ((installment ?? Number(loan.installmentCents ?? 0)) > newBalance) return bad('La cuota no puede ser mayor que el saldo.');
  return { ok: true, value: { installmentCents: installment, balanceCents: balance, notes } };
}

/**
 * Cancelar: deja de descontarse. Si tiene entrega y no se descontó nada, se
 * reversa también su asiento (`reverseEntry`); si ya se descontó algo, el
 * asiento queda y lo que falte cobrar se ajusta a mano.
 */
export function cancelLoanPlan(loan: Record<string, any> | undefined, reason: string):
  Ok<{ reverseEntry: boolean }> {
  if (!loan) return bad('El préstamo no existe.');
  if (loan.status !== 'active') return bad('Solo se cancela un préstamo activo.');
  if (!reason.trim()) return bad('Escribe el motivo.');
  const untouched = Number(loan.balanceCents ?? 0) === Number(loan.amountCents ?? 0);
  return { ok: true, value: { reverseEntry: Boolean(loan.disbursement?.entryId) && untouched } };
}

/** El préstamo entra al cálculo del mes: activo y ya empezó. */
export const loanAppliesTo = (loan: Record<string, any>, period: string) =>
  loan.status === 'active' && (!loan.startPeriod || String(loan.startPeriod) <= period);

/** PRE-2026-000001 */
export const loanNumber = (year: number, seq: number) => `PRE-${year}-${String(seq).padStart(6, '0')}`;
