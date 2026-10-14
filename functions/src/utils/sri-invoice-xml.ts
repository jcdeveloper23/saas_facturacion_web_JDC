/**
 * sri-invoice-xml.ts — el XML de la factura (codDoc 01), sin Firestore.
 *
 * Salió de `generate-invoice-xml.ts` (2026-10-13) para poder probarlo contra
 * el XSD oficial del SRI (docs/XML y XSD Factura/) con descuento por línea.
 * La function lee la factura, la empresa y la configuración, arma la clave
 * de acceso y llama aquí; el orden de los elementos no cambió.
 */

import { create } from 'xmlbuilder2';
import { sriVatCode } from './sri-vat-codes';
import { validateTotals } from './sri-invoice-validator';
import { invoiceTotalDiscount, lineDiscountAmount, prorateAdditionalDiscount, round2 } from './invoice-discount';

export interface InvoiceXmlLine {
  productId?: string;
  sku?: string;
  productSku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  discountPct?: number;
  taxRate?: number;
  vatPct?: number;
  sriTaxCode?: string;
  lineTotal?: number;
  subtotal?: number;
  taxAmount?: number;
  vatAmount?: number;
  unit?: string;
  skuAlt?: string;
}

export interface InvoiceXmlPayment {
  code: string;
  amount?: number;
  deadline?: number | null;
  timeUnit?: string;
}

export interface InvoiceXmlDoc {
  customerName: string;
  customerTaxId: string;
  subtotal?: number;
  netAmount?: number;
  grossAmount?: number;
  discount?: number;
  discountAmount?: number;
  total?: number;
  lines: InvoiceXmlLine[];
  paymentMethod?: string;
  paymentMethods?: InvoiceXmlPayment[];
  paymentDays?: number;
}

export interface InvoiceXmlHeader {
  version: string;
  ambiente: string;
  tipoEmision: string;
  razonSocial: string;
  nombreComercial?: string;
  ruc: string;
  accessKey: string;
  establishment: string;
  emissionPoint: string;
  secuencial: string;
  dirMatriz: string;
  /** dd/mm/aaaa */
  fechaEmision: string;
  dirEstablecimiento: string;
  contribuyenteEspecial?: string;
  obligadoContabilidad: string;
  regimenMicroempresa?: boolean;
  tipoIdentificacionComprador: string;
}

export interface InvoiceXmlInput {
  header: InvoiceXmlHeader;
  invoice: InvoiceXmlDoc;
  taxCodes?: Array<{ vatPct: number; sriCode: string; isExempt?: boolean }>;
  infoAdicional?: Array<{ nombre: string; valor: string }>;
}

/** Montos del XML: los mismos que se escriben, para pruebas y para el RIDE. */
export function invoiceXmlAmounts(invoice: InvoiceXmlDoc, taxCodes?: InvoiceXmlInput['taxCodes']) {
  // invoice.netAmount YA viene neto de todo descuento (de línea y global);
  // subtotal/grossAmount no. `discountAmount` se usa solo en el respaldo
  // legacy, cuando no hay netAmount.
  const legacyDiscount = invoice.discountAmount ?? invoice.discount ?? 0;
  const totalSinImpuestos = invoice.netAmount !== undefined
    ? invoice.netAmount
    : (invoice.subtotal ?? invoice.grossAmount ?? 0) - legacyDiscount;

  // El descuento global (web de FacturaEc, POS) se reparte en las líneas:
  // ver prorateAdditionalDiscount.
  const detalles = prorateAdditionalDiscount(invoice.lines.map(line => {
    const taxRate = line.vatPct ?? line.taxRate ?? 0;
    return {
      line,
      taxRate,
      lineTotal: line.subtotal ?? line.lineTotal ?? 0,
      lineTax:   line.vatAmount ?? line.taxAmount ?? 0,
      lineDisc:  lineDiscountAmount(line),
      sriTaxCode: line.sriTaxCode ?? sriVatCode(taxRate, taxCodes),
    };
  }), totalSinImpuestos);

  const taxGroups = new Map<string, { base: number; tax: number }>();
  for (const d of detalles) {
    const g = taxGroups.get(d.sriTaxCode) ?? { base: 0, tax: 0 };
    taxGroups.set(d.sriTaxCode, { base: g.base + d.lineTotal, tax: g.tax + d.lineTax });
  }

  return {
    totalSinImpuestos,
    // Σ descuentos de línea + descuento adicional (invoice-discount.ts).
    totalDescuento: invoiceTotalDiscount(invoice.lines, totalSinImpuestos),
    taxGroups,
    detalles,
    importeTotal: invoice.total ?? 0,
  };
}

