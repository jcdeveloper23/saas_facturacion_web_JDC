import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { create } from 'xmlbuilder2';
import { getStorage } from 'firebase-admin/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebitNoteMotivo { razon: string; valor: number; }

interface DebitNote {
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

function fmtFecha(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtClaveAcceso(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
}

function extractSecuencial(fullNumber: string): string {
  const parts = fullNumber.split('-');
  return (parts[parts.length - 1] ?? '000000001').replace(/\D/g, '').padStart(9, '0');
}

function sriCodeForVat(vatPct: number, taxCodes?: SriPlatformConfig['taxCodes']): string {
  const match = taxCodes?.find(tc => tc.vatPct === vatPct);
  if (match) return match.sriCode;
  if (vatPct === 15) return '3';
  if (vatPct === 5)  return '5';
  return '2';
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

  const platformSnap   = await db.doc('platform/defaults/sriConfig/data').get();
  const platformConfig = platformSnap.exists ? (platformSnap.data() as SriPlatformConfig) : {};

  // Build access key
  const dnDate     = dn.date.toDate();
  const ruc        = company.sri.ruc;
  const ambiente   = company.sri.environment === 'production' ? '2' : '1';
  const serie      = `${company.sri.establishment}${company.sri.emissionPoint}`;
  const secuencial = extractSecuencial(dn.fullNumber ?? '001-001-000000001');
  const codNum     = dn.codigoNumerico ?? genCodigo();
  const codDoc     = '05'; // Nota de Débito

  const clave48 = fmtClaveAcceso(dnDate) + codDoc + ruc + ambiente + serie + secuencial + codNum + '1';
  if (clave48.length !== 48) throw new Error(`Clave mal construida: ${clave48.length} dígitos`);
  const accessKey = clave48 + String(calcDigito(clave48));
  console.log('[generate-debit-note-xml] Clave de acceso:', accessKey);

  const version = platformConfig.notaDebitoVersion ?? '1.0.0';
  const sriCode = sriCodeForVat(dn.vatPct, platformConfig.taxCodes);

  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('notaDebito', { id: 'comprobante', version });

  // <infoTributaria>
  const infoTrib = root.ele('infoTributaria');
  infoTrib.ele('ambiente').txt(ambiente);
  infoTrib.ele('tipoEmision').txt('1');
  infoTrib.ele('razonSocial').txt(sriConfig.razonSocial);
  if (sriConfig.nombreComercial) infoTrib.ele('nombreComercial').txt(sriConfig.nombreComercial);
  infoTrib.ele('ruc').txt(ruc);
  infoTrib.ele('claveAcceso').txt(accessKey);
  infoTrib.ele('codDoc').txt(codDoc);
  infoTrib.ele('estab').txt(company.sri.establishment);
  infoTrib.ele('ptoEmi').txt(company.sri.emissionPoint);
  infoTrib.ele('secuencial').txt(secuencial);
  infoTrib.ele('dirMatriz').txt(sriConfig.direccionMatriz);

  // <infoNotaDebito>
  const infoND = root.ele('infoNotaDebito');
  infoND.ele('fechaEmision').txt(fmtFecha(dnDate));
  infoND.ele('dirEstablecimiento').txt(sriConfig.direccionEstablecimiento);
  infoND.ele('tipoIdentificacionComprador').txt(dn.customerTaxIdType ?? '04');
  infoND.ele('razonSocialComprador').txt(dn.customerName);
  infoND.ele('identificacionComprador').txt(dn.customerTaxId);
  if (company.sri.contribuyenteEspecial) {
    infoND.ele('contribuyenteEspecial').txt(company.sri.contribuyenteEspecial);
  }
  infoND.ele('obligadoContabilidad').txt(
    sriConfig.obligadoContabilidad ?? (company.sri.accountingRequired ? 'SI' : 'NO')
  );
  infoND.ele('codDocModificado').txt('01');  // factura original
  infoND.ele('numDocModificado').txt(dn.originalInvoiceNumber);
  infoND.ele('fechaEmisionDocSustento').txt(fmtFecha(dn.originalInvoiceDate.toDate()));
  infoND.ele('totalSinImpuestos').txt(dn.totalSinImpuestos.toFixed(2));

  const impuestos = infoND.ele('impuestos');
  if (dn.vatPct > 0) {
    const imp = impuestos.ele('impuesto');
    imp.ele('codigo').txt('2');  // IVA
    imp.ele('codigoPorcentaje').txt(sriCode);
    imp.ele('tarifa').txt(dn.vatPct.toFixed(2));
    imp.ele('baseImponible').txt(dn.totalSinImpuestos.toFixed(2));
    imp.ele('valor').txt(dn.vatAmount.toFixed(2));
  }

  infoND.ele('importeTotal').txt(dn.total.toFixed(2));
  infoND.ele('moneda').txt('DOLAR');

  if (dn.originalInvoiceAuth) {
    infoND.ele('numAutorizacionDocSustento').txt(dn.originalInvoiceAuth);
  }

  // <motivos>
  const motivos = root.ele('motivos');
  for (const m of dn.motivos) {
    const motivo = motivos.ele('motivo');
    motivo.ele('razon').txt(m.razon);
    motivo.ele('valor').txt(m.valor.toFixed(2));
  }

  // <infoAdicional>
  if (sriConfig.additionalInfoFields?.length > 0) {
    const infoAd = root.ele('infoAdicional');
    for (const f of sriConfig.additionalInfoFields) {
      infoAd.ele('campoAdicional', { nombre: f.nombre }).txt(f.valor);
    }
  }

  const xmlString = root.end({ prettyPrint: true });
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
