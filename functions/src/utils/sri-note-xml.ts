// ─── XML de la nota de crédito (04) y la nota de débito (05) ─────────────────
//
// Constructores puros (2026-10-06): reciben los datos ya resueltos y devuelven
// el XML sin firmar, para poder validarlos contra el esquema del SRI sin
// Firestore. Hasta hoy ninguna de las dos se había emitido en producción y las
// dos tenían el XML fuera de esquema:
//
//  · NC: llevaba <numAutDocSustento> (no existe en notaCredito), el detalle
//    con <codigoPrincipal> y <unidadMedida> (son de la factura; la NC usa
//    <codigoInterno> y no tiene unidad), y salía como versión 1.0.0, que solo
//    admite 2 decimales en cantidad y precio. Ahora es 1.1.0 (6 decimales).
//  · ND: cerraba con <importeTotal> y <moneda> (son de la factura; la ND usa
//    <valorTotal> y no tiene moneda), no mandaba <pagos> (obligatorio en la
//    ficha técnica), mandaba <numAutorizacionDocSustento> (no existe) y, con
//    IVA 0 %, dejaba <impuestos> vacío (exige al menos un <impuesto>).
//
// Orden de los campos: XSD NotaCredito_V1.1.0 (docs/) y ficha técnica offline
// v2.34, «Formato XML nota de débito».

import { create } from 'xmlbuilder2';
import { XMLBuilder } from 'xmlbuilder2/lib/interfaces';
import { formatFechaEmisionEC } from './sri-date';

export const CREDIT_NOTE_XML_VERSION = '1.1.0';
export const DEBIT_NOTE_XML_VERSION = '1.0.0';

