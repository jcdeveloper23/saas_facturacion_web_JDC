// ─── Constructor PURO del ATS (Anexo Transaccional Simplificado) ─────────────
//
// Datos ya leídos de Firestore → XML + filas del Excel + resumen. Sin Firestore
// ni red, para probarlo con Jest y validarlo con xmllint contra el XSD oficial
// (ats.xsd, descargado del SRI; ver su cabecera).
//
// Fuente de cada regla: docs/Ficha-Tecnica-Transaccional-Simplificado-ATS-2025.pdf
// («ficha», con su número de página) y el esquema ats.xsd («XSD»).
//
// Qué documento cuenta — el mismo criterio que los borradores del 104 y del 103
// de Conecta (lib/features/accounting/declarations/declarations.dart):
//   - Ventas (facturas, NC, ND): status issued|paid, sin anular, y sriStatus
//     authorized, not_required, plan_feature_disabled o plan_limit_reached. Los
//     borradores, los que están en camino al SRI y los rechazados no cuentan.
//   - Compras: status received|paid, sin anular, por `date` (fecha de registro
//     contable, ficha p. 15).
//   - Retenciones emitidas: status issued, sin anular y authorized.
// Todo se suma en centavos enteros y los días son de Ecuador (UTC−5).

import { create } from 'xmlbuilder2';
import { resolveTipoIdentificacionComprador } from '../../utils/sri-buyer-id';
import { DEFAULT_SRI_SUSTENTO_CODE, normalizeSustentoCode } from '../../utils/sri-sustento-codes';
import { zeroRateKind } from '../../utils/sri-vat-codes';

// ─── Tipos de los documentos (lo que se lee de Firestore, sin tipar a fondo) ──

/** Un documento de Firestore tal cual: las fechas pueden ser Timestamp, Date o texto. */
export type RawDoc = Record<string, any>;

// ─── Contrato de salida (lo usa la web: src/app/features/accounting/services/ats.service.ts) ─

export interface AtsCompraRow {
  codigoOper: string; codSustento: string; tpIdProv: string; idProv: string;
  parteRel: string; tipoComprobante: string; fechaRegistro: string;
  establecimiento: string; puntoEmision: string; secuencial: string;
  fechaEmision: string; autorizacion: string;
  baseNoGraIva: number; baseImponible: number; baseImpGrav: number;
  baseImpExe: number; montoIce: number; montoIva: number;
  valRetBien10: number; valRetServ20: number; valorRetBienes: number;
  valRetServ50: number; valorRetServicios: number; valRetServ100: number;
  pagoLocExt: string; formaPago: string;
  codRetAir: string; baseImpAir: number; porcentajeAir: number; valRetAir: number;
  estabRetencion: string; ptoEmiRetencion: string; secRetencion: string;
  autRetencion: string; fechaEmiRetencion: string;
}

export interface AtsVentaRow {
  tpIdCliente: string; idCliente: string; parteRel: string;
  tipoComprobante: string; tipoEmision: string; numeroComprobantes: number;
  baseNoGraIva: number; baseImponible: number; baseImpGrav: number;
  montoIva: number; montoIce: number; valorRetIva: number; valorRetRenta: number;
}

export interface AtsVentaEstabRow {
  codEstab: string; ventasEstab: number; ivaComp: number;
}

export interface AtsAnuladoRow {
  tipoComprobante: string; establecimiento: string; puntoEmision: string;
  secuencialInicio: number; secuencialFin: number; autorizacion: string;
}

export interface AtsExcelData {
  companyRuc: string; companyName: string; year: number; mesXml: string;
  numEstabRuc: number; totalVentas: number;
  compras: AtsCompraRow[];
  ventas: AtsVentaRow[];
  ventasEstab: AtsVentaEstabRow[];
  anulados: AtsAnuladoRow[];
}

/** Resumen para la pantalla de Conecta (campo nuevo: la web lo ignora). */
export interface AtsSummary {
  ventas: {
    facturas: number; notasCredito: number; notasDebito: number;
    /** Bases sin IVA: no objeto + 0 % + distinta de 0 % (NC restando). Igual a totalVentas. */
    baseTotal: number; baseNoGraIva: number; baseImponible: number; baseImpGrav: number;
    /** IVA de facturas + ND − NC. */
    montoIva: number;
  };
  compras: {
    documentos: number;
    baseNoGraIva: number; baseImponible: number; baseImpGrav: number; baseImpExe: number;
    montoIva: number;
  };
  retenciones: { documentos: number; iva: number; renta: number };
  /** Retenciones que los clientes le hicieron a la empresa, por su fecha (2026-10-08). */
  retencionesRecibidas: { documentos: number; iva: number; renta: number };
  anulados: { documentos: number; rangos: number };
  /** Ventas que no entraron: en camino al SRI o rechazadas. */
  excluidas: { enProceso: number; rechazadas: number };
}

export interface AtsBuildInput {
  companyRuc: string;
  companyName: string;
  year: number;
  /** 1-12 (mensual). Con semestre se ignora. */
  month: number;
  /** undefined = mensual; 1 = enero-junio; 2 = julio-diciembre. */
  semestre?: 1 | 2;
  /** Códigos (001…) de los establecimientos ACTIVOS del RUC. */
  establishmentCodes: string[];
  /** El de la empresa (`sri.establishment`), si no hay ninguno registrado. */
  defaultEstablishment?: string;
  /** Facturas y NC (colección `invoices`) por `date`; pueden venir de más. */
  invoices: RawDoc[];
  debitNotes: RawDoc[];
  purchases: RawDoc[];
  /** Retenciones ligadas a las compras, por id. */
  retentionsById: Record<string, RawDoc>;
  /** Comprobantes propios anulados (por `voidedAt`): facturas/NC, ND y retenciones. */
  voidedInvoices: RawDoc[];
  voidedDebitNotes: RawDoc[];
  voidedRetentions: RawDoc[];
  /**
   * Retenciones que los clientes le hicieron a la empresa
   * (`receivedRetentions`), por `date`; pueden venir de más. Alimentan
   * valorRetIva y valorRetRenta del detalle de ventas (ficha p. 37).
   */
  receivedRetentions?: RawDoc[];
  /** Sin la línea informativa 332 en las compras sin retención de renta. */
  excluirInformativa332?: boolean;
}

export interface AtsBuildResult {
  xml: string;
  /** ATmmaaaa (ficha p. 3). */
  filenameBase: string;
  excelData: AtsExcelData;
  summary: AtsSummary;
  /** Cosas a revisar antes de presentar (en castellano, sin datos personales). */
  warnings: string[];
}

// ─── Periodo en hora de Ecuador ──────────────────────────────────────────────

const EC_OFFSET_MS = 5 * 60 * 60 * 1000; // Ecuador continental: UTC−5, sin horario de verano.