/** Construye el XML sin firmar. Lanza si los totales no cuadran. */
export function buildInvoiceXml(input: InvoiceXmlInput): string {
  const { header: h, invoice } = input;
  const a = invoiceXmlAmounts(invoice, input.taxCodes);

  // Nunca generar/firmar un comprobante con totales que no cuadren.
  const totalImpuestoValor = [...a.taxGroups.values()].reduce((s, g) => s + g.tax, 0);
  const totalsCheck = validateTotals({
    lines: a.detalles.map(d => ({
      baseImponible:          d.lineTotal,
      valorImpuesto:          d.lineTax,
      precioTotalSinImpuesto: d.lineTotal,
    })),
    totalSinImpuestos: a.totalSinImpuestos,
    totalImpuestoValor,
    totalDescuento:    a.totalDescuento,
    importeTotal:      a.importeTotal,
  });
  if (totalsCheck.length > 0) {
    const detail = totalsCheck.map(e => `[${e.code}] ${e.message}`).join('; ');
    throw new Error(`Totales de la factura inconsistentes, no se generará el XML: ${detail}`);
  }

  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('factura', { id: 'comprobante', version: h.version });

  // <infoTributaria>
  const infoTrib = root.ele('infoTributaria');
  infoTrib.ele('ambiente').txt(h.ambiente);
  infoTrib.ele('tipoEmision').txt(h.tipoEmision);
  infoTrib.ele('razonSocial').txt(h.razonSocial);
  if (h.nombreComercial) infoTrib.ele('nombreComercial').txt(h.nombreComercial);
  infoTrib.ele('ruc').txt(h.ruc);
  infoTrib.ele('claveAcceso').txt(h.accessKey);
  infoTrib.ele('codDoc').txt('01');
  infoTrib.ele('estab').txt(h.establishment);
  infoTrib.ele('ptoEmi').txt(h.emissionPoint);
  infoTrib.ele('secuencial').txt(h.secuencial);
  infoTrib.ele('dirMatriz').txt(h.dirMatriz);

  // <infoFactura>
  const infoFactura = root.ele('infoFactura');
  infoFactura.ele('fechaEmision').txt(h.fechaEmision);
  infoFactura.ele('dirEstablecimiento').txt(h.dirEstablecimiento);
  if (h.contribuyenteEspecial) infoFactura.ele('contribuyenteEspecial').txt(h.contribuyenteEspecial);
  infoFactura.ele('obligadoContabilidad').txt(h.obligadoContabilidad);
  // Solo si la empresa es microempresa (campo agregado en Sprint 3)
  if (h.regimenMicroempresa === true) infoFactura.ele('regimenMicroempresa').txt('CONTRIBUYENTE');
  infoFactura.ele('tipoIdentificacionComprador').txt(h.tipoIdentificacionComprador);
  infoFactura.ele('razonSocialComprador').txt(invoice.customerName);
  infoFactura.ele('identificacionComprador').txt(invoice.customerTaxId);
  infoFactura.ele('totalSinImpuestos').txt(a.totalSinImpuestos.toFixed(2));
  infoFactura.ele('totalDescuento').txt(a.totalDescuento.toFixed(2));

  const totalConImpuestos = infoFactura.ele('totalConImpuestos');
  for (const [sriTaxCode, { base, tax }] of a.taxGroups) {
    const ti = totalConImpuestos.ele('totalImpuesto');
    ti.ele('codigo').txt('2'); // IVA
    ti.ele('codigoPorcentaje').txt(sriTaxCode);
    ti.ele('baseImponible').txt(round2(base).toFixed(2));
    ti.ele('valor').txt(round2(tax).toFixed(2));
  }

  infoFactura.ele('propina').txt('0.00');
  infoFactura.ele('importeTotal').txt(a.importeTotal.toFixed(2));
  infoFactura.ele('moneda').txt('DOLAR');

  // Pagos: soporta paymentMethods[] (frontend) y paymentMethod (legacy)
  const pagos = infoFactura.ele('pagos');
  const paymentList = invoice.paymentMethods?.length
    ? invoice.paymentMethods
    : [{ code: invoice.paymentMethod ?? '01', amount: a.importeTotal, deadline: invoice.paymentDays ?? 0, timeUnit: 'dias' }];
  for (const pm of paymentList) {
    const pago = pagos.ele('pago');
    pago.ele('formaPago').txt(pm.code ?? '01');
    pago.ele('total').txt((pm.amount || a.importeTotal).toFixed(2));
    pago.ele('plazo').txt(String(pm.deadline ?? 0));
    pago.ele('unidadTiempo').txt(pm.timeUnit ?? 'dias');
  }

  // <detalles>
  const detalles = root.ele('detalles');
  for (const d of a.detalles) {
    const line = d.line;
    const detalle = detalles.ele('detalle');
    detalle.ele('codigoPrincipal').txt(line.productSku || line.sku || line.productId || 'SIN-CODIGO');
    if (line.skuAlt) detalle.ele('codigoAdicional').txt(line.skuAlt);
    detalle.ele('descripcion').txt(line.description);
    detalle.ele('unidadMedida').txt(line.unit || 'UNIDAD');
    detalle.ele('cantidad').txt(Number(line.quantity).toFixed(6));      // SRI XSD: fractionDigits=6
    detalle.ele('precioUnitario').txt(Number(line.unitPrice).toFixed(2)); // SRI XSD 1.0.0: fractionDigits=2
    detalle.ele('descuento').txt(d.lineDisc.toFixed(2));
    detalle.ele('precioTotalSinImpuesto').txt(d.lineTotal.toFixed(2));

    const impuesto = detalle.ele('impuestos').ele('impuesto');
    impuesto.ele('codigo').txt('2'); // IVA
    impuesto.ele('codigoPorcentaje').txt(d.sriTaxCode);
    impuesto.ele('tarifa').txt(String(d.taxRate));
    impuesto.ele('baseImponible').txt(d.lineTotal.toFixed(2));
    impuesto.ele('valor').txt(d.lineTax.toFixed(2));
  }

  // <infoAdicional> — ya armado por buildAdditionalInfo (sin vacíos, con tope).
  const extra = input.infoAdicional ?? [];
  if (extra.length > 0) {
    const infoAdicional = root.ele('infoAdicional');
    for (const field of extra) {
      infoAdicional.ele('campoAdicional', { nombre: field.nombre }).txt(field.valor);
    }
  }

  return root.end({ prettyPrint: true });
}
