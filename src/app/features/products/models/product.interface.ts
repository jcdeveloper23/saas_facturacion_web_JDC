import { Timestamp } from '@angular/fire/firestore';

// ─── Enums ───────────────────────────────────────────────────────────────────

export type ProductType      = 'product' | 'service';
export type BarcodeType      = 'Code39' | 'EAN13' | 'EAN8' | 'UPC' | 'QR' | 'other';
export type StockMovementType =
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out'
  | 'sale'
  | 'purchase'
  | 'return_sale'
  | 'return_purchase';
export type TransferStatus = 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

// ─── Product master ──────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/products/{productId}

export interface Product {
  id: string;

  // ── Identification ──────────────────────────────────────────────────────────
  sku: string;               // referencia — unique per company (max 18)
  barcode?: string;          // codbarras
  barcodeType?: BarcodeType; // tipocodbarras
  partNumber?: string;       // partnumber
  equivalentSku?: string;    // equivalencia — reference of equivalent product

  // ── Description ─────────────────────────────────────────────────────────────
  name: string;              // descripcion (required)
  shortName?: string;        // nombre corto para tickets/POS
  notes?: string;            // observaciones
  imageUrl?: string;         // imagen principal → Firebase Storage URL (backward compat = imageUrls[0])
  imageUrls?: string[];      // hasta 4 imágenes; índice 0 = principal

  // ── Type & flags ────────────────────────────────────────────────────────────
  type: ProductType;         // 'product' | 'service'
  isSold: boolean;           // sevende
  isPurchased: boolean;      // secompra
  isPublic: boolean;         // publico (ecommerce / catálogo público)
  isBlocked: boolean;        // bloqueado
  isActive: boolean;

  // ── Classification ───────────────────────────────────────────────────────────
  familyId?: string;         // Firestore ID of family document
  familyCode?: string;       // codfamilia (denormalized for display)
  familyName?: string;       // denormalized for display
  manufacturerId?: string;   // Firestore ID of manufacturer document
  manufacturerCode?: string; // codfabricante (denormalized)
  manufacturerName?: string; // denormalized for display

  // ── Fiscal ───────────────────────────────────────────────────────────────────
  taxRateCode: string;       // codimpuesto → FK /tax-rates (code)
  taxRateName?: string;      // denormalized
  taxRate?: number;          // denormalized %

  // ── Pricing ──────────────────────────────────────────────────────────────────
  salePrice: number;         // pvp — precio venta al público (sin IVA)
  costPrice: number;         // preciocoste — costo de compra
  averageCost: number;       // costemedio — costo promedio ponderado (CF-maintained)
  priceUpdatedAt?: Timestamp;// factualizado

  // ── Stock (aggregate totals — maintained by Cloud Functions) ─────────────────
  trackStock: boolean;       // controlstock — false = no movements generated
  noStock: boolean;          // nostock — true for services: skip all stock logic
  stockMin: number;          // stockmin — global default (each warehouse has its own)
  stockMax: number;          // stockmax — global default
  stockQty: number;          // stockfis — total across all warehouses (CF-maintained)
  stockReserved: number;     // total reserved (open orders) — CF-maintained
  stockAvailable: number;    // stockQty - stockReserved — CF-maintained

  // ── Variants ─────────────────────────────────────────────────────────────────
  hasVariants: boolean;      // tieneCombinaciones — activates variants tab
  traceable: boolean;        // trazabilidad — serial / lot tracking

  // ── Accounting ───────────────────────────────────────────────────────────────
  purchaseAccountCode?: string; // codsubcuentacom — cuenta contable compras

