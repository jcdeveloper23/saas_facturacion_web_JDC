import { Timestamp } from '@angular/fire/firestore';
import { CartItem } from '../services/cart.service';

// ─── Tipos base ───────────────────────────────────────────────────────────────

export type CatalogPaymentMethod = 'transfer' | 'cash_on_delivery' | 'card';

export type CatalogPaymentStatus = 'pending' | 'proof_uploaded' | 'confirmed' | 'rejected';

export type CatalogOrderStatus = 'new' | 'processing' | 'shipped' | 'completed' | 'cancelled';

// ─── Sub-interfaces ───────────────────────────────────────────────────────────

export interface OrderCustomer {
  name: string;
  email: string;
  phone: string;
  address?: string;
  notes?: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  imageUrl?: string;
  qty: number;
  unitPrice: number;      // precio sin IVA
  taxRate: number;        // porcentaje, ej: 15
  lineTotal: number;      // (unitPrice * (1 + taxRate/100)) * qty
}

export interface OrderStatusEntry {
  status: CatalogOrderStatus;
  changedAt: Timestamp;
  note?: string;
}

// ─── Documento principal ──────────────────────────────────────────────────────
// Path: public-catalogs/{slug}/orders/{orderId}

export interface CatalogOrder {
  id: string;
  slug: string;
  companyId: string;

  // Datos del cliente
  customer: OrderCustomer;

  // Líneas del pedido (snapshot del carrito al momento de crear la orden)
  items: OrderItem[];

  // Totales
  subtotal: number;       // suma de (unitPrice * qty) sin IVA
  taxAmount: number;      // suma de IVA
  total: number;          // subtotal + taxAmount

  // Pago
  paymentMethod: CatalogPaymentMethod;
  paymentStatus: CatalogPaymentStatus;
  paymentProofUrl?: string;           // URL Storage — solo para 'transfer'
  paymentProofStoragePath?: string;   // path en Storage para posible eliminación
  paymentRef?: string;                // referencia del gateway (tarjeta)
  paymentGatewayResponse?: unknown;   // respuesta cruda del gateway

  // Estado del pedido
  status: CatalogOrderStatus;
  statusHistory: OrderStatusEntry[];

  // Metadata
  orderNumber: string;    // ej: ORD-mitienda-20260430-0001
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Input para crear una orden ───────────────────────────────────────────────

export interface CreateOrderInput {
  slug: string;
  companyId: string;
  customer: OrderCustomer;
  items: CartItem[];
  paymentMethod: CatalogPaymentMethod;
}

// ─── Resultado de totales ─────────────────────────────────────────────────────

export interface OrderTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

// ─── Helper: calcular totales desde items del carrito ─────────────────────────

export function calcOrderTotals(items: CartItem[]): OrderTotals {
  let subtotal  = 0;
  let taxAmount = 0;

  for (const item of items) {
    const unitPrice  = item.product.salePrice;
    const taxRate    = item.product.taxRate ?? 0;
    const lineBase   = round2(unitPrice * item.qty);
    const lineTax    = round2(lineBase * taxRate / 100);
    subtotal  += lineBase;
    taxAmount += lineTax;
  }

  return {
    subtotal:  round2(subtotal),
    taxAmount: round2(taxAmount),
    total:     round2(subtotal + taxAmount),
  };
}

// ─── Helper: mapear CartItem[] → OrderItem[] ─────────────────────────────────

export function cartItemsToOrderItems(items: CartItem[]): OrderItem[] {
  return items.map(item => {
    const taxRate   = item.product.taxRate ?? 0;
    const lineTotal = round2(item.product.salePrice * (1 + taxRate / 100) * item.qty);
    return {
      productId:   item.product.id,
      productName: item.product.name,
      imageUrl:    item.product.imageUrls?.[0] ?? item.product.imageUrl,
      qty:         item.qty,
      unitPrice:   item.product.salePrice,
      taxRate,
      lineTotal,
    };
  });
}

// ─── Helper: label legible del estado ────────────────────────────────────────

export const ORDER_STATUS_LABELS: Record<CatalogOrderStatus, string> = {
  new:        'Nuevo',
  processing: 'En proceso',
  shipped:    'Enviado',
  completed:  'Completado',
  cancelled:  'Cancelado',
};

export const PAYMENT_STATUS_LABELS: Record<CatalogPaymentStatus, string> = {
  pending:        'Pago pendiente',
  proof_uploaded: 'Comprobante recibido',
  confirmed:      'Pago confirmado',
  rejected:       'Pago rechazado',
};

export const PAYMENT_METHOD_LABELS: Record<CatalogPaymentMethod, string> = {
  transfer:        'Transferencia bancaria',
  cash_on_delivery: 'Pago contra entrega',
  card:            'Tarjeta de crédito/débito',
};

function round2(n: number): number { return Math.round(n * 100) / 100; }
