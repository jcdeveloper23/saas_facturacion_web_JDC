/**
 * Tipos de la nómina (PLAN_NOMINA.md §4.3, §4.4, §5.1). Puros: sin Firestore.
 *
 * Todo el dinero va en CENTAVOS ENTEROS. Los porcentajes, como en el documento
 * de parámetros: 9.45 significa 9,45 %.
 */

/** `payrollParameters/{año}_v{n}` (§4.3). Un `null` es un valor que falta. */
export interface PayrollParameters {
  year: number;
  version: number;
  status: 'draft' | 'published';
  /** 'AAAA-MM-DD' */
  validFrom: string;
  validTo: string;
  /** En dólares, como el acuerdo del Ministerio: 482.00. */
  sbu: number | null;
  iess: { personalPct: number | null; employerPct: number | null; iecePct: number | null; secapPct: number | null };
  reserveFund: { pct: number | null };
  thirteenth: { divisor: number | null };
  fourteenth: { divisor: number | null };
  overtime: {
    hoursDivisor: number | null;
    supplementaryPct: number | null;
    nightSupplementaryPct: number | null;
    weekendPct: number | null;
    nightShiftPct: number | null;
    maxPerDay: number | null;
    maxPerWeek: number | null;
  };
  vacation: { baseDays: number | null; divisor: number | null };
  advanceCapPct: number | null;
}

export type PayMode = 'monthly' | 'accumulated';
export type Region = 'sierra' | 'costa';

/** Lo que el cálculo necesita de `payrollEmployees/{id}`. */
export interface PayrollEmployeeInput {
  id: string;
  name: string;
  salaryCents: number;
  /** 'AAAA-MM-DD' */
  hireDate: string;
  endDate?: string | null;
  workdayType: 'full' | 'efficient' | 'partial';
  region: Region;
  expenseGroup: 'admin' | 'sales';
  thirteenthMode: PayMode;
  fourteenthMode: PayMode;
  /** accumulated = depositado en el IESS (art. 201). */
  reserveFundMode: PayMode;
  /** Días trabajados antes con el mismo empleador (reingreso, art. 197). */
  priorServiceDays?: number;
}

export type NoveltyType =
  | 'overtime50' | 'overtime100' | 'weekend' | 'nightShift'
  | 'commission' | 'bonusTaxable' | 'bonusNonTaxable'
  | 'advance' | 'otherDeduction' | 'unpaidLeave';

export interface PayrollNoveltyInput {
  employeeId: string;
  type: NoveltyType;
  /** Horas (horas extra) o días (permiso sin sueldo). */
  qty?: number;
  amountCents?: number;
  /** Cuenta de la otra deducción (§4.4, regla 7). */
  accountCode?: string;
}

/** Un anticipo a largo plazo o préstamo con cuotas (D-N12). */
export interface PayrollLoanInput {
  id: string;
  employeeId: string;
  type: 'longTermAdvance' | 'companyLoan' | 'iessQuirografario' | 'iessHipotecario';
  installmentCents: number;
  balanceCents: number;
  /** Cuenta propia del préstamo (D-N10); si no, la de `loans` de la empresa. */
  accountCode?: string;
}

/** Los conceptos del rol: dan el rótulo y la cuenta del asiento (§5.2). */
export type Concept =
  // ingresos
  | 'salary' | 'overtime50' | 'overtime100' | 'weekend' | 'nightShift'
  | 'commission' | 'bonusTaxable' | 'bonusNonTaxable'
  | 'thirteenthMonthly' | 'fourteenthMonthly' | 'reserveFundMonthly'
  // descuentos
  | 'iessPersonal' | 'advance' | 'otherDeduction' | 'loan'
  // costo del empleador
  | 'iessEmployer' | 'iece' | 'secap'
  // provisiones (no suman al neto, §4.4 regla 1)
  | 'thirteenthAccrued' | 'fourteenthAccrued' | 'vacationAccrued' | 'reserveFundIess';

export interface PayslipLine {
  concept: Concept;
  label: string;
  amountCents: number;
  qty?: number;
  /** Solo en otras deducciones y préstamos: la cuenta propia. */
  accountCode?: string;
  /** Préstamo al que descuenta, y su tipo (decide la cuenta, D-N10). */
  loanId?: string;
  loanType?: PayrollLoanInput['type'];
}

export interface PayslipResult {
  employeeId: string;
  workedDays: number;
  taxableCents: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  employerCosts: PayslipLine[];
  provisions: PayslipLine[];
  netCents: number;
  /** No impiden aprobar (horas sobre el tope del art. 55…). */
  warnings: string[];
  /** Impiden aprobar (sueldo bajo el SBU, anticipo sobre el tope…). */
  errors: string[];
  /** Saldo de cada préstamo después de este rol. */
  loanBalances: { loanId: string; balanceCents: number }[];
}

/** Rótulos del rol. Los de los décimos mensuales son los de MDT-2015-0087, Disp. Gen. Segunda. */
export const CONCEPT_LABELS: Record<Concept, string> = {
  salary: 'Sueldo',
  overtime50: 'Horas suplementarias (50 %)',
  overtime100: 'Horas extraordinarias (100 %)',
  weekend: 'Horas en sábado o domingo (100 %)',
  nightShift: 'Recargo por jornada nocturna (25 %)',
  commission: 'Comisiones',
  bonusTaxable: 'Bonificación',
  bonusNonTaxable: 'Bonificación no aportable',
  thirteenthMonthly: 'Pago mensual de la decimotercera remuneración',
  fourteenthMonthly: 'Pago mensual de la decimocuarta remuneración',
  reserveFundMonthly: 'Pago mensual de fondos de reserva',
  iessPersonal: 'Aporte personal IESS',
  advance: 'Anticipo',
  otherDeduction: 'Otra deducción',
  loan: 'Cuota de préstamo',
  iessEmployer: 'Aporte patronal IESS',
  iece: 'IECE',
  secap: 'SECAP',
  thirteenthAccrued: 'Provisión décimo tercero',
  fourteenthAccrued: 'Provisión décimo cuarto',
  vacationAccrued: 'Provisión vacaciones',
  reserveFundIess: 'Fondos de reserva depositados en el IESS',
};
