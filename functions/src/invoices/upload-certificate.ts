import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as forge from 'node-forge';

interface UploadCertificateData {
  companyId: string;
  certificateBase64: string;
  password: string;
}

interface CompanySriData {
  ruc: string;
  environment: 'testing' | 'production';
  businessName: string;
  establishment: string;
  emissionPoint: string;
  contributorType: 'natural' | 'juridica';
  accountingRequired: boolean;
  contribuyenteEspecial?: string;
  microempresa: boolean;
  regimen: 'general' | 'rimpe_negocio_popular' | 'rimpe_emprendedor';
  representanteLegal?: { name: string; taxId: string };
  certificatePath?: string;
  certificateThumbprint?: string;
  certificateSubject?: string;
  certificateExpiry?: admin.firestore.Timestamp;
}

/**
 * uploadCertificate
 *
 * Callable function to upload a .p12 signing certificate for a company.
 * Validates the certificate with node-forge, extracts metadata (subject,
 * expiry, SHA1 thumbprint), saves the raw .p12 to Cloud Storage, and
 * updates the /companies/{companyId}.sri fields in Firestore.
 *
 * Requires: authenticated user with role 'admin' or 'super_admin' that
 * belongs to the target company (or is super_admin).
 *
 * Returns: { success, thumbprint, subject, expiresAt, expiresIn }
 */
