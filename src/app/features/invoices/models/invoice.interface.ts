import { Timestamp } from '@angular/fire/firestore';

// ─── SRI Electronic Document Status ──────────────────────────────────────────
export type SriDocumentStatus =
  | 'pending'        // emitida, pendiente de envío a SRI
  | 'authorized'     // autorizada por SRI, tiene authorizationNumber
  | 'rejected'       // rechazada por SRI, ver sriError
  | 'not_required';  // borrador o estado que no requiere SRI

// ─── Status ──────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void' | 'credit_note';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft:       'Borrador',
  issued:      'Emitida',
  paid:        'Pagada',
  void:        'Anulada',
  credit_note: 'Nota de crédito'  
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft:       'secondary',
  issued:      'primary',
  paid:        'success',
  void:        'danger',
  credit_note: 'warning'
};

export const SRI_STATUS_LABELS: Record<SriDocumentStatus, string> = {
  pending:      'Pendiente SRI',
  authorized:   'Autorizada',
  rejected:     'Rechazada SRI',
  not_required: '—'
};

export const SRI_STATUS_COLORS: Record<SriDocumentStatus, string> = {
  pending:      'warning',
  authorized:   'success',
  rejected:     'danger',
  not_required: 'secondary'
};

// ─── Line ─────────────────────────────────────────────────────────────────────

export interface InvoiceLine {
  id: string;
  productId?: string;
  productSku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;       // % descuento por línea
  subtotal: number;          // quantity * unitPrice * (1 - discountPct/100)
  vatPct: number;            // 0 | 5 | 8 | 15
  vatAmount: number;         // subtotal * vatPct / 100
  total: number;             // subtotal + vatAmount
  warehouseCode?: string;    // override por línea si es necesario
  notes?: string;
  sriTaxCode?: string;  // código SRI: '2'=IVA 0%, '3'=IVA 15%, '5'=IVA 5%, '6'=Exento
}

// ─── VAT summary breakdown ────────────────────────────────────────────────────

export interface VatSummaryLine {
  vatPct: number;
  taxableBase: number;
  vatAmount: number;
}

// ─── SRI Payment Methods ─────────────────────────────────────────────────────

export interface SriPaymentMethod {
  code: string;        // código SRI: '01', '16', '19', etc.
  name: string;        // nombre para display
  amount: number;      // monto pagado con este método
  deadline?: number;   // plazo (solo para crédito)
  timeUnit?: string;   // 'dias' | 'meses' | 'años'
}

export const SRI_PAYMENT_METHODS: { code: string; name: string }[] = [
  { code: '01', name: 'Efectivo' },
  { code: '15', name: 'Compensación de deudas' },
  { code: '16', name: 'Tarjeta de débito' },
  { code: '17', name: 'Dinero electrónico' },
  { code: '18', name: 'Tarjeta prepago' },
  { code: '19', name: 'Tarjeta de crédito' },
  { code: '20', name: 'Otros (sistema financiero)' },
  { code: '21', name: 'Endoso de títulos' },
];

// ─── Main Invoice document ────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/invoices/{invoiceId}

export interface Invoice {
  id: string;

  // ── Numbering ───────────────────────────────────────────────────────────────
  seriesCode: string;            // e.g. "A" — links to DocumentSeries.code
  seriesEstablishment: string;   // "001"
  seriesEmissionPoint: string;   // "001"
  number: number;                // auto-increment per series+fiscalYear
  fullNumber: string;            // SRI format "001-001-000000001"
  fiscalYear: string;            // "2025"

  // ── Dates ───────────────────────────────────────────────────────────────────
  date: Timestamp;
  dueDate: Timestamp;

  // ── Customer snapshot (copied at emit time) ─────────────────────────────────
  customerId: string;
  customerCode: string;
  customerName: string;
  customerTaxId: string;
  customerTaxIdType: string;     // RUC | CI | PASAPORTE | EXTERIOR
  customerAddress?: string;
  customerCity?: string;
  customerProvince?: string;
  customerEmail?: string;

