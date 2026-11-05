// ─── XML de la liquidación de compra de bienes y prestación de servicios (03) ─
//
// Constructor puro (2026-11-05): recibe los datos ya resueltos y devuelve el
// XML sin firmar, para validarlo contra el esquema del SRI sin Firestore.
// La liquidación la emite el COMPRADOR (la empresa) a un proveedor que no puede
// facturar; por eso el «otro» del comprobante es el proveedor, no un comprador.
//
// Orden de los campos: XSD oficial LiquidacionCompra_V1.1.0
// («docs/XML y XSD Liquidacion/») y Anexo 17 de la ficha técnica offline v2.34.
// Versión 1.1.0: hasta 6 decimales en cantidad y precio unitario.
//
// Fuera de esta primera entrega (D-LC4, 2026-11-05): reembolsos
// (codDocReembolso / <reembolsos>), tipoNegociable y maquinaFiscal.
// Proveedor solo con cédula (05) o pasaporte (06).

import { create } from 'xmlbuilder2';
import { formatFechaEmisionEC } from './sri-date';

export const PURCHASE_SETTLEMENT_XML_VERSION = '1.1.0';
export const PURCHASE_SETTLEMENT_COD_DOC = '03';

/** Tipos de identificación del proveedor admitidos en la primera entrega (D-LC4). */
export const SETTLEMENT_SUPPLIER_ID_TYPES = ['05', '06'] as const;
export type SettlementSupplierIdType = typeof SETTLEMENT_SUPPLIER_ID_TYPES[number];

export interface SettlementIssuer {
  ambiente: '1' | '2';
  razonSocial: string;
  nombreComercial?: string;
  ruc: string;
  accessKey: string;
  establishment: string;
  emissionPoint: string;
  secuencial: string;
  dirMatriz: string;
  dirEstablecimiento?: string;
  contribuyenteEspecial?: string;
  obligadoContabilidad: 'SI' | 'NO';
}

export interface SettlementSupplier {
  tipoIdentificacion: SettlementSupplierIdType;
  razonSocial: string;
  identificacion: string;
  direccion: string;
}

export interface SettlementXmlLine {
  code?: string;
  extraCode?: string;
  description: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;   // sin impuestos, ya con el descuento
  vatCode: string;     // tabla 17 (sriVatCode)
  vatRate: number;
  vatAmount: number;
}

export interface SettlementPayment {
  /** Tabla 24 (formas de pago, 01–21); si no es válida se manda «20». */
  code?: string;
  total: number;
  term?: number;
  timeUnit?: string;   // 'dias', 'meses'…
}

export interface SettlementAdditionalField { nombre: string; valor: string; }

export interface PurchaseSettlementXmlInput {
  issuer: SettlementIssuer;
  supplier: SettlementSupplier;
  issueDate: Date;
  totalSinImpuestos: number;
  totalDescuento: number;
  taxGroups: Array<{ vatCode: string; vatRate: number; base: number; tax: number }>;
  importeTotal: number;
  payments: SettlementPayment[];
  lines: SettlementXmlLine[];
  additionalInfo: SettlementAdditionalField[];
}

const m2 = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const m6 = (n: number) => (Math.round((Number(n) || 0) * 1e6) / 1e6).toFixed(6);

/** Lo que el XSD permite en un texto: sin saltos de línea y con su tope. */
function txt(value: string | undefined, max = 300): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

/** formaPago del XSD: 01 a 21. */
function isPaymentCode(code: string | undefined): boolean {
  return /^(0[1-9]|1\d|2[01])$/.test(code ?? '');
}