export interface AtsPeriod { start: Date; end: Date; mesXml: string }

/**
 * Inicio (incluido) y fin (excluido) del periodo, como instantes: 00:00 en
 * Ecuador = 05:00 UTC. Semestral: mes 06 = primer semestre, 12 = segundo
 * (ficha p. 5, tabla 1 p. 71).
 */
export function atsPeriod(year: number, month: number, semestre?: 1 | 2): AtsPeriod {
  const at = (y: number, m0: number) => new Date(Date.UTC(y, m0, 1) + EC_OFFSET_MS);
  if (semestre === 1) return { start: at(year, 0), end: at(year, 6), mesXml: '06' };
  if (semestre === 2) return { start: at(year, 6), end: at(year + 1, 0), mesXml: '12' };
  return { start: at(year, month - 1), end: at(year, month), mesXml: pad(month, 2) };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pad(n: string | number, len: number): string {
  return String(n).padStart(len, '0');
}

/** Timestamp de Firestore, Date o texto → Date. */
export function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof (v as any).seconds === 'number') return new Date((v as any).seconds * 1000);
  return null;
}

/** dd/mm/aaaa del día en Ecuador. */
export function fmtDateEc(v: unknown): string {
  const d = toDate(v);
  if (!d) return '';
  const e = new Date(d.getTime() - EC_OFFSET_MS);
  return `${pad(e.getUTCDate(), 2)}/${pad(e.getUTCMonth() + 1, 2)}/${e.getUTCFullYear()}`;
}

function inPeriod(v: unknown, p: AtsPeriod): boolean {
  const d = toDate(v);
  return !!d && d >= p.start && d < p.end;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

/** Dólares → centavos enteros. */
export function cents(v: unknown): number {
  return Math.round(num(v) * 100);
}

/** Centavos → «1234.56» (con signo si es negativo; solo totalVentas/ventasEstab lo admiten). */
export function money(c: number): string {
  const sign = c < 0 ? '-' : '';
  const a = Math.abs(Math.round(c));
  return `${sign}${Math.floor(a / 100)}.${pad(a % 100, 2)}`;
}

const toUsd = (c: number) => Math.round(c) / 100;

/** autorizacionType exige solo dígitos ([0-9]{3,49}). */
function digitsOnly(s: unknown): string {
  return String(s ?? '').replace(/\D/g, '');
}

/**
 * razonSocialType del XSD: «[a-zA-Z0-9][a-zA-Z0-9\s]+[a-zA-Z0-9\s]». Sin
 * tildes, sin puntos ni símbolos (ficha p. 5: «no se deben ingresar caracteres
 * ni símbolos extraños»). «Weconnect Corp.» → «Weconnect Corp».
 */
export function sanitizeRazonSocial(name: string): string {
  const s = String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[ñÑ]/g, (c) => (c === 'ñ' ? 'n' : 'N'))
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.slice(0, 500);
}

/** «001-001-000000123» → partes. Si no tiene ese formato, null. */
export function parseDocNumber(fullNumber: unknown): { establecimiento: string; puntoEmision: string; secuencial: number } | null {
  const m = String(fullNumber ?? '').trim().match(/^(\d{3})-(\d{3})-(\d{1,9})$/);
  if (!m) return null;
  const sec = parseInt(m[3], 10);
  if (!(sec >= 1)) return null;
  return { establecimiento: m[1], puntoEmision: m[2], secuencial: sec };
}

/** Número de la factura del proveedor: libre si no trae el formato SRI. */
function parseSupplierNumber(fullNumber: unknown): { establecimiento: string; puntoEmision: string; secuencial: string } {
  const p = parseDocNumber(fullNumber);
  if (p) return { establecimiento: p.establecimiento, puntoEmision: p.puntoEmision, secuencial: String(p.secuencial) };
  // TODO(ATS): numeración libre de un proveedor sin formato 001-001-…: se toman
  // los últimos 9 dígitos como secuencial y 001-001 como serie. Revisar a mano.
  const digits = String(fullNumber ?? '').replace(/\D/g, '');
  const secuencial = digits ? String(parseInt(digits.slice(-9), 10) || 1) : '1';
  return { establecimiento: '001', puntoEmision: '001', secuencial };
}

/** Agrega un elemento de texto. */
function addEl(parent: any, tag: string, value: string | number): void {
  parent.ele(tag).txt(String(value));
}

// ─── Tablas de la ficha ──────────────────────────────────────────────────────

/** Estados del SRI con los que un comprobante propio cuenta (como en Conecta). */
export const COUNTED_SRI_STATUSES: ReadonlySet<string> =
  new Set(['authorized', 'not_required', 'plan_feature_disabled', 'plan_limit_reached']);
const IN_PROCESS_SRI_STATUSES: ReadonlySet<string> = new Set(['', 'pending', 'xml_generated', 'signed']);

/**
 * Tipo de emisión, tabla 20 (ficha p. 84): F = facturación física, E =
 * facturación electrónica. Antes iba al revés (F para las electrónicas).
 * Electrónica = la que pasó por el SRI (authorized). not_required y los
 * estados del plan son comprobantes que no se emitieron electrónicamente.
 */
export function tipoEmision(sriStatus: unknown): 'E' | 'F' {
  return String(sriStatus ?? '') === 'authorized' ? 'E' : 'F';
}

/**
 * Código tipo de comprobante, tabla 4 (ficha pp. 79-80):
 *   - Ventas: la factura va como 18 «Documentos autorizados utilizados en
 *     ventas excepto N/C N/D» (el 01 no admite el secuencial de transacción de
 *     venta, 04-07), la NC como 04 y la ND como 05 (ficha p. 34). Antes la ND
 *     salía con 02, que es «Nota o boleta de venta».
 *   - Anulados: el tipo del comprobante propio: 01 factura, 04 NC, 05 ND, 07
 *     comprobante de retención (ficha p. 46).
 */
export const TIPO_COMPROBANTE = {
  ventaFactura: '18',
  notaCredito: '04',
  notaDebito: '05',
  factura: '01',
  retencion: '07',
} as const;

/** tpIdCliente, tabla 2 (ficha p. 71): 04 RUC, 05 cédula, 06 pasaporte/exterior, 07 consumidor final. */
export function tpIdCliente(taxId: unknown, taxIdType: unknown, explicit?: unknown): string {
  const c = resolveTipoIdentificacionComprador(
    String(taxId ?? ''), explicit ? String(explicit) : undefined, taxIdType ? String(taxIdType) : undefined);
  // El 08 (identificación del exterior) de los comprobantes electrónicos no
  // existe en la tabla 2: es el 06 «Pasaporte / Identificación tributaria del exterior».
  return c === '08' ? '06' : c;
}

