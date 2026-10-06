import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { sriVatCode } from '../utils/sri-vat-codes';
import * as admin from 'firebase-admin';
import { buildDebitNoteXml } from '../utils/sri-note-xml';
import { getStorage } from 'firebase-admin/storage';
import { formatFechaClaveAccesoEC } from '../utils/sri-date';
import { resolveTipoIdentificacionComprador } from '../utils/sri-buyer-id';
import { assertValidAccessKey } from '../utils/sri-access-key';
import { resolveEmissionSeries, resolveEstablishmentAddress } from '../utils/establishments';
import { buildAdditionalInfo } from '../utils/additional-info';
import { resolveSoftwareProviderRuc } from '../utils/software-provider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebitNoteMotivo { razon: string; valor: number; }

interface DebitNote {
  seriesEstablishment?: string;
  seriesEmissionPoint?: string;
  fullNumber?: string;
  date: admin.firestore.Timestamp;
  customerName: string;
  customerTaxId: string;
  customerTaxIdType: string;
  originalInvoiceNumber: string;
  originalInvoiceDate: admin.firestore.Timestamp;
  originalInvoiceAuth?: string;
  motivos: DebitNoteMotivo[];
  totalSinImpuestos: number;
  vatPct: number;
  vatAmount: number;
  total: number;
  /** Tabla 24 del SRI; vacío = '20'. */
  paymentMethodCode?: string;
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

interface SriPlatformConfig {
  notaDebitoVersion?: string;
  taxCodes?: Array<{ vatPct: number; sriCode: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcDigito(clave48: string): number {
  const f = [2, 3, 4, 5, 6, 7];
  let s = 0;
  for (let i = clave48.length - 1, j = 0; i >= 0; i--, j++) {
    s += parseInt(clave48[i]) * f[j % 6];
  }
  const r = s % 11;
  return r === 0 ? 0 : r === 1 ? 1 : 11 - r;
}

function genCodigo(): string {
  return String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
}

function extractSecuencial(fullNumber: string): string {
  const parts = fullNumber.split('-');
  return (parts[parts.length - 1] ?? '000000001').replace(/\D/g, '').padStart(9, '0');
}

function sriCodeForVat(vatPct: number, taxCodes?: SriPlatformConfig['taxCodes']): string {
  // Tabla 17 en un solo sitio (2026-10-06): el respaldo de aquí daba el 15 %
  // como '3' (14 %) y el 0 % como '2' (12 %).
  return sriVatCode(vatPct, taxCodes);
}

// ─── Core logic ───────────────────────────────────────────────────────────────

export async function generateDebitNoteXmlInternal(
  debitNoteId: string,
  companyId: string
): Promise<{ accessKey: string; xmlUrl: string }> {
  const db  = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  console.log('[generate-debit-note-xml] Inicio:', { debitNoteId, companyId });

  const dnSnap = await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).get();
  if (!dnSnap.exists) throw new Error(`Nota de débito no encontrada: ${debitNoteId}`);
  const dn = dnSnap.data() as DebitNote;

  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) throw new Error(`Empresa no encontrada: ${companyId}`);
  const company = companySnap.data() as Company;

  const sriConfigSnap = await db.doc(`companies/${companyId}/configuration/sri`).get();
  if (!sriConfigSnap.exists) throw new Error(`Configuración SRI no encontrada: ${companyId}`);
  const sriConfig = sriConfigSnap.data() as SriCompanyConfig;

  // Establecimiento y punto de emisión DEL COMPROBANTE, los de la serie con que
  // se numeró; no los de la empresa. Con dos establecimientos, usar los de la
  // empresa mandaba la sucursal al SRI como si fuera la matriz, con un
  // secuencial que la matriz ya había usado.
  const series = resolveEmissionSeries(dn, company.sri);
  const dirEstablecimiento = await resolveEstablishmentAddress(
    db, companyId, series.establishment, sriConfig.direccionEstablecimiento,
  );

  const platformSnap   = await db.doc('platform/defaults/sriConfig/data').get();
  const platformConfig = platformSnap.exists ? (platformSnap.data() as SriPlatformConfig) : {};

