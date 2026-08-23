import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { create } from 'xmlbuilder2';
import { getStorage } from 'firebase-admin/storage';
import { formatFechaEmisionEC, formatFechaClaveAccesoEC } from '../utils/sri-date';
import { resolveTipoIdentificacionComprador } from '../utils/sri-buyer-id';
import { assertValidAccessKey } from '../utils/sri-access-key';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditNoteLine {
  productId?: string;
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  sriTaxCode?: string;
  lineTotal: number;
  taxAmount: number;
  unit?: string;     // unidad de medida (ej: 'UNIDAD', 'KG', 'LT', 'CAJA') — default 'UNIDAD'
  skuAlt?: string;   // código adicional (código de barras, referencia del proveedor, etc.)
}

interface CreditNote {
  // Numbering
  fullNumber?: string;
  date: admin.firestore.Timestamp;

  // Customer
  customerName: string;
  customerTaxId: string;
  customerTaxIdType?: string;
  customerIdentificationType?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerReference?: string;

  // Document sustento (factura original)
  isCreditNote: boolean;
  rectifiedInvoiceId?: string;
  rectifiedInvoiceNumber?: string;        // e.g. '001-001-000000123'
  rectifiedInvoiceAuthNumber?: string;    // numAutDocSustento (49 dígitos)
  rectifiedInvoiceDate?: admin.firestore.Timestamp | string;
  creditNoteMotivo?: string;              // motivo de la nota de crédito

  // Totals
  subtotal: number;
  discount: number;
  taxableBase: number;
  vatAmount: number;
  total: number;

  // Lines
  lines: CreditNoteLine[];

  // SRI internal
  codigoNumerico?: string;
  accessKey?: string;
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
  additionalInfoFields: Array<{ nombre: string; valor: string }>;
}

interface SriPlatformConfig {
  notaCreditoVersion?: string;
  taxCodes: Array<{ vatPct: number; sriCode: string; isExempt?: boolean }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcularDigitoVerificador(clave48: string): number {
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

/** Extract numeric-only secuencial from "001-001-000000001" → "000000001" */
function extractSecuencial(fullNumber: string): string {
  const parts = fullNumber.split('-');
  const raw = parts[parts.length - 1] ?? '000000001';
  return raw.replace(/\D/g, '').padStart(9, '0');
}

/** Derive SRI tax code from taxRate percentage using platform config */
function deriveSriTaxCode(
  taxRate: number,
  taxCodes: SriPlatformConfig['taxCodes']
): string {
  const match = taxCodes.find(tc => tc.vatPct === taxRate);
  if (match) return match.sriCode;
  // Fallback map — SRI Ficha Técnica v2.32 TABLA 17
  if (taxRate === 15) return '4'; // IVA 15% → código 4
  if (taxRate === 5)  return '5';
  if (taxRate === 0)  return '2';
  return '2';
}

/** Resolve ${invoice.field} / ${customer.field} / ${company.field} templates */
function resolveTemplate(
  template: string,
  ctx: { invoice: Record<string, any>; customer: Record<string, any>; company: Record<string, any> }
): string {
  return template.replace(
    /\$\{(invoice|customer|company)\.(\w+)\}/g,
    (_, obj, key) => String(ctx[obj as keyof typeof ctx]?.[key] ?? '')
  );
}

/** Resolve rectifiedInvoiceDate to a JS Date regardless of whether it's a
 *  Firestore Timestamp or an ISO string stored as a plain string. */
function resolveRectifiedDate(
  raw: admin.firestore.Timestamp | string | undefined
): Date {
  if (!raw) return new Date();
  if (typeof raw === 'string') return new Date(raw);
  // Firestore Timestamp — has .toDate()
  return (raw as admin.firestore.Timestamp).toDate();
}

// ─── Core logic (exported for internal use by orchestrator) ───────────────────

export async function generateCreditNoteXmlInternal(
  creditNoteId: string,
  companyId: string
): Promise<{ accessKey: string; xmlUrl: string }> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  console.log('[generate-credit-note-xml] Inicio:', { creditNoteId, companyId });

  // 1. Read Invoice (credit note is stored as an Invoice document)
  const invoiceSnap = await db.doc(`companies/${companyId}/invoices/${creditNoteId}`).get();
  if (!invoiceSnap.exists) {
    throw new Error(`Nota de crédito no encontrada: ${creditNoteId}`);
  }
  const cn = invoiceSnap.data() as CreditNote;

  if (!cn.isCreditNote) {
    throw new Error(`El documento ${creditNoteId} no está marcado como nota de crédito (isCreditNote=false)`);
  }

  // 2. Read Company
  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) {
    throw new Error(`Empresa no encontrada: ${companyId}`);
  }
  const company = companySnap.data() as Company;

  // 3. Read SRI company config
  const sriConfigSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  if (!sriConfigSnap.exists) {
    throw new Error(`Configuración SRI no encontrada para empresa: ${companyId}`);
  }
  const sriConfig = sriConfigSnap.data() as SriCompanyConfig;

