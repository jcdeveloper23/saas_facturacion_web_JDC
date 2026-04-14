import { Timestamp } from '@angular/fire/firestore';

// ─── Status ───────────────────────────────────────────────────────────────────

export type PurchaseStatus = 'draft' | 'sent' | 'received' | 'cancelled';

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  draft:     'Borrador',
  sent:      'Enviada',
  received:  'Recibida',
  cancelled: 'Cancelada',
};

export const PURCHASE_STATUS_COLORS: Record<PurchaseStatus, string> = {
  draft:     'secondary',
  sent:      'info',
  received:  'success',
  cancelled: 'danger',
};

// ─── Purchase Line ─────────────────────────────────────────────────────────────

export interface PurchaseLine {
  id: string;              // uuid local
  productId: string;
  productSku: string;
  productName: string;
  description?: string;
  qty: number;
  unitCost: number;
  discount: number;        // % descuento
  subtotal: number;        // qty * unitCost * (1 - discount/100)
  taxRate: number;         // 0 o 15
  taxAmount: number;       // subtotal * taxRate/100
  total: number;           // subtotal + taxAmount
}

// ─── Purchase Document ─────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/purchases/{purchaseId}

export interface Purchase {
  id: string;
  // Numeración interna
  number: number;
  serie: string;           // 'C' por defecto
  year: number;
  fullNumber: string;      // 'C-2025-000001'
  // Factura del proveedor
  supplierInvoiceNumber: string;
  supplierInvoiceDate: Timestamp;
  supplierAccessKey?: string;   // clave acceso SRI 49 dígitos (opcional)
  // Proveedor (snapshot)
  supplierId: string;
  supplierName: string;
  supplierRuc: string;
  supplierTaxIdType: string;   // 'ruc'|'cedula'|'passport'
  // Retenciones precargadas del proveedor
  irRetentionPct: number;
  vatRetentionPct: number;
  // Logística
  warehouseCode: string;
  warehouseName: string;
  date: Timestamp;
  expectedDate?: Timestamp;
  notes?: string;
  // Líneas
  lines: PurchaseLine[];
  // Totales
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  totalIrRetention: number;
  totalVatRetention: number;
  total: number;
  // Estado
  status: PurchaseStatus;
  stockProcessed: boolean;
  // Retención vinculada
  retentionId?: string;
  // Auditoría
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildPurchaseFullNumber(serie: string, year: number, number: number): string {
  return `${serie}-${year}-${String(number).padStart(6, '0')}`;
}

export function calcPurchaseLine(
  qty: number,
  unitCost: number,
  discountPct: number,
  taxRate: number
): Pick<PurchaseLine, 'subtotal' | 'taxAmount' | 'total'> {
  const base     = Math.round(qty * unitCost * 10000) / 10000;
  const subtotal = Math.round(base * (1 - discountPct / 100) * 10000) / 10000;
  const taxAmount = Math.round(subtotal * taxRate / 100 * 10000) / 10000;
  const total    = Math.round((subtotal + taxAmount) * 10000) / 10000;
  return { subtotal, taxAmount, total };
}

export interface PurchaseTotals {
  subtotal:          number;
  totalDiscount:     number;
  totalTax:          number;
  totalIrRetention:  number;
  totalVatRetention: number;
  total:             number;
}

export function calcPurchaseTotals(
  lines: Pick<PurchaseLine, 'qty' | 'unitCost' | 'discount' | 'taxRate' | 'subtotal' | 'taxAmount' | 'total'>[],
  irRetentionPct: number,
  vatRetentionPct: number
): PurchaseTotals {
  let subtotal      = 0;
  let totalDiscount = 0;
  let totalTax      = 0;

  for (const l of lines) {
    const grossLine = Math.round(l.qty * l.unitCost * 10000) / 10000;
    totalDiscount  += Math.round(grossLine * l.discount / 100 * 10000) / 10000;
    subtotal       += l.subtotal;
    totalTax       += l.taxAmount;
  }

  subtotal      = Math.round(subtotal      * 100) / 100;
  totalDiscount = Math.round(totalDiscount * 100) / 100;
  totalTax      = Math.round(totalTax      * 100) / 100;

  const totalIrRetention  = Math.round(subtotal * irRetentionPct  / 100 * 100) / 100;
  const totalVatRetention = Math.round(totalTax * vatRetentionPct / 100 * 100) / 100;
  const total             = Math.round((subtotal + totalTax - totalIrRetention - totalVatRetention) * 100) / 100;

  return { subtotal, totalDiscount, totalTax, totalIrRetention, totalVatRetention, total };
}
