/**
 * Nómina y roles de pago — modelos de la web (PLAN_NOMINA.md §5.1, E5).
 *
 * Todo lo escribe el servidor (functions/src/payroll/, E3); la web lee y llama
 * a las callables. Ningún cálculo de dinero corre aquí (§4.4, regla 8). Los
 * campos son los que escriben payroll-employee-callables.ts,
 * payroll-run-callables.ts y payroll-compute.ts (payslipDoc).
 */

export type RunStatus = 'draft' | 'approved' | 'reversed';
export type PayMode = 'monthly' | 'accumulated';

export interface PayrollEmployee {
  id: string;
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
  thirteenthMode: PayMode;
  fourteenthMode: PayMode;
  reserveFundMode: PayMode;
  bankAccount: string;
  isActive: boolean;
}

/** Lo que se manda en `employee` a upsertPayrollEmployee (validateEmployee). */
export type PayrollEmployeeInput = Omit<PayrollEmployee, 'id'>;

export interface PayrollTotals {
  employees: number;
  grossCents: number;
  deductionsCents: number;
  netCents: number;
  employerCostsCents: number;
  provisionsCents: number;
}

export interface PayrollRun {
  id: string;
  period: string;
  version: number;
  status: RunStatus;
  totals: PayrollTotals;
  warnings: string[];
  blockingErrors: string[];
  accountingEntryId: string | null;
  reversalEntryId: string | null;
  reversalReason: string;
  approvedAt: Date | null;
  reversedAt: Date | null;
}

export interface PayslipLine {
  concept: string;
  label: string;
  amountCents: number;
  qty?: number;
}

export interface Payslip {
  id: string;
  runId: string;
  period: string;
  employeeId: string;
  status: RunStatus;
  employee: { name: string; taxId: string; email: string; position: string; iessNumber: string };
  workedDays: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  employerCosts: PayslipLine[];
  provisions: PayslipLine[];
  netCents: number;
  emailSent: boolean;
  emailTo: string;
  emailError: string;
}

export interface PayrollNovelty {
  id: string;
  period: string;
  employeeId: string;
  type: NoveltyType;
  qty?: number;
  amountCents?: number;
  accountCode: string;
  note: string;
}

export type NoveltyType =
  | 'overtime50' | 'overtime100' | 'weekend' | 'nightShift'
  | 'commission' | 'bonusTaxable' | 'bonusNonTaxable'
  | 'advance' | 'otherDeduction' | 'unpaidLeave';

export interface NoveltyTypeInfo { code: NoveltyType; label: string; unit: 'hours' | 'days' | 'amount' }

export const NOVELTY_TYPES: NoveltyTypeInfo[] = [
  { code: 'overtime50', label: 'Horas suplementarias (50 %)', unit: 'hours' },
  { code: 'overtime100', label: 'Horas extraordinarias (100 %)', unit: 'hours' },
  { code: 'weekend', label: 'Horas en sábado o domingo (100 %)', unit: 'hours' },
  { code: 'nightShift', label: 'Horas nocturnas (25 %)', unit: 'hours' },
  { code: 'commission', label: 'Comisión', unit: 'amount' },
  { code: 'bonusTaxable', label: 'Bono que aporta al IESS', unit: 'amount' },
  { code: 'bonusNonTaxable', label: 'Bono que no aporta al IESS', unit: 'amount' },
  { code: 'advance', label: 'Anticipo', unit: 'amount' },
  { code: 'otherDeduction', label: 'Otra deducción', unit: 'amount' },
  { code: 'unpaidLeave', label: 'Permiso sin sueldo', unit: 'days' },
];

export const noveltyInfo = (code: string) => NOVELTY_TYPES.find((t) => t.code === code);

export const CONTRACT_LABELS: Record<string, string> = {
  indefinite: 'Indefinido', fixedTerm: 'Plazo fijo', occasional: 'Ocasional', seasonal: 'Por temporada', eventual: 'Eventual',
};
export const WORKDAY_LABELS: Record<string, string> = { full: 'Jornada completa', efficient: 'Jornada laboral eficiente' };
export const REGION_LABELS: Record<string, string> = { sierra: 'Sierra y Amazonía', costa: 'Costa e Insular' };
export const EXPENSE_LABELS: Record<string, string> = { admin: 'Administración', sales: 'Ventas' };
export const MODE_LABELS: Record<string, string> = { monthly: 'Mensual en el rol', accumulated: 'Acumulado' };
export const RESERVE_LABELS: Record<string, string> = { monthly: 'Mensual en el rol', accumulated: 'Depositado en el IESS' };

export const RUN_STATUS: Record<RunStatus, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'secondary' },
  approved: { label: 'Aprobada', color: 'success' },
  reversed: { label: 'Reversada', color: 'danger' },
};

/** El aviso fijo de §4.4, regla 9. */
export const INCOME_TAX_NOTICE =
  'El sistema todavía no calcula la retención de renta en relación de dependencia; revísela por fuera.';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre',
  'Octubre', 'Noviembre', 'Diciembre'];
export const MONTH_NAMES = MONTHS;

export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

export const runTitle = (r: Pick<PayrollRun, 'period' | 'version'>) =>
  r.version > 1 ? `${periodLabel(r.period)} · v${r.version}` : periodLabel(r.period);

export const money = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString('es-EC', { style: 'currency', currency: 'USD' });

/** '1.234,56', '1234.56' o '1234' → centavos; null si no se entiende o no es mayor que cero. */
export function parseMoneyCents(s: string): number | null {
  let t = String(s ?? '').trim().replace(/\s|\$/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else {
    t = t.replace(',', '.');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const c = Math.round(Number(t) * 100);
  return c > 0 ? c : null;
}

export const sumLines = (lines: PayslipLine[]) => lines.reduce((s, l) => s + Number(l.amountCents || 0), 0);