  // 4. Read platform SRI config
  const platformConfigSnap = await db.doc('platform/defaults/sriConfig/data').get();
  const platformConfig: SriPlatformConfig = platformConfigSnap.exists
    ? (platformConfigSnap.data() as SriPlatformConfig)
    : {
        notaCreditoVersion: '1.0.0',
        taxCodes: [
          { vatPct: 15, sriCode: '4' }, // SRI TABLA 17 v2.32: IVA 15% → código 4
          { vatPct: 5,  sriCode: '5' },
          { vatPct: 0,  sriCode: '2' },
        ],
      };

  console.log('[generate-credit-note-xml] Datos leídos. Construyendo clave de acceso...');

  // 5. Build access key (49 digits) — codDoc = '04' (Nota de Crédito)
  const cnDate: Date = cn.date.toDate();
  const fechaStr = formatFechaClaveAccesoEC(cnDate);
  const tipoComprobante = '04'; // Nota de Crédito
  const ruc = company.sri.ruc;
  const ambiente = company.sri.environment === 'production' ? '2' : '1';
  const serie = `${company.sri.establishment}${company.sri.emissionPoint}`;
  const secuencial = extractSecuencial(cn.fullNumber ?? '001-001-000000001');
  const codigoNumerico = cn.codigoNumerico ?? generarCodigoNumerico();
  const tipoEmision = '1'; // Normal

  const clave48 =
    fechaStr + tipoComprobante + ruc + ambiente + serie + secuencial + codigoNumerico + tipoEmision;

  if (clave48.length !== 48) {
    throw new Error(`Clave de acceso mal construida, longitud: ${clave48.length} (esperada: 48)`);
  }

  const digitoVerificador = calcularDigitoVerificador(clave48);
  const accessKey = clave48 + String(digitoVerificador);
  assertValidAccessKey(accessKey); // nunca continuar con una clave mal construida

  console.log('[generate-credit-note-xml] Clave de acceso:', accessKey, '| longitud:', accessKey.length);

  // 6. Group lines by SRI tax code for totalConImpuestos
  const taxGroups: Map<string, { base: number; tax: number }> = new Map();
  for (const line of cn.lines) {
    const sriTaxCode = line.sriTaxCode ?? deriveSriTaxCode(line.taxRate, platformConfig.taxCodes);
    const existing = taxGroups.get(sriTaxCode) ?? { base: 0, tax: 0 };
    taxGroups.set(sriTaxCode, {
      base: existing.base + line.lineTotal,
      tax:  existing.tax  + line.taxAmount,
    });
  }

  // 7. Build XML using xmlbuilder2
  const totalSinImpuestos = cn.subtotal - cn.discount;
  const valorModificacion = cn.total; // importe total con IVA de la NC
  const version = platformConfig.notaCreditoVersion ?? '1.0.0';

  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('notaCredito', { id: 'comprobante', version });

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
  infoTrib.ele('codDoc').txt('04');
  infoTrib.ele('estab').txt(company.sri.establishment);
  infoTrib.ele('ptoEmi').txt(company.sri.emissionPoint);
  infoTrib.ele('secuencial').txt(secuencial);
  infoTrib.ele('dirMatriz').txt(sriConfig.direccionMatriz);

  // <infoNotaCredito>
  const infoNC = root.ele('infoNotaCredito');
  infoNC.ele('fechaEmision').txt(formatFechaEmisionEC(cnDate));
  infoNC.ele('dirEstablecimiento').txt(sriConfig.direccionEstablecimiento);

  const tipoIdComprador = resolveTipoIdentificacionComprador(
    cn.customerTaxId,
    cn.customerIdentificationType,
    cn.customerTaxIdType,
  );
  infoNC.ele('tipoIdentificacionComprador').txt(tipoIdComprador);
  infoNC.ele('razonSocialComprador').txt(cn.customerName);
  infoNC.ele('identificacionComprador').txt(cn.customerTaxId);

  if (company.sri.contribuyenteEspecial) {
    infoNC.ele('contribuyenteEspecial').txt(company.sri.contribuyenteEspecial);
  }

  const obligadoContabilidad =
    sriConfig.obligadoContabilidad ?? (company.sri.accountingRequired ? 'SI' : 'NO');
  infoNC.ele('obligadoContabilidad').txt(obligadoContabilidad);

  // Documento sustento (factura original)
  infoNC.ele('codDocModificado').txt('01'); // siempre factura
  infoNC.ele('numDocModificado').txt(cn.rectifiedInvoiceNumber ?? '');

  const rectifiedDate = resolveRectifiedDate(cn.rectifiedInvoiceDate);
  infoNC.ele('fechaEmisionDocSustento').txt(formatFechaEmisionEC(rectifiedDate));

  if (cn.rectifiedInvoiceAuthNumber) {
    infoNC.ele('numAutDocSustento').txt(cn.rectifiedInvoiceAuthNumber);
  }

  infoNC.ele('totalSinImpuestos').txt(totalSinImpuestos.toFixed(2));
  infoNC.ele('valorModificacion').txt(valorModificacion.toFixed(2));
  infoNC.ele('moneda').txt('DOLAR');

