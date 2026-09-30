/**
 * sri-xml-import.ts
 *
 * Leer el XML de una factura o nota de crédito que la empresa ya emitió en otro
 * sistema, y armar con él el documento de `invoices` con que se importa.
 *
 * Es el port del lector de Conectate (`App_Web_Conectate/lib/features/
 * accounting/invoices/sri_xml.dart` y `xml_invoice_import.dart`): la vista
 * previa se sigue haciendo allá, pero quien decide y escribe es el servidor
 * (`importInvoices`), que además lee **el XML que devuelve el SRI**, no el que
 * se subió. Si se cambia la forma del documento aquí, la lista, la ficha, el
 * RIDE y la nota de crédito de Conectate lo leen: mantener los mismos campos.
 *
 * Solo lógica pura: sin Firestore ni red.
 */

import { create } from 'xmlbuilder2';
import { calculateModulo11 } from './sri-access-key';

/** El XML no se pudo leer. `message` va tal cual al usuario. */
export class SriXmlError extends Error {}

export const COD_DOC_FACTURA = '01';
export const COD_DOC_NOTA_CREDITO = '04';

export interface SriLine {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  vatPct: number;
  vatAmount: number;
}

export interface SriVatTotal { vatPct: number; base: number; amount: number; }
export interface SriPayment { code: string; amount: number; deadline: number; timeUnit: string; }

export interface SriDocument {
  codDoc: string;
  /** `1` pruebas, `2` producción. */
  environment: string;
  issuerRuc: string;
  issuerName: string;
  accessKey: string;
  establishment: string;
  emissionPoint: string;
  sequential: number;
  /** Fecha de emisión (año, mes, día); la hora no cuenta. */
  issueDate: { y: number; m: number; d: number };
  buyerIdType: string;
  buyerId: string;
  buyerName: string;
  buyerAddress: string;
  buyerEmail: string;
  lines: SriLine[];
  vatTotals: SriVatTotal[];
  payments: SriPayment[];
  totalWithoutTaxes: number;
  totalDiscount: number;
  total: number;
  modifiedDocNumber: string;
  modifiedDocDate: { y: number; m: number; d: number } | null;
  reason: string;
  hasAuthorization: boolean;
  authorizationStatus: string;
  authorizationNumber: string;
  authorizedAt: Date | null;
}

export const isCreditNote = (d: SriDocument) => d.codDoc === COD_DOC_NOTA_CREDITO;
export const fullNumber = (d: SriDocument) =>
  `${d.establishment}-${d.emissionPoint}-${String(d.sequential).padStart(9, '0')}`;
export const isAuthorized = (d: SriDocument) =>
  d.hasAuthorization && d.authorizationStatus === 'AUTORIZADO' && d.authorizationNumber !== '';

// ─── DOM ─────────────────────────────────────────────────────────────────────

type El = { localName: string; textContent: string | null; childNodes: ArrayLike<any>; getAttribute(n: string): string | null };

function parseXml(text: string): El {
  // Los XML del SRI pueden venir con BOM.
  const limpio = text.replace(/^﻿/, '').trim();
  const doc = create(limpio).node as any;
  const raiz = doc.documentElement as El | null;
  if (!raiz) throw new Error('sin raíz');
  return raiz;
}

function elementos(raiz: El): El[] {
  const out: El[] = [];
  const walk = (e: El) => {
    for (const c of Array.from(e.childNodes)) {
      if (c.nodeType === 1) { out.push(c); walk(c); }
    }
  };
  walk(raiz);
  return out;
}

/** El primer elemento con ese nombre (sin prefijo), la raíz incluida. */
function primero(raiz: El, nombre: string): El | null {
  if (raiz.localName === nombre) return raiz;
  return elementos(raiz).find((e) => e.localName === nombre) ?? null;
}

const todos = (raiz: El, nombre: string) => elementos(raiz).filter((e) => e.localName === nombre);

function texto(raiz: El, nombre: string): string {
  const e = elementos(raiz).find((x) => x.localName === nombre);
  return (e?.textContent ?? '').trim();
}

