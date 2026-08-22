import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as forge from 'node-forge';

interface UploadCertificateData {
  companyId: string;
  certificateBase64: string;
  password: string;
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

  // ── Read company taxId from configuration/general ────────────────────────
  const db = admin.firestore();
  const companySnap = await db.collection('companies').doc(data.companyId).get();

  if (!companySnap.exists) {
    throw new HttpsError('not-found', `No se encontró la empresa con ID: ${data.companyId}`);
  }

  const configSnap = await db
    .collection('companies').doc(data.companyId)
    .collection('configuration').doc('general')
    .get();

  const companyTaxId: string = configSnap.exists
    ? ((configSnap.data() as Record<string, unknown>)['taxId'] as string | undefined) ?? ''
    : '';

  // ── Extract RUC/cédula from certificate subject ───────────────────────────
  // BCE Ecuador embeds the RUC in SERIALNUMBER field (most reliable).
  // Some CAs also include it inside CN: "APELLIDO NOMBRE - 1234567890001".
  const cnField      = cert.subject.getField('CN');
  const serialField  = cert.subject.getField('SERIALNUMBER');

  const certSerial: string = typeof serialField?.value === 'string' ? serialField.value.trim() : '';
  const certCn:     string = typeof cnField?.value     === 'string' ? cnField.value.trim()     : '';

  // Attempt to pull a 10- or 13-digit number from SERIALNUMBER or CN
  const taxIdPattern = /\b(\d{10}|\d{13})\b/;
  const certTaxId: string =
    certSerial.match(taxIdPattern)?.[1] ??
    certCn.match(taxIdPattern)?.[1] ??
    '';

  console.log('[uploadCertificate] certTaxId extraído:', certTaxId, '| companyTaxId:', companyTaxId);

  // ── Validate cert identity against company taxId ──────────────────────────
  if (companyTaxId && certTaxId) {
    if (certTaxId !== companyTaxId) {
      throw new HttpsError(
        'invalid-argument',
        `El certificado pertenece al RUC/cédula ${certTaxId}, ` +
        `pero la empresa tiene registrado ${companyTaxId}. ` +
        'Sube el certificado que corresponde a esta empresa.'
      );
    }
    console.log('[uploadCertificate] RUC/cédula validado correctamente:', certTaxId);
  } else if (companyTaxId && !certTaxId) {
    // Could not extract a tax ID from the cert — allow but warn
    console.warn(
      '[uploadCertificate] No se pudo extraer RUC/cédula del certificado. Subject:', subject
    );
  } else {
    console.warn('[uploadCertificate] Empresa sin taxId configurado — saltando validación.');
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
    expiresAt:      expiryDate.toISOString(),
    expiresIn,
    certOwnerTaxId: certTaxId,
    certOwnerName:  certCn,
  };
});
