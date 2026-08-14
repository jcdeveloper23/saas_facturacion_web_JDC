import { Timestamp } from '@angular/fire/firestore';
import { MenuItemCategory } from './school-menu.interface';

// ─── Status ───────────────────────────────────────────────────────────────────

export type SchoolOrderStatus =
  | 'pending'       // creada, esperando confirmación del bar
  | 'confirmed'     // confirmada por el bar
  | 'preparing'     // en preparación
  | 'ready'         // lista para retirar o despachar
  | 'delivered'     // entregada al alumno
  | 'undelivered'   // no pudo entregarse (alumno ausente)
  | 'cancelled'     // cancelada antes del corte
  | 'refunded';     // anulada con devolución al wallet

export const ORDER_STATUS_LABELS: Record<SchoolOrderStatus, string> = {
  pending:     'Pendiente',
  confirmed:   'Confirmada',
  preparing:   'En preparación',
  ready:       'Lista para retirar',
  delivered:   'Entregada',
  undelivered: 'No entregada',
  cancelled:   'Cancelada',
  refunded:    'Reembolsada'
};

export const ORDER_STATUS_COLORS: Record<SchoolOrderStatus, string> = {
  pending:     'warning',
  confirmed:   'info',
  preparing:   'primary',
  ready:       'success',
  delivered:   'secondary',
  undelivered: 'danger',
  cancelled:   'dark',
  refunded:    'secondary'
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type SchoolOrderType    = 'advance' | 'immediate';
export type SchoolDeliveryType = 'bar_pickup' | 'classroom_delivery';

export const ORDER_TYPE_LABELS: Record<SchoolOrderType, string> = {
  advance:   'Pedido anticipado',
  immediate: 'Compra en el momento'
};

export const DELIVERY_TYPE_LABELS: Record<SchoolDeliveryType, string> = {
  bar_pickup:          'Retiro en el bar',
  classroom_delivery:  'Entrega en aula'
};

// ─── Order Item ───────────────────────────────────────────────────────────────

export interface SchoolOrderItem {
  menuItemId?: string;         // opcional — null si es venta directa desde catálogo sin menú
  productId: string;           // REQUERIDO — referencia a products/{id} para decrementar stock
  productSku: string;          // SKU denormalizado
  name: string;
  category: MenuItemCategory;
  imageUrl?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;           // quantity * unitPrice
}

// ─── Status History ───────────────────────────────────────────────────────────

export interface OrderStatusEntry {
  status: SchoolOrderStatus;
  changedAt: Timestamp;
  changedBy?: string;          // userId
  note?: string;
}

// ─── Order ────────────────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/school_orders/{orderId}

export interface SchoolOrder {
  id: string;
  companyId: string;           // antes institutionId — empresa = institución
  menuId?: string;             // null si es compra inmediata sin menú del día

  // ── Estudiante — NUNCA vacíos en órdenes reales ───────────────────────────
  studentId: string;
  studentName: string;
  studentCode: string;
  gradeId: string;
  gradeName: string;
  section: string;

  // ── Representante (null si la orden fue creada en el POS del bar) ────────
  parentId?: string;
  parentName?: string;

  // ── Almacén para descuento de stock ──────────────────────────────────────
  warehouseCode?: string;      // tomado de SchoolBarConfig.defaultWarehouseCode

  // ── Items ────────────────────────────────────────────────────────────────
  items: SchoolOrderItem[];

  // ── Totales ──────────────────────────────────────────────────────────────
  subtotal: number;
  total: number;               // igual a subtotal (sin IVA en bar escolar por defecto)

  // ── Tipo de orden y entrega ───────────────────────────────────────────────
  orderType: SchoolOrderType;
  deliveryType: SchoolDeliveryType;

  // ── Para entrega en aula ─────────────────────────────────────────────────
  classroomGradeId?: string;
  classroomGradeName?: string;
  classroomSection?: string;
  deliveryFee?: number;

  // ── Estado ───────────────────────────────────────────────────────────────
  status: SchoolOrderStatus;
  statusHistory: OrderStatusEntry[];

  // ── Pago (siempre wallet en v1) ───────────────────────────────────────────
  paymentMethod: 'wallet';
  walletTransactionId: string; // referencia a school_transactions/{id}
  amountCharged: number;

  // ── Despacho ─────────────────────────────────────────────────────────────
  dispatchedBy?: string;       // userId del cajero o repartidor
  dispatchedAt?: Timestamp;
  deliveryConfirmedAt?: Timestamp;

  // ── Facturación (opcional — requiere pkg_sri activo) ──────────────────────
  invoiceId?: string;
  invoiceNumber?: string;

  scheduledFor: Timestamp;     // fecha y hora del recreo al que corresponde
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function calcOrderTotal(items: SchoolOrderItem[]): number {
  return round2(items.reduce((s, i) => s + i.lineTotal, 0));
}

export function isOrderEditable(status: SchoolOrderStatus): boolean {
  return status === 'pending';
}

export function isOrderActive(status: SchoolOrderStatus): boolean {
  return !['delivered', 'undelivered', 'cancelled', 'refunded'].includes(status);
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