function num(s: string): number {
  const n = parseFloat(s.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const round = (n: number, dec: number) => Math.round(n * 10 ** dec) / 10 ** dec;
const r2 = (n: number) => round(n, 2);

// ─── Fechas ──────────────────────────────────────────────────────────────────

/** `dd/mm/aaaa` → fecha. null si no lo es. */
export function parseSriDate(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const f = new Date(Date.UTC(y, mo - 1, d));
  if (f.getUTCDate() !== d || f.getUTCMonth() !== mo - 1) return null;
  return { y, m: mo, d };
}

/** Fecha de autorización: ISO 8601 o, en XML viejos, `dd/mm/aaaa hh:mm:ss` (hora de Ecuador). */
export function parseSriDateTime(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/.exec(t);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-05:00`);
  const iso = new Date(t);
  return isNaN(iso.getTime()) ? null : iso;
}

/** La fecha de emisión a mediodía de Ecuador, como la guarda `createAndEmitInvoice`. */
export const ecuadorNoon = (f: { y: number; m: number; d: number }) =>
  new Date(Date.UTC(f.y, f.m - 1, f.d, 17));

// ─── Clave de acceso ─────────────────────────────────────────────────────────

/**
 * Qué tiene de malo la clave de acceso, o null si cuadra con el comprobante.
 * Sus 49 dígitos repiten fecha, tipo, RUC, ambiente, serie y secuencial: que
 * coincidan descarta un XML retocado o armado con la clave de otro.
 */
export function accessKeyProblem(key: string, d: {
  codDoc: string; ruc: string; environment: string; establishment: string;
  emissionPoint: string; sequential: number; issueDate: { y: number; m: number; d: number };
}): string | null {
  if (!/^\d{49}$/.test(key)) return 'La clave de acceso no tiene 49 dígitos.';
  if (calculateModulo11(key.slice(0, 48)) !== +key[48]) {
    return 'El dígito verificador de la clave de acceso no cuadra.';
  }
  const fecha = `${String(d.issueDate.d).padStart(2, '0')}${String(d.issueDate.m).padStart(2, '0')}${d.issueDate.y}`;
  if (key.slice(0, 8) !== fecha ||
      key.slice(8, 10) !== d.codDoc ||
      key.slice(10, 23) !== d.ruc ||
      key.slice(23, 24) !== d.environment ||
      key.slice(24, 30) !== `${d.establishment}${d.emissionPoint}` ||
      key.slice(30, 39) !== String(d.sequential).padStart(9, '0')) {
    return 'La clave de acceso no corresponde a este comprobante.';
  }
  return null;
}

/** Tarifa del IVA por su código (tabla 17 del SRI), para los XML sin `<tarifa>`. */
export function vatPctFromCode(code: string): number {
  switch (code) {
    case '2': return 12;
    case '3': return 14;
    case '4': return 15;
    case '5': return 5;
    case '8': return 8;
    case '10': return 13;
    default: return 0; // 0, 6 (no objeto), 7 (exento)
  }
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

function nombreDelTipo(raiz: string): string {
  switch (raiz) {
    case 'comprobanteRetencion': return 'Es un comprobante de retención: solo se importan facturas y notas de crédito.';
    case 'notaDebito': return 'Es una nota de débito: solo se importan facturas y notas de crédito.';
    case 'guiaRemision': return 'Es una guía de remisión: solo se importan facturas y notas de crédito.';
    case 'liquidacionCompra': return 'Es una liquidación de compra: solo se importan facturas y notas de crédito.';
    default: return 'No es un comprobante del SRI (no trae <factura> ni <autorizacion>).';
  }
}

/** Lee un comprobante. Lanza `SriXmlError` con el motivo si no se puede. */
export function parseSriXml(text: string): SriDocument {
  let doc: El;
  try {
    doc = parseXml(text);
  } catch {
    throw new SriXmlError('No es un XML bien formado.');
  }

  const autorizacion = primero(doc, 'autorizacion');
  let comprobante: El;
  let estado = '';
  let numero = '';
  let fechaAut: Date | null = null;

  if (autorizacion) {
    estado = texto(autorizacion, 'estado').toUpperCase();
    numero = texto(autorizacion, 'numeroAutorizacion');
    fechaAut = parseSriDateTime(texto(autorizacion, 'fechaAutorizacion'));
    const nodo = primero(autorizacion, 'comprobante');
    const hijo = nodo ? Array.from(nodo.childNodes).find((c: any) => c.nodeType === 1) as El | undefined : undefined;
    if (hijo) {
      comprobante = hijo;
    } else {
      const interno = (nodo?.textContent ?? '').trim();
      if (!interno) throw new SriXmlError('La autorización no trae el comprobante dentro.');
      try {
        comprobante = parseXml(interno);
      } catch {
        throw new SriXmlError('El comprobante dentro de la autorización no es un XML válido.');
      }
    }
  } else {
    comprobante = doc;
  }

  const tipo = comprobante.localName;
  if (tipo !== 'factura' && tipo !== 'notaCredito') throw new SriXmlError(nombreDelTipo(tipo));

  const info = primero(comprobante, 'infoTributaria');
  if (!info) throw new SriXmlError('Falta la información tributaria.');
  const codDoc = texto(info, 'codDoc');
  if (codDoc !== COD_DOC_FACTURA && codDoc !== COD_DOC_NOTA_CREDITO) {
    throw new SriXmlError(`Es un comprobante de tipo ${codDoc}: solo se importan facturas (01) y notas de crédito (04).`);
  }
  const esNota = codDoc === COD_DOC_NOTA_CREDITO;
  const cuerpo = primero(comprobante, esNota ? 'infoNotaCredito' : 'infoFactura');
  if (!cuerpo) throw new SriXmlError(`Falta ${esNota ? 'infoNotaCredito' : 'infoFactura'}.`);

  const clave = texto(info, 'claveAcceso');
  const estab = texto(info, 'estab');
  const pto = texto(info, 'ptoEmi');
  const secuencial = parseInt(texto(info, 'secuencial'), 10);
  const ruc = texto(info, 'ruc');
  const ambiente = texto(info, 'ambiente');
  const fecha = parseSriDate(texto(cuerpo, 'fechaEmision'));

  if (!/^\d{3}$/.test(estab) || !/^\d{3}$/.test(pto) || !Number.isFinite(secuencial) || secuencial <= 0) {
    throw new SriXmlError('El establecimiento, el punto de emisión o el secuencial no son válidos.');
  }
  if (!/^\d{13}$/.test(ruc)) throw new SriXmlError('El RUC del emisor no es válido.');
  if (!fecha) throw new SriXmlError('La fecha de emisión no es válida.');
  const problema = accessKeyProblem(clave, {
    codDoc, ruc, environment: ambiente, establishment: estab, emissionPoint: pto,
    sequential: secuencial, issueDate: fecha,
  });
  if (problema) throw new SriXmlError(problema);

  const lines: SriLine[] = todos(comprobante, 'detalle').map((d) => {
    let pct = 0;
    let iva = 0;
    for (const imp of todos(d, 'impuesto')) {
      if (texto(imp, 'codigo') !== '2') continue; // solo el IVA
      const tarifa = texto(imp, 'tarifa');
      pct = tarifa ? num(tarifa) : vatPctFromCode(texto(imp, 'codigoPorcentaje'));
      iva += num(texto(imp, 'valor'));
    }
    const codigo = texto(d, esNota ? 'codigoInterno' : 'codigoPrincipal');
    return {
      code: codigo || texto(d, esNota ? 'codigoAdicional' : 'codigoAuxiliar'),
      description: texto(d, 'descripcion'),
      quantity: num(texto(d, 'cantidad')),
      unitPrice: num(texto(d, 'precioUnitario')),
      discount: num(texto(d, 'descuento')),
      subtotal: num(texto(d, 'precioTotalSinImpuesto')),
      vatPct: pct,
      vatAmount: r2(iva),
    };
  });
  if (lines.length === 0) throw new SriXmlError('El comprobante no trae ninguna línea.');

  const vatTotals: SriVatTotal[] = [];
  const tci = primero(cuerpo, 'totalConImpuestos');
  if (tci) {
    for (const t of todos(tci, 'totalImpuesto')) {
      if (texto(t, 'codigo') !== '2') continue;
      const tarifa = texto(t, 'tarifa');
      vatTotals.push({
        vatPct: tarifa ? num(tarifa) : vatPctFromCode(texto(t, 'codigoPorcentaje')),
        base: num(texto(t, 'baseImponible')),
        amount: num(texto(t, 'valor')),
      });
    }
  }

  const payments: SriPayment[] = todos(cuerpo, 'pago').map((p) => ({
    code: texto(p, 'formaPago'),
    amount: num(texto(p, 'total')),
    deadline: Math.round(num(texto(p, 'plazo'))),
    timeUnit: texto(p, 'unidadTiempo'),
  }));

  let correo = '';
  const adicional = primero(comprobante, 'infoAdicional');
  if (adicional) {
    for (const c of todos(adicional, 'campoAdicional')) {
      const n = (c.getAttribute('nombre') ?? '').toLowerCase();
      if (n.includes('mail') || n.includes('correo')) { correo = (c.textContent ?? '').trim(); break; }
    }
  }

  return {
    codDoc,
    environment: ambiente,
    issuerRuc: ruc,
    issuerName: texto(info, 'razonSocial'),
    accessKey: clave,
    establishment: estab,
    emissionPoint: pto,
    sequential: secuencial,
    issueDate: fecha,
    buyerIdType: texto(cuerpo, 'tipoIdentificacionComprador'),
    buyerId: texto(cuerpo, 'identificacionComprador'),
    buyerName: texto(cuerpo, 'razonSocialComprador'),
    buyerAddress: texto(cuerpo, 'direccionComprador'),
    buyerEmail: correo,
    lines,
    vatTotals,
    payments,
    totalWithoutTaxes: num(texto(cuerpo, 'totalSinImpuestos')),
    totalDiscount: num(texto(cuerpo, 'totalDescuento')),
    total: esNota ? num(texto(cuerpo, 'valorModificacion')) : num(texto(cuerpo, 'importeTotal')),
    modifiedDocNumber: esNota ? texto(cuerpo, 'numDocModificado') : '',
    modifiedDocDate: esNota ? parseSriDate(texto(cuerpo, 'fechaEmisionDocSustento')) : null,
    reason: esNota ? texto(cuerpo, 'motivo') : '',
    hasAuthorization: !!autorizacion,
    authorizationStatus: estado,
    authorizationNumber: numero,
    authorizedAt: fechaAut,
  };
}

// ─── Documento de la factura importada ───────────────────────────────────────

/** Identificación del consumidor final. */
export const CONSUMIDOR_FINAL_ID = '9999999999999';

/** El tipo de identificación de FacturaEc para el código del SRI. */
export function taxIdTypeFromSri(code: string, id: string): string {
  if (id.trim() === CONSUMIDOR_FINAL_ID) return 'CONSUMIDOR_FINAL';
  switch (code) {
    case '04': return 'RUC';
    case '05': return 'CI';
    case '06': return 'PASAPORTE';
    case '07': return 'CONSUMIDOR_FINAL';
    case '08': return 'EXTERIOR';
    default: return id.trim().length === 13 ? 'RUC' : 'CI';
  }
}

/**
 * El documento de `invoices` de un comprobante importado, con la misma forma
 * que el de Conectate (`buildImportedInvoiceDoc`). Las marcas de servidor
 * (`importedAt`, `updatedAt`) y dónde quedó el XML las pone quien escribe.
 *
 * Tres campos lo dejan fuera de los disparadores:
 *   · `sriStatus: 'authorized'` desde que nace — `onInvoiceEmit` no lo reenvía
 *     ni lo manda por correo;
 *   · `stockProcessed: true` — `onInvoiceStock` no descuenta una venta pasada;
 *   · `stockRestored: true` — si se anula, no devuelve lo que nunca descontó.
 * `generateJournalEntryFromInvoice` sí lo contabiliza, pero solo si su año
 * tiene un periodo contable abierto (decisión del 2026-09-30).
 */
export function buildImportedInvoiceDoc(d: SriDocument, opts: {
  uid: string;
  fileName: string;
  customerId: string | null;
  productIdsBySku: Record<string, string>;
}): Record<string, unknown> {
  const fecha = ecuadorNoon(d.issueDate);
  const tipo = taxIdTypeFromSri(d.buyerIdType, d.buyerId);

  const lineas = d.lines.map((l) => {
    const pct = (() => {
      const bruto = l.quantity * l.unitPrice;
      return bruto <= 0 || l.discount <= 0 ? 0 : round((l.discount * 100) / bruto, 4);
    })();
    const sku = l.code === '' ? 'SIN-CODIGO' : l.code;
    return {
      productId: opts.productIdsBySku[l.code.trim().toUpperCase()] ?? null,
      sku,
      productSku: sku,
      description: l.description,
      unit: 'UNIDAD',
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
      discountPct: pct,
      subtotal: l.subtotal,
      vatPct: l.vatPct,
      vatAmount: l.vatAmount,
      lineTotal: l.subtotal,
      taxRate: l.vatPct,
      taxAmount: l.vatAmount,
    };
  });

  // Base e IVA por tarifa: las del XML si vienen; si no, de las líneas.
  const resumen = new Map<number, [number, number]>();
  const sumar = (pct: number, base: number, iva: number) => {
    const r = resumen.get(pct) ?? [0, 0];
    resumen.set(pct, [r[0] + base, r[1] + iva]);
  };
  if (d.vatTotals.length > 0) d.vatTotals.forEach((t) => sumar(t.vatPct, t.base, t.amount));
  else d.lines.forEach((l) => sumar(l.vatPct, l.subtotal, l.vatAmount));
  const vatSummary = [...resumen.entries()].map(([pct, [b, v]]) => ({
    vatPct: pct, taxableBase: r2(b), vatAmount: r2(v),
  }));
  const iva = r2([...resumen.values()].reduce((s, r) => s + r[1], 0));
  const base = d.totalWithoutTaxes > 0 ? d.totalWithoutTaxes : r2(d.lines.reduce((s, l) => s + l.subtotal, 0));

  const pagos = d.payments.length === 0
    ? [{ code: '01', amount: d.total, deadline: 0, timeUnit: 'dias' }]
    : d.payments.map((p) => ({ code: p.code, amount: p.amount, deadline: p.deadline, timeUnit: p.timeUnit || 'dias' }));

  const doc: Record<string, unknown> = {
    // Numeración
    seriesEstablishment: d.establishment,
    seriesEmissionPoint: d.emissionPoint,
    number: d.sequential,
    fullNumber: fullNumber(d),
    fiscalYear: String(d.issueDate.y),
    // Fechas
    date: fecha,
    dueDate: fecha,
    // Cliente
    customerId: opts.customerId,
    customerName: d.buyerName,
    customerTaxId: d.buyerId,
    customerTaxIdType: tipo,
    customerEmail: d.buyerEmail.includes('@') ? d.buyerEmail : null,
    customerAddress: d.buyerAddress === '' ? null : d.buyerAddress,
    // Líneas y totales
    lines: lineas,
    grossAmount: r2(base + d.totalDiscount),
    discountAmount: d.totalDiscount,
    netAmount: base,
    subtotal: base,
    discount: d.totalDiscount,
    taxableBase: base,
    vatAmount: iva,
    vatSummary,
    total: d.total,
    currency: 'USD',
    paymentMethods: pagos,
    // Estado: ya autorizada, fuera de los disparadores
    status: 'issued',
    isVoid: false,
    sriStatus: 'authorized',
    accessKey: d.accessKey,
    authorizationNumber: d.authorizationNumber,
    authorizedAt: d.authorizedAt,
    authorizationVerified: true,
    verifiedWithSri: true,
    sriEnvironment: d.environment === '2' ? 'production' : 'testing',
    stockProcessed: true,
    stockRestored: true,
    // Origen
    source: 'xml_import',
    imported: true,
    importedFileName: opts.fileName,
    createdBy: opts.uid,
    importedBy: opts.uid,
    // La lista se ordena por `createdAt`: sale en su fecha, no encima de lo de ayer.
    createdAt: fecha,
  };
  if (isCreditNote(d)) {
    doc.documentType = 'creditNote';
    doc.isCreditNote = true;
    doc.creditNoteMotivo = d.reason;
    doc.rectifiedInvoiceNumber = d.modifiedDocNumber;
    if (d.modifiedDocDate) doc.rectifiedInvoiceDate = ecuadorNoon(d.modifiedDocDate);
  }
  return doc;
}

// ─── Contadores ──────────────────────────────────────────────────────────────

/**
 * Hasta dónde tiene que llegar cada contador de `counters/invoices` para que la
 * próxima emisión no repita un número importado. El SRI numera por
 * establecimiento, punto y tipo, y el secuencial sigue de un año a otro; los
 * contadores van por año (`001_001_2026` facturas, `NC_001_001_2026` notas de
 * crédito). Por eso sube el del año de cada comprobante y el de los años en
 * curso (`currentYears`: el de Ecuador y el UTC, que en Nochevieja difieren).
 */
export function counterFloors(docs: SriDocument[], currentYears: number[]): Record<string, number> {
  const pisos: Record<string, number> = {};
  const subir = (k: string, n: number) => { if ((pisos[k] ?? 0) < n) pisos[k] = n; };
  for (const d of docs) {
    const punto = `${isCreditNote(d) ? 'NC_' : ''}${d.establishment}_${d.emissionPoint}`;
    subir(`${punto}_${d.issueDate.y}`, d.sequential);
    for (const y of currentYears) subir(`${punto}_${y}`, d.sequential);
  }
  return pisos;
}

/** Lo que hay que escribir en el contador: solo lo que sube. */
export function counterUpdates(actual: Record<string, unknown> | undefined, pisos: Record<string, number>): Record<string, number> {
  const cambios: Record<string, number> = {};
  for (const [k, piso] of Object.entries(pisos)) {
    const hoy = Number(actual?.[k] ?? 0) || 0;
    if (piso > hoy) cambios[k] = piso;
  }
  return cambios;
}