  // ── Metadata ─────────────────────────────────────────────────────────────────
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Product stock per warehouse ─────────────────────────────────────────────
// Stored at: /companies/{companyId}/products/{productId}/stocks/{warehouseCode}

export interface ProductStock {
  warehouseCode: string;     // codalmacen — also the document ID
  warehouseName?: string;    // denormalized
  qty: number;               // cantidad
  available: number;         // disponible = qty - reserved
  reserved: number;          // reservada — held by open orders
  pendingReceive: number;    // pterecibir — in transit from transfer
  stockMin: number;          // override per warehouse (0 = use product default)
  stockMax: number;
  location?: string;         // ubicacion — shelf/aisle reference
  lastUpdatedAt?: Timestamp;
  lastUpdatedQty?: number;   // cantidadultreg
}

// ─── Product supplier pricing ─────────────────────────────────────────────────
// Stored at: /companies/{companyId}/products/{productId}/suppliers/{id}

export interface ProductSupplier {
  id: string;
  supplierCode: string;      // codproveedor
  supplierName?: string;     // denormalized from personas
  supplierRef: string;       // refproveedor — supplier's own code for this product
  description?: string;      // descripcion proveedor
  price: number;             // precio compra
  discountPct?: number;      // dto — descuento en compra %
  taxCode?: string;          // codimpuesto del proveedor
  currency: string;          // coddivisa
  barcode?: string;
  partNumber?: string;
  isPreferred?: boolean;     // proveedor preferido
}

// ─── Product variant (combination) ───────────────────────────────────────────
// Stored at: /companies/{companyId}/products/{productId}/variants/{id}
// Only when Product.hasVariants = true

export interface ProductVariant {
  id: string;
  sku: string;               // codigo — unique SKU for this variant
  barcode?: string;
  attributes: {
    name: string;            // nombreatributo — e.g. "Talla", "Color"
    value: string;           // valor — e.g. "S", "Rojo"
  }[];
  priceAdjustment: number;   // impactoprecio — ± sobre pvp base
  stockQty: number;          // stockfis — stock de esta variante
  isActive: boolean;
}

// ─── Stock movement log ──────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/stock-movements/{movementId}
// Written exclusively by Cloud Functions — read-only from UI

export interface StockMovement {
  id: string;
  type: StockMovementType;
  productId: string;
  productSku: string;        // denormalized
  productName: string;       // denormalized
  warehouseCode: string;
  warehouseName?: string;
  variantSku?: string;       // if movement is for a variant
  qtyBefore: number;
  qtyAfter: number;
  qtyDelta: number;          // positive = in, negative = out
  unitCost?: number;         // for weighted average cost calculation
  reason?: string;           // motivo — for manual adjustments
  sourceDocId?: string;      // FK to invoice / transfer / purchase doc
  sourceDocType?: 'invoice' | 'purchase' | 'transfer' | 'adjustment';
  userId: string;
  createdAt: Timestamp;
}

// ─── Stock transfer ───────────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/stock-transfers/{transferId}
// Lines embedded (max ~50 lines per transfer — safe for Firestore doc size)

export interface StockTransferLine {
  productId: string;
  productSku: string;        // denormalized
  productName: string;       // denormalized
  qty: number;
  notes?: string;
}

export interface StockTransfer {
  id: string;
  status: TransferStatus;
  originWarehouseCode: string;
  originWarehouseName?: string;
  destinationWarehouseCode: string;
  destinationWarehouseName?: string;
  lines: StockTransferLine[];
  notes?: string;
  createdBy: string;
  createdByName?: string;
  receivedBy?: string;
  transferredAt: Timestamp;
  receivedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Family (product category) ────────────────────────────────────────────────
// Stored at: /companies/{companyId}/families/{familyId}

export interface Family {
  id: string;
  code: string;              // codfamilia (max 8)
  name: string;              // descripcion
  parentId?: string;         // Firestore ID of parent family (madre)
  parentCode?: string;       // denormalized
  accountingCode?: string;   // codcuenta
  imageUrl?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Manufacturer / Brand ─────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/manufacturers/{manufacturerId}

export interface Manufacturer {
  id: string;
  code: string;              // codfabricante (max 8)
  name: string;              // nombre
  web?: string;
  logoUrl?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isLowStock(p: Product): boolean {
  return p.trackStock && !p.noStock && p.stockMin > 0 && p.stockQty <= p.stockMin;
}

export function isOutOfStock(p: Product): boolean {
  return p.trackStock && !p.noStock && p.stockQty <= 0;
}

export function calcMarginPct(salePrice: number, costPrice: number): number {
  if (!salePrice || !costPrice) return 0;
  return Math.round(((salePrice - costPrice) / salePrice) * 10000) / 100;
}
