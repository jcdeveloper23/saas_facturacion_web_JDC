import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { create } from 'xmlbuilder2';
import { getStorage } from 'firebase-admin/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceLine {
  productId?: string;
  sku?: string;
  productSku?: string;  // campo real del frontend
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  discountPct?: number; // campo real del frontend (porcentaje)
  taxRate?: number;
  vatPct?: number;      // campo real del frontend
  sriTaxCode?: string;
  lineTotal?: number;
  subtotal?: number;    // campo real del frontend
  taxAmount?: number;
  vatAmount?: number;   // campo real del frontend
  unit?: string;
  skuAlt?: string;
}

interface PaymentMethod {
  code: string;
  name?: string;
  amount?: number;
  deadline?: number | null;
  timeUnit?: string;
}

interface Invoice {
  number?: number | string;
  fullNumber?: string;
  date: admin.firestore.Timestamp;
  status: string;
  sriStatus?: string;
  accessKey?: string;
  codigoNumerico?: string;
  customerId: string;
  customerName: string;
  customerTaxId: string;
  customerTaxIdType?: string;           // campo real: "CI", "RUC", "PASAPORTE"
  customerIdentificationType?: string;  // código SRI directo si ya viene mapeado
  customerEmail?: string;
  customerAddress?: string;
  customerReference?: string;
  subtotal?: number;
  netAmount?: number;     // campo real del frontend
  grossAmount?: number;
  discount?: number;
  discountAmount?: number; // campo real del frontend
  taxableBase?: number;
  vatAmount?: number;
  total?: number;
  lines: InvoiceLine[];
  paymentMethod?: string;
  paymentMethods?: PaymentMethod[]; // campo real del frontend
  paymentDays?: number;
  notes?: string;
  seriesEstablishment?: string;
  seriesEmissionPoint?: string;
}

interface CompanySri {
  ruc: string;
  businessName: string;
  establishment: string;
  emissionPoint: string;
  environment: 'testing' | 'production';
  contributorType: string;
  accountingRequired: boolean;
  contribuyenteEspecial?: string;
}

interface Company {
  name: string;
  sri: CompanySri;
}

interface SriCompanyConfig {
  razonSocial: string;
  nombreComercial?: string;
  direccionMatriz: string;
  direccionEstablecimiento: string;
  obligadoContabilidad: 'SI' | 'NO';
  contribuyenteEspecial: string;
  regimenMicroempresa?: boolean;  // true si la empresa está en régimen de microempresas (Sprint 3)
  additionalInfoFields: Array<{ nombre: string; valor: string }>;
}

