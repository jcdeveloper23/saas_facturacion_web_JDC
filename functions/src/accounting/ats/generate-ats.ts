import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { create } from 'xmlbuilder2';
import JSZip from 'jszip';
import { requireCompanyRole } from '../../utils/callable-auth';
import { mapTipoIdentificacion } from '../../utils/sri-buyer-id';

/**
 * tpIdProv (compras) usa una tabla DISTINTA a tpIdCliente (ventas) — confirmado
 * contra el ejemplo oficial del SRI (descargas.sri.gob.ec/.../Ejemplo de archivo
 * en XML.xml): tpIdProv=01 para un RUC, tpIdProv=03 para un proveedor extranjero
 * sin RUC/cédula. tpIdCliente en cambio usa 04=RUC/05=Cédula/etc (la misma tabla
 * de comprobantes electrónicos, ver mapTipoIdentificacion). No usar
 * mapTipoIdentificacion() para proveedores — da el código equivocado.
 */
function mapTipoIdentificacionProveedor(type: string | undefined): string {
  const t = (type ?? '').trim().toUpperCase();
  if (t === 'RUC' || t === '01' || t === '04') return '01';
  if (t === 'CI' || t === 'CEDULA' || t === '02' || t === '05') return '02';
  if (t === 'PASAPORTE' || t === 'EXTERIOR' || t === '03' || t === '06' || t === '08') return '03';
  return '01';
}

// ─── Types (mirrored from frontend models to avoid cross-module imports) ──────
// Ver src/app/features/{invoices,debit-notes,purchases,retentions}/models/*.interface.ts

interface InvoiceLine {
  vatPct: number;
  vatAmount: number;
  subtotal: number;
  sriTaxCode?: string; // '2'=IVA 0%, '3'=IVA 15%, '5'=IVA 5%, '6'=Exento
}

interface InvoiceExportData {
  exportType: string;
  destinationCountry: string;
  shipmentDate: admin.firestore.Timestamp;
  fobValue: number;
  customsDistrict?: string;
  customsYear?: string;
  customsRegime?: string;
  customsCorrelative?: string;
  customsVerifier?: string;
  transportDoc?: string;
  fue?: string;
}

interface InvoiceDoc {
  seriesEstablishment: string;
  seriesEmissionPoint: string;
  fullNumber: string;
  date: admin.firestore.Timestamp;
  customerTaxId: string;
  customerTaxIdType: string;
  netAmount: number;
  vatAmount: number;
  total: number;
  lines: InvoiceLine[];
  isVoid: boolean;
  voidedAt?: admin.firestore.Timestamp;
  isCreditNote: boolean;
  sriStatus?: string;
  accessKey?: string;
  authorizationNumber?: string;
  exportData?: InvoiceExportData;
}

interface DebitNoteDoc {
  seriesEstablishment: string;
  seriesEmissionPoint: string;
  fullNumber: string;
  date: admin.firestore.Timestamp;
  customerTaxId: string;
  customerTaxIdType: string;
  totalSinImpuestos: number;
  vatAmount: number;
  total: number;
  isVoid: boolean;
  voidedAt?: admin.firestore.Timestamp;
  sriStatus?: string;
  accessKey?: string;
  authorizationNumber?: string;
}

interface PurchaseLineDoc {
  taxRate: number; // 0 o 15
  subtotal: number;
  taxAmount: number;
}

interface PurchaseDoc {
  supplierInvoiceNumber: string;
  supplierInvoiceDate: admin.firestore.Timestamp;
  supplierAccessKey?: string;
  supplierRuc: string;
  supplierTaxIdType: string;
  sriDocumentType: string;
  sriSustentoCode: string;
  paymentMethodCode?: string;
  date: admin.firestore.Timestamp;
  lines: PurchaseLineDoc[];
  subtotal: number;
  totalTax: number;
  totalIrRetention: number;
  totalVatRetention: number;
  status: string;
  voidedAt?: admin.firestore.Timestamp;
  retentionId?: string;
}

interface RetentionTaxDoc {
  taxCode: string;   // '1'=IR, '2'=IVA, '6'=ISD
  pctCode: string;
  rate?: number;     // porcentaje almacenado (igual al catálogo SRI) — usado en porcentajeAir
  taxableBase: number;
  retainedAmount: number;
}

interface RetentionDoc {
  seriesEstablishment: string;
  seriesEmissionPoint: string;
  number: number;
  date: admin.firestore.Timestamp;
  authorizationNumber?: string;
  taxes: RetentionTaxDoc[];
}

// ─── Input/output contract ──────────────────────────────────────────────────

interface GenerateAtsInput {
  companyId: string;
  year:      number;
  month:     number; // 1-12 (mensual) — para semestral: 6=S1, 12=S2
  semestre?: 1 | 2; // undefined = mensual; 1 = Enero-Junio, 2 = Julio-Diciembre
  excluirInformativa332?: boolean; // omite compras sin retención asignada del detalle air
  includeExcelData?: boolean;      // cuando true, incluye AtsExcelData en el resultado
}

