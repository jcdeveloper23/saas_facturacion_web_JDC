import { Timestamp } from '@angular/fire/firestore';

// ─── Terminal ─────────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/pos-terminals/{terminalId}

export interface PosTerminal {
  id: string;
  name: string;                    // "Caja 1", "Terminal Principal"
  // ── Operación (cajas_terminales: codalmacen, codserie, codcliente) ─────────
  warehouseCode: string;           // codalmacen — bodega para descontar stock
  seriesCode: string;              // codserie — serie de documentos (ej. "PV")
  defaultCustomerId?: string;      // codcliente — cliente por defecto
  defaultCustomerName?: string;
  defaultCustomerTaxId?: string | null;
  // ── Hardware (cajas_terminales: anchopapel, comandocorte, comandoapertura, sin_comandos) ──
  paperWidth: 58 | 80;             // anchopapel — ancho del papel en mm
  sinComandos: boolean;            // sin_comandos — usar impresión por navegador (sin ESC/POS)
  cutCommand?: string | null;      // comandocorte — comando ESC/POS de corte (ej. "\x1d\x56\x42")
  openDrawerCommand?: string | null; // comandoapertura — comando de apertura del cajón
  cashDrawerEnabled: boolean;
  barcodeEnabled: boolean;
  // ── Conectividad impresora ─────────────────────────────────────────────────
  printerType: 'usb' | 'network' | 'browser';
  printerIp?: string | null;       // para impresoras de red
  printerPort?: number | null;
  // ── Contador (cajas_terminales: num_tickets) ───────────────────────────────
  numTickets: number;              // num_tickets — contador secuencial de tickets
  // ── Status ─────────────────────────────────────────────────────────────────
  isActive: boolean;
  currentSessionId?: string | null;
  currentUserId?: string | null;
  currentUserName?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Session (Arqueo) ─────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/pos-sessions/{sessionId}

export type PosSessionStatus = 'open' | 'closed';

export interface PosSession {
  id: string;
  terminalId: string;
  terminalName: string;
  // ── Cajero ─────────────────────────────────────────────────────────────────
  userId: string;
  userName: string;
  userEmail?: string;
  // ── Apertura ───────────────────────────────────────────────────────────────
  openedAt: Timestamp;
  openingBalance: number;         // efectivo inicial en caja
  openingNotes?: string | null;
  // ── Cierre ─────────────────────────────────────────────────────────────────
  status: PosSessionStatus;
  closedAt?: Timestamp;
  closingBalance?: number;        // efectivo contado al cierre
  expectedBalance?: number;       // calculado: apertura + ventas efectivo - egresos
  difference?: number;            // closingBalance - expectedBalance
  closingNotes?: string | null;
  // ── Totales acumulados (actualizados en cada venta) ─────────────────────────
  totalSales: number;
  totalSalesCount: number;
  totalCash: number;
  totalCard: number;
  totalTransfer: number;
  totalRefunds: number;
  totalCashIn: number;            // ingresos manuales
  totalCashOut: number;           // egresos manuales
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Cart item ────────────────────────────────────────────────────────────────

export interface PosCartItem {
  productId: string;
  productSku: string;
  productName: string;
  productShortName?: string;
  imageUrl?: string;
  unitPrice: number;
  salePrice: number;              // precio final (puede diferir por descuento)
  quantity: number;
  discountPct: number;
  vatPct: number;
  vatCode?: string;               // código SRI
  noStock: boolean;               // services
  averageCost?: number;           // costemedio — para el movimiento de stock
  subtotal: number;               // qty * salePrice * (1 - discountPct/100)
  vatAmount: number;
  lineTotal: number;
}

// ─── Payment split ────────────────────────────────────────────────────────────

export type PosPaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export interface PosPayment {
  method: PosPaymentMethod;
  methodLabel: string;
  amount: number;
  reference?: string;             // referencia tarjeta / transferencia
  sriCode?: string;               // código SRI para factura electrónica
}

// ─── Sale ─────────────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/pos-sales/{saleId}

export type PosSaleStatus = 'completed' | 'refunded' | 'void';

export interface PosSale {
  id: string;
  sessionId: string;
  terminalId: string;
  terminalName: string;
  // ── Cajero ─────────────────────────────────────────────────────────────────
  userId: string;
  userName: string;
  // ── Cliente ────────────────────────────────────────────────────────────────
  customerId: string;
  customerName: string;
  customerTaxId: string;
  customerTaxIdType: string;
  // ── Líneas ─────────────────────────────────────────────────────────────────
  lines: PosCartItem[];
  // ── Totales ────────────────────────────────────────────────────────────────
  subtotal: number;
  globalDiscountPct: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  // ── Pago ───────────────────────────────────────────────────────────────────
  payments: PosPayment[];
  totalPaid: number;
  change: number;
  // ── Factura electrónica vinculada ──────────────────────────────────────────
  invoiceId?: string;
  invoiceNumber?: string;
  generateInvoice: boolean;
  invoiceError?: string;    // mensaje de error si la CF falló al generar la factura
  // ── Estado ─────────────────────────────────────────────────────────────────
  seriesCode: string;              // codserie del terminal
  warehouseCode?: string;          // bodega — necesaria para reponer stock al anular
  status: PosSaleStatus;
  stockProcessed?: boolean;
  ticketNumber: number;           // num_tickets — correlativo global del terminal
  createdAt: Timestamp;
}

// ─── Cash movement ────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/pos-cash-movements/{movId}

export type CashMovementType = 'cash_in' | 'cash_out';

export interface PosCashMovement {
  id: string;
  sessionId: string;
  terminalId: string;
  userId: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  createdAt: Timestamp;
}

// ─── Cart state (in-memory only) ─────────────────────────────────────────────

export interface PosCartState {
  items: PosCartItem[];
  customerId: string;
  customerName: string;
  customerTaxId: string;
  customerTaxIdType: string;
  globalDiscountPct: number;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
}

// ─── Close session report ─────────────────────────────────────────────────────

export interface PosCloseReport {
  session: PosSession;
  sales: PosSale[];
  movements: PosCashMovement[];
  expectedBalance: number;
  difference: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const POS_PAYMENT_METHODS: { method: PosPaymentMethod; label: string; icon: string; sriCode: string }[] = [
  { method: 'cash',     label: 'Efectivo',      icon: 'cilCash',           sriCode: '01' },
  { method: 'card',     label: 'Tarjeta',        icon: 'cilCreditCard',     sriCode: '19' },
  { method: 'transfer', label: 'Transferencia',  icon: 'cilTransfer',       sriCode: '17' },
  { method: 'other',    label: 'Otro',           icon: 'cilOptions',        sriCode: '20' },
];

export function calcCartTotals(items: PosCartItem[], globalDiscountPct: number): Pick<PosCartState, 'subtotal' | 'discountAmount' | 'vatAmount' | 'total'> {
  const gross        = round2(items.reduce((s, i) => s + i.subtotal, 0));
  const discAmt      = round2(gross * globalDiscountPct / 100);
  const net          = round2(gross - discAmt);
  const factor       = gross > 0 ? net / gross : 1;
  // Use the stored vatAmount (computed from full-precision net) scaled by the
  // global-discount factor, rather than recomputing from the already-rounded subtotal.
  const vatAmount    = round2(items.reduce((s, i) => s + i.vatAmount * factor, 0));
  return {
    subtotal:       gross,
    discountAmount: discAmt,
    vatAmount,
    total:          round2(net + vatAmount)
  };
}

export function calcCartItem(item: Partial<PosCartItem>): Pick<PosCartItem, 'subtotal' | 'vatAmount' | 'lineTotal'> {
  const qty    = item.quantity    ?? 1;
  const price  = item.salePrice   ?? item.unitPrice ?? 0;
  const disc   = item.discountPct ?? 0;
  const vatPct = item.vatPct      ?? 0;
  // Compute net and vat at full precision before rounding, so that lineTotal
  // reflects the original PVP con IVA without accumulating rounding error.
  const net       = qty * price * (1 - disc / 100);
  const vat       = net * vatPct / 100;
  const lineTotal = round2(net + vat);
  return { subtotal: round2(net), vatAmount: round2(vat), lineTotal };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