export interface NoteIssuer {
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

export interface NoteBuyer {
  tipoIdentificacion: string;
  razonSocial: string;
  identificacion: string;
}

/** La factura que la nota modifica. */
export interface NoteSupportDoc {
  number: string;      // '001-001-000000123'
  date: Date;
}

export interface NoteAdditionalField { nombre: string; valor: string; }

export interface CreditNoteXmlLine {
  code: string;
  extraCode?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;   // sin impuestos
  vatCode: string;     // tabla 17
  vatRate: number;
  vatAmount: number;
}

export interface CreditNoteXmlInput {
  issuer: NoteIssuer;
  buyer: NoteBuyer;
  issueDate: Date;
  supportDoc: NoteSupportDoc;
  totalSinImpuestos: number;
  valorModificacion: number;
  taxGroups: Array<{ vatCode: string; base: number; tax: number }>;
  motivo: string;
  lines: CreditNoteXmlLine[];
  additionalInfo: NoteAdditionalField[];
}

export interface DebitNoteXmlInput {
  issuer: NoteIssuer;
  buyer: NoteBuyer;
  issueDate: Date;
  supportDoc: NoteSupportDoc;
  totalSinImpuestos: number;
  vatCode: string;
  vatRate: number;
  vatAmount: number;
  valorTotal: number;
  /** Tabla 24; si viene vacío se manda «20» (otros con utilización del sistema financiero). */
  paymentCode?: string;
  motivos: Array<{ razon: string; valor: number }>;
  additionalInfo: NoteAdditionalField[];
}

const m2 = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const m6 = (n: number) => (Math.round((Number(n) || 0) * 1e6) / 1e6).toFixed(6);

/** Lo que el XSD permite en un texto: sin saltos de línea y con su tope. */
function txt(value: string | undefined, max = 300): string {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function infoTributaria(root: XMLBuilder, i: NoteIssuer, codDoc: '04' | '05'): void {
  const it = root.ele('infoTributaria');
  it.ele('ambiente').txt(i.ambiente);
  it.ele('tipoEmision').txt('1');
  it.ele('razonSocial').txt(txt(i.razonSocial));
  if (txt(i.nombreComercial)) it.ele('nombreComercial').txt(txt(i.nombreComercial));
  it.ele('ruc').txt(i.ruc);
  it.ele('claveAcceso').txt(i.accessKey);
  it.ele('codDoc').txt(codDoc);
  it.ele('estab').txt(i.establishment);
  it.ele('ptoEmi').txt(i.emissionPoint);
  it.ele('secuencial').txt(i.secuencial);
  it.ele('dirMatriz').txt(txt(i.dirMatriz));
}

/** Lo común de infoNotaCredito e infoNotaDebito hasta fechaEmisionDocSustento. */
function buyerAndSupport(info: XMLBuilder, input: { issuer: NoteIssuer; buyer: NoteBuyer; issueDate: Date; supportDoc: NoteSupportDoc }): void {
  info.ele('fechaEmision').txt(formatFechaEmisionEC(input.issueDate));
  if (txt(input.issuer.dirEstablecimiento)) info.ele('dirEstablecimiento').txt(txt(input.issuer.dirEstablecimiento));
  info.ele('tipoIdentificacionComprador').txt(input.buyer.tipoIdentificacion);
  info.ele('razonSocialComprador').txt(txt(input.buyer.razonSocial));
  info.ele('identificacionComprador').txt(txt(input.buyer.identificacion, 20));
  const especial = txt(input.issuer.contribuyenteEspecial, 13);
  if (especial.length >= 3) info.ele('contribuyenteEspecial').txt(especial);
  info.ele('obligadoContabilidad').txt(input.issuer.obligadoContabilidad);
  info.ele('codDocModificado').txt('01'); // siempre una factura
  info.ele('numDocModificado').txt(input.supportDoc.number);
  info.ele('fechaEmisionDocSustento').txt(formatFechaEmisionEC(input.supportDoc.date));
}

function additional(root: XMLBuilder, fields: NoteAdditionalField[]): void {
  const usable = fields.filter((f) => txt(f.nombre) && txt(f.valor)).slice(0, 15);
  if (!usable.length) return;
  const ia = root.ele('infoAdicional');
  for (const f of usable) ia.ele('campoAdicional', { nombre: txt(f.nombre) }).txt(txt(f.valor));
}

export function buildCreditNoteXml(input: CreditNoteXmlInput): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('notaCredito', { id: 'comprobante', version: CREDIT_NOTE_XML_VERSION });
  infoTributaria(root, input.issuer, '04');

  const info = root.ele('infoNotaCredito');
  buyerAndSupport(info, input);
  info.ele('totalSinImpuestos').txt(m2(input.totalSinImpuestos));
  info.ele('valorModificacion').txt(m2(input.valorModificacion));
  info.ele('moneda').txt('DOLAR');
  const tci = info.ele('totalConImpuestos');
  for (const g of input.taxGroups) {
    const ti = tci.ele('totalImpuesto');
    ti.ele('codigo').txt('2'); // IVA
    ti.ele('codigoPorcentaje').txt(g.vatCode);
    ti.ele('baseImponible').txt(m2(g.base));
    ti.ele('valor').txt(m2(g.tax));
  }
  info.ele('motivo').txt(txt(input.motivo) || 'Devolución');

  const detalles = root.ele('detalles');
  for (const l of input.lines) {
    const d = detalles.ele('detalle');
    d.ele('codigoInterno').txt(txt(l.code, 25) || 'SIN-CODIGO');
    if (txt(l.extraCode, 25)) d.ele('codigoAdicional').txt(txt(l.extraCode, 25));
    d.ele('descripcion').txt(txt(l.description) || 'Sin descripción');
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

  additional(root, input.additionalInfo);
  return root.end({ prettyPrint: true });
}

export function buildDebitNoteXml(input: DebitNoteXmlInput): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('notaDebito', { id: 'comprobante', version: DEBIT_NOTE_XML_VERSION });
  infoTributaria(root, input.issuer, '05');

  const info = root.ele('infoNotaDebito');
  buyerAndSupport(info, input);
  info.ele('totalSinImpuestos').txt(m2(input.totalSinImpuestos));
  // Siempre un <impuesto>, también con IVA 0 %: el esquema no acepta la lista vacía.
  const imp = info.ele('impuestos').ele('impuesto');
  imp.ele('codigo').txt('2');
  imp.ele('codigoPorcentaje').txt(input.vatCode);
  imp.ele('tarifa').txt(m2(input.vatRate));
  imp.ele('baseImponible').txt(m2(input.totalSinImpuestos));
  imp.ele('valor').txt(m2(input.vatAmount));
  info.ele('valorTotal').txt(m2(input.valorTotal));
  const pago = info.ele('pagos').ele('pago');
  pago.ele('formaPago').txt(/^\d{2}$/.test(input.paymentCode ?? '') ? input.paymentCode! : '20');
  pago.ele('total').txt(m2(input.valorTotal));

  const motivos = root.ele('motivos');
  for (const m of input.motivos) {
    const mo = motivos.ele('motivo');
    mo.ele('razon').txt(txt(m.razon) || 'Ajuste');
    mo.ele('valor').txt(m2(m.valor));
  }

  additional(root, input.additionalInfo);
  return root.end({ prettyPrint: true });
}