interface GenerateAtsResult {
  zip:        string; // base64
  filename:   string;
  excelData?: AtsExcelData; // presente cuando includeExcelData=true
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pad(n: string | number, len: number): string {
  return String(n).padStart(len, '0');
}

function fmtDate(ts: admin.firestore.Timestamp | undefined): string {
  if (!ts) return '';
  const d = ts.toDate();
  return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()}`;
}

function money(n: number | undefined): string {
  return (n ?? 0).toFixed(2);
}

/** autorizacionType exige solo dígitos ([0-9]{3,49}) — nunca pasar un valor con guiones. */
function digitsOnly(s: string | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/**
 * Parsea un número de comprobante en formato SRI "001-001-000000123" a sus
 * 3 partes. Si el string no matchea el formato (ej. numeración libre de un
 * proveedor sin punto de venta electrónico), cae a valores por defecto en
 * vez de fallar — el ATS necesita los 3 campos igual, aunque sean aproximados.
 */
function parseDocNumber(fullNumber: string | undefined): { establecimiento: string; puntoEmision: string; secuencial: string } {
  const m = (fullNumber ?? '').match(/^(\d{3})-(\d{3})-(\d{1,9})$/);
  if (m) {
    return { establecimiento: m[1], puntoEmision: m[2], secuencial: String(parseInt(m[3], 10)) };
  }
  // Fallback: busca los últimos dígitos como secuencial, resto fijo en 001
  const digits = (fullNumber ?? '').replace(/\D/g, '');
  const secuencial = digits ? String(parseInt(digits.slice(-9), 10) || 1) : '1';
  return { establecimiento: '001', puntoEmision: '001', secuencial };
}

function ele(parent: any, tag: string): any {
  return parent.ele(tag);
}

/** Agrega un elemento de texto solo si el valor no está vacío (campos opcionales del schema). */
function addOpt(parent: any, tag: string, value: string | number | undefined | null): void {
  if (value === undefined || value === null || value === '') return;
  ele(parent, tag).txt(String(value));
}

/** Agrega un elemento de texto siempre, con fallback si falta (campos obligatorios del schema). */
function addReq(parent: any, tag: string, value: string | number | undefined | null, fallback = ''): void {
  ele(parent, tag).txt(String(value ?? fallback));
}

// ─── Cross-document type used for anulados (rangos contiguos) ────────────────

interface VoidedRef {
  tipoComprobante: string;
  establecimiento: string;
  puntoEmision:    string;
  secuencial:      number;
  autorizacion:    string;
}

// ─── ATS Excel data rows (shared between XML and Excel to guarantee consistency) ─

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

/** Colapsa VoidedRef[] en rangos contiguos → AtsAnuladoRow[] (compartido entre XML y Excel). */
function buildAnuladosRows(voided: VoidedRef[]): AtsAnuladoRow[] {
  const rows: AtsAnuladoRow[] = [];
  if (!voided.length) return rows;

  // Agrupa por (tipoComprobante, establecimiento, puntoEmision) y colapsa
  // secuenciales consecutivos en rangos — así es como lo modela el XSD
  // (detalleAnuladosType: secuencialInicio/secuencialFin, no un registro
  // por comprobante).
  const groups = new Map<string, VoidedRef[]>();
  for (const v of voided) {
    const key = `${v.tipoComprobante}|${v.establecimiento}|${v.puntoEmision}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  for (const [, refs] of groups) {
    refs.sort((a, b) => a.secuencial - b.secuencial);
    let rangeStart = refs[0];
    let rangeEnd   = refs[0];

    const flush = () => {
      rows.push({
        tipoComprobante: rangeStart.tipoComprobante,
        establecimiento: rangeStart.establecimiento,
        puntoEmision:    rangeStart.puntoEmision,
        secuencialInicio: rangeStart.secuencial,
        secuencialFin:    rangeEnd.secuencial,
        autorizacion:    rangeStart.autorizacion,
      });
    };

    for (let i = 1; i < refs.length; i++) {
      if (refs[i].secuencial === rangeEnd.secuencial + 1) {
        rangeEnd = refs[i];
      } else {
        flush();
        rangeStart = refs[i];
        rangeEnd   = refs[i];
      }
    }
    flush();
  }
  return rows;
}

function buildAnulados(root: any, voided: VoidedRef[]): AtsAnuladoRow[] {
  const rows = buildAnuladosRows(voided);
  if (!rows.length) return rows;
  const anuladosEl = ele(root, 'anulados');
  for (const row of rows) {
    const d = ele(anuladosEl, 'detalleAnulados');
    addReq(d, 'tipoComprobante', row.tipoComprobante);
    addReq(d, 'establecimiento', row.establecimiento);
    addReq(d, 'puntoEmision',    row.puntoEmision);
    addReq(d, 'secuencialInicio', row.secuencialInicio);
    addReq(d, 'secuencialFin',    row.secuencialFin);
    addOpt(d, 'autorizacion', row.autorizacion);
  }
  return rows;
}

// ─── Main callable ─────────────────────────────────────────────────────────────

