// ─── Liquidación de compra (codDoc 03): lógica pura ──────────────────────────
//
// 2026-11-05. Sin Firestore, para probarla sola. La usan la callable
// `issuePurchaseSettlement` y el generador del XML.
//
// Diseño (weworkscloud/docs/PLAN_LIQUIDACION_COMPRA.md, decisiones D-LC1..5):
//  · La liquidación ES una compra: vive en `companies/{cid}/purchases` con
//    `sriDocumentType: '03'` e `issuedByCompany: true`. Así le sirven las
//    cuentas por pagar, los pagos, «Retener», el asiento y el ATS.
//  · `supplierInvoiceNumber` = NUESTRO número y `supplierAccessKey` = NUESTRA
//    clave: la retención (numDocSustento) y el ATS (autorizacion) los toman de
//    ahí sin cambios.
//  · Emiten admin, contador y vendedor (D-LC2).
//  · Proveedor solo con cédula o pasaporte (D-LC4).
//  · No mueve inventario (D-LC5): las líneas van sin `productId`.
//  · Importes en dólares, como el resto de compras; aquí las líneas se
//    redondean a 2 decimales para que la compra y el XML digan lo mismo.

import { buyerTaxIdProblem } from '../../utils/ecuador-tax-id';
import { isSriSustentoCode } from '../../utils/sri-sustento-codes';

export const SETTLEMENT_ROLES = ['admin', 'accountant', 'seller'] as const;

/** Tipos de proveedor admitidos: texto de Conecta → código del SRI. */
const SUPPLIER_ID_TYPES: Record<string, '05' | '06'> = {
  '05': '05', CI: '05', CEDULA: '05', 'CÉDULA': '05',
  '06': '06', PASAPORTE: '06', PASSPORT: '06',
};

export const SETTLEMENT_VAT_RATES = [0, 5, 15] as const;

export interface SettlementLineInput {
  description: string;
  code?: string;
  unit?: string;
  qty: number;
  unitCost: number;
  /** Descuento en porcentaje, como en Compras. */
  discount?: number;
  /** IVA en porcentaje: 0, 5 o 15. */
  taxRate: number;
  expenseAccountCode?: string;
  expenseAccountName?: string;
}

export interface SettlementPayload {
  companyId: string;
  establishment?: string;
  emissionPoint?: string;
  /** YYYY-MM-DD; vacío = hoy en Ecuador. */
  date?: string;
  supplier: {
    id?: string;
    name: string;
    taxId: string;
    taxIdType: string;
    address: string;
    email?: string;
  };
  sriSustentoCode: string;
  paymentMethodCode: string;
  paymentTermDays?: number;
  lines: SettlementLineInput[];
  notes?: string;
  additionalInfo?: Array<{ nombre: string; valor: string }>;
  costCenterId?: string;
  costCenterName?: string;
}

export interface SettlementLine {
  id: string;
  productId: '';
  productSku: string;
  productName: string;
  description: string;
  unit?: string;
  qty: number;
  unitCost: number;
  discount: number;
  /** Descuento en dólares (el <descuento> del XML). */
  discountAmount: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  expenseAccountCode?: string;
  expenseAccountName?: string;
}