export function buildPurchaseSettlementXml(input: PurchaseSettlementXmlInput): string {
  const { issuer: i, supplier: s } = input;
  if (!SETTLEMENT_SUPPLIER_ID_TYPES.includes(s.tipoIdentificacion)) {
    throw new Error(`Tipo de identificación del proveedor no admitido en la liquidación: ${s.tipoIdentificacion}`);
  }
  if (!input.lines.length) throw new Error('La liquidación necesita al menos un detalle');

  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('liquidacionCompra', { id: 'comprobante', version: PURCHASE_SETTLEMENT_XML_VERSION });

  const it = root.ele('infoTributaria');
  it.ele('ambiente').txt(i.ambiente);
  it.ele('tipoEmision').txt('1');
  it.ele('razonSocial').txt(txt(i.razonSocial));
  if (txt(i.nombreComercial)) it.ele('nombreComercial').txt(txt(i.nombreComercial));
  it.ele('ruc').txt(i.ruc);
  it.ele('claveAcceso').txt(i.accessKey);
  it.ele('codDoc').txt(PURCHASE_SETTLEMENT_COD_DOC);
  it.ele('estab').txt(i.establishment);
  it.ele('ptoEmi').txt(i.emissionPoint);
  it.ele('secuencial').txt(i.secuencial);
  it.ele('dirMatriz').txt(txt(i.dirMatriz));

  const info = root.ele('infoLiquidacionCompra');
  info.ele('fechaEmision').txt(formatFechaEmisionEC(input.issueDate));
  if (txt(i.dirEstablecimiento)) info.ele('dirEstablecimiento').txt(txt(i.dirEstablecimiento));
  const especial = txt(i.contribuyenteEspecial, 13);
  if (especial.length >= 3) info.ele('contribuyenteEspecial').txt(especial);
  info.ele('obligadoContabilidad').txt(i.obligadoContabilidad);
  info.ele('tipoIdentificacionProveedor').txt(s.tipoIdentificacion);
  info.ele('razonSocialProveedor').txt(txt(s.razonSocial));
  info.ele('identificacionProveedor').txt(txt(s.identificacion, 20));
  // Opcional en el XSD, pero la pedimos siempre (plan §2.1).
  if (txt(s.direccion)) info.ele('direccionProveedor').txt(txt(s.direccion));
  info.ele('totalSinImpuestos').txt(m2(input.totalSinImpuestos));
  info.ele('totalDescuento').txt(m2(input.totalDescuento));
  const tci = info.ele('totalConImpuestos');
  for (const g of input.taxGroups) {
    const ti = tci.ele('totalImpuesto');
    ti.ele('codigo').txt('2'); // IVA
    ti.ele('codigoPorcentaje').txt(g.vatCode);
    ti.ele('baseImponible').txt(m2(g.base));
    ti.ele('tarifa').txt(m2(g.vatRate));
    ti.ele('valor').txt(m2(g.tax));
  }
  info.ele('importeTotal').txt(m2(input.importeTotal));
  info.ele('moneda').txt('DOLAR');
  const payments = input.payments.length ? input.payments : [{ total: input.importeTotal }];
  const pagos = info.ele('pagos');
  for (const p of payments) {
    const pago = pagos.ele('pago');
    pago.ele('formaPago').txt(isPaymentCode(p.code) ? p.code! : '20');
    pago.ele('total').txt(m2(p.total));
    if (p.term && p.term > 0) {
      pago.ele('plazo').txt(m2(p.term));
      pago.ele('unidadTiempo').txt(txt(p.timeUnit, 10) || 'dias');
    }
  }

  const detalles = root.ele('detalles');
  for (const l of input.lines) {
    const d = detalles.ele('detalle');
    if (txt(l.code, 25)) d.ele('codigoPrincipal').txt(txt(l.code, 25));
    if (txt(l.extraCode, 25)) d.ele('codigoAuxiliar').txt(txt(l.extraCode, 25));
    d.ele('descripcion').txt(txt(l.description) || 'Sin descripción');
    if (txt(l.unit, 50)) d.ele('unidadMedida').txt(txt(l.unit, 50));
    d.ele('cantidad').txt(m6(l.quantity));
    d.ele('precioUnitario').txt(m6(l.unitPrice));
    d.ele('descuento').txt(m2(l.discount));
    d.ele('precioTotalSinImpuesto').txt(m2(l.lineTotal));
    const imp = d.ele('impuestos').ele('impuesto');
    imp.ele('codigo').txt('2');
    imp.ele('codigoPorcentaje').txt(l.vatCode);
    imp.ele('tarifa').txt(m2(l.vatRate));
    imp.ele('baseImponible').txt(m2(l.lineTotal));
    imp.ele('valor').txt(m2(l.vatAmount));
  }

  const usable = input.additionalInfo.filter((f) => txt(f.nombre) && txt(f.valor)).slice(0, 15);
  if (usable.length) {
    const ia = root.ele('infoAdicional');
    for (const f of usable) ia.ele('campoAdicional', { nombre: txt(f.nombre) }).txt(txt(f.valor));
  }
  return root.end({ prettyPrint: true });
}
