/**
 * Pago de roles, anticipos a empleados y cuentas de nómina — modelos de la web
 * (NOMINA_PAGOS.md, 2026-11-18). Todo lo escribe el servidor
 * (payroll-payment-callables.ts, payroll-advance-callables.ts); la web lee y
 * llama a las callables.
 */

import { PaymentStatus } from './payroll.models';

export type PaymentDocStatus = 'posted' | 'voided';
export type MoneySourceMode = 'bank' | 'account';

export interface PayrollPaymentLine {
  payslipId: string;
  employeeId: string;
  name: string;
  amountCents: number;
  netPayableAccount: string;
}

export interface PayrollPayment {
  id: string;
  number: string;
  runId: string;
  period: string;
  date: string;
  status: PaymentDocStatus;
  paymentMode: MoneySourceMode;
  sourceLabel: string;
  paymentMethodCode: string;
  chequeNumber: string;
  reference: string;
  notes: string;
  lines: PayrollPaymentLine[];
  totalCents: number;
  entryId: string;
  voidReason: string;
}

export interface PayrollAdvance {
  id: string;
  number: string;
  employeeId: string;
  employeeName: string;
  date: string;
  period: string;
  amountCents: number;
  status: PaymentDocStatus;
  paymentMode: MoneySourceMode;
  sourceLabel: string;
  paymentMethodCode: string;
  chequeNumber: string;
  reference: string;
  notes: string;
  noveltyId: string;
  entryId: string;
  voidReason: string;
}

/** El formulario de «De dónde sale el dinero» (igual que los comprobantes de egreso). */
export interface MoneySourceForm {
  mode: MoneySourceMode;
  bankAccountId: string;
  paymentMethodCode: string;
  chequeNumber: string;
  creditAccountCode: string;
}

export const newMoneySource = (): MoneySourceForm => ({
  mode: 'bank', bankAccountId: '', paymentMethodCode: '20', chequeNumber: '', creditAccountCode: '',
});

/** Lo que va a la callable, o el aviso de lo que falta. */
export function moneySourcePayload(f: MoneySourceForm): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (f.mode === 'account') {
    const code = f.creditAccountCode.trim();
    return code ? { ok: true, value: { paymentMode: 'account', creditAccountCode: code } }
      : { ok: false, error: 'Elige la cuenta contable de donde sale el dinero.' };
  }
  if (!f.bankAccountId) return { ok: false, error: 'Elige la cuenta de banco o caja.' };
  if (!f.paymentMethodCode) return { ok: false, error: 'Elige la forma de pago.' };
  return {
    ok: true,
    value: {
      paymentMode: 'bank', bankAccountId: f.bankAccountId, paymentMethodCode: f.paymentMethodCode,
      ...(f.chequeNumber.trim() ? { chequeNumber: f.chequeNumber.trim() } : {}),
    },
  };
}

/** El código de la Tabla 24 que sirve para cheques y transferencias. */
export const CHEQUE_METHOD_CODE = '20';

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; color: string }> = {
  unpaid: { label: 'Por pagar', color: 'warning' },
  partial: { label: 'Pago parcial', color: 'info' },
  paid: { label: 'Pagado', color: 'success' },
};

export const DOC_STATUS: Record<PaymentDocStatus, { label: string; color: string }> = {
  posted: { label: 'Registrado', color: 'success' },
  voided: { label: 'Anulado', color: 'danger' },
};

/** Hoy en Ecuador, como 'AAAA-MM-DD' (la fecha que espera el servidor). */
export function ecuadorToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. */
export const dayLabel = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d);

/** El mes siguiente a 'AAAA-MM'. */
export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// ─── Cuentas de nómina (payroll-entry.ts → DEFAULT_PAYROLL_ACCOUNTS) ─────────

export type PayrollAccountKey =
  | 'salaryAdmin' | 'salarySales' | 'otherTaxable' | 'commissions' | 'bonuses' | 'nonTaxableIncome'
  | 'thirteenthExpense' | 'fourteenthExpense' | 'reserveFundExpense' | 'vacationExpense' | 'employerCostExpense' | 'assumedIessExpense'
  | 'netPayable' | 'advances' | 'iessPersonalPayable' | 'employerCostPayable'
  | 'thirteenthProvision' | 'fourteenthProvision' | 'vacationProvision' | 'reserveFundIessPayable'
  | 'companyLoan' | 'longTermAdvance' | 'iessQuirografario' | 'iessHipotecario' | 'otherDeductions';

export interface PayrollAccountsView {
  defaults: Partial<Record<PayrollAccountKey, string>>;
  saved: Partial<Record<PayrollAccountKey, string>>;
}

export const PAYROLL_ACCOUNT_LABELS: Record<PayrollAccountKey, string> = {
  salaryAdmin: 'Sueldos — administración',
  salarySales: 'Sueldos — ventas',
  otherTaxable: 'Horas extra y otros ingresos que aportan',
  commissions: 'Comisiones',
  bonuses: 'Bonos que aportan al IESS',
  nonTaxableIncome: 'Ingresos que no aportan al IESS',
  thirteenthExpense: 'Décimo tercero (gasto)',
  fourteenthExpense: 'Décimo cuarto (gasto)',
  reserveFundExpense: 'Fondos de reserva (gasto)',
  vacationExpense: 'Vacaciones (gasto)',
  employerCostExpense: 'Aporte patronal IESS (gasto)',
  assumedIessExpense: 'Gasto aporte personal asumido',
  netPayable: 'Sueldos por pagar (neto a pagar)',
  advances: 'Anticipos a empleados',
  iessPersonalPayable: 'Aporte personal IESS por pagar',
  employerCostPayable: 'Aporte patronal IESS por pagar',
  reserveFundIessPayable: 'Fondos de reserva por pagar al IESS',
  thirteenthProvision: 'Provisión décimo tercero',
  fourteenthProvision: 'Provisión décimo cuarto',
  vacationProvision: 'Provisión vacaciones',
  companyLoan: 'Préstamos de la empresa a empleados',
  longTermAdvance: 'Anticipos a largo plazo',
  iessQuirografario: 'Préstamos quirografarios del IESS',
  iessHipotecario: 'Préstamos hipotecarios del IESS',
  otherDeductions: 'Otras deducciones',
};

/** Las claves sin sugerida que caen a otra (payroll-entry.ts → FALLBACK). */
export const PAYROLL_ACCOUNT_FALLBACK: Partial<Record<PayrollAccountKey, PayrollAccountKey>> = {
  commissions: 'otherTaxable', bonuses: 'otherTaxable', nonTaxableIncome: 'otherTaxable',
  longTermAdvance: 'advances', assumedIessExpense: 'employerCostExpense',
};

export const PAYROLL_ACCOUNT_GROUPS: { title: string; keys: PayrollAccountKey[] }[] = [
  {
    title: 'Ingresos y gasto',
    keys: ['salaryAdmin', 'salarySales', 'otherTaxable', 'commissions', 'bonuses', 'nonTaxableIncome',
      'thirteenthExpense', 'fourteenthExpense', 'reserveFundExpense', 'vacationExpense', 'employerCostExpense',
      'assumedIessExpense'],
  },
  { title: 'Por pagar', keys: ['netPayable', 'iessPersonalPayable', 'employerCostPayable', 'reserveFundIessPayable'] },
  { title: 'Provisiones', keys: ['thirteenthProvision', 'fourteenthProvision', 'vacationProvision'] },
  {
    title: 'Descuentos y préstamos',
    keys: ['advances', 'longTermAdvance', 'companyLoan', 'iessQuirografario', 'iessHipotecario', 'otherDeductions'],
  },
];
