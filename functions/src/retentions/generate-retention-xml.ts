import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { create } from 'xmlbuilder2';
import { getStorage } from 'firebase-admin/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RetentionTax {
  taxCode:        string;   // '1'=IR, '2'=IVA, '6'=ISD
  pctCode:        string;   // '303', '4', etc. — maps to codigoRetencion
  rate:           number;   // porcentaje de retención
  taxableBase:    number;
  retainedAmount: number;
}

interface Retention {
  number?: number;
  fullNumber?: string;
  date: admin.firestore.Timestamp;
  periodoFiscal: string;
  supplierName: string;
  supplierTaxId: string;
  supplierTaxIdType: string;
  // codSustento: tipo de sustento SRI (01=compras, 02=servicios, etc.)
  // codDocSustento: tipo de comprobante (01=factura, 04=nota crédito, etc.)
  supportDocType:     string;   // codDocSustento — tipo del comprobante de sustento
  supportDocCodSust?: string;   // codSustento — código de sustento tributario (ej. '01')
  supportDocNumber: string;
  supportDocDate: admin.firestore.Timestamp;
  supportDocAuth?: string;
  supportDocTotal: number;
  // pagoLocExt: '01'=local, '02'=exterior
  pagoLocExt?: string;
  tipoRegi?: string;
  paisEfecPago?: string;
  taxes: RetentionTax[];
  totalRetained: number;
  codigoNumerico?: string;
  accessKey?: string;
}

interface CompanySri {
  ruc: string;
  businessName: string;
  establishment: string;
  emissionPoint: string;
  environment: 'testing' | 'production';
  accountingRequired: boolean;
  contribuyenteEspecial?: string;
}

interface Company { sri: CompanySri; }

