import { Timestamp } from '@angular/fire/firestore';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type ProfitPeriodType = 'day' | 'week' | 'month' | 'year' | 'custom';
export type DistributionStatus = 'pending' | 'partially_paid' | 'distributed';
export type PartnerPaymentStatus = 'pending' | 'paid';
export type PartnerPaymentMethod = 'cash' | 'transfer' | 'check' | 'other';

// ─── Partner config ───────────────────────────────────────────────────────────

export interface ProfitPartner {
  id: string;                    // UUID local (nanoid / crypto.randomUUID)
  name: string;
  taxId?: string;
  email?: string;
  percentage: number;            // 0.01 - 100, suma total debe ser 100
  notes?: string;
}

// ─── Profit config ────────────────────────────────────────────────────────────
// /companies/{companyId}/profit-config/{configId}

export interface ProfitConfig {
  id: string;
  name: string;
  isActive: boolean;
  partners: ProfitPartner[];
  totalPercentage: number;       // cached sum — siempre 100 si es valida
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;
}

// ─── Distribution line (por socio) ───────────────────────────────────────────

export interface PartnerDistributionLine {
  partnerId: string;
  partnerName: string;
  percentage: number;
  amount: number;
}

// ─── Profit snapshot ──────────────────────────────────────────────────────────
// /companies/{companyId}/profit-snapshots/{snapshotId}

export interface ProfitSnapshot {
  id: string;
  periodType: ProfitPeriodType;
  periodLabel: string;
  startDate: Timestamp;
  endDate: Timestamp;
  warehouseCode: string | null;
  familyId: string | null;

  // Contadores
  posSalesCount: number;
  invoicesCount: number;
  totalDocsCount: number;

  // Financiero
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;

  // Alertas
  linesWithoutCost: number;
  revenueWithoutCost: number;

  // Distribucion
  configId: string;
  distribution: PartnerDistributionLine[];

  // Control
  calculatedAt: Timestamp;
  calculatedBy: string;
  isStale: boolean;
  source: 'manual' | 'scheduled_cf';
}

// ─── Partner payment en una liquidacion ──────────────────────────────────────

export interface PartnerPayment {
  partnerId: string;
  partnerName: string;
  taxId?: string;
  percentage: number;
  amount: number;
  status: PartnerPaymentStatus;
  paidAt?: Timestamp | null;
  paidBy?: string | null;
  paymentMethod?: PartnerPaymentMethod | null;
  paymentReference?: string | null;
  notes?: string | null;
}

// ─── Profit distribution (liquidacion) ───────────────────────────────────────
// /companies/{companyId}/profit-distributions/{distributionId}

export interface ProfitDistribution {
  id: string;
  snapshotId: string;
  periodType: ProfitPeriodType;
  periodLabel: string;
  startDate: Timestamp;
  endDate: Timestamp;

  // Totales congelados al crear la liquidacion
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;

  // Config usada
  configId: string;
  configName: string;

  // Pagos
  partnerPayments: PartnerPayment[];
  status: DistributionStatus;

  notes?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;
}

// ─── Resultado de calculo (en memoria — no se persiste directamente) ──────────

export interface ProfitCalculationResult {
  periodType: ProfitPeriodType;
  periodLabel: string;
  startDate: Date;
  endDate: Date;
  posSalesCount: number;
  invoicesCount: number;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  linesWithoutCost: number;
  revenueWithoutCost: number;
  lineBreakdown: ProfitLineDetail[];   // detalle para drill-down
}

export interface ProfitLineDetail {
  sourceType: 'pos_sale' | 'invoice';
  sourceId: string;
  sourceNumber: string;                // ticketNumber o fullNumber
  date: Date;
  productId: string;
  productSku: string;
  productName: string;
  familyId?: string;
  familyName?: string;
  warehouseCode: string;
  quantity: number;
  salePrice: number;
  averageCost: number;
  revenue: number;                     // subtotal neto de la linea
  cogs: number;                        // averageCost * quantity
  grossProfit: number;
  grossMarginPct: number;
  hasCost: boolean;                    // false si averageCost == 0
}

// ─── Labels y helpers ─────────────────────────────────────────────────────────

export const PERIOD_TYPE_LABELS: Record<ProfitPeriodType, string> = {
  day:    'Diario',
  week:   'Semanal',
  month:  'Mensual',
  year:   'Anual',
  custom: 'Personalizado'
};

export const DISTRIBUTION_STATUS_LABELS: Record<DistributionStatus, string> = {
  pending:          'Pendiente',
  partially_paid:   'Parcialmente pagado',
  distributed:      'Distribuido'
};

export const DISTRIBUTION_STATUS_COLORS: Record<DistributionStatus, string> = {
  pending:          'warning',
  partially_paid:   'primary',
  distributed:      'success'
};

export function calcDistributionStatus(payments: PartnerPayment[]): DistributionStatus {
  const paid = payments.filter(p => p.status === 'paid').length;
  if (paid === 0)                return 'pending';
  if (paid === payments.length)  return 'distributed';
  return 'partially_paid';
}