/**
 * tpIdProv, tabla 2 (ficha p. 71): 01 RUC, 02 cédula, 03 pasaporte/exterior.
 * Distinta de la de ventas. Sin tipo, se deduce del número.
 */
export function tpIdProv(type: unknown, id: unknown): string {
  const t = String(type ?? '').trim().toUpperCase();
  if (t === 'RUC' || t === '01' || t === '04') return '01';
  if (t === 'CI' || t === 'CEDULA' || t === 'CÉDULA' || t === '02' || t === '05') return '02';
  if (t === 'PASAPORTE' || t === 'EXTERIOR' || t === '03' || t === '06' || t === '08') return '03';
  const s = String(id ?? '').trim();
  if (/^\d{10}$/.test(s)) return '02';
  return '01';
}

/** tpIdClienteEx, tabla 2 (ficha pp. 71-72): 20 exportación con RUC, 21 con pasaporte/exterior. */
export function tpIdClienteEx(taxId: unknown, taxIdType: unknown): string {
  return tpIdCliente(taxId, taxIdType) === '04' ? '20' : '21';
}

/**
 * Retención de IVA, tabla 11 (ficha p. 83): código → porcentaje. Se usa si la
 * línea no trae su porcentaje.
 */
const IVA_RETENTION_PCT_BY_CODE: Readonly<Record<string, number>> = {
  '9': 10, '10': 20, '1': 30, '11': 50, '2': 70, '3': 100,
};

// ─── Bases por tipo de IVA ───────────────────────────────────────────────────

/** Bases en centavos: no objeto, 0 %, distinta de 0 %, exento; e IVA. */
interface Bases { noObj: number; zero: number; grav: number; exe: number; iva: number }
const emptyBases = (): Bases => ({ noObj: 0, zero: 0, grav: 0, exe: 0, iva: 0 });

function lineCode(l: RawDoc): unknown {
  return l?.['sriTaxCode'] ?? l?.['vatCode'] ?? l?.['sriCode'];
}

/**
 * Bases de una factura o NC. La base y el IVA por tarifa salen de
 * `vatSummary` (respeta el descuento global, como el asiento y el 104 de
 * Conecta); si no lo trae, de las líneas. La parte de tarifa 0 se reparte
 * entre 0 %, no objeto (6) y exento (7) en proporción a las líneas, porque
 * `vatSummary` no los distingue (tabla 17; sri-vat-codes.ts).
 */
export function saleBases(doc: RawDoc): { bases: Bases; fromLines: boolean } {
  const lines: RawDoc[] = Array.isArray(doc['lines']) ? doc['lines'] : [];
  const b = emptyBases();
  // Líneas de tarifa 0, por clase.
  const z = { zero: 0, noObjeto: 0, exento: 0 };
  for (const l of lines) {
    const rate = num(l?.['vatPct'] ?? l?.['taxRate']);
    if (rate > 0) continue;
    z[zeroRateKind(lineCode(l))] += cents(l?.['subtotal'] ?? l?.['lineTotal']);
  }
  const summary: RawDoc[] = Array.isArray(doc['vatSummary']) ? doc['vatSummary'] : [];
  let zeroBase = 0;
  let fromLines = false;
  if (summary.length) {
    for (const v of summary) {
      const rate = num(v?.['vatPct']);
      if (rate > 0) { b.grav += cents(v?.['taxableBase']); b.iva += cents(v?.['vatAmount']); }
      else zeroBase += cents(v?.['taxableBase']);
    }
  } else {
    fromLines = true;
    for (const l of lines) {
      const rate = num(l?.['vatPct'] ?? l?.['taxRate']);
      if (rate > 0) {
        b.grav += cents(l?.['subtotal'] ?? l?.['lineTotal']);
        b.iva += cents(l?.['vatAmount'] ?? l?.['taxAmount']);
      }
    }
    zeroBase = z.zero + z.noObjeto + z.exento;
  }
  const zLines = z.zero + z.noObjeto + z.exento;
  if (zLines > 0 && zeroBase !== 0) {
    b.noObj = Math.round((zeroBase * z.noObjeto) / zLines);
    b.exe = Math.round((zeroBase * z.exento) / zLines);
    b.zero = zeroBase - b.noObj - b.exe;
  } else {
    b.zero = zeroBase;
  }
  return { bases: b, fromLines };
}

/** Bases de una compra, por sus líneas (taxRate + código opcional de la tabla 17). */
export function purchaseBases(doc: RawDoc): Bases {
  const b = emptyBases();
  for (const l of (Array.isArray(doc['lines']) ? doc['lines'] : []) as RawDoc[]) {
    const rate = num(l?.['taxRate'] ?? l?.['vatPct']);
    const sub = cents(l?.['subtotal']);
    if (rate > 0) { b.grav += sub; b.iva += cents(l?.['taxAmount'] ?? l?.['vatAmount']); continue; }
    const k = zeroRateKind(lineCode(l));
    if (k === 'noObjeto') b.noObj += sub;
    else if (k === 'exento') b.exe += sub;
    else b.zero += sub;
  }
  return b;
}

// ─── Clasificación ───────────────────────────────────────────────────────────

const isVoidDoc = (d: RawDoc) => d['isVoid'] === true || d['status'] === 'void';

type SaleClass = 'counted' | 'inProcess' | 'rejected' | 'ignored';

/** Facturas, NC y ND (igual que classifySale de Conecta). */
export function classifySale(d: RawDoc): SaleClass {
  const status = String(d['status'] ?? '');
  if (isVoidDoc(d) || !(status === 'issued' || status === 'paid')) return 'ignored';
  const sri = String(d['sriStatus'] ?? '');
  if (COUNTED_SRI_STATUSES.has(sri)) return 'counted';
  if (sri === 'rejected') return 'rejected';
  if (IN_PROCESS_SRI_STATUSES.has(sri)) return 'inProcess';
  return 'inProcess';
}

export function isCountedPurchase(d: RawDoc): boolean {
  const s = String(d['status'] ?? '');
  return !isVoidDoc(d) && (s === 'received' || s === 'paid');
}

export function isCountedRetention(d: RawDoc | undefined): boolean {
  return !!d && !isVoidDoc(d) && d['status'] === 'issued' && d['sriStatus'] === 'authorized';
}

const isCreditNote = (d: RawDoc) => d['isCreditNote'] === true || d['documentType'] === 'creditNote';

// ─── Constructor ─────────────────────────────────────────────────────────────

/** Umbral de la forma de pago en compras (ficha p. 24): > USD 500 desde el 20/12/2023, > 1000 antes. */
const FORMA_PAGO_DESDE = Date.UTC(2023, 11, 20) + EC_OFFSET_MS;

