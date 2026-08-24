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
  month:     number; // 1-12
}

interface GenerateAtsResult {
  zip:      string; // base64
  filename: string;
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

function buildAnulados(root: any, voided: VoidedRef[]): void {
  if (!voided.length) return;
  const anuladosEl = ele(root, 'anulados');

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
      const d = ele(anuladosEl, 'detalleAnulados');
      addReq(d, 'tipoComprobante', rangeStart.tipoComprobante);
      addReq(d, 'establecimiento', rangeStart.establecimiento);
      addReq(d, 'puntoEmision',    rangeStart.puntoEmision);
      addReq(d, 'secuencialInicio', rangeStart.secuencial);
      addReq(d, 'secuencialFin',    rangeEnd.secuencial);
      addOpt(d, 'autorizacion', rangeStart.autorizacion);
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
}

// ─── Main callable ─────────────────────────────────────────────────────────────

export const generateAts = onCall<GenerateAtsInput>(
  { timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    const { companyId, year, month } = request.data;
    console.log('[generateAts] Solicitud:', { companyId, year, month });

    if (!companyId || !year || !month || month < 1 || month > 12) {
      throw new HttpsError('invalid-argument', 'companyId, year y month (1-12) son requeridos');
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

    const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
    const monthEnd    = new Date(year, month, 1, 0, 0, 0); // exclusivo
    const tsStart = admin.firestore.Timestamp.fromDate(monthStart);
    const tsEnd   = admin.firestore.Timestamp.fromDate(monthEnd);

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
      baseImpGrav: number; baseImponible: number; montoIva: number; numeroComprobantes: number;
    }
    const ventasMap = new Map<string, VentaAgg>();
    const establecimientoTotals = new Map<string, number>();
    let totalVentasSum = 0;

    const addVenta = (
      tpIdCliente: string, idCliente: string, tipoComprobante: string,
      tipoEmision: string, baseGrav: number, baseNoGrav: number, iva: number,
      establecimiento: string
    ) => {
      const key = `${tpIdCliente}|${idCliente}|${tipoComprobante}|${tipoEmision}`;
      const cur = ventasMap.get(key) ?? {
        tpIdCliente, idCliente, tipoComprobante, tipoEmision,
        baseImpGrav: 0, baseImponible: 0, montoIva: 0, numeroComprobantes: 0
      };
      cur.baseImpGrav   += baseGrav;
      cur.baseImponible += baseGrav + baseNoGrav;
      cur.montoIva      += iva;
      cur.numeroComprobantes += 1;
      ventasMap.set(key, cur);

      const docTotal = baseGrav + baseNoGrav + iva;
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
      let baseGrav = 0, baseNoGrav = 0, iva = 0;
      for (const line of inv.lines ?? []) {
        if ((line.vatPct ?? 0) > 0) { baseGrav += line.subtotal; iva += line.vatAmount; }
        else baseNoGrav += line.subtotal;
      }
      const tipoComprobante = inv.isCreditNote ? '04' : '01';
      addVenta(
        mapTipoIdentificacion(inv.customerTaxIdType), inv.customerTaxId,
        tipoComprobante, emisionTipo(inv.sriStatus),
        baseGrav, baseNoGrav, iva, inv.seriesEstablishment
      );
    }
    for (const dn of debitNotes) {
      if (dn.isVoid) continue;
      // DebitNote no desglosa base gravada/no gravada por línea — se asume
      // gravada (caso típico: recargo por mora, interés, etc.).
      addVenta(
        mapTipoIdentificacion(dn.customerTaxIdType), dn.customerTaxId,
        '02', emisionTipo(dn.sriStatus),
        dn.totalSinImpuestos, 0, dn.vatAmount, dn.seriesEstablishment
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
    addReq(root, 'Mes', pad(month, 2));
    // numEstabRuc: aproximado como la cantidad de establecimientos con ventas
    // este mes (no hay en el sistema un catálogo de "establecimientos totales
    // registrados en el RUC" independiente de la actividad real).
    addReq(root, 'numEstabRuc', pad(establecimientoTotals.size || 1, 3));
    addReq(root, 'totalVentas', money(totalVentasSum));
    addReq(root, 'codigoOperativo', 'IVA');

    // ─── COMPRAS — una fila por documento (no se agrega, ver ats.xsd) ─────────
    const activePurchases = purchases.filter(p => p.status !== 'cancelled');
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

        addReq(d, 'codSustento', p.sriSustentoCode, '01');
        addReq(d, 'tpIdProv', mapTipoIdentificacionProveedor(p.supplierTaxIdType));
        addReq(d, 'idProv', p.supplierRuc);
        addReq(d, 'tipoComprobante', p.sriDocumentType, '01');
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
        addReq(d, 'autorizacion', digitsOnly(p.supplierAccessKey) || digitsOnly(p.supplierInvoiceNumber) || '000');
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

        if (p.totalVatRetention > 0) {
          addOpt(d, 'valorRetBienes', money(p.totalVatRetention));
          addOpt(d, 'valorRetServicios', money(0));
        }

        if (p.paymentMethodCode) {
          const fp = ele(d, 'formasDePago');
          addReq(fp, 'formaPago', p.paymentMethodCode);
        }

        // air (retenciones de Renta) va ANTES de estabRetencion1/etc en el
        // schema — ver ejemplo oficial del SRI.
        const ret = p.retentionId ? retentionDocs.get(p.retentionId) : undefined;
        if (ret) {
          if (ret.taxes?.length) {
            const airEl = ele(d, 'air');
            for (const tax of ret.taxes) {
              if (tax.taxCode !== '1') continue; // air = solo retenciones de Renta (IR)
              const da = ele(airEl, 'detalleAir');
              addReq(da, 'codRetAir', tax.pctCode);
              addReq(da, 'baseImpAir', money(tax.taxableBase));
              addReq(da, 'porcentajeAir', money(tax.retainedAmount && tax.taxableBase ? (tax.retainedAmount / tax.taxableBase) * 100 : 0));
              addReq(da, 'valRetAir', money(tax.retainedAmount));
            }
          }
          addOpt(d, 'estabRetencion1', ret.seriesEstablishment);
          addOpt(d, 'ptoEmiRetencion1', ret.seriesEmissionPoint);
          addOpt(d, 'secRetencion1', String(ret.number));
          addOpt(d, 'autRetencion1', ret.authorizationNumber);
          addOpt(d, 'fechaEmiRet1', fmtDate(ret.date));
        }
      }
    }

    if (ventasMap.size) {
      const ventasEl = ele(root, 'ventas');
      for (const v of ventasMap.values()) {
        const d = ele(ventasEl, 'detalleVentas');
        addReq(d, 'tpIdCliente', v.tpIdCliente);
        addReq(d, 'idCliente', v.idCliente);
        addReq(d, 'tipoComprobante', v.tipoComprobante);
        addReq(d, 'tipoEmision', v.tipoEmision);
        addReq(d, 'numeroComprobantes', v.numeroComprobantes);
        addReq(d, 'baseNoGraIva', money(0));
        addReq(d, 'baseImponible', money(v.baseImponible));
        addReq(d, 'baseImpGrav', money(v.baseImpGrav));
        addReq(d, 'montoIva', money(v.montoIva));
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

    buildAnulados(root, voided);

    // ─── Serializar + empaquetar en .zip ──────────────────────────────────────
    const xmlString = doc.end({ prettyPrint: true });
    console.log('[generateAts] XML generado:', xmlString.length, 'caracteres');
    console.log('[generateAts] XML completo (debug):\n' + xmlString);

    const zip = new JSZip();
    const filenameBase = `ATS-${companyRuc}-${year}${pad(month, 2)}`;
    zip.file(`${filenameBase}.xml`, Buffer.from(xmlString, 'latin1'));
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const result: GenerateAtsResult = {
      zip: zipBuffer.toString('base64'),
      filename: `${filenameBase}.zip`,
    };
    console.log('[generateAts] Listo:', result.filename, '—', zipBuffer.length, 'bytes comprimidos');
    return result;
  }
);
