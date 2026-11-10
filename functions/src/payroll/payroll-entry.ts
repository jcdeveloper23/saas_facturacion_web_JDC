/**
 * payroll-entry.ts — El asiento de una nómina (PLAN_NOMINA.md §5.2). Puro.
 *
 * Uno por nómina, con las líneas AGREGADAS POR CUENTA y sin nombres de
 * empleados: el contador lee asientos, pero el libro no debe mostrar sueldos
 * individuales. Cuadra por construcción: cada centavo del rol entra una vez al
 * debe y una vez al haber.
 *
 * Los códigos de abajo son SOLO SUGERENCIAS (D-N10): cada empresa tiene su plan
 * de cuentas y cada grupo de colaboradores puede tener las suyas. Se guardan en
 * `settings/accounting.payrollAccounts`. ⛔ No van a DEFAULT_CODES: la Puesta en
 * marcha vería cuentas faltantes en empresas sin nómina.
 */

import { Concept, PayslipLine, PayslipResult } from './payroll-types';

export type PayrollAccountKey =
  | 'salaryAdmin' | 'salarySales' | 'otherTaxable' | 'commissions' | 'bonuses' | 'nonTaxableIncome'
  | 'thirteenthExpense' | 'fourteenthExpense'
  | 'reserveFundExpense' | 'vacationExpense' | 'employerCostExpense'
  | 'netPayable' | 'advances' | 'iessPersonalPayable' | 'employerCostPayable'
  | 'thirteenthProvision' | 'fourteenthProvision' | 'vacationProvision' | 'reserveFundIessPayable'
  | 'companyLoan' | 'longTermAdvance' | 'iessQuirografario' | 'iessHipotecario' | 'otherDeductions';

/**
 * §5.2 y D-N10. Vacías a propósito, con caída a otra cuenta:
 *   commissions, bonuses → otherTaxable (5.2.01.002) si la empresa no las separa;
 *   nonTaxableIncome     → otherTaxable;
 *   longTermAdvance      → advances (1.1.02.002, también es un anticipo);
 *   otherDeductions      → cada novedad trae su cuenta (§4.4 regla 7).
 * Sin caída: companyLoan, iessQuirografario e iessHipotecario. Los del IESS son
 * una deuda con el IESS (2.1.04.x), no una cuenta por cobrar: el contador elige.
 */
export const DEFAULT_PAYROLL_ACCOUNTS: Record<PayrollAccountKey, string> = {
  salaryAdmin: '5.2.01.001',
  salarySales: '5.2.02.001',
  otherTaxable: '5.2.01.002',
  commissions: '',
  bonuses: '',
  nonTaxableIncome: '',
  thirteenthExpense: '5.2.01.003',
  fourteenthExpense: '5.2.01.004',
  reserveFundExpense: '5.2.01.005',
  vacationExpense: '5.2.01.006',
  employerCostExpense: '5.2.01.007',
  netPayable: '2.1.01.003',
  advances: '1.1.02.002',
  iessPersonalPayable: '2.1.04.006',
  employerCostPayable: '2.1.04.007',
  thirteenthProvision: '2.1.03.001',
  fourteenthProvision: '2.1.03.002',
  vacationProvision: '2.1.03.003',
  reserveFundIessPayable: '2.1.03.004',
  companyLoan: '',
  longTermAdvance: '',
  iessQuirografario: '',
  iessHipotecario: '',
  otherDeductions: '',
};

/** Clave con caída: si la empresa no configuró la propia, la de respaldo. */
const FALLBACK: Partial<Record<PayrollAccountKey, PayrollAccountKey>> = {
  commissions: 'otherTaxable', bonuses: 'otherTaxable', nonTaxableIncome: 'otherTaxable',
  longTermAdvance: 'advances',
};

const pick = (a: Record<PayrollAccountKey, string>, key: PayrollAccountKey): string =>
  a[key] || (FALLBACK[key] ? a[FALLBACK[key]!] : '') || '';

export interface EntryLine { accountCode: string; debitCents: number; creditCents: number }

/** Las cuentas de un rol: las de su grupo encima de las de la empresa (D-N10). */
export type AccountsFor = (payslip: PayslipResult & { expenseGroup?: 'admin' | 'sales' }) =>
  Record<PayrollAccountKey, string>;