export function buildAts(input: AtsBuildInput): AtsBuildResult {
  const period = atsPeriod(input.year, input.month, input.semestre);
  const warnings: string[] = [];
  const companyName = sanitizeRazonSocial(input.companyName);
  if (companyName.length < 5) warnings.push('La razón social de la empresa tiene menos de 5 letras o números (ficha p. 4).');

  // ── VENTAS: agregadas por cliente + tipo de comprobante + tipo de emisión ──
  interface VentaAgg {
    tpIdCliente: string; idCliente: string; tipoComprobante: string; tipoEmision: string;
    noObj: number; zero: number; grav: number; iva: number; n: number; formasPago: Set<string>;
    /** Retenido por el cliente en el periodo (centavos). */
    retIva: number; retRenta: number;
  }
  const ventas = new Map<string, VentaAgg>();
  const porEstab = new Map<string, number>();
  const sum = {
    facturas: 0, nc: 0, nd: 0,
    noObj: 0, zero: 0, grav: 0, iva: 0,
    enProceso: 0, rechazadas: 0, deLineas: 0,
  };

  const addVenta = (d: RawDoc, tipoComp: string, b: Bases, sign: 1 | -1) => {
    const idCliente = String(d['customerTaxId'] ?? '').trim().slice(0, 13);
    const tpId = tpIdCliente(idCliente, d['customerTaxIdType'], d['customerTaxIdCode']);
    const emision = tipoEmision(d['sriStatus']);
    const key = `${tpId}|${idCliente}|${tipoComp}|${emision}`;
    const cur = ventas.get(key) ?? {
      tpIdCliente: tpId, idCliente, tipoComprobante: tipoComp, tipoEmision: emision,
      noObj: 0, zero: 0, grav: 0, iva: 0, n: 0, formasPago: new Set<string>(), retIva: 0, retRenta: 0,
    };
    // En el detalle los valores van siempre positivos (ficha p. 4); la NC resta en los totales.
    // TODO(ATS): las ventas exentas (código 7) no tienen campo propio en el
    // detalle de ventas (ficha pp. 31-32); van con la base no objeto.
    cur.noObj += b.noObj + b.exe;
    cur.zero += b.zero;
    cur.grav += b.grav;
    cur.iva += b.iva;
    cur.n += 1;
    if (tipoComp === TIPO_COMPROBANTE.ventaFactura) {
      for (const pm of (Array.isArray(d['paymentMethods']) ? d['paymentMethods'] : []) as RawDoc[]) {
        const c = String(pm?.['code'] ?? '').trim();
        if (/^\d{2}$/.test(c)) cur.formasPago.add(c);
      }
    }
    ventas.set(key, cur);

    // totalVentas y ventasEstab: suma de las bases sin IVA (no objeto + 0 % +
    // distinta de 0 %), ficha p. 6; la NC resta. El exento va con no objeto.
    const base = b.noObj + b.exe + b.zero + b.grav;
    const estab = String(d['seriesEstablishment'] ?? '').trim() || parseDocNumber(d['fullNumber'])?.establecimiento || '';
    const codEstab = /^\d{3}$/.test(estab) ? estab : (input.defaultEstablishment || '001');
    porEstab.set(codEstab, (porEstab.get(codEstab) ?? 0) + sign * base);
    sum.noObj += sign * (b.noObj + b.exe);
    sum.zero += sign * b.zero;
    sum.grav += sign * b.grav;
    sum.iva += sign * b.iva;
  };

  const exportInvoices: RawDoc[] = [];
  for (const d of input.invoices) {
    if (!inPeriod(d['date'], period)) continue;
    const c = classifySale(d);
    if (c === 'ignored') continue;
    if (c === 'inProcess') { sum.enProceso++; continue; }
    if (c === 'rejected') { sum.rechazadas++; continue; }
    const { bases, fromLines } = saleBases(d);
    if (fromLines) sum.deLineas++;
    if (isCreditNote(d)) {
      addVenta(d, TIPO_COMPROBANTE.notaCredito, bases, -1);
      sum.nc++;
    } else {
      addVenta(d, TIPO_COMPROBANTE.ventaFactura, bases, 1);
      sum.facturas++;
      if (d['exportData']) exportInvoices.push(d);
    }
  }
  for (const d of input.debitNotes) {
    if (!inPeriod(d['date'], period)) continue;
    const c = classifySale(d);
    if (c === 'ignored') continue;
    if (c === 'inProcess') { sum.enProceso++; continue; }
    if (c === 'rejected') { sum.rechazadas++; continue; }
    // La ND no desglosa líneas: base e IVA del documento, con su tarifa.
    const b = emptyBases();
    const base = cents(d['totalSinImpuestos']);
    if (num(d['vatPct']) > 0 || cents(d['vatAmount']) > 0) b.grav = base;
    else b.zero = base;
    b.iva = cents(d['vatAmount']);
    addVenta(d, TIPO_COMPROBANTE.notaDebito, b, 1);
    sum.nd++;
  }
  if (sum.enProceso) warnings.push(`${sum.enProceso} comprobante(s) de venta todavía en camino al SRI: no entran en el ATS.`);
  if (sum.rechazadas) warnings.push(`${sum.rechazadas} comprobante(s) de venta rechazados por el SRI: no entran en el ATS.`);
  if (sum.deLineas) warnings.push(`${sum.deLineas} factura(s) o NC sin resumen de IVA: la base salió de las líneas (sin descuento global).`);

  // ── Retenciones RECIBIDAS de clientes (ficha p. 37: «el monto que el cliente
  // retuvo por IVA en el período que se informa») ──
  // Van por la fecha de la retención, no por la de la factura: una factura de
  // septiembre retenida en octubre se informa en octubre. Se suman al detalle
  // del mismo cliente, tipo 18 (factura) y tipo de emisión de la factura; si
  // ese cliente no tiene ventas en el periodo, sale un detalle con 0
  // comprobantes y bases en 0 (el XSD acepta numeroComprobantes = 0) y se avisa.
  const sumRR = { docs: 0, iva: 0, renta: 0, sinVentas: 0 };
  for (const r of input.receivedRetentions ?? []) {
    if (r['status'] !== 'registered' || r['isVoid'] === true) continue;
    if (!inPeriod(r['date'], period)) continue;
    const iva = Number.isInteger(r['ivaCents']) ? Number(r['ivaCents']) : cents(r['ivaRetained']);
    const renta = Number.isInteger(r['rentaCents']) ? Number(r['rentaCents']) : cents(r['rentaRetained']);
    if (iva + renta <= 0) continue;
    const idCliente = String(r['customerTaxId'] ?? '').trim().slice(0, 13);
    const tpId = tpIdCliente(idCliente, r['customerTaxIdType'], r['customerTaxIdCode']);
    const tipoComp = TIPO_COMPROBANTE.ventaFactura;
    const emision = tipoEmision(r['invoiceSriStatus'] ?? 'authorized');
    const key = `${tpId}|${idCliente}|${tipoComp}|${emision}`;
    let cur = ventas.get(key);
    if (!cur) {
      cur = {
        tpIdCliente: tpId, idCliente, tipoComprobante: tipoComp, tipoEmision: emision,
        noObj: 0, zero: 0, grav: 0, iva: 0, n: 0, formasPago: new Set<string>(), retIva: 0, retRenta: 0,
      };
      ventas.set(key, cur);
      sumRR.sinVentas++;
    }
    cur.retIva += iva;
    cur.retRenta += renta;
    sumRR.docs++;
    sumRR.iva += iva;
    sumRR.renta += renta;
  }
  if (sumRR.sinVentas) {
    warnings.push(`${sumRR.sinVentas} cliente(s) con retenciones recibidas en el periodo y sin ventas en él: se informan con 0 comprobantes.`);
  }

  // ── Establecimientos: todos los activos del RUC, con su total aunque sea 0 (ficha p. 37) ──
  const estabCodes = new Set<string>();
  for (const c of input.establishmentCodes) if (/^\d{3}$/.test(c)) estabCodes.add(c);
  if (!estabCodes.size) estabCodes.add(/^\d{3}$/.test(input.defaultEstablishment ?? '') ? input.defaultEstablishment! : '001');
  for (const c of porEstab.keys()) {
    if (!estabCodes.has(c)) {
      estabCodes.add(c);
      warnings.push(`Hay ventas del establecimiento ${c}, que no está registrado como activo: se incluyó igual.`);
    }
  }
  const estabRows: AtsVentaEstabRow[] = [...estabCodes].sort().map((codEstab) => ({
    codEstab, ventasEstab: toUsd(porEstab.get(codEstab) ?? 0), ivaComp: 0,
  }));
  const totalVentas = sum.noObj + sum.zero + sum.grav;

  // ── XML: cabecera (ficha pp. 4-6; orden del XSD, ivaType) ──
  const doc = create({ version: '1.0', encoding: 'ISO-8859-1' });
  const root = doc.ele('iva');
  addEl(root, 'TipoIDInformante', 'R');
  addEl(root, 'IdInformante', input.companyRuc);
  addEl(root, 'razonSocial', companyName);
  addEl(root, 'Anio', input.year);
  addEl(root, 'Mes', period.mesXml);
  // Semestral (RIMPE): regimenMicroempresa = SI, solo con mes 06 o 12 (ficha pp. 4-6).
  if (input.semestre) addEl(root, 'regimenMicroempresa', 'SI');
  addEl(root, 'numEstabRuc', pad(estabRows.length, 3));
  addEl(root, 'totalVentas', money(totalVentas));
  addEl(root, 'codigoOperativo', 'IVA');

  // ── COMPRAS: una fila por documento (ficha pp. 6-31) ──
  const comprasRows: AtsCompraRow[] = [];
  const sumC = { docs: 0, noObj: 0, zero: 0, grav: 0, exe: 0, iva: 0 };
  const sumR = { docs: new Set<string>(), iva: 0, renta: 0 };
  let retSinAutorizar = 0;
  let sinSustento = 0;
  let sinAutorizacion = 0;
  const purchases = input.purchases.filter((p) => inPeriod(p['date'], period) && isCountedPurchase(p));
  if (purchases.length) {
    const comprasEl = root.ele('compras');
    for (const p of purchases) {
      const d = comprasEl.ele('detalleCompras');
      const { establecimiento, puntoEmision, secuencial } = parseSupplierNumber(p['supplierInvoiceNumber']);
      const b = purchaseBases(p);
      sumC.docs++; sumC.noObj += b.noObj; sumC.zero += b.zero; sumC.grav += b.grav; sumC.exe += b.exe; sumC.iva += b.iva;

      const fechaDoc = toDate(p['supplierInvoiceDate']) ?? toDate(p['date']);
      const threshold = fechaDoc && fechaDoc.getTime() >= FORMA_PAGO_DESDE ? 50000 : 100000;
      const docTotal = b.noObj + b.zero + b.grav + b.exe + b.iva;
      const fp = String(p['paymentMethodCode'] ?? '').trim();
      const formaPago = /^\d{2}$/.test(fp) && docTotal > threshold ? fp : '';
      if (!fp && docTotal > threshold) {
        warnings.push(`Una compra de más de USD ${threshold / 100} no tiene forma de pago (ficha p. 24).`);
      }

      let autorizacion = digitsOnly(p['supplierAccessKey']) || digitsOnly(p['supplierAuthorizationNumber']);
      if (autorizacion.length < 3) {
        // TODO(ATS): sin clave de acceso ni autorización del proveedor; se usa
        // el número de su factura sin guiones. No es una autorización real.
        sinAutorizacion++;
        autorizacion = (digitsOnly(p['supplierInvoiceNumber']) || '0').padStart(3, '0');
      }
      autorizacion = autorizacion.slice(0, 49);

      const sustentoRaw = normalizeSustentoCode(p['sriSustentoCode']);
      if (!sustentoRaw) sinSustento++;
      const codSustento = sustentoRaw || DEFAULT_SRI_SUSTENTO_CODE;
      const tipoComp = pad(String(p['sriDocumentType'] ?? '').trim() || '01', 2);
      const idProv = String(p['supplierRuc'] ?? '').trim().slice(0, 13);
      const tpId = tpIdProv(p['supplierTaxIdType'], idProv);

      addEl(d, 'codSustento', codSustento);           // tabla 5 (p. 81)
      addEl(d, 'tpIdProv', tpId);                     // tabla 2 (p. 71)
      addEl(d, 'idProv', idProv);
      addEl(d, 'tipoComprobante', tipoComp);          // tabla 4 (pp. 79-80)
      // TODO(ATS): tipoProv y denoProv solo para tpIdProv 03 (ficha p. 15): el
      // modelo de compra no distingue persona natural de sociedad.
      addEl(d, 'parteRel', 'NO');                     // ficha p. 15; partes relacionadas: revisar a mano
      addEl(d, 'fechaRegistro', fmtDateEc(p['date']));
      addEl(d, 'establecimiento', establecimiento);
      addEl(d, 'puntoEmision', puntoEmision);
      addEl(d, 'secuencial', secuencial);
      addEl(d, 'fechaEmision', fmtDateEc(p['supplierInvoiceDate'] ?? p['date']));
      addEl(d, 'autorizacion', autorizacion);
      // Bases (ficha pp. 17-19): no objeto, 0 %, distinta de 0 %, exenta.
      addEl(d, 'baseNoGraIva', money(b.noObj));
      addEl(d, 'baseImponible', money(b.zero));
      addEl(d, 'baseImpGrav', money(b.grav));
      addEl(d, 'baseImpExe', money(b.exe));
      addEl(d, 'montoIce', money(0));
      addEl(d, 'montoIva', money(b.iva));

      // Retención: solo la ligada, emitida y autorizada. Sin ella, todo en 0
      // (antes se inventaba un 30 % con totalVatRetention).
      const retRaw = p['retentionId'] ? input.retentionsById[String(p['retentionId'])] : undefined;
      if (retRaw && !isCountedRetention(retRaw)) retSinAutorizar++;
      const ret = isCountedRetention(retRaw) ? retRaw : undefined;
      const ivaRet = { b10: 0, s20: 0, b30: 0, s50: 0, s70: 0, s100: 0 };
      const taxes: RawDoc[] = Array.isArray(ret?.['taxes']) ? ret!['taxes'] : [];
      for (const t of taxes) {
        if (String(t?.['taxCode'] ?? '').trim() !== '2') continue;
        const pct = Math.round(num(t?.['rate']) || IVA_RETENTION_PCT_BY_CODE[String(t?.['pctCode'] ?? '').trim()] || 0);
        const v = cents(t?.['retainedAmount']);
        switch (pct) {
          case 10: ivaRet.b10 += v; break;
          case 20: ivaRet.s20 += v; break;
          case 30: ivaRet.b30 += v; break;
          case 50: ivaRet.s50 += v; break;
          case 70: ivaRet.s70 += v; break;
          case 100: ivaRet.s100 += v; break;
          default: warnings.push(`Retención de IVA con un porcentaje que no está en la tabla 11 (${pct} %): no se informó.`);
        }
      }
      // Los seis van siempre: la ficha los marca obligatorios (pp. 7-8) y el XSD
      // exige valorRetBienes, valorRetServicios y valRetServ100.
      addEl(d, 'valRetBien10', money(ivaRet.b10));
      addEl(d, 'valRetServ20', money(ivaRet.s20));
      addEl(d, 'valorRetBienes', money(ivaRet.b30));
      addEl(d, 'valRetServ50', money(ivaRet.s50));
      addEl(d, 'valorRetServicios', money(ivaRet.s70));
      addEl(d, 'valRetServ100', money(ivaRet.s100));

      // Pago local (tabla 15, p. 84). En el XSD va dentro de <pagoExterior>.
      // TODO(ATS): pagos a no residentes (02) no se distinguen en el modelo de compra.
      const pe = d.ele('pagoExterior');
      addEl(pe, 'pagoLocExt', '01');
      addEl(pe, 'paisEfecPago', 'NA');
      addEl(pe, 'aplicConvDobTrib', 'NA');
      addEl(pe, 'pagExtSujRetNorLeg', 'NA');

      if (formaPago) addEl(d.ele('formasDePago'), 'formaPago', formaPago); // tabla 13 (p. 83)

      // Renta (ficha pp. 22-24). Sin retención de renta: concepto 332 «otras
      // compras y servicios no sujetas a retención» con 0 %, salvo que se pida
      // excluir esa línea informativa (la compra se informa igual).
      const irTaxes = taxes.filter((t) => String(t?.['taxCode'] ?? '').trim() === '1');
      const airRows: Array<{ cod: string; base: number; pct: number; val: number }> = [];
      for (const t of irTaxes) {
        const base = cents(t?.['taxableBase']);
        const val = cents(t?.['retainedAmount']);
        const pct = t?.['rate'] !== undefined && t?.['rate'] !== null
          ? num(t['rate'])
          : (base > 0 ? (val / base) * 100 : 0);
        airRows.push({ cod: String(t?.['pctCode'] ?? '').trim(), base, pct, val });
      }
      if (!airRows.length && !input.excluirInformativa332) {
        airRows.push({ cod: '332', base: b.noObj + b.zero + b.grav + b.exe, pct: 0, val: 0 });
      }
      if (airRows.length) {
        const airEl = d.ele('air');
        for (const a of airRows) {
          const da = airEl.ele('detalleAir');
          addEl(da, 'codRetAir', a.cod);
          addEl(da, 'baseImpAir', money(a.base));
          addEl(da, 'porcentajeAir', a.pct.toFixed(2));
          addEl(da, 'valRetAir', money(a.val));
        }
      }

      let retParts: { estab: string; pto: string; sec: string; aut: string; fecha: string } | null = null;
      if (ret) {
        const pn = parseDocNumber(ret['fullNumber']);
        const estab = pn?.establecimiento ?? String(ret['seriesEstablishment'] ?? '').padStart(3, '0');
        const pto = pn?.puntoEmision ?? String(ret['seriesEmissionPoint'] ?? '').padStart(3, '0');
        const sec = pn ? String(pn.secuencial) : String(parseInt(String(ret['number'] ?? ''), 10) || '');
        const aut = (digitsOnly(ret['authorizationNumber']) || digitsOnly(ret['accessKey'])).slice(0, 49);
        retParts = { estab, pto, sec, aut, fecha: fmtDateEc(ret['date']) };
        if (/^\d{3}$/.test(estab) && /^\d{3}$/.test(pto) && sec && aut.length >= 3) {
          addEl(d, 'estabRetencion1', estab);
          addEl(d, 'ptoEmiRetencion1', pto);
          addEl(d, 'secRetencion1', sec);
          addEl(d, 'autRetencion1', aut);
          addEl(d, 'fechaEmiRet1', retParts.fecha);
        } else {
          warnings.push('Una retención autorizada no tiene número o autorización completos: se omitió su serie.');
        }
        sumR.docs.add(String(p['retentionId']));
        sumR.iva += ivaRet.b10 + ivaRet.s20 + ivaRet.b30 + ivaRet.s50 + ivaRet.s70 + ivaRet.s100;
        sumR.renta += irTaxes.reduce((s, t) => s + cents(t?.['retainedAmount']), 0);
      }
      // TODO(ATS): una compra con tipo 04/05 (NC o ND del proveedor) exige
      // docModificado, estabModificado… (ficha p. 27); el modelo no los guarda.
      if (tipoComp === '04' || tipoComp === '05') {
        warnings.push('Hay una NC o ND de proveedor: completar a mano el comprobante que modifica (ficha p. 27).');
      }

      const baseRow = {
        codigoOper: '', codSustento, tpIdProv: tpId, idProv, parteRel: 'NO',
        tipoComprobante: tipoComp, fechaRegistro: fmtDateEc(p['date']),
        establecimiento, puntoEmision, secuencial,
        fechaEmision: fmtDateEc(p['supplierInvoiceDate'] ?? p['date']), autorizacion,
        baseNoGraIva: toUsd(b.noObj), baseImponible: toUsd(b.zero), baseImpGrav: toUsd(b.grav),
        baseImpExe: toUsd(b.exe), montoIce: 0, montoIva: toUsd(b.iva),
        valRetBien10: toUsd(ivaRet.b10), valRetServ20: toUsd(ivaRet.s20), valorRetBienes: toUsd(ivaRet.b30),
        valRetServ50: toUsd(ivaRet.s50), valorRetServicios: toUsd(ivaRet.s70), valRetServ100: toUsd(ivaRet.s100),
        pagoLocExt: '01', formaPago,
        estabRetencion: retParts?.estab ?? '', ptoEmiRetencion: retParts?.pto ?? '',
        secRetencion: retParts?.sec ?? '', autRetencion: retParts?.aut ?? '',
        fechaEmiRetencion: retParts?.fecha ?? '',
      };
      if (airRows.length) {
        for (const a of airRows) {
          comprasRows.push({ ...baseRow, codRetAir: a.cod, baseImpAir: toUsd(a.base), porcentajeAir: a.pct, valRetAir: toUsd(a.val) });
        }
      } else {
        comprasRows.push({ ...baseRow, codRetAir: '', baseImpAir: 0, porcentajeAir: 0, valRetAir: 0 });
      }
    }
  }
  if (retSinAutorizar) warnings.push(`${retSinAutorizar} compra(s) con una retención que no está autorizada por el SRI: se informaron sin retención.`);
  if (sinSustento) warnings.push(`${sinSustento} compra(s) sin sustento tributario: se informaron con 01.`);
  if (sinAutorizacion) warnings.push(`${sinAutorizacion} compra(s) sin clave de acceso ni autorización del proveedor: revisar el campo autorización.`);

  // ── VENTAS (ficha pp. 31-37; detalleVentasType del XSD) ──
  const ventasRows: AtsVentaRow[] = [];
  if (ventas.size) {
    const ventasEl = root.ele('ventas');
    for (const v of ventas.values()) {
      const d = ventasEl.ele('detalleVentas');
      addEl(d, 'tpIdCliente', v.tpIdCliente);
      addEl(d, 'idCliente', v.idCliente);
      // parteRelVtas (así se llama en el XSD): solo con 04, 05 y 06 (ficha p. 34).
      if (v.tpIdCliente !== '07') addEl(d, 'parteRelVtas', 'NO');
      addEl(d, 'tipoComprobante', v.tipoComprobante);
      addEl(d, 'tipoEmision', v.tipoEmision);
      addEl(d, 'numeroComprobantes', v.n);
      addEl(d, 'baseNoGraIva', money(v.noObj));
      addEl(d, 'baseImponible', money(v.zero));
      addEl(d, 'baseImpGrav', money(v.grav));
      addEl(d, 'montoIva', money(v.iva));
      addEl(d, 'montoIce', money(0));
      // Retenciones que le hizo este cliente en el periodo (ficha p. 37).
      addEl(d, 'valorRetIva', money(v.retIva));
      addEl(d, 'valorRetRenta', money(v.retRenta));
      if (v.formasPago.size) {
        const fp = d.ele('formasDePago');
        for (const c of [...v.formasPago].sort()) addEl(fp, 'formaPago', c);
      }
      ventasRows.push({
        tpIdCliente: v.tpIdCliente, idCliente: v.idCliente, parteRel: v.tpIdCliente !== '07' ? 'NO' : '',
        tipoComprobante: v.tipoComprobante, tipoEmision: v.tipoEmision, numeroComprobantes: v.n,
        baseNoGraIva: toUsd(v.noObj), baseImponible: toUsd(v.zero), baseImpGrav: toUsd(v.grav),
        montoIva: toUsd(v.iva), montoIce: 0, valorRetIva: toUsd(v.retIva), valorRetRenta: toUsd(v.retRenta),
      });
    }
  }

  // ── VENTAS POR ESTABLECIMIENTO (ficha p. 37): uno por establecimiento activo ──
  {
    const el = root.ele('ventasEstablecimiento');
    for (const r of estabRows) {
      const d = el.ele('ventaEst');
      addEl(d, 'codEstab', r.codEstab);
      addEl(d, 'ventasEstab', money(cents(r.ventasEstab)));
      addEl(d, 'ivaComp', money(0)); // Ley de Solidaridad (2016-2017): no aplica.
    }
  }

  // ── EXPORTACIONES (ficha pp. 38-45; orden de detalleExportacionesType) ──
  if (exportInvoices.length) {
    warnings.push('Hay facturas de exportación: revisar a mano su detalle en el ATS (tipo de exportación, país, refrendo).');
    const expEl = root.ele('exportaciones');
    for (const inv of exportInvoices) {
      const ex = inv['exportData'] as RawDoc;
      const pn = parseDocNumber(inv['fullNumber']);
      const d = expEl.ele('detalleExportaciones');
      addEl(d, 'tpIdClienteEx', tpIdClienteEx(inv['customerTaxId'], inv['customerTaxIdType']));
      addEl(d, 'idClienteEx', String(inv['customerTaxId'] ?? '').trim().slice(0, 13));
      addEl(d, 'parteRelExp', 'NO');
      // TODO(ATS): tipoRegi, país y demás datos del exterior (ficha pp. 39-42) no
      // están en el modelo; exportacionDe (tabla 10) sale del documento.
      // Tabla 10 (p. 82): 01 con refrendo, 02 sin refrendo, 03 servicios. Antes el
      // respaldo era '05', que no existe.
      const expDe = String(ex?.['exportType'] ?? '').trim();
      addEl(d, 'exportacionDe', ['01', '02', '03'].includes(expDe) ? expDe : (ex?.['customsDistrict'] ? '01' : '02'));
      addEl(d, 'tipoComprobante', TIPO_COMPROBANTE.factura);
      if (ex?.['customsDistrict']) addEl(d, 'distAduanero', ex['customsDistrict']);
      if (ex?.['customsYear']) addEl(d, 'anio', ex['customsYear']);
      if (ex?.['customsRegime']) addEl(d, 'regimen', ex['customsRegime']);
      if (ex?.['customsCorrelative']) addEl(d, 'correlativo', ex['customsCorrelative']);
      if (ex?.['customsVerifier']) addEl(d, 'verificador', ex['customsVerifier']);
      if (ex?.['transportDoc']) addEl(d, 'docTransp', ex['transportDoc']);
      addEl(d, 'fechaEmbarque', fmtDateEc(ex?.['shipmentDate'] ?? inv['date']));
      if (ex?.['fue']) addEl(d, 'fue', ex['fue']);
      addEl(d, 'valorFOB', money(cents(ex?.['fobValue'])));
      addEl(d, 'valorFOBComprobante', money(cents(ex?.['fobValue'])));
      addEl(d, 'establecimiento', pn?.establecimiento ?? '001');
      addEl(d, 'puntoEmision', pn?.puntoEmision ?? '001');
      addEl(d, 'secuencial', pn?.secuencial ?? 1);
      addEl(d, 'autorizacion', (digitsOnly(inv['authorizationNumber']) || digitsOnly(inv['accessKey']) || '9999999999').slice(0, 49));
      addEl(d, 'fechaEmision', fmtDateEc(inv['date']));
    }
  }

  // ── ANULADOS (ficha pp. 45-46): solo comprobantes PROPIOS ──
  // Facturas, NC, ND y retenciones emitidas que se anularon en el periodo y que
  // llegaron a existir (el SRI los autorizó o no hacía falta). Las compras no:
  // son comprobantes del proveedor. La ficha excluye los dados de baja en SRI en
  // línea; Conecta y FacturaEc no lo hacen allí (solo marcan anulado), por eso
  // se informan.
  const voided: VoidedRef[] = [];
  const pushVoided = (d: RawDoc, tipo: string) => {
    if (!inPeriod(d['voidedAt'], period) || !isVoidDoc(d)) return;
    if (!COUNTED_SRI_STATUSES.has(String(d['sriStatus'] ?? ''))) return;
    const pn = parseDocNumber(d['fullNumber'])
      ?? (d['seriesEstablishment'] && d['number']
        ? parseDocNumber(`${pad(d['seriesEstablishment'], 3)}-${pad(d['seriesEmissionPoint'] ?? '001', 3)}-${d['number']}`)
        : null);
    if (!pn) return;
    // TODO(ATS): un comprobante sin autorización (no electrónico) no tiene
    // número que informar; se completa con nueves como pide la ficha (p. 17)
    // para los comprobantes sin numeración.
    const aut = (digitsOnly(d['authorizationNumber']) || digitsOnly(d['accessKey']) || '9999999999').slice(0, 49);
    voided.push({ tipoComprobante: tipo, establecimiento: pn.establecimiento, puntoEmision: pn.puntoEmision, secuencial: pn.secuencial, autorizacion: aut });
  };
  for (const d of input.voidedInvoices) pushVoided(d, isCreditNote(d) ? TIPO_COMPROBANTE.notaCredito : TIPO_COMPROBANTE.factura);
  for (const d of input.voidedDebitNotes) pushVoided(d, TIPO_COMPROBANTE.notaDebito);
  for (const d of input.voidedRetentions) pushVoided(d, TIPO_COMPROBANTE.retencion);
  const anuladosRows = buildAnuladosRows(voided);
  if (anuladosRows.length) {
    const el = root.ele('anulados');
    for (const r of anuladosRows) {
      const d = el.ele('detalleAnulados');
      addEl(d, 'tipoComprobante', r.tipoComprobante);
      addEl(d, 'establecimiento', r.establecimiento);
      addEl(d, 'puntoEmision', r.puntoEmision);
      addEl(d, 'secuencialInicio', r.secuencialInicio);
      addEl(d, 'secuencialFin', r.secuencialFin);
      addEl(d, 'autorizacion', r.autorizacion);
    }
  }

  const xml = doc.end({ prettyPrint: true });
  const excelData: AtsExcelData = {
    companyRuc: input.companyRuc, companyName,
    year: input.year, mesXml: period.mesXml,
    numEstabRuc: estabRows.length,
    totalVentas: toUsd(totalVentas),
    compras: comprasRows, ventas: ventasRows, ventasEstab: estabRows, anulados: anuladosRows,
  };
  const summary: AtsSummary = {
    ventas: {
      facturas: sum.facturas, notasCredito: sum.nc, notasDebito: sum.nd,
      baseTotal: toUsd(totalVentas), baseNoGraIva: toUsd(sum.noObj), baseImponible: toUsd(sum.zero),
      baseImpGrav: toUsd(sum.grav), montoIva: toUsd(sum.iva),
    },
    compras: {
      documentos: sumC.docs, baseNoGraIva: toUsd(sumC.noObj), baseImponible: toUsd(sumC.zero),
      baseImpGrav: toUsd(sumC.grav), baseImpExe: toUsd(sumC.exe), montoIva: toUsd(sumC.iva),
    },
    retenciones: { documentos: sumR.docs.size, iva: toUsd(sumR.iva), renta: toUsd(sumR.renta) },
    retencionesRecibidas: { documentos: sumRR.docs, iva: toUsd(sumRR.iva), renta: toUsd(sumRR.renta) },
    anulados: { documentos: voided.length, rangos: anuladosRows.length },
    excluidas: { enProceso: sum.enProceso, rechazadas: sum.rechazadas },
  };
  return { xml, filenameBase: `AT${period.mesXml}${input.year}`, excelData, summary, warnings: [...new Set(warnings)] };
}

