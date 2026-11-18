/**
 * Grupos de colaboradores y préstamos — modelos de la web
 * (NOMINA_GRUPOS_PRESTAMOS.md, 2026-11-18). Todo lo escribe el servidor
 * (payroll-group-loan-callables.ts); la web lee y llama a las callables.
 */

import {
  PAYROLL_ACCOUNT_FALLBACK, PAYROLL_ACCOUNT_LABELS, PayrollAccountKey, PayrollAccountsView,
} from './payroll-payments.models';

export type PayrollAccountMap = Partial<Record<PayrollAccountKey, string>>;

export interface PayrollGroup {
  id: string;
  name: string;
  description: string;
  accounts: PayrollAccountMap;
  isActive: boolean;
}

export type LoanType = 'companyLoan' | 'longTermAdvance' | 'iessQuirografario' | 'iessHipotecario';
export type LoanStatus = 'active' | 'paid' | 'cancelled';

export interface LoanDisbursement {
  date: string;
  entryId: string;
  sourceLabel: string;
  chequeNumber: string;
  reference: string;
  reversalEntryId: string;
}

export interface PayrollLoan {
  id: string;
  number: string;
  employeeId: string;
  employeeName: string;
  type: LoanType;
  amountCents: number;
  balanceCents: number;
  installmentCents: number;
  /** Primer mes del descuento; vacío en los préstamos viejos (se descuentan siempre). */
  startPeriod: string;
  accountCode: string;
  status: LoanStatus;
  notes: string;
  disbursement: LoanDisbursement | null;
  cancelReason: string;
}

export const LOAN_TYPES: { code: LoanType; label: string }[] = [
  { code: 'companyLoan', label: 'Préstamo de la empresa' },
  { code: 'longTermAdvance', label: 'Anticipo a largo plazo' },
  { code: 'iessQuirografario', label: 'Préstamo IESS quirografario' },
  { code: 'iessHipotecario', label: 'Préstamo IESS hipotecario' },
];

export const LOAN_TYPE_LABELS = Object.fromEntries(LOAN_TYPES.map((t) => [t.code, t.label])) as Record<LoanType, string>;

export const LOAN_STATUS: Record<LoanStatus, { label: string; color: string }> = {
  active: { label: 'Activo', color: 'success' },
  paid: { label: 'Pagado', color: 'secondary' },
  cancelled: { label: 'Cancelado', color: 'danger' },
};

/** Los del IESS: sin entrega (lo paga el IESS) y con saldo editable (lo informa el IESS). */
export const isIessLoan = (t: LoanType) => t === 'iessQuirografario' || t === 'iessHipotecario';
/** Los que entrega la empresa: pueden llevar asiento de entrega. */
export const isDisbursedLoan = (t: LoanType) => t === 'companyLoan' || t === 'longTermAdvance';

/**
 * La cuenta que la empresa usa hoy para una clave (lo que aplica cuando un
 * grupo la deja vacía): la guardada, o la sugerida, o la de su caída
 * (payroll-entry.ts → pick).
 */
export function companyAccountFor(view: PayrollAccountsView | null, key: PayrollAccountKey): { code: string; note: string } {
  const own = (k: PayrollAccountKey) => view?.saved?.[k] || view?.defaults?.[k] || '';
  const code = own(key);
  if (code) return { code, note: '' };
  const fb = PAYROLL_ACCOUNT_FALLBACK[key];
  if (fb && own(fb)) return { code: own(fb), note: `(la de «${PAYROLL_ACCOUNT_LABELS[fb]}»)` };
  return { code: '', note: 'La empresa no tiene cuenta' };
}