const DEBIT: Partial<Record<Concept, PayrollAccountKey>> = {
  overtime50: 'otherTaxable', overtime100: 'otherTaxable', weekend: 'otherTaxable', nightShift: 'otherTaxable',
  commission: 'commissions', bonusTaxable: 'bonuses', bonusNonTaxable: 'nonTaxableIncome',
  thirteenthMonthly: 'thirteenthExpense', thirteenthAccrued: 'thirteenthExpense',
  fourteenthMonthly: 'fourteenthExpense', fourteenthAccrued: 'fourteenthExpense',
  reserveFundMonthly: 'reserveFundExpense', reserveFundIess: 'reserveFundExpense',
  vacationAccrued: 'vacationExpense',
  iessEmployer: 'employerCostExpense', iece: 'employerCostExpense', secap: 'employerCostExpense',
};

const CREDIT: Partial<Record<Concept, PayrollAccountKey>> = {
  iessPersonal: 'iessPersonalPayable', advance: 'advances',
  iessEmployer: 'employerCostPayable', iece: 'employerCostPayable', secap: 'employerCostPayable',
  thirteenthAccrued: 'thirteenthProvision', fourteenthAccrued: 'fourteenthProvision',
  vacationAccrued: 'vacationProvision', reserveFundIess: 'reserveFundIessPayable',
};

export class PayrollEntryError extends Error {
  constructor(public readonly missing: PayrollAccountKey[]) {
    super(`Faltan cuentas de nómina: ${missing.join(', ')}. Configúralas antes de aprobar.`);
  }
}

/**
 * Las líneas del asiento, una por cuenta y lado. Lanza [PayrollEntryError] si
 * una cuenta usada está vacía (la validación de existencia y movimiento la
 * hace la callable con `accountProblem`, §5.2).
 */
export function buildPayrollEntryLines(
  payslips: (PayslipResult & { expenseGroup?: 'admin' | 'sales' })[],
  accountsFor: AccountsFor,
): EntryLine[] {
  const debe = new Map<string, number>();
  const haber = new Map<string, number>();
  const faltan = new Set<PayrollAccountKey>();
  const add = (m: Map<string, number>, key: PayrollAccountKey, code: string | undefined, v: number) => {
    if (v === 0) return;
    if (!code) { faltan.add(key); return; }
    m.set(code, (m.get(code) ?? 0) + v);
  };

  for (const p of payslips) {
    const a = accountsFor(p);
    const deb = (l: PayslipLine) => {
      const key: PayrollAccountKey = l.concept === 'salary'
        ? (p.expenseGroup === 'sales' ? 'salarySales' : 'salaryAdmin')
        : DEBIT[l.concept]!;
      add(debe, key, pick(a, key), l.amountCents);
    };
    // Debe: ingresos, costo del empleador y provisiones.
    [...p.earnings, ...p.employerCosts, ...p.provisions].forEach(deb);
    // Haber: neto, descuentos, costo del empleador por pagar y provisiones.
    add(haber, 'netPayable', a.netPayable, p.netCents);
    for (const l of [...p.deductions, ...p.employerCosts, ...p.provisions]) {
      if (l.concept === 'otherDeduction') {
        add(haber, 'otherDeductions', l.accountCode || a.otherDeductions, l.amountCents);
      } else if (l.concept === 'loan') {
        // Cada tipo de préstamo a su cuenta (D-N10): los del IESS son deuda con el IESS.
        const key: PayrollAccountKey = l.loanType ?? 'companyLoan';
        add(haber, key, l.accountCode || pick(a, key), l.amountCents);
      } else {
        add(haber, CREDIT[l.concept]!, pick(a, CREDIT[l.concept]!), l.amountCents);
      }
    }
  }
  if (faltan.size) throw new PayrollEntryError([...faltan]);

  const lineas: EntryLine[] = [
    ...[...debe].map(([accountCode, v]) => ({ accountCode, debitCents: v, creditCents: 0 })),
    ...[...haber].map(([accountCode, v]) => ({ accountCode, debitCents: 0, creditCents: v })),
  ];
  return lineas.sort((x, y) =>
    (x.debitCents > 0 ? 0 : 1) - (y.debitCents > 0 ? 0 : 1) || x.accountCode.localeCompare(y.accountCode));
}

export const entryTotals = (lines: EntryLine[]) => ({
  debitCents: lines.reduce((s, l) => s + l.debitCents, 0),
  creditCents: lines.reduce((s, l) => s + l.creditCents, 0),
});