interface SriPlatformConfig {
  facturaVersion: string;
  taxCodes: Array<{ vatPct: number; sriCode: string; isExempt?: boolean }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function calcularDigitoVerificador(clave48: string): number {
  const factores = [2, 3, 4, 5, 6, 7];
  let suma = 0;
  for (let i = clave48.length - 1, f = 0; i >= 0; i--, f++) {
    suma += parseInt(clave48[i]) * factores[f % 6];
  }
  const residuo = suma % 11;
  if (residuo === 0) return 0;
  if (residuo === 1) return 1;
  return 11 - residuo;
}

function generarCodigoNumerico(): string {
  return String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
}

function formatFechaEmision(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatFechaClaveAcceso(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

/** Extract numeric-only secuencial from fullNumber "001-001-000000001" or plain number */
function extractSecuencial(invoice: { fullNumber?: string; number?: number | string }): string {
  const source = invoice.fullNumber ?? String(invoice.number ?? '');
  if (!source) return '000000001';
  const parts = source.split('-');
  const raw = parts[parts.length - 1] ?? '000000001';
  return raw.replace(/\D/g, '').padStart(9, '0');
}

/** Map frontend tax ID type to SRI identification code */
function mapTipoIdentificacion(type: string | undefined): string {
  if (!type) return '04';
  const t = type.toUpperCase();
  if (t === 'RUC'  || t === '04') return '04';
  if (t === 'CI'   || t === '05') return '05';
  if (t === 'PASAPORTE' || t === '06') return '06';
  if (t === 'CONSUMIDOR_FINAL' || t === '07') return '07';
  return '04';
}

/** Derive SRI tax code from taxRate percentage using platform config */
function deriveSriTaxCode(
  taxRate: number,
  taxCodes: SriPlatformConfig['taxCodes']
): string {
  const match = taxCodes.find(tc => tc.vatPct === taxRate);
  if (match) return match.sriCode;
  // Fallback map — SRI Ficha Técnica v2.32 TABLA 17
  if (taxRate === 15) return '4'; // IVA 15% → código 4 (antes era '3' para IVA 12%)
  if (taxRate === 5)  return '5';
  if (taxRate === 0)  return '2';
  return '2';
}

/** Resolve ${invoice.field} / ${customer.field} / ${company.field} templates */
export function resolveTemplate(
  template: string,
  ctx: { invoice: Record<string, any>; customer: Record<string, any>; company: Record<string, any> }
): string {
  return template.replace(
    /\$\{(invoice|customer|company)\.(\w+)\}/g,
    (_, obj, key) => String(ctx[obj as keyof typeof ctx]?.[key] ?? '')
  );
}

// ─── Core logic (exported for internal use by orchestrator) ───────────────────

export async function generateInvoiceXmlInternal(
  invoiceId: string,
  companyId: string
): Promise<{ invoiceId: string; accessKey: string; xmlUrl: string; sriStatus: string; fullNumber: string; nextStep: string }> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  console.log('[generate-invoice-xml] ========== INICIO ==========');
  console.log('[generate-invoice-xml] invoiceId:', invoiceId);
  console.log('[generate-invoice-xml] companyId:', companyId);

  // 1. Read Invoice
  const invoiceSnap = await db.doc(`companies/${companyId}/invoices/${invoiceId}`).get();
  console.log('[generate-invoice-xml] 1. invoiceSnap.exists:', invoiceSnap.exists);
  if (!invoiceSnap.exists) {
    throw new Error(`Factura no encontrada: ${invoiceId}`);
  }
  const invoice = invoiceSnap.data() as Invoice;
  console.log('[generate-invoice-xml] 1. invoice.number:', invoice.number, '| tipo:', typeof invoice.number);
  console.log('[generate-invoice-xml] 1. invoice.fullNumber:', invoice.fullNumber);
  console.log('[generate-invoice-xml] 1. invoice.total:', invoice.total, '| netAmount:', (invoice as any).netAmount, '| subtotal:', (invoice as any).subtotal);
  console.log('[generate-invoice-xml] 1. invoice.customerTaxIdType:', (invoice as any).customerTaxIdType);
  console.log('[generate-invoice-xml] 1. invoice.lines.length:', invoice.lines?.length);
  console.log('[generate-invoice-xml] 1. invoice.paymentMethods:', JSON.stringify(invoice.paymentMethods));

  // 2. Read Company
  const companySnap = await db.doc(`companies/${companyId}`).get();
  console.log('[generate-invoice-xml] 2. companySnap.exists:', companySnap.exists);
  if (!companySnap.exists) {
    throw new Error(`Empresa no encontrada: ${companyId}`);
  }
  const company = companySnap.data() as Company;
  console.log('[generate-invoice-xml] 2. company.sri:', JSON.stringify(company.sri));

  // 3. Read SRI company config
  const sriConfigSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  console.log('[generate-invoice-xml] 3. sriConfigSnap.exists:', sriConfigSnap.exists);
  if (!sriConfigSnap.exists) {
    throw new Error(`Configuración SRI no encontrada para empresa: ${companyId}`);
  }
  const sriConfig = sriConfigSnap.data() as SriCompanyConfig;
  console.log('[generate-invoice-xml] 3. sriConfig.razonSocial:', sriConfig.razonSocial);

  // 4. Read platform SRI config
  const platformConfigSnap = await db.doc('platform/defaults/sriConfig/data').get();
  console.log('[generate-invoice-xml] 4. platformConfig.exists:', platformConfigSnap.exists);
  const platformConfig: SriPlatformConfig = platformConfigSnap.exists
    ? (platformConfigSnap.data() as SriPlatformConfig)
    : {
        facturaVersion: '1.0.0',
        taxCodes: [
          { vatPct: 15, sriCode: '4' }, // SRI TABLA 17 v2.32: IVA 15% → código 4
          { vatPct: 5,  sriCode: '5' },
          { vatPct: 0,  sriCode: '2' },
        ],
      };

  console.log('[generate-invoice-xml] 5. Construyendo clave de acceso...');

  // 5. Build access key (49 digits)
  const invoiceDate: Date = invoice.date.toDate();
  const fechaStr = formatFechaClaveAcceso(invoiceDate);
  const tipoComprobante = '01'; // Factura
  const ruc = company.sri.ruc;
  const ambiente = company.sri.environment === 'production' ? '2' : '1';
  const serie = `${company.sri.establishment}${company.sri.emissionPoint}`;
  const secuencial = extractSecuencial(invoice);
  const codigoNumerico = invoice.codigoNumerico ?? generarCodigoNumerico();
  const tipoEmision = '1'; // Normal

  console.log('[generate-invoice-xml] 5. fechaStr:', fechaStr, '| ruc:', ruc, '| ambiente:', ambiente);
  console.log('[generate-invoice-xml] 5. serie:', serie, '| secuencial:', secuencial, '| codigoNumerico:', codigoNumerico);

  const clave48 =
    fechaStr + tipoComprobante + ruc + ambiente + serie + secuencial + codigoNumerico + tipoEmision;

  console.log('[generate-invoice-xml] 5. clave48 (longitud ' + clave48.length + '):', clave48);

  if (clave48.length !== 48) {
    throw new Error(`Clave de acceso mal construida, longitud: ${clave48.length} (esperada: 48)`);
  }

  const digitoVerificador = calcularDigitoVerificador(clave48);
  const accessKey = clave48 + String(digitoVerificador);
  console.log('[generate-invoice-xml] 5. accessKey (49 dígitos):', accessKey);

  console.log('[generate-invoice-xml] Clave de acceso:', accessKey, '| longitud:', accessKey.length);

  // 6. Normalizar totales (soporta campos del frontend y campos legacy)
  const subtotal      = invoice.netAmount ?? invoice.subtotal ?? invoice.grossAmount ?? 0;
  const discountAmt   = invoice.discountAmount ?? invoice.discount ?? 0;
  const totalSinImp   = subtotal - discountAmt;

  // 6b. Group lines by SRI tax code for totalConImpuestos
  const taxGroups: Map<string, { base: number; tax: number }> = new Map();
  for (const line of invoice.lines) {
    const taxRate    = line.vatPct ?? line.taxRate ?? 0;
    const lineTotal  = line.subtotal ?? line.lineTotal ?? 0;
    const lineTax    = line.vatAmount ?? line.taxAmount ?? 0;
    const sriTaxCode = line.sriTaxCode ?? deriveSriTaxCode(taxRate, platformConfig.taxCodes);
    const existing   = taxGroups.get(sriTaxCode) ?? { base: 0, tax: 0 };
    taxGroups.set(sriTaxCode, {
      base: existing.base + lineTotal,
      tax:  existing.tax  + lineTax,
    });
  }

  // 7. Build XML using xmlbuilder2
  const totalSinImpuestos = totalSinImp;
  const version = platformConfig.facturaVersion ?? '1.0.0';

  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('factura', { id: 'comprobante', version });

  // <infoTributaria>
  const infoTrib = root.ele('infoTributaria');
  infoTrib.ele('ambiente').txt(ambiente);
  infoTrib.ele('tipoEmision').txt(tipoEmision);
  infoTrib.ele('razonSocial').txt(sriConfig.razonSocial);
  if (sriConfig.nombreComercial) {
    infoTrib.ele('nombreComercial').txt(sriConfig.nombreComercial);
  }
  infoTrib.ele('ruc').txt(ruc);
  infoTrib.ele('claveAcceso').txt(accessKey);
  infoTrib.ele('codDoc').txt('01');
  infoTrib.ele('estab').txt(company.sri.establishment);
  infoTrib.ele('ptoEmi').txt(company.sri.emissionPoint);
  infoTrib.ele('secuencial').txt(secuencial);
  infoTrib.ele('dirMatriz').txt(sriConfig.direccionMatriz);

  // <infoFactura>
  const infoFactura = root.ele('infoFactura');
  infoFactura.ele('fechaEmision').txt(formatFechaEmision(invoiceDate));
  infoFactura.ele('dirEstablecimiento').txt(sriConfig.direccionEstablecimiento);

  if (company.sri.contribuyenteEspecial) {
    infoFactura.ele('contribuyenteEspecial').txt(company.sri.contribuyenteEspecial);
  }
  const obligadoContabilidad =
    sriConfig.obligadoContabilidad ?? (company.sri.accountingRequired ? 'SI' : 'NO');
  infoFactura.ele('obligadoContabilidad').txt(obligadoContabilidad);

  // Solo si la empresa es microempresa (campo agregado en Sprint 3)
  if (sriConfig.regimenMicroempresa === true) {
    infoFactura.ele('regimenMicroempresa').txt('CONTRIBUYENTE');
  }

  const tipoIdComprador = invoice.customerIdentificationType
    ?? mapTipoIdentificacion(invoice.customerTaxIdType);
  infoFactura.ele('tipoIdentificacionComprador').txt(tipoIdComprador);
  infoFactura.ele('razonSocialComprador').txt(invoice.customerName);
  infoFactura.ele('identificacionComprador').txt(invoice.customerTaxId);
  infoFactura.ele('totalSinImpuestos').txt(totalSinImpuestos.toFixed(2));
  infoFactura.ele('totalDescuento').txt(discountAmt.toFixed(2));

  const totalConImpuestos = infoFactura.ele('totalConImpuestos');
  for (const [sriTaxCode, { base, tax }] of taxGroups) {
    const ti = totalConImpuestos.ele('totalImpuesto');
    ti.ele('codigo').txt('2'); // IVA
    ti.ele('codigoPorcentaje').txt(sriTaxCode);
    ti.ele('baseImponible').txt(base.toFixed(2));
    ti.ele('valor').txt(tax.toFixed(2));
  }

  const importeTotal = invoice.total ?? 0;
  infoFactura.ele('propina').txt('0.00');
  infoFactura.ele('importeTotal').txt(importeTotal.toFixed(2));
  infoFactura.ele('moneda').txt('DOLAR');

  // Pagos: soporta paymentMethods[] (frontend) y paymentMethod (legacy)
  const pagos = infoFactura.ele('pagos');
  const paymentList = invoice.paymentMethods?.length
    ? invoice.paymentMethods
    : [{ code: invoice.paymentMethod ?? '01', amount: importeTotal, deadline: invoice.paymentDays ?? 0, timeUnit: 'dias' }];

  for (const pm of paymentList) {
    const pago = pagos.ele('pago');
    pago.ele('formaPago').txt(pm.code ?? '01');
    pago.ele('total').txt((pm.amount || importeTotal).toFixed(2));
    pago.ele('plazo').txt(String(pm.deadline ?? 0));
    pago.ele('unidadTiempo').txt(pm.timeUnit ?? 'dias');
  }

  // <detalles>
  const detalles = root.ele('detalles');
  for (const line of invoice.lines) {
    const taxRate    = line.vatPct ?? line.taxRate ?? 0;
    const lineTotal  = line.subtotal ?? line.lineTotal ?? 0;
    const lineTax    = line.vatAmount ?? line.taxAmount ?? 0;
    const lineDisc   = line.discount ?? 0;
    const sriTaxCode = line.sriTaxCode ?? deriveSriTaxCode(taxRate, platformConfig.taxCodes);
    const detalle    = detalles.ele('detalle');
    const codigoPrincipal = line.productSku || line.sku || line.productId || 'SIN-CODIGO';

    detalle.ele('codigoPrincipal').txt(codigoPrincipal);
    if (line.skuAlt) {
      detalle.ele('codigoAdicional').txt(line.skuAlt);
    }
    detalle.ele('descripcion').txt(line.description);
    detalle.ele('unidadMedida').txt(line.unit || 'UNIDAD');
    detalle.ele('cantidad').txt(Number(line.quantity).toFixed(6));      // SRI XSD: fractionDigits=6
    detalle.ele('precioUnitario').txt(Number(line.unitPrice).toFixed(2)); // SRI XSD: fractionDigits=2 (Xerces normaliza y rechaza >2 dígitos significativos)
    detalle.ele('descuento').txt(lineDisc.toFixed(2));
    detalle.ele('precioTotalSinImpuesto').txt(lineTotal.toFixed(2));

    const impuestos = detalle.ele('impuestos');
    const impuesto  = impuestos.ele('impuesto');
    impuesto.ele('codigo').txt('2'); // IVA
    impuesto.ele('codigoPorcentaje').txt(sriTaxCode);
    impuesto.ele('tarifa').txt(String(taxRate));
    impuesto.ele('baseImponible').txt(lineTotal.toFixed(2));
    impuesto.ele('valor').txt(lineTax.toFixed(2));
  }

  // <infoAdicional>
  const customerCtx = {
    name: invoice.customerName,
    taxId: invoice.customerTaxId,
    email: invoice.customerEmail ?? '',
    address: invoice.customerAddress ?? '',
    reference: invoice.customerReference ?? '',
  };
  const companyCtx = { name: company.name, ruc };

  if (sriConfig.additionalInfoFields && sriConfig.additionalInfoFields.length > 0) {
    const infoAdicional = root.ele('infoAdicional');
    for (const field of sriConfig.additionalInfoFields) {
      const valorResuelto = resolveTemplate(field.valor, {
        invoice: invoice as any,
        customer: customerCtx,
        company: companyCtx,
      });
      infoAdicional.ele('campoAdicional', { nombre: field.nombre }).txt(valorResuelto);
    }
  }

  // 8. Serialize XML
  const xmlString = root.end({ prettyPrint: true });
  console.log('[generate-invoice-xml] XML generado, longitud:', xmlString.length);

  // 9. Upload to Storage
  const bucket = getStorage().bucket();
  const xmlPath = `companies/${companyId}/xml/${invoiceId}.xml`;
  const xmlFile = bucket.file(xmlPath);

  try {
    await xmlFile.save(Buffer.from(xmlString, 'utf8'), {
      metadata: { contentType: 'application/xml' },
    });
    console.log('[generate-invoice-xml] XML subido a Storage:', xmlPath);
  } catch (err) {
    console.error('[generate-invoice-xml] Error subiendo XML a Storage:', err);
    throw new Error('Error al guardar XML en Storage');
  }

  // Make file publicly accessible and use public URL (no IAM signBlob required)
  await xmlFile.makePublic();
  const xmlSignedUrl = `https://storage.googleapis.com/${bucket.name}/${xmlPath}`;
  console.log('[generate-invoice-xml] 9. URL pública generada:', xmlSignedUrl);

  // 10. Update Invoice in Firestore
  await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
    codigoNumerico,
    accessKey,
    xmlUrl: xmlSignedUrl,
    sriStatus: 'xml_generated',
    updatedAt: now,
  });

  console.log('[generate-invoice-xml] Factura actualizada en Firestore');
  const fullNumber = `${company.sri.establishment}-${company.sri.emissionPoint}-${secuencial}`;
  return {
    invoiceId,
    accessKey,
    xmlUrl:     xmlSignedUrl,
    sriStatus:  'xml_generated',
    fullNumber,
    nextStep:   'signXml',
  };
}

// ─── Callable function ────────────────────────────────────────────────────────

export const generateInvoiceXml = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const { invoiceId, companyId } = request.data as { invoiceId: string; companyId: string };

  if (!invoiceId || typeof invoiceId !== 'string') {
    throw new HttpsError('invalid-argument', 'invoiceId es requerido.');
  }
  if (!companyId || typeof companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }

  const callerRole = request.auth.token['role'] as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;

  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }

  try {
    return await generateInvoiceXmlInternal(invoiceId, companyId);
  } catch (err) {
    console.error('[generate-invoice-xml] Error:', err);
    const message = err instanceof Error ? err.message : 'Error generando XML';
    throw new HttpsError('internal', message);
  }
});
