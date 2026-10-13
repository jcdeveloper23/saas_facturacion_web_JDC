/**
 * invoice-discount.ts — descuento por línea de la factura (2026-10-13).
 *
 * Una sola cuenta para el descuento, que usan `createAndEmitInvoice` (al
 * guardar), el XML y el RIDE (al leer). La ficha técnica del SRI pide:
 *
 *   detalle.descuento               = descuento de la línea, en dólares
 *   detalle.precioTotalSinImpuesto  = cantidad × precioUnitario − descuento
 *   totalSinImpuestos               = Σ precioTotalSinImpuesto
 *   totalDescuento                  = Σ descuentos de línea (+ descuento adicional)
 *   baseImponible por tarifa        = sobre el neto
 *
 * Redondeo (igual en Conecta, `invoice_draft.dart`):
 *   bruto     = round2(cantidad × precio)
 *   descuento = round2(bruto × pct / 100)
 *   neto      = bruto − descuento
 *   IVA       = round2(neto × tarifa / 100)
 *
 * Qué guarda la factura de `createAndEmitInvoice`: `grossAmount` = Σ brutos,
 * `discountAmount` = Σ descuentos de línea, `netAmount` = Σ netos
 * (grossAmount − discountAmount = netAmount), y `vatSummary` por tarifa sobre
 * el neto. Es la misma forma que ya usan las facturas importadas desde XML
 * (`sri-xml-import.ts`). La web de FacturaEc, en cambio, guarda en
 * `grossAmount` la suma de netos de línea y en `discountAmount` solo el
 * descuento global; por eso el XML y el RIDE NO leen `discountAmount` para el
 * total de descuento, sino que lo derivan de las líneas (`invoiceTotalDiscount`),
 * y así no se duplica con ninguna de las dos formas.
 */

/** El mismo redondeo que usaba `createAndEmitInvoice` (sin descuento, idéntico a antes). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Porcentaje de descuento válido (0–100) o `null` si no lo es. Vacío o
 * ausente = 0. Acepta coma decimal si llega como texto.
 */
export function normalizeDiscountPct(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export interface PricedLineInput {
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  vatPct: number;
}

export interface PricedLine {
  quantity: number;
  unitPrice: number;
  discountPct: number;
  /** cantidad × precio, redondeado. */
  gross: number;
  /** Descuento de la línea en dólares. */
  discount: number;
  /** Neto: gross − discount (precioTotalSinImpuesto). */
  subtotal: number;
  vatPct: number;
  vatAmount: number;
}

export interface VatSummaryLine {
  vatPct: number;
  taxableBase: number;
  vatAmount: number;
}

/** Calcula una línea con su descuento. */
export function priceLine(line: PricedLineInput): PricedLine {
  const qty      = Number(line.quantity) || 0;
  const price    = Number(line.unitPrice) || 0;
  const pct      = normalizeDiscountPct(line.discountPct) ?? 0;
  const vatPct   = Number(line.vatPct ?? 0);
  const gross    = round2(qty * price);
  const discount = round2(gross * pct / 100);
  const subtotal = round2(gross - discount);
  const vatAmount = round2(subtotal * vatPct / 100);
  return { quantity: qty, unitPrice: price, discountPct: pct, gross, discount, subtotal, vatPct, vatAmount };
}

export interface PricedInvoice {
  lines: PricedLine[];
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  vatAmount: number;
  total: number;
  vatSummary: VatSummaryLine[];
}

/** Totales de la factura a partir de sus líneas (sin descuento global). */
export function priceInvoiceLines(lines: PricedLineInput[]): PricedInvoice {
  const priced = lines.map(priceLine);
  const sum = (f: (l: PricedLine) => number) => round2(priced.reduce((s, l) => s + f(l), 0));
  const grossAmount    = sum(l => l.gross);
  const discountAmount = sum(l => l.discount);
  const netAmount      = sum(l => l.subtotal);
  const byRate = new Map<number, VatSummaryLine>();
  for (const l of priced) {
    const e = byRate.get(l.vatPct) ?? { vatPct: l.vatPct, taxableBase: 0, vatAmount: 0 };
    e.taxableBase = round2(e.taxableBase + l.subtotal);
    e.vatAmount   = round2(e.vatAmount + l.vatAmount);
    byRate.set(l.vatPct, e);
  }
  const vatSummary = [...byRate.values()].sort((a, b) => a.vatPct - b.vatPct);
  const vatAmount  = round2(vatSummary.reduce((s, v) => s + v.vatAmount, 0));
  return {
    lines: priced, grossAmount, discountAmount, netAmount, vatAmount,
    total: round2(netAmount + vatAmount), vatSummary,
  };
}

/** Línea tal como está guardada (Conecta, web de FacturaEc, importada, POS). */
export interface StoredLine {
  quantity?: number;
  unitPrice?: number;
  discount?: number;
  discountPct?: number;
  subtotal?: number;
  lineTotal?: number;
}

/**
 * Descuento en dólares de una línea guardada, para el XML y el RIDE.
 * - Si trae `discount` en dólares (Conecta, importadas), ese.
 * - Si solo trae `discountPct` (web de FacturaEc), lo que va del bruto al neto.
 * - Si no, 0.
 * Nunca negativo.
 */
export function lineDiscountAmount(line: StoredLine): number {
  const d = Number(line.discount);
  if (line.discount !== undefined && line.discount !== null && Number.isFinite(d)) {
    return Math.max(0, round2(d));
  }
  const pct = Number(line.discountPct ?? 0);
  if (!(pct > 0)) return 0;
  const gross = round2((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
  const net   = Number(line.subtotal ?? line.lineTotal ?? 0);
  return Math.max(0, round2(gross - net));
}

/**
 * `totalDescuento` del comprobante: Σ descuentos de línea + el descuento
 * adicional (lo que falta de Σ netos de línea a `totalSinImpuestos`). No lee
 * `discountAmount`, que significa cosas distintas según quién creó la factura.
 */
export function invoiceTotalDiscount(lines: StoredLine[], totalSinImpuestos: number): number {
  const lineDiscounts = lines.reduce((s, l) => s + lineDiscountAmount(l), 0);
  const lineNets      = lines.reduce((s, l) => s + Number(l.subtotal ?? l.lineTotal ?? 0), 0);
  const additional    = round2(lineNets - totalSinImpuestos);
  return round2(lineDiscounts + (additional > 0 ? additional : 0));
}