// ─── Anulados en rangos contiguos ────────────────────────────────────────────

interface VoidedRef {
  tipoComprobante: string; establecimiento: string; puntoEmision: string;
  secuencial: number; autorizacion: string;
}

/**
 * Colapsa los anulados en rangos de secuenciales seguidos por tipo, serie y
 * autorización (ficha p. 46: «se considerarán anulados los comprobantes que
 * consten dentro del rango»). Con autorizaciones distintas (electrónicos: una
 * por comprobante) no se juntan, porque el registro lleva una sola.
 */
export function buildAnuladosRows(voided: VoidedRef[]): AtsAnuladoRow[] {
  const rows: AtsAnuladoRow[] = [];
  const groups = new Map<string, VoidedRef[]>();
  for (const v of voided) {
    const key = `${v.tipoComprobante}|${v.establecimiento}|${v.puntoEmision}|${v.autorizacion}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }
  for (const refs of groups.values()) {
    refs.sort((a, b) => a.secuencial - b.secuencial);
    let start = refs[0];
    let end = refs[0];
    const flush = () => rows.push({
      tipoComprobante: start.tipoComprobante, establecimiento: start.establecimiento,
      puntoEmision: start.puntoEmision, secuencialInicio: start.secuencial,
      secuencialFin: end.secuencial, autorizacion: start.autorizacion,
    });
    for (let i = 1; i < refs.length; i++) {
      if (refs[i].secuencial === end.secuencial) continue;
      if (refs[i].secuencial === end.secuencial + 1) { end = refs[i]; continue; }
      flush();
      start = refs[i];
      end = refs[i];
    }
    flush();
  }
  return rows.sort((a, b) =>
    a.tipoComprobante.localeCompare(b.tipoComprobante) ||
    a.establecimiento.localeCompare(b.establecimiento) ||
    a.puntoEmision.localeCompare(b.puntoEmision) ||
    a.secuencialInicio - b.secuencialInicio);
}