interface SriCompanyConfig {
  razonSocial: string;
  nombreComercial?: string;
  direccionMatriz: string;
  direccionEstablecimiento: string;
  obligadoContabilidad: 'SI' | 'NO';
  contribuyenteEspecial: string;
  additionalInfoFields: Array<{ nombre: string; valor: string }>;
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

function formatFechaEmision(date: Date): string {
  const dd   = String(date.getDate()).padStart(2, '0');
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatFechaClaveAcceso(date: Date): string {
  const dd   = String(date.getDate()).padStart(2, '0');
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

function extractSecuencial(fullNumber: string): string {
  const parts = fullNumber.split('-');
  return (parts[parts.length - 1] ?? '000000001').replace(/\D/g, '').padStart(9, '0');
}

// ─── Core logic ───────────────────────────────────────────────────────────────

export async function generateRetentionXmlInternal(
  retentionId: string,
  companyId: string
): Promise<{ accessKey: string; xmlUrl: string }> {
  const db  = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  console.log('[generate-retention-xml] Inicio:', { retentionId, companyId });

  const retSnap = await db.doc(`companies/${companyId}/retentions/${retentionId}`).get();
  if (!retSnap.exists) throw new Error(`Retención no encontrada: ${retentionId}`);
  const retention = retSnap.data() as Retention;

  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) throw new Error(`Empresa no encontrada: ${companyId}`);
  const company = companySnap.data() as Company;

  const sriConfigSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  if (!sriConfigSnap.exists) throw new Error(`Configuración SRI no encontrada: ${companyId}`);
  const sriConfig = sriConfigSnap.data() as SriCompanyConfig;

  // Build access key (49 digits)
  const retDate    = retention.date.toDate();
  const fechaStr   = formatFechaClaveAcceso(retDate);
  const ruc        = company.sri.ruc;
  const ambiente   = company.sri.environment === 'production' ? '2' : '1';
  const serie      = `${company.sri.establishment}${company.sri.emissionPoint}`;
  const secuencial = extractSecuencial(retention.fullNumber ?? '001-001-000000001');
  const codigoNumerico = retention.codigoNumerico ?? generarCodigoNumerico();
  const tipoEmision    = '1';
  const codDoc         = '07'; // Comprobante de Retención

  const clave48 = fechaStr + codDoc + ruc + ambiente + serie + secuencial + codigoNumerico + tipoEmision;
  if (clave48.length !== 48) {
    throw new Error(`Clave de acceso mal construida, longitud: ${clave48.length}`);
  }
  const accessKey = clave48 + String(calcularDigitoVerificador(clave48));
  console.log('[generate-retention-xml] Clave de acceso:', accessKey);

  // Build XML
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('comprobanteRetencion', { id: 'comprobante', version: '2.0.0' });

  // <infoTributaria>
  const infoTrib = root.ele('infoTributaria');
  infoTrib.ele('ambiente').txt(ambiente);
  infoTrib.ele('tipoEmision').txt(tipoEmision);
  infoTrib.ele('razonSocial').txt(sriConfig.razonSocial);
  if (sriConfig.nombreComercial) infoTrib.ele('nombreComercial').txt(sriConfig.nombreComercial);
  infoTrib.ele('ruc').txt(ruc);
  infoTrib.ele('claveAcceso').txt(accessKey);
  infoTrib.ele('codDoc').txt(codDoc);
  infoTrib.ele('estab').txt(company.sri.establishment);
  infoTrib.ele('ptoEmi').txt(company.sri.emissionPoint);
  infoTrib.ele('secuencial').txt(secuencial);
  infoTrib.ele('dirMatriz').txt(sriConfig.direccionMatriz);

  // <infoCompRetencion>
  const infoComp = root.ele('infoCompRetencion');
  infoComp.ele('fechaEmision').txt(formatFechaEmision(retDate));
  infoComp.ele('dirEstablecimiento').txt(sriConfig.direccionEstablecimiento);
  if (company.sri.contribuyenteEspecial) {
    infoComp.ele('contribuyenteEspecial').txt(company.sri.contribuyenteEspecial);
  }
  const obligado = sriConfig.obligadoContabilidad ?? (company.sri.accountingRequired ? 'SI' : 'NO');
  infoComp.ele('obligadoContabilidad').txt(obligado);
  infoComp.ele('tipoIdentificacionSujetoRetenido').txt(retention.supplierTaxIdType ?? '04');
  infoComp.ele('razonSocialSujetoRetenido').txt(retention.supplierName);
  infoComp.ele('identificacionSujetoRetenido').txt(retention.supplierTaxId);
  infoComp.ele('periodoFiscal').txt(retention.periodoFiscal);

  // <docsSustento> — Ficha Técnica v2.32: impuestos van DENTRO de <docSustento><retenciones>
  // El nodo <impuestos> a nivel raíz fue eliminado (era de versiones anteriores al v2.0.0)
  const docsSustento = root.ele('docsSustento');
  const docSustento  = docsSustento.ele('docSustento');

  // codSustento: código de sustento tributario (tipo de gasto/compra).
  // Si el dato no viene en supportDocCodSust, se usa '01' (compras) como fallback.
  docSustento.ele('codSustento').txt(retention.supportDocCodSust ?? '01');

  // codDocSustento: tipo de comprobante (01=factura, 04=nota crédito, etc.)
  docSustento.ele('codDocSustento').txt(retention.supportDocType);

  docSustento.ele('numDocSustento').txt(retention.supportDocNumber);
  docSustento.ele('fechaEmisionDocSustento').txt(formatFechaEmision(retention.supportDocDate.toDate()));
  if (retention.supportDocAuth) {
    docSustento.ele('numAutDocSustento').txt(retention.supportDocAuth);
  }

  // pagoLocExt: '01'=local (Ecuador), '02'=exterior. Default '01'.
  const pagoLocExt = retention.pagoLocExt ?? '01';
  docSustento.ele('pagoLocExt').txt(pagoLocExt);

  // tipoRegi y paisEfecPago SOLO cuando pagoLocExt='02' (pago al exterior)
  if (pagoLocExt === '02') {
    docSustento.ele('tipoRegi').txt(retention.tipoRegi ?? '');
    docSustento.ele('paisEfecPago').txt(retention.paisEfecPago ?? '');
  }

  docSustento.ele('totalSinImpuestos').txt(retention.supportDocTotal.toFixed(2));
  docSustento.ele('importeTotal').txt(retention.supportDocTotal.toFixed(2));

  // <retenciones> — estructura correcta según Ficha Técnica v2.32
  const retenciones = docSustento.ele('retenciones');
  for (const tax of retention.taxes) {
    const ret = retenciones.ele('retencion');
    ret.ele('codigo').txt(tax.taxCode);                          // tipo impuesto: 1=IR, 2=IVA, 6=ISD
    ret.ele('codigoRetencion').txt(tax.pctCode);                 // código de retención SRI (303, 4, etc.)
    ret.ele('baseImponible').txt(tax.taxableBase.toFixed(2));
    ret.ele('porcentajeRetener').txt(tax.rate.toFixed(2));       // porcentaje (no tarifa)
    ret.ele('valorRetenido').txt(tax.retainedAmount.toFixed(2));
  }

  // <infoAdicional>
  if (sriConfig.additionalInfoFields?.length > 0) {
    const infoAd = root.ele('infoAdicional');
    for (const field of sriConfig.additionalInfoFields) {
      infoAd.ele('campoAdicional', { nombre: field.nombre }).txt(field.valor);
    }
  }

  const xmlString = root.end({ prettyPrint: true });
  console.log('[generate-retention-xml] XML generado, longitud:', xmlString.length);

  // Upload to Storage
  const bucket  = getStorage().bucket();
  const xmlPath = `companies/${companyId}/xml/ret-${retentionId}.xml`;
  const xmlFile = bucket.file(xmlPath);
  await xmlFile.save(Buffer.from(xmlString, 'utf8'), {
    metadata: { contentType: 'application/xml' },
  });

  await xmlFile.makePublic();
  const xmlSignedUrl = `https://storage.googleapis.com/${xmlFile.bucket.name}/${xmlFile.name}`;

  await db.doc(`companies/${companyId}/retentions/${retentionId}`).update({
    codigoNumerico,
    accessKey,
    xmlUrl:    xmlSignedUrl,
    sriStatus: 'xml_generated',
    updatedAt: now,
  });

  return { accessKey, xmlUrl: xmlSignedUrl };
}

// ─── Callable function ────────────────────────────────────────────────────────

export const generateRetentionXml = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debe estar autenticado.');

  const { retentionId, companyId } = request.data as { retentionId: string; companyId: string };
  if (!retentionId) throw new HttpsError('invalid-argument', 'retentionId es requerido.');
  if (!companyId)   throw new HttpsError('invalid-argument', 'companyId es requerido.');

  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  const callerRole      = request.auth.token['role']      as string | undefined;
  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }

  try {
    return await generateRetentionXmlInternal(retentionId, companyId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error generando XML de retención';
    throw new HttpsError('internal', message);
  }
});