  const totalConImpuestos = infoNC.ele('totalConImpuestos');
  for (const [sriTaxCode, { base, tax }] of taxGroups) {
    const ti = totalConImpuestos.ele('totalImpuesto');
    ti.ele('codigo').txt('2'); // IVA
    ti.ele('codigoPorcentaje').txt(sriTaxCode);
    ti.ele('baseImponible').txt(base.toFixed(2));
    ti.ele('valor').txt(tax.toFixed(2));
  }

  infoNC.ele('motivo').txt(cn.creditNoteMotivo ?? 'Anulación de factura');

  // <detalles>
  const detalles = root.ele('detalles');
  for (const line of cn.lines) {
    const sriTaxCode = line.sriTaxCode ?? deriveSriTaxCode(line.taxRate, platformConfig.taxCodes);
    const detalle = detalles.ele('detalle');
    const codigoPrincipal = line.sku || line.productId || 'SIN-CODIGO';
    detalle.ele('codigoPrincipal').txt(codigoPrincipal);
    if (line.skuAlt) {
      detalle.ele('codigoAdicional').txt(line.skuAlt);
    }
    detalle.ele('descripcion').txt(line.description);
    detalle.ele('unidadMedida').txt(line.unit || 'UNIDAD');
    detalle.ele('cantidad').txt(line.quantity.toFixed(6));
    detalle.ele('precioUnitario').txt(line.unitPrice.toFixed(6));
    detalle.ele('descuento').txt(line.discount.toFixed(2));
    detalle.ele('precioTotalSinImpuesto').txt(line.lineTotal.toFixed(2));

    const impuestos = detalle.ele('impuestos');
    const impuesto = impuestos.ele('impuesto');
    impuesto.ele('codigo').txt('2'); // IVA
    impuesto.ele('codigoPorcentaje').txt(sriTaxCode);
    impuesto.ele('tarifa').txt(String(line.taxRate));
    impuesto.ele('baseImponible').txt(line.lineTotal.toFixed(2));
    impuesto.ele('valor').txt(line.taxAmount.toFixed(2));
  }

  // <infoAdicional>
  const customerCtx = {
    name: cn.customerName,
    taxId: cn.customerTaxId,
    email: cn.customerEmail ?? '',
    address: cn.customerAddress ?? '',
    reference: cn.customerReference ?? '',
  };
  const companyCtx = { name: company.name, ruc };

  if (sriConfig.additionalInfoFields && sriConfig.additionalInfoFields.length > 0) {
    const infoAdicional = root.ele('infoAdicional');
    for (const field of sriConfig.additionalInfoFields) {
      const valorResuelto = resolveTemplate(field.valor, {
        invoice: cn as any,
        customer: customerCtx,
        company: companyCtx,
      });
      infoAdicional.ele('campoAdicional', { nombre: field.nombre }).txt(valorResuelto);
    }
  }

  // 8. Serialize XML
  const xmlString = root.end({ prettyPrint: true });
  console.log('[generate-credit-note-xml] XML generado, longitud:', xmlString.length);

  // 9. Upload to Storage — prefix "cn-" to distinguish from plain invoices
  const bucket = getStorage().bucket();
  const xmlPath = `companies/${companyId}/xml/cn-${creditNoteId}.xml`;
  const xmlFile = bucket.file(xmlPath);

  try {
    await xmlFile.save(Buffer.from(xmlString, 'utf8'), {
      metadata: { contentType: 'application/xml' },
    });
    console.log('[generate-credit-note-xml] XML subido a Storage:', xmlPath);
  } catch (err) {
    console.error('[generate-credit-note-xml] Error subiendo XML a Storage:', err);
    throw new Error('Error al guardar XML en Storage');
  }

  await xmlFile.makePublic();
  const xmlUrl = `https://storage.googleapis.com/${xmlFile.bucket.name}/${xmlFile.name}`;

  // 10. Update Invoice document in Firestore
  await db.doc(`companies/${companyId}/invoices/${creditNoteId}`).update({
    codigoNumerico,
    accessKey,
    xmlUrl,
    sriStatus: 'xml_generated',
    updatedAt: now,
  });

  console.log('[generate-credit-note-xml] Documento actualizado en Firestore');
  return { accessKey, xmlUrl };
}

// ─── Callable function ────────────────────────────────────────────────────────

export const generateCreditNoteXml = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const { creditNoteId, companyId } = request.data as { creditNoteId: string; companyId: string };

  if (!creditNoteId || typeof creditNoteId !== 'string') {
    throw new HttpsError('invalid-argument', 'creditNoteId es requerido.');
  }
  if (!companyId || typeof companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;

  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }

  try {
    return await generateCreditNoteXmlInternal(creditNoteId, companyId);
  } catch (err) {
    console.error('[generate-credit-note-xml] Error:', err);
    const message = err instanceof Error ? err.message : 'Error generando XML de nota de crédito';
    throw new HttpsError('internal', message);
  }
});