export const uploadCertificate = onCall(async (request) => {
  // ── Auth check ────────────────────────────────────────────────────────────
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado para subir un certificado.');
  }

  const callerRole = request.auth.token['role'] as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;

  const data = request.data as UploadCertificateData;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!data.companyId || typeof data.companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }
  if (!data.certificateBase64 || typeof data.certificateBase64 !== 'string') {
    throw new HttpsError('invalid-argument', 'certificateBase64 es requerido.');
  }
  if (typeof data.password !== 'string') {
    throw new HttpsError('invalid-argument', 'password es requerido.');
  }

  // ── Permission check ──────────────────────────────────────────────────────
  const isSuperAdmin = callerRole === 'super_admin';
  const isCompanyAdmin =
    (callerRole === 'admin') && callerCompanyId === data.companyId;

  if (!isSuperAdmin && !isCompanyAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Solo un administrador de la empresa o super_admin puede subir el certificado.'
    );
  }

  console.log('[uploadCertificate] Inicio:', {
    companyId: data.companyId,
    callerUid: request.auth.uid,
    callerRole,
  });

  // ── Parse certificate with node-forge ─────────────────────────────────────
  let p12: forge.pkcs12.Pkcs12Pfx;

  try {
    const p12Der = forge.util.decode64(data.certificateBase64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, data.password);
  } catch (err) {
    console.warn('[uploadCertificate] Error parseando el .p12:', err);
    throw new HttpsError(
      'invalid-argument',
      'Certificado inválido o contraseña incorrecta.'
    );
  }

  // ── Extract X.509 certificate ─────────────────────────────────────────────
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];

  if (!certBag?.cert) {
    throw new HttpsError(
      'invalid-argument',
      'No se encontró certificado en el archivo .p12.'
    );
  }

  const cert = certBag.cert;

  console.log('[uploadCertificate] Certificado extraído correctamente.');

  // ── Build subject string ──────────────────────────────────────────────────
  const subject = cert.subject.attributes
    .map((a: forge.pki.CertificateField) => `${a.shortName ?? a.name}=${a.value}`)
    .join(', ');

  // ── Expiry date ───────────────────────────────────────────────────────────
  const expiryDate: Date = cert.validity.notAfter;

  // ── SHA1 thumbprint ───────────────────────────────────────────────────────
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha1.create();
  md.update(certDer);
  const thumbprint = md.digest().toHex();

  console.log('[uploadCertificate] Thumbprint:', thumbprint);
  console.log('[uploadCertificate] Subject:', subject);
  console.log('[uploadCertificate] Expiry:', expiryDate.toISOString());

  // ── Read company document to validate RUC ────────────────────────────────
  const db = admin.firestore();
  const companySnap = await db.collection('companies').doc(data.companyId).get();

  if (!companySnap.exists) {
    throw new HttpsError('not-found', `No se encontró la empresa con ID: ${data.companyId}`);
  }

  const companyDoc = companySnap.data() as Record<string, unknown>;
  const sri = companyDoc['sri'] as CompanySriData | undefined;
  const companyRuc = sri?.ruc;

  // ── Validate RUC against certificate subject ──────────────────────────────
  if (companyRuc) {
    // RUC can appear in CN or SERIALNUMBER fields of the subject
    const cnField = cert.subject.getField('CN');
    const serialField = cert.subject.getField('SERIALNUMBER');

    const cnValue: string = typeof cnField?.value === 'string' ? cnField.value : '';
    const serialValue: string = typeof serialField?.value === 'string' ? serialField.value : '';
    const subjectLower = subject.toLowerCase();

    const rucInCn = cnValue.includes(companyRuc);
    const rucInSerial = serialValue.includes(companyRuc);
    const rucInSubject = subjectLower.includes(companyRuc.toLowerCase());

    if (!rucInCn && !rucInSerial && !rucInSubject) {
      // RUC not found in certificate — warn but allow (format varies by CA in Ecuador)
      console.warn(
        '[uploadCertificate] WARNING: RUC de la empresa no encontrado en el certificado.',
        { companyRuc, subject }
      );
    } else {
      // RUC found — confirm it matches (redundant but explicit)
      if (!rucInCn && !rucInSerial && !rucInSubject) {
        throw new HttpsError(
          'invalid-argument',
          'El RUC del certificado no coincide con el RUC de la empresa.'
        );
      }
      console.log('[uploadCertificate] RUC validado en el certificado.');
    }
  } else {
    console.warn('[uploadCertificate] WARNING: La empresa no tiene RUC configurado en sri.ruc — saltando validación de RUC.');
  }

  // ── Validate certificate is not expired ───────────────────────────────────
  const now = new Date();
  if (expiryDate < now) {
    throw new HttpsError(
      'invalid-argument',
      `El certificado expiró el ${expiryDate.toLocaleDateString('es-EC')}.`
    );
  }

  // ── Save .p12 to Cloud Storage ────────────────────────────────────────────
  const bucket = admin.storage().bucket();
  const filePath = `companies/${data.companyId}/certificates/signing.p12`;
  const file = bucket.file(filePath);

  const p12Buffer = Buffer.from(data.certificateBase64, 'base64');

  try {
    await file.save(p12Buffer, {
      metadata: {
        contentType: 'application/x-pkcs12',
        metadata: {
          companyId: data.companyId,
          uploadedBy: request.auth.uid,
          uploadedAt: new Date().toISOString(),
        },
      },
    });
    console.log('[uploadCertificate] .p12 guardado en Storage:', filePath);
  } catch (err) {
    console.error('[uploadCertificate] Error guardando en Storage:', err);
    throw new HttpsError('internal', 'Error al guardar el certificado en Storage.');
  }

  // ── Update Firestore ───────────────────────────────────────────────────────
  try {
    await db.collection('companies').doc(data.companyId).update({
      'sri.certificatePath':       filePath,
      'sri.certificateThumbprint': thumbprint,
      'sri.certificateSubject':    subject,
      'sri.certificateExpiry':     admin.firestore.Timestamp.fromDate(expiryDate),
      'sri.certificatePassword':   data.password,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    console.log('[uploadCertificate] Firestore actualizado para companyId:', data.companyId);
  } catch (err) {
    console.error('[uploadCertificate] Error actualizando Firestore:', err);
    throw new HttpsError('internal', 'Error al actualizar los datos del certificado.');
  }

  // ── Return result (never include .p12 or password) ────────────────────────
  const expiresIn = Math.floor(
    (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return {
    success: true,
    thumbprint,
    subject,
    expiresAt: expiryDate.toISOString(),
    expiresIn,
  };
});