  // Build access key
  const dnDate     = dn.date.toDate();
  const ruc        = company.sri.ruc;
  const ambiente   = company.sri.environment === 'production' ? '2' : '1';
  const serie      = `${series.establishment}${series.emissionPoint}`;
  const secuencial = extractSecuencial(dn.fullNumber ?? '001-001-000000001');
  const codNum     = dn.codigoNumerico ?? genCodigo();
  const codDoc     = '05'; // Nota de Débito

  const clave48 = formatFechaClaveAccesoEC(dnDate) + codDoc + ruc + ambiente + serie + secuencial + codNum + '1';
  if (clave48.length !== 48) throw new Error(`Clave mal construida: ${clave48.length} dígitos`);
  const accessKey = clave48 + String(calcDigito(clave48));
  assertValidAccessKey(accessKey); // nunca continuar con una clave mal construida
  console.log('[generate-debit-note-xml] Clave de acceso:', accessKey);

  const sriCode = sriCodeForVat(dn.vatPct, platformConfig.taxCodes);

  // infoAdicional — los campos de la empresa y los de la nota, sin vacíos, y el
  // «RUC Proveedor» del sistema que exige el SRI desde el 2026-09-26.
  const infoAdicionalFields = buildAdditionalInfo({
    companyFields: sriConfig.additionalInfoFields,
    docFields: (dn as any).additionalInfo,
    doc: dn as any,
    company: { name: sriConfig.razonSocial, ruc },
    providerRuc: await resolveSoftwareProviderRuc(company as any),
  });

  // Constructor puro de utils/sri-note-xml.ts: <valorTotal>, <pagos> y siempre
  // un <impuesto> (antes salía con <importeTotal>/<moneda>, sin pagos y fuera
  // de esquema).
  const xmlString = buildDebitNoteXml({
    issuer: {
      ambiente, razonSocial: sriConfig.razonSocial, nombreComercial: sriConfig.nombreComercial,
      ruc, accessKey, establishment: series.establishment, emissionPoint: series.emissionPoint,
      secuencial, dirMatriz: sriConfig.direccionMatriz, dirEstablecimiento,
      contribuyenteEspecial: company.sri.contribuyenteEspecial,
      obligadoContabilidad: sriConfig.obligadoContabilidad ?? (company.sri.accountingRequired ? 'SI' : 'NO'),
    },
    buyer: {
      tipoIdentificacion: resolveTipoIdentificacionComprador(dn.customerTaxId, undefined, dn.customerTaxIdType),
      razonSocial: dn.customerName,
      identificacion: dn.customerTaxId,
    },
    issueDate: dnDate,
    supportDoc: { number: dn.originalInvoiceNumber, date: dn.originalInvoiceDate.toDate() },
    totalSinImpuestos: dn.totalSinImpuestos,
    vatCode: sriCode,
    vatRate: dn.vatPct,
    vatAmount: dn.vatAmount,
    valorTotal: dn.total,
    paymentCode: dn.paymentMethodCode,
    motivos: dn.motivos,
    additionalInfo: infoAdicionalFields,
  });
  console.log('[generate-debit-note-xml] XML generado, longitud:', xmlString.length);

  const bucket  = getStorage().bucket();
  const xmlPath = `companies/${companyId}/xml/dn-${debitNoteId}.xml`;
  await bucket.file(xmlPath).save(Buffer.from(xmlString, 'utf8'), {
    metadata: { contentType: 'application/xml' },
  });

  const xmlFile = bucket.file(xmlPath);
  await xmlFile.makePublic();
  const xmlUrl = `https://storage.googleapis.com/${bucket.name}/${xmlPath}`;

  await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
    codigoNumerico: codNum, accessKey, xmlUrl, sriStatus: 'xml_generated', updatedAt: now,
  });

  return { accessKey, xmlUrl };
}

// ─── Callable ─────────────────────────────────────────────────────────────────

export const generateDebitNoteXml = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debe estar autenticado.');

  const { debitNoteId, companyId } = request.data as { debitNoteId: string; companyId: string };
  if (!debitNoteId) throw new HttpsError('invalid-argument', 'debitNoteId es requerido.');
  if (!companyId)   throw new HttpsError('invalid-argument', 'companyId es requerido.');

  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  const callerRole      = request.auth.token['role']      as string | undefined;
  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'Sin permisos para esta empresa.');
  }

  try {
    return await generateDebitNoteXmlInternal(debitNoteId, companyId);
  } catch (err) {
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Error generando XML');
  }
});
