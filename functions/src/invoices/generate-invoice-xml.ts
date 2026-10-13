import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { buildAdditionalInfo } from '../utils/additional-info';
import { resolveSoftwareProviderRuc } from '../utils/software-provider';
// Se reexporta: las pruebas de sri-calculations lo importan de aquí.
export { resolveTemplate } from '../utils/additional-info';
import { buildInvoiceXml } from '../utils/sri-invoice-xml';
import { getStorage } from 'firebase-admin/storage';
import { formatFechaEmisionEC, formatFechaClaveAccesoEC } from '../utils/sri-date';
import { resolveTipoIdentificacionComprador } from '../utils/sri-buyer-id';
import { generateAccessKey, assertValidAccessKey, calculateModulo11 } from '../utils/sri-access-key';
import { resolveEmissionSeries, resolveEstablishmentAddress } from '../utils/establishments';

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

/** @deprecated alias de calculateModulo11 (utils/sri-access-key.ts) — se conserva por compatibilidad con tests existentes. */
export const calcularDigitoVerificador = calculateModulo11;

function generarCodigoNumerico(): string {
  return String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
}

/** Extract numeric-only secuencial from fullNumber "001-001-000000001" or plain number */
function extractSecuencial(invoice: { fullNumber?: string; number?: number | string }): string {
  const source = invoice.fullNumber ?? String(invoice.number ?? '');
  if (!source) return '000000001';
  const parts = source.split('-');
  const raw = parts[parts.length - 1] ?? '000000001';
  return raw.replace(/\D/g, '').padStart(9, '0');
}

/** Resolve ${invoice.field} / ${customer.field} / ${company.field} templates */

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

  // Establecimiento y punto de emisión DEL COMPROBANTE, los de la serie con que
  // se numeró; no los de la empresa. Con dos establecimientos, usar los de la
  // empresa mandaba la sucursal al SRI como si fuera la matriz, con un
  // secuencial que la matriz ya había usado.
  const series = resolveEmissionSeries(invoice, company.sri);
  const dirEstablecimiento = await resolveEstablishmentAddress(
    db, companyId, series.establishment, sriConfig.direccionEstablecimiento,
  );
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
          { vatPct: 0,  sriCode: '0' }, // tabla 17: IVA 0 % → código 0 (el 2 es el 12 %)
        ],
      };

  console.log('[generate-invoice-xml] 5. Construyendo clave de acceso...');

  // 5. Build access key (49 digits)
  const invoiceDate: Date = invoice.date.toDate();
  const fechaStr = formatFechaClaveAccesoEC(invoiceDate);
  const tipoComprobante = '01'; // Factura
  const ruc = company.sri.ruc;
  const ambiente = company.sri.environment === 'production' ? '2' : '1';
  const serie = `${series.establishment}${series.emissionPoint}`;
  const secuencial = extractSecuencial(invoice);
  const codigoNumerico = invoice.codigoNumerico ?? generarCodigoNumerico();
  const tipoEmision = '1'; // Normal

  console.log('[generate-invoice-xml] 5. fechaStr:', fechaStr, '| ruc:', ruc, '| ambiente:', ambiente);
  console.log('[generate-invoice-xml] 5. serie:', serie, '| secuencial:', secuencial, '| codigoNumerico:', codigoNumerico);

  const accessKey = generateAccessKey({
    fechaEmision:    fechaStr,
    tipoComprobante,
    ruc,
    ambiente,
    establecimiento: series.establishment,
    puntoEmision:    series.emissionPoint,
    secuencial,
    codigoNumerico,
    tipoEmision,
  });
  // Nunca continuar (firmar/enviar) con una clave mal construida.
  assertValidAccessKey(accessKey);
  console.log('[generate-invoice-xml] 5. accessKey (49 dígitos, validada):', accessKey);

  // 6-7. Totales (con descuento por línea) y XML: utils/sri-invoice-xml.ts,
  // sin Firestore, probado contra el XSD del SRI (2026-10-13).
  const obligadoContabilidad =
    sriConfig.obligadoContabilidad ?? (company.sri.accountingRequired ? 'SI' : 'NO');
  const tipoIdComprador = resolveTipoIdentificacionComprador(
    invoice.customerTaxId,
    invoice.customerIdentificationType,
    invoice.customerTaxIdType,
  );
  // <infoAdicional> — campos de la empresa, los del comprobante y el correo
  // del comprador, sin vacíos y con el tope del SRI (utils/additional-info.ts).
  const infoAdicionalFields = buildAdditionalInfo({
    companyFields: sriConfig.additionalInfoFields,
    docFields: (invoice as any).additionalInfo,
    doc: invoice as any,
    company: { name: company.name, ruc },
    providerRuc: await resolveSoftwareProviderRuc(company as any),
  });

  const xmlString = buildInvoiceXml({
    header: {
      version:              platformConfig.facturaVersion ?? '1.0.0',
      ambiente,
      tipoEmision,
      razonSocial:          sriConfig.razonSocial,
      nombreComercial:      sriConfig.nombreComercial,
      ruc,
      accessKey,
      establishment:        series.establishment,
      emissionPoint:        series.emissionPoint,
      secuencial,
      dirMatriz:            sriConfig.direccionMatriz,
      fechaEmision:         formatFechaEmisionEC(invoiceDate),
      dirEstablecimiento,
      contribuyenteEspecial: company.sri.contribuyenteEspecial,
      obligadoContabilidad,
      regimenMicroempresa:  sriConfig.regimenMicroempresa === true,
      tipoIdentificacionComprador: tipoIdComprador,
    },
    invoice,
    taxCodes: platformConfig.taxCodes,
    infoAdicional: infoAdicionalFields,
  });

  // 8. XML ya serializado
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
  const fullNumber = `${series.establishment}-${series.emissionPoint}-${secuencial}`;
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