export interface SettlementTotals {
  /** Suma de líneas ya con descuento (totalSinImpuestos). */
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  /** subtotal + IVA (importeTotal). La retención todavía no existe. */
  total: number;
  taxGroups: Array<{ vatRate: number; base: number; tax: number }>;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function canIssueSettlement(role: string | undefined): boolean {
  return role === 'super_admin' || (SETTLEMENT_ROLES as readonly string[]).includes(role ?? '');
}

/** '05' o '06', o null si el tipo no se admite en la liquidación. */
export function settlementSupplierIdType(raw: string | undefined): '05' | '06' | null {
  return SUPPLIER_ID_TYPES[String(raw ?? '').trim().toUpperCase()] ?? null;
}

/** Qué falta o está mal en el pedido, o null si se puede emitir. */
export function settlementPayloadProblem(p: SettlementPayload | undefined): string | null {
  if (!p || typeof p !== 'object') return 'Faltan los datos de la liquidación.';
  if (!p.companyId) return 'companyId es requerido.';
  if (p.date && !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return 'La fecha va como AAAA-MM-DD.';

  const s = p.supplier;
  if (!s || !String(s.name ?? '').trim()) return 'Falta el nombre del proveedor.';
  const tipo = settlementSupplierIdType(s.taxIdType);
  if (!tipo) {
    return 'La liquidación de compra se emite a un proveedor con cédula o pasaporte. '
      + 'Si tiene RUC activo, debe darte factura.';
  }
  const idProblem = buyerTaxIdProblem(s.taxId, tipo);
  if (idProblem) return idProblem.replace('del comprador', 'del proveedor');
  if (!String(s.address ?? '').trim()) return 'Falta la dirección del proveedor (va en la liquidación).';

  if (!isSriSustentoCode(p.sriSustentoCode)) return 'Elige el sustento tributario (Tabla 5 del ATS).';
  if (!/^(0[1-9]|1\d|2[01])$/.test(String(p.paymentMethodCode ?? ''))) return 'Elige la forma de pago.';
  if (p.paymentTermDays !== undefined && !(Number(p.paymentTermDays) >= 0)) return 'El plazo no puede ser negativo.';

  if (!Array.isArray(p.lines) || p.lines.length === 0) return 'Agrega al menos una línea.';
  for (const [i, l] of p.lines.entries()) {
    const n = i + 1;
    if (!String(l?.description ?? '').trim()) return `La línea ${n} no tiene descripción.`;
    if (!(Number(l.qty) > 0)) return `La cantidad de la línea ${n} tiene que ser mayor que cero.`;
    if (!(Number(l.unitCost) >= 0)) return `El costo de la línea ${n} no puede ser negativo.`;
    const d = Number(l.discount ?? 0);
    if (!(d >= 0 && d <= 100)) return `El descuento de la línea ${n} va de 0 a 100 %.`;
    if (!(SETTLEMENT_VAT_RATES as readonly number[]).includes(Number(l.taxRate))) {
      return `El IVA de la línea ${n} tiene que ser 0, 5 o 15 %.`;
    }
  }
  const t = computeSettlement(p.lines, () => 'x');
  if (t.totals.total <= 0) return 'La liquidación tiene que valer algo.';
  return null;
}

/** Las líneas como se guardan en la compra y los totales del XML. */
export function computeSettlement(
  input: SettlementLineInput[],
  newId: () => string,
): { lines: SettlementLine[]; totals: SettlementTotals } {
  const groups = new Map<number, { base: number; tax: number }>();
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  const lines = input.map((l): SettlementLine => {
    const qty = Number(l.qty);
    const unitCost = Number(l.unitCost);
    const discount = Number(l.discount ?? 0);
    const taxRate = Number(l.taxRate);
    const gross = r2(qty * unitCost);
    const lineSubtotal = r2(gross * (1 - discount / 100));
    const taxAmount = r2(lineSubtotal * taxRate / 100);
    subtotal += lineSubtotal;
    totalDiscount += r2(gross - lineSubtotal);
    totalTax += taxAmount;
    const g = groups.get(taxRate) ?? { base: 0, tax: 0 };
    g.base += lineSubtotal;
    g.tax += taxAmount;
    groups.set(taxRate, g);
    const description = String(l.description).replace(/[\r\n\t]+/g, ' ').trim();
    return {
      id: newId(),
      productId: '',
      productSku: String(l.code ?? '').trim(),
      productName: description,
      description,
      ...(String(l.unit ?? '').trim() ? { unit: String(l.unit).trim() } : {}),
      qty,
      unitCost,
      discount,
      discountAmount: r2(gross - lineSubtotal),
      subtotal: lineSubtotal,
      taxRate,
      taxAmount,
      total: r2(lineSubtotal + taxAmount),
      ...(String(l.expenseAccountCode ?? '').trim()
        ? { expenseAccountCode: String(l.expenseAccountCode).trim(), expenseAccountName: String(l.expenseAccountName ?? '').trim() }
        : {}),
    };
  });

  subtotal = r2(subtotal);
  totalTax = r2(totalTax);
  return {
    lines,
    totals: {
      subtotal,
      totalDiscount: r2(totalDiscount),
      totalTax,
      total: r2(subtotal + totalTax),
      taxGroups: [...groups.entries()]
        .sort(([a], [b]) => b - a)
        .map(([vatRate, g]) => ({ vatRate, base: r2(g.base), tax: r2(g.tax) })),
    },
  };
}

/** `001-001-000000001`. */
export function settlementFullNumber(establishment: string, emissionPoint: string, sequential: number): string {
  return `${establishment}-${emissionPoint}-${String(sequential).padStart(9, '0')}`;
}

/**
 * Clave del contador `counters/purchaseSettlements`: por punto y año, como el de
 * las NC (`NC_{estab}_{pto}_{año}`). El SRI numera por tipo de comprobante.
 */
export function settlementCounterKey(establishment: string, emissionPoint: string, year: number): string {
  return `LC_${establishment}_${emissionPoint}_${year}`;
}

/** Lo que el trigger de emisión exige: liquidación nuestra, enviada y sin estado del SRI. */
export function isSettlementReadyToEmit(data: Record<string, any>): boolean {
  return data['issuedByCompany'] === true
    && data['sriDocumentType'] === '03'
    && data['status'] === 'sent'
    && !data['isVoid']
    && !data['sriStatus'];
}