export const generateAts = onCall<GenerateAtsInput>(
  { timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    const { companyId, year, month, semestre, excluirInformativa332, includeExcelData } = request.data;
    console.log('[generateAts] Solicitud:', { companyId, year, month, semestre, excluirInformativa332 });

    if (!companyId || !year || !month || month < 1 || month > 12) {
      throw new HttpsError('invalid-argument', 'companyId, year y month (1-12) son requeridos');
    }
    if (semestre !== undefined && semestre !== 1 && semestre !== 2) {
      throw new HttpsError('invalid-argument', 'semestre debe ser 1 (Enero-Junio) o 2 (Julio-Diciembre)');
    }

    // Mismo criterio de acceso que generateAccountingPdf — el ATS expone RUC,
    // razón social y el detalle completo de compras/ventas del mes.
    requireCompanyRole(request, companyId, ['admin', 'accountant']);

    const db = admin.firestore();

    const companySnap = await db.doc(`companies/${companyId}`).get();
    const company      = companySnap.data() as Record<string, any> | undefined;
    const companyName  = company?.['name'] ?? company?.['businessName'] ?? '';
    const companyRuc   = String(company?.['taxId'] ?? company?.['ruc'] ?? '');
    console.log('[generateAts] Empresa:', { companyName, companyRuc });

    if (!/^\d{10}001$/.test(companyRuc)) {
      // IdInformante del ATS exige el RUC matriz (termina en 001) — si la empresa
      // tiene un RUC de establecimiento o el dato está mal cargado, el SRI
      // rechazará el archivo. Se detiene acá con un mensaje claro en vez de
      // generar un ATS que fallará en la validación del SRI.
      throw new HttpsError(
        'failed-precondition',
        `El RUC de la empresa ("${companyRuc}") no tiene el formato de RUC matriz (10 dígitos + 001). Verifique el RUC en la configuración de la empresa antes de generar el ATS.`
      );
    }

    // ── Rango de fechas y campo Mes del XML ───────────────────────────────────
    // Semestral S1: Enero-Junio (Mes=06), S2: Julio-Diciembre (Mes=12).
    // Mensual: usa el mes recibido tal cual.
    let periodStart: Date;
    let periodEnd:   Date;
    let mesXml:      string;

    if (semestre === 1) {
      periodStart = new Date(year, 0, 1, 0, 0, 0);      // 1 Ene
      periodEnd   = new Date(year, 6, 1, 0, 0, 0);      // 1 Jul exclusivo
      mesXml      = '06';
    } else if (semestre === 2) {
      periodStart = new Date(year, 6, 1, 0, 0, 0);      // 1 Jul
      periodEnd   = new Date(year + 1, 0, 1, 0, 0, 0);  // 1 Ene año siguiente exclusivo
      mesXml      = '12';
    } else {
      periodStart = new Date(year, month - 1, 1, 0, 0, 0);
      periodEnd   = new Date(year, month,     1, 0, 0, 0); // exclusivo
      mesXml      = pad(month, 2);
    }

    const tsStart = admin.firestore.Timestamp.fromDate(periodStart);
    const tsEnd   = admin.firestore.Timestamp.fromDate(periodEnd);

    const invoicesCol   = db.collection(`companies/${companyId}/invoices`);
    const debitNotesCol = db.collection(`companies/${companyId}/debitNotes`);
    const purchasesCol  = db.collection(`companies/${companyId}/purchases`);
    const retentionsCol = db.collection(`companies/${companyId}/retentions`);

    const [
      invoicesByDateSnap, invoicesByVoidSnap,
      debitNotesByDateSnap, debitNotesByVoidSnap,
      purchasesByDateSnap, purchasesByVoidSnap,
    ] = await Promise.all([
      invoicesCol.where('date', '>=', tsStart).where('date', '<', tsEnd).get(),
      invoicesCol.where('voidedAt', '>=', tsStart).where('voidedAt', '<', tsEnd).get(),
      debitNotesCol.where('date', '>=', tsStart).where('date', '<', tsEnd).get(),
      debitNotesCol.where('voidedAt', '>=', tsStart).where('voidedAt', '<', tsEnd).get(),
      purchasesCol.where('date', '>=', tsStart).where('date', '<', tsEnd).get(),
      purchasesCol.where('voidedAt', '>=', tsStart).where('voidedAt', '<', tsEnd).get(),
    ]);

    const invoices     = invoicesByDateSnap.docs.map(d => d.data() as InvoiceDoc);
    const debitNotes   = debitNotesByDateSnap.docs.map(d => d.data() as DebitNoteDoc);
    const purchases    = purchasesByDateSnap.docs.map(d => ({ id: d.id, ...(d.data() as PurchaseDoc) }));

    console.log('[generateAts] Documentos consultados en el mes:', {
      invoices: invoices.length,
      invoicesVoidedThisMonth: invoicesByVoidSnap.size,
      debitNotes: debitNotes.length,
      debitNotesVoidedThisMonth: debitNotesByVoidSnap.size,
      purchases: purchases.length,
      purchasesVoidedThisMonth: purchasesByVoidSnap.size,
    });
    console.log('[generateAts] Detalle facturas:', invoices.map(i => ({
      fullNumber: i.fullNumber, date: fmtDate(i.date), customerTaxId: i.customerTaxId,
      customerTaxIdType: i.customerTaxIdType, total: i.total, isVoid: i.isVoid,
      isCreditNote: i.isCreditNote, sriStatus: i.sriStatus, hasExportData: !!i.exportData,
    })));
    console.log('[generateAts] Detalle notas de débito:', debitNotes.map(d => ({
      fullNumber: d.fullNumber, date: fmtDate(d.date), customerTaxId: d.customerTaxId,
      total: d.total, isVoid: d.isVoid, sriStatus: d.sriStatus,
    })));
    console.log('[generateAts] Detalle compras:', purchases.map(p => ({
      id: p.id, supplierInvoiceNumber: p.supplierInvoiceNumber, date: fmtDate(p.date),
      supplierRuc: p.supplierRuc, supplierTaxIdType: p.supplierTaxIdType,
      sriDocumentType: p.sriDocumentType, sriSustentoCode: p.sriSustentoCode,
      status: p.status, retentionId: p.retentionId ?? null,
    })));

    // ─── VENTAS — agregado por cliente + tipoComprobante + tipoEmision ────────
    // (numeroComprobantes confirma que el schema espera filas agregadas, no
    // una por factura — ver ats.xsd, detalleVentasType)
    interface VentaAgg {
      tpIdCliente: string; idCliente: string; tipoComprobante: string; tipoEmision: string;
      baseNoGraIva: number; // exento / no objeto de IVA
      baseImponible: number; // tarifa 0% IVA
      baseImpGrav: number;   // tarifa IVA > 0%
      montoIva: number; numeroComprobantes: number;
    }
    const ventasMap = new Map<string, VentaAgg>();
    const establecimientoTotals = new Map<string, number>();
    let totalVentasSum = 0;

    // baseNoObj = exento/no objeto IVA; base0 = tarifa 0%; baseGrav = tarifa IVA > 0%
    const addVenta = (
      tpIdCliente: string, idCliente: string, tipoComprobante: string,
      tipoEmision: string, baseNoObj: number, base0: number, baseGrav: number, iva: number,
      establecimiento: string
    ) => {
      const key = `${tpIdCliente}|${idCliente}|${tipoComprobante}|${tipoEmision}`;
      const cur = ventasMap.get(key) ?? {
        tpIdCliente, idCliente, tipoComprobante, tipoEmision,
        baseNoGraIva: 0, baseImponible: 0, baseImpGrav: 0, montoIva: 0, numeroComprobantes: 0
      };
      cur.baseNoGraIva  += baseNoObj;
      cur.baseImponible += base0;
      cur.baseImpGrav   += baseGrav;
      cur.montoIva      += iva;
      cur.numeroComprobantes += 1;
      ventasMap.set(key, cur);

      const docTotal = baseNoObj + base0 + baseGrav + iva;
      establecimientoTotals.set(establecimiento, (establecimientoTotals.get(establecimiento) ?? 0) + docTotal);
      totalVentasSum += docTotal;
    };

    // tipoEmision: 'F' = facturación electrónica, 'E' = emisión física/no-SRI.
    // Ver ats.xsd tipoEmisionType — se infiere de sriStatus porque el ATS no
    // tiene un campo propio que lo indique. Usar allowlist explícita (no
    // "todo lo que no sea 'not_required' es F") — hay varios estados que
    // significan "no se generó comprobante electrónico" además de
    // 'not_required': 'plan_feature_disabled' y 'plan_limit_reached' (el plan
    // de la empresa no tiene/agotó la facturación electrónica). Con solo
    // excluir 'not_required', esos quedaban mal clasificados como 'F' — se
    // detectó con los logs de debug: 2 facturas 'plan_feature_disabled' se
    // separaban de las 5 'not_required' del mismo cliente en vez de agruparse.
    const SRI_ELECTRONIC_STATUSES = new Set(['pending', 'xml_generated', 'signed', 'authorized', 'rejected']);
    const emisionTipo = (sriStatus: string | undefined) =>
      sriStatus && SRI_ELECTRONIC_STATUSES.has(sriStatus) ? 'F' : 'E';

    for (const inv of invoices) {
      if (inv.isVoid) continue;
      let baseGrav = 0, base0 = 0, baseNoObj = 0, iva = 0;
      for (const line of inv.lines ?? []) {
        if ((line.vatPct ?? 0) > 0) {
          baseGrav += line.subtotal;
          iva += line.vatAmount;
        } else if (line.sriTaxCode === '6') {
          baseNoObj += line.subtotal; // exento de IVA
        } else {
          base0 += line.subtotal;    // tarifa 0%
        }
      }
      const tipoComprobante = inv.isCreditNote ? '04' : '01';
      addVenta(
        mapTipoIdentificacion(inv.customerTaxIdType), inv.customerTaxId,
        tipoComprobante, emisionTipo(inv.sriStatus),
        baseNoObj, base0, baseGrav, iva, inv.seriesEstablishment
      );
    }
    for (const dn of debitNotes) {
      if (dn.isVoid) continue;
      // DebitNote no desglosa líneas — se asume todo gravado (mora, interés, etc.)
      addVenta(
        mapTipoIdentificacion(dn.customerTaxIdType), dn.customerTaxId,
        '02', emisionTipo(dn.sriStatus),
        0, 0, dn.totalSinImpuestos, dn.vatAmount, dn.seriesEstablishment
      );
    }

    console.log('[generateAts] Agregación de ventas (filas del XML):', [...ventasMap.values()]);
    console.log('[generateAts] Ventas por establecimiento:', Object.fromEntries(establecimientoTotals));
    console.log('[generateAts] totalVentas:', totalVentasSum.toFixed(2), 'numEstabRuc:', establecimientoTotals.size || 1);

    // ─── XML root ────────────────────────────────────────────────────────────
    // Orden de elementos EXACTO al del ejemplo oficial del SRI — el schema es
    // tipo "sequence" (no "all"), así que un orden distinto hace que el SRI
    // rechace el archivo aunque todos los datos sean correctos.
    const doc  = create({ version: '1.0', encoding: 'ISO-8859-1' });
    const root = doc.ele('iva');

    addReq(root, 'TipoIDInformante', 'R');
    addReq(root, 'IdInformante', companyRuc);
    addReq(root, 'razonSocial', companyName);
    addReq(root, 'Anio', year);
    addReq(root, 'Mes', mesXml);
    // numEstabRuc: aproximado como la cantidad de establecimientos con ventas
    // este mes (no hay en el sistema un catálogo de "establecimientos totales
    // registrados en el RUC" independiente de la actividad real).
    addReq(root, 'numEstabRuc', pad(establecimientoTotals.size || 1, 3));
    addReq(root, 'totalVentas', money(totalVentasSum));
    addReq(root, 'codigoOperativo', 'IVA');

    // ─── COMPRAS — una fila por documento (no se agrega, ver ats.xsd) ─────────
    const allActivePurchases = purchases.filter(p => p.status !== 'cancelled');
    // excluirInformativa332: omite compras sin retención vinculada (que en el ATS
    // se reportarían con codRetAir 332 "sin retención"). Útil para simplificar el
    // archivo cuando la empresa tiene muchas compras no sujetas a retención.
    const activePurchases = excluirInformativa332
      ? allActivePurchases.filter(p => !!p.retentionId)
      : allActivePurchases;
    // formaPago threshold: >$500 desde 2023-12-20, >$1000 antes (Resolución SRI NAC-DGERCGC23-00000052)
    const FORMA_PAGO_DATE_SUP = new Date(2023, 11, 20); // 2023-12-20

    const comprasRows: AtsCompraRow[] = [];

    if (activePurchases.length) {
      const comprasEl = ele(root, 'compras');

      // Pre-carga las retenciones vinculadas (para estabRetencion1/etc.)
      const retentionIds = [...new Set(activePurchases.map(p => p.retentionId).filter(Boolean))] as string[];
      const retentionDocs = new Map<string, RetentionDoc>();
      await Promise.all(retentionIds.map(async id => {
        const snap = await retentionsCol.doc(id).get();
        if (snap.exists) retentionDocs.set(id, snap.data() as RetentionDoc);
      }));

      for (const p of activePurchases) {
        const d = ele(comprasEl, 'detalleCompras');
        const { establecimiento, puntoEmision, secuencial } = parseDocNumber(p.supplierInvoiceNumber);

        let baseImpGrav = 0, baseNoGraIva = 0, montoIva = 0;
        for (const line of p.lines ?? []) {
          if ((line.taxRate ?? 0) > 0) { baseImpGrav += line.subtotal; montoIva += line.taxAmount; }
          else baseNoGraIva += line.subtotal;
        }

        const docDateForFp = (p.supplierInvoiceDate ?? p.date)?.toDate() ?? new Date();
        const fpThreshold  = docDateForFp >= FORMA_PAGO_DATE_SUP ? 500 : 1000;
        const docTotal     = (p.subtotal ?? 0) + (p.totalTax ?? 0);
        const formaPagoVal = p.paymentMethodCode && docTotal > fpThreshold ? p.paymentMethodCode : '';

        const autorizacion = digitsOnly(p.supplierAccessKey) || digitsOnly(p.supplierInvoiceNumber) || '000';

        addReq(d, 'codSustento', p.sriSustentoCode, '01');
        addReq(d, 'tpIdProv', mapTipoIdentificacionProveedor(p.supplierTaxIdType));
        addReq(d, 'idProv', p.supplierRuc);
        addReq(d, 'tipoComprobante', p.sriDocumentType, '01');
        // parteRel: obligatorio — 'NO' por defecto; verificar manualmente si
        // hay transacciones con partes relacionadas (Art. 4 LRTI).
        addReq(d, 'parteRel', 'NO');
        addReq(d, 'fechaRegistro', fmtDate(p.date));
        addReq(d, 'establecimiento', establecimiento);
        addReq(d, 'puntoEmision', puntoEmision);
        addReq(d, 'secuencial', secuencial);
        addReq(d, 'fechaEmision', fmtDate(p.supplierInvoiceDate));
        // autorizacion exige solo dígitos — si no hay clave de acceso SRI
        // capturada (compra de un proveedor sin factura electrónica), se cae al
        // N° de factura sin guiones. No es un número de autorización real —
        // si el proveedor imprime uno propio en la factura física, corregir
        // manualmente antes de presentar.
        addReq(d, 'autorizacion', autorizacion);
        addReq(d, 'baseNoGraIva', money(baseNoGraIva));
        addReq(d, 'baseImponible', money(baseImpGrav + baseNoGraIva));
        addReq(d, 'baseImpGrav', money(baseImpGrav));
        // baseImpExe (compras exentas de IVA): el modelo de Purchase solo
        // distingue taxRate 0/15, no "no objeto de IVA" vs "exento" — se
        // reporta 0. Si la empresa compra a proveedores con tarifa exenta,
        // revisar manualmente este campo antes de presentar.
        addReq(d, 'baseImpExe', money(0));
        addReq(d, 'montoIce', money(0));
        addReq(d, 'montoIva', money(montoIva));

        // IVA retention — mapeado por pctCode desde el comprobante de retención
        // vinculado. Si no hay retención vinculada pero el campo totalVatRetention > 0,
        // se reporta como valorRetBienes (30%, caso más común) como fallback.
        const ret = p.retentionId ? retentionDocs.get(p.retentionId) : undefined;
        const ivaRet = {
          valRetBien10: 0, valRetServ20: 0, valorRetBienes: 0,
          valRetServ50: 0, valorRetServicios: 0, valRetServ100: 0,
        };
        if (ret) {
          for (const tax of ret.taxes ?? []) {
            if (tax.taxCode !== '2') continue; // solo IVA
            switch (tax.pctCode) {
              case '9':  ivaRet.valRetBien10      += tax.retainedAmount; break;
              case '10': ivaRet.valRetServ20      += tax.retainedAmount; break;
              case '3':  ivaRet.valorRetBienes    += tax.retainedAmount; break;
              case '4':  ivaRet.valorRetServicios += tax.retainedAmount; break;
              case '5':
              case '1':  ivaRet.valRetServ100     += tax.retainedAmount; break;
            }
          }
        } else if (p.totalVatRetention > 0) {
          ivaRet.valorRetBienes = p.totalVatRetention;
        }
        if (ivaRet.valRetBien10      > 0) addOpt(d, 'valRetBien10',       money(ivaRet.valRetBien10));
        if (ivaRet.valRetServ20      > 0) addOpt(d, 'valRetServ20',       money(ivaRet.valRetServ20));
        if (ivaRet.valorRetBienes    > 0) addOpt(d, 'valorRetBienes',     money(ivaRet.valorRetBienes));
        if (ivaRet.valRetServ50      > 0) addOpt(d, 'valRetServ50',       money(ivaRet.valRetServ50));
        if (ivaRet.valorRetServicios > 0) addOpt(d, 'valorRetServicios',  money(ivaRet.valorRetServicios));
        if (ivaRet.valRetServ100     > 0) addOpt(d, 'valRetServ100',      money(ivaRet.valRetServ100));

        // pagoLocExt: '01'=local/residente (obligatorio). Compras al exterior
        // (pagoLocExt='02') no están distinguidas en el modelo actual de Purchase
        // — verificar manualmente si hay importaciones de servicios.
        addReq(d, 'pagoLocExt', '01');

        if (formaPagoVal) {
          const fp = ele(d, 'formasDePago');
          addReq(fp, 'formaPago', formaPagoVal);
        }

        // air (retenciones de Renta) va ANTES de estabRetencion1/etc en el
        // schema — ver ejemplo oficial del SRI.
        const irTaxes = (ret?.taxes ?? []).filter(t => t.taxCode === '1');
        if (ret && irTaxes.length) {
          const airEl = ele(d, 'air');
          for (const tax of irTaxes) {
            const da = ele(airEl, 'detalleAir');
            addReq(da, 'codRetAir', tax.pctCode);
            addReq(da, 'baseImpAir', money(tax.taxableBase));
            // Usar tasa almacenada si está disponible; calcular como fallback.
            const pctAir = tax.rate !== undefined
              ? tax.rate
              : (tax.taxableBase > 0 ? (tax.retainedAmount / tax.taxableBase) * 100 : 0);
            addReq(da, 'porcentajeAir', money(pctAir));
            addReq(da, 'valRetAir', money(tax.retainedAmount));
          }
        }
        if (ret) {
          addOpt(d, 'estabRetencion1', ret.seriesEstablishment);
          addOpt(d, 'ptoEmiRetencion1', ret.seriesEmissionPoint);
          addOpt(d, 'secRetencion1', String(ret.number));
          addOpt(d, 'autRetencion1', ret.authorizationNumber);
          addOpt(d, 'fechaEmiRet1', fmtDate(ret.date));
        }

        // ─── Recopilar filas para Excel (una fila por código IR; si no hay IR, una fila vacía) ─
        const baseRowFields = {
          codigoOper:  '',
          codSustento: p.sriSustentoCode ?? '01',
          tpIdProv:    mapTipoIdentificacionProveedor(p.supplierTaxIdType),
          idProv:      p.supplierRuc,
          parteRel:    'NO',
          tipoComprobante: p.sriDocumentType ?? '01',
          fechaRegistro:   fmtDate(p.date),
          establecimiento, puntoEmision, secuencial,
          fechaEmision:    fmtDate(p.supplierInvoiceDate),
          autorizacion,
          baseNoGraIva, baseImponible: baseImpGrav + baseNoGraIva,
          baseImpGrav, baseImpExe: 0, montoIce: 0, montoIva,
          ...ivaRet,
          pagoLocExt: '01', formaPago: formaPagoVal,
          estabRetencion: ret?.seriesEstablishment ?? '',
          ptoEmiRetencion: ret?.seriesEmissionPoint ?? '',
          secRetencion:   ret ? String(ret.number) : '',
          autRetencion:   ret?.authorizationNumber ?? '',
          fechaEmiRetencion: ret ? fmtDate(ret.date) : '',
        };

        if (irTaxes.length) {
          for (const tax of irTaxes) {
            const pctAir = tax.rate !== undefined
              ? tax.rate
              : (tax.taxableBase > 0 ? (tax.retainedAmount / tax.taxableBase) * 100 : 0);
            comprasRows.push({
              ...baseRowFields,
              codRetAir: tax.pctCode,
              baseImpAir: tax.taxableBase,
              porcentajeAir: pctAir,
              valRetAir: tax.retainedAmount,
            });
          }
        } else {
          comprasRows.push({ ...baseRowFields, codRetAir: '', baseImpAir: 0, porcentajeAir: 0, valRetAir: 0 });
        }
      }
    }

    if (ventasMap.size) {
      const ventasEl = ele(root, 'ventas');
      for (const v of ventasMap.values()) {
        const d = ele(ventasEl, 'detalleVentas');
        addReq(d, 'tpIdCliente', v.tpIdCliente);
        addReq(d, 'idCliente', v.idCliente);
        // parteRel: obligatorio — 'NO' por defecto; verificar si hay ventas a
        // partes relacionadas (Art. 4 LRTI) y corregir manualmente.
        addReq(d, 'parteRel', 'NO');
        addReq(d, 'tipoComprobante', v.tipoComprobante);
        addReq(d, 'tipoEmision', v.tipoEmision);
        addReq(d, 'numeroComprobantes', v.numeroComprobantes);
        addReq(d, 'baseNoGraIva', money(v.baseNoGraIva));
        addReq(d, 'baseImponible', money(v.baseImponible));
        addReq(d, 'baseImpGrav', money(v.baseImpGrav));
        addReq(d, 'montoIva', money(v.montoIva));
        addReq(d, 'montoIce', money(0));
        // valorRetIva/valorRetRenta: retenciones RECIBIDAS de clientes — este
        // sistema hoy no las registra (solo retenciones EMITIDAS a proveedores
        // en el módulo de Compras). Se reporta 0 — revisar manualmente si la
        // empresa vende a contribuyentes que le retienen IR/IVA.
        addReq(d, 'valorRetIva', money(0));
        addReq(d, 'valorRetRenta', money(0));
      }
    }

    // ─── VENTAS POR ESTABLECIMIENTO ────────────────────────────────────────────
    if (establecimientoTotals.size) {
      const vEstEl = ele(root, 'ventasEstablecimiento');
      for (const [codEstab, total] of establecimientoTotals) {
        const d = ele(vEstEl, 'ventaEst');
        addReq(d, 'codEstab', codEstab);
        addReq(d, 'ventasEstab', money(total));
        addReq(d, 'ivaComp', money(0)); // IVA compensado por Ley de Solidaridad — no aplica
      }
    }

    // ─── EXPORTACIONES ─────────────────────────────────────────────────────────
    const exportInvoices = invoices.filter(inv => !inv.isVoid && inv.exportData);
    if (exportInvoices.length) {
      const expEl = ele(root, 'exportaciones');
      for (const inv of exportInvoices) {
        const ex = inv.exportData!;
        const { establecimiento, puntoEmision, secuencial } = parseDocNumber(inv.fullNumber);
        const d = ele(expEl, 'detalleExportaciones');
        // tpIdClienteEx: el ejemplo oficial del SRI usa un código ('20') que no
        // pudimos verificar contra ninguna tabla documentada — a diferencia de
        // tpIdProv/tpIdCliente (sí confirmados). Se usa el mismo catálogo que
        // tpIdCliente como mejor esfuerzo; revisar manualmente si hay filas de
        // exportaciones en el ATS generado.
        addReq(d, 'tpIdClienteEx', mapTipoIdentificacion(inv.customerTaxIdType));
        addReq(d, 'idClienteEx', inv.customerTaxId);
        addReq(d, 'exportacionDe', ex.exportType || '05');
        addReq(d, 'tipoComprobante', '01');
        addOpt(d, 'distAduanero', ex.customsDistrict);
        addOpt(d, 'anio', ex.customsYear);
        addOpt(d, 'regimen', ex.customsRegime);
        addOpt(d, 'correlativo', ex.customsCorrelative);
        addOpt(d, 'verificador', ex.customsVerifier);
        addOpt(d, 'docTransp', ex.transportDoc);
        addOpt(d, 'fue', ex.fue);
        addReq(d, 'fechaEmbarque', fmtDate(ex.shipmentDate));
        addReq(d, 'valorFOB', money(ex.fobValue));
        addReq(d, 'valorFOBComprobante', money(ex.fobValue));
        addReq(d, 'establecimiento', establecimiento);
        addReq(d, 'puntoEmision', puntoEmision);
        addReq(d, 'secuencial', secuencial);
        addOpt(d, 'autorizacion', digitsOnly(inv.accessKey || inv.authorizationNumber));
        addReq(d, 'fechaEmision', fmtDate(inv.date));
      }
    }

    // ─── ANULADOS ────────────────────────────────────────────────────────────
    const voided: VoidedRef[] = [];

    for (const doc2 of invoicesByVoidSnap.docs) {
      const inv = doc2.data() as InvoiceDoc;
      const { establecimiento, puntoEmision, secuencial } = parseDocNumber(inv.fullNumber);
      voided.push({
        tipoComprobante: inv.isCreditNote ? '04' : '01',
        establecimiento, puntoEmision,
        secuencial: parseInt(secuencial, 10),
        autorizacion: digitsOnly(inv.accessKey || inv.authorizationNumber),
      });
    }
    for (const doc2 of debitNotesByVoidSnap.docs) {
      const dn = doc2.data() as DebitNoteDoc;
      const { establecimiento, puntoEmision, secuencial } = parseDocNumber(dn.fullNumber);
      voided.push({
        tipoComprobante: '02',
        establecimiento, puntoEmision,
        secuencial: parseInt(secuencial, 10),
        autorizacion: digitsOnly(dn.accessKey || dn.authorizationNumber),
      });
    }
    for (const doc2 of purchasesByVoidSnap.docs) {
      const p = doc2.data() as PurchaseDoc;
      const { establecimiento, puntoEmision, secuencial } = parseDocNumber(p.supplierInvoiceNumber);
      voided.push({
        tipoComprobante: p.sriDocumentType || '01',
        establecimiento, puntoEmision,
        secuencial: parseInt(secuencial, 10),
        autorizacion: digitsOnly(p.supplierAccessKey),
      });
    }

    console.log('[generateAts] Comprobantes anulados en el mes:', voided);

    const anuladosRows = buildAnulados(root, voided);

    // ─── Serializar + empaquetar en .zip ──────────────────────────────────────
    const xmlString = doc.end({ prettyPrint: true });
    console.log('[generateAts] XML generado:', xmlString.length, 'caracteres');
    console.log('[generateAts] XML completo (debug):\n' + xmlString);

    const zip = new JSZip();
    // El SRI exige el nombre ATmmaaaa.zip (ej. AT082026.zip).
    const filenameBase = `AT${pad(mesXml, 2)}${year}`;
    zip.file(`${filenameBase}.xml`, Buffer.from(xmlString, 'latin1'));
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const result: GenerateAtsResult = {
      zip: zipBuffer.toString('base64'),
      filename: `${filenameBase}.zip`,
    };

    if (includeExcelData) {
      const ventasRows: AtsVentaRow[] = [...ventasMap.values()].map(v => ({
        tpIdCliente: v.tpIdCliente, idCliente: v.idCliente, parteRel: 'NO',
        tipoComprobante: v.tipoComprobante, tipoEmision: v.tipoEmision,
        numeroComprobantes: v.numeroComprobantes,
        baseNoGraIva: v.baseNoGraIva, baseImponible: v.baseImponible,
        baseImpGrav: v.baseImpGrav, montoIva: v.montoIva, montoIce: 0,
        valorRetIva: 0, valorRetRenta: 0,
      }));

      const ventasEstabRows: AtsVentaEstabRow[] = [...establecimientoTotals.entries()].map(([codEstab, total]) => ({
        codEstab, ventasEstab: total, ivaComp: 0,
      }));

      result.excelData = {
        companyRuc, companyName,
        year, mesXml,
        numEstabRuc: establecimientoTotals.size || 1,
        totalVentas: totalVentasSum,
        compras: comprasRows,
        ventas: ventasRows,
        ventasEstab: ventasEstabRows,
        anulados: anuladosRows,
      };
    }

    console.log('[generateAts] Listo:', result.filename, '—', zipBuffer.length, 'bytes comprimidos');
    return result;
  }
);