  // ── Commerce ────────────────────────────────────────────────────────────────
  warehouseCode: string;
  paymentTermCode: string;
  currency: string;              // "USD"
  exchangeRate: number;          // 1.0 for USD
  agentCode?: string;
  // Referencia del cliente (número de orden de compra / PO)
  customerReference?: string;
  paymentMethods?: SriPaymentMethod[];  // formas de pago SRI (requerido para XML)

  // ── Lines (embedded) ────────────────────────────────────────────────────────
  lines: InvoiceLine[];

  // ── Totals ──────────────────────────────────────────────────────────────────
  grossAmount: number;           // sum of line subtotals before global discount
  globalDiscountPct: number;     // % descuento global (dtopor1)
  discountAmount: number;        // grossAmount * globalDiscountPct / 100
  netAmount: number;             // grossAmount - discountAmount (total base imponible)
  vatSummary: VatSummaryLine[];  // breakdown by vatPct
  vatAmount: number;             // total IVA
  total: number;                 // netAmount + vatAmount

  // ── Status ──────────────────────────────────────────────────────────────────
  status: InvoiceStatus;
  isPaid: boolean;
  paidAt?: Timestamp;
  isVoid: boolean;
  voidedAt?: Timestamp;
  isCreditNote: boolean;
  rectifiedInvoiceId?: string;
  rectifiedInvoiceNumber?: string;

  // ── Notes & audit ───────────────────────────────────────────────────────────
  notes?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;

  // ── SRI Electronic Document ─────────────────────────────────────────────────
  sriStatus?: SriDocumentStatus;     // estado en el proceso SRI
  accessKey?: string;                // clave de acceso 49 dígitos
  codigoNumerico?: string;           // 8 dígitos aleatorios (parte de accessKey)
  authorizationNumber?: string;      // número autorización retornado por SRI
  authorizedAt?: Timestamp;          // fecha/hora de autorización SRI
  sriError?: string;                 // mensaje de error si sriStatus === 'rejected'
  xmlUrl?: string;                   // Cloud Storage URL del XML firmado
  pdfUrl?: string;                   // Cloud Storage URL del PDF (RIDE)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function buildFullNumber(establishment: string, emissionPoint: string, number: number): string {
  return `${establishment.padStart(3, '0')}-${emissionPoint.padStart(3, '0')}-${String(number).padStart(9, '0')}`;
}

export function calcLine(line: Partial<InvoiceLine>): Pick<InvoiceLine, 'subtotal' | 'vatAmount' | 'total'> {
  const qty      = line.quantity    ?? 0;
  const price    = line.unitPrice   ?? 0;
  const disc     = line.discountPct ?? 0;
  const vatPct   = line.vatPct      ?? 0;
  const subtotal = round2(qty * price * (1 - disc / 100));
  const vatAmount= round2(subtotal * vatPct / 100);
  return { subtotal, vatAmount, total: round2(subtotal + vatAmount) };
}

export function calcInvoiceTotals(lines: InvoiceLine[], globalDiscountPct: number) {
  const gross  = round2(lines.reduce((s, l) => s + l.subtotal, 0));
  const disc   = round2(gross * globalDiscountPct / 100);
  const net    = round2(gross - disc);
  const factor = gross > 0 ? net / gross : 1;

  const vatMap = new Map<number, VatSummaryLine>();
  for (const l of lines) {
    const base = round2(l.subtotal * factor);
    const va   = round2(base * l.vatPct / 100);
    const entry = vatMap.get(l.vatPct) ?? { vatPct: l.vatPct, taxableBase: 0, vatAmount: 0 };
    entry.taxableBase = round2(entry.taxableBase + base);
    entry.vatAmount   = round2(entry.vatAmount   + va);
    vatMap.set(l.vatPct, entry);
  }

  const vatSummary = [...vatMap.values()].sort((a, b) => a.vatPct - b.vatPct);
  const vatAmount  = round2(vatSummary.reduce((s, v) => s + v.vatAmount, 0));
  return { grossAmount: gross, discountAmount: disc, netAmount: net, vatSummary, vatAmount, total: round2(net + vatAmount) };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
