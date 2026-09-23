/**
 * sign-xml.ts
 *
 * Signs the invoice XML using XAdES-BES (XML Advanced Electronic Signatures –
 * Basic Electronic Signature), as required by the SRI Ecuador web services.
 *
 * XAdES-BES structure implemented:
 *   - ds:SignedInfo with CanonicalizationMethod (C14N) and SignatureMethod (RSA-SHA1)
 *   - Three ds:Reference elements:
 *       1. Reference to the comprobante element (enveloped-signature transform, SHA1 digest)
 *       2. Reference to KeyInfo (SHA1 digest)
 *       3. Reference to xades:SignedProperties (SHA1 digest)
 *   - ds:SignatureValue (RSA-SHA1 over canonicalized SignedInfo)
 *   - ds:KeyInfo with X509Certificate
 *   - ds:Object containing xades:QualifyingProperties → xades:SignedProperties
 *       with xades:SigningTime and xades:SigningCertificate
 *
 * NOTE: Full C14N (Canonical XML 1.0) is approximated by serializing the
 * element sub-tree without the XML declaration and normalizing namespace
 * declarations. The SRI validation endpoint performs its own canonicalization
 * before verifying, so minor C14N approximations are acceptable in the digest
 * pre-image — the critical part is the correct RSA-SHA1 signature over the
 * actual SignedInfo element that the SRI endpoint constructs.
 *
 * For production use with strict C14N requirements, replace the
 * `canonicalize()` helper with a dedicated C14N library such as
 * `xml-crypto` or `@xmldom/xmldom` + `c14n`.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { readCertificatePassword } from '../utils/cert-password';
import { getStorage } from 'firebase-admin/storage';

import { signXmlContent } from '../utils/sign-xml-helper';

// ─── Core logic (exported for internal use by orchestrator) ───────────────────

export async function signXmlInternal(
  invoiceId: string,
  companyId: string,
  xmlFilename?: string
): Promise<{ signedXmlUrl: string; accessKey: string; sriStatus: string; invoiceId: string; nextStep: string }> {
  const db = admin.firestore();
  const bucket = getStorage().bucket();
  const now = admin.firestore.Timestamp.now();

  console.log('[sign-xml] Inicio:', { invoiceId, companyId, xmlFilename });

  // 1. Read Invoice — verify it exists
  const invoiceSnap = await db.doc(`companies/${companyId}/invoices/${invoiceId}`).get();
  if (!invoiceSnap.exists) {
    throw new Error(`Factura no encontrada: ${invoiceId}`);
  }

  // 2. Download original XML from Storage (use well-known path, not signed URL)
  // xmlFilename allows callers to override the default name (e.g. 'cn-{id}.xml' for credit notes)
  const resolvedFilename = xmlFilename ?? `${invoiceId}.xml`;
  const xmlStoragePath = `companies/${companyId}/xml/${resolvedFilename}`;
  let xmlBuffer: Buffer;
  try {
    [xmlBuffer] = await bucket.file(xmlStoragePath).download();
    console.log('[sign-xml] XML descargado:', xmlStoragePath, '| bytes:', xmlBuffer.length);
  } catch (err) {
    console.error('[sign-xml] Error descargando XML:', err);
    throw new Error('No se encontró el XML de la factura en Storage. Ejecute primero generateInvoiceXml.');
  }
  const xmlContent = xmlBuffer.toString('utf8');

  // 3. Download .p12 certificate from Storage
  const certStoragePath = `companies/${companyId}/certificates/signing.p12`;
  let certBuffer: Buffer;
  try {
    [certBuffer] = await bucket.file(certStoragePath).download();
    console.log('[sign-xml] Certificado .p12 descargado:', certStoragePath);
  } catch (err) {
    console.error('[sign-xml] Error descargando .p12:', err);
    throw new Error('No se encontró el certificado de firma en Storage. Cargue el certificado .p12 primero.');
  }

  // 4. La contraseña, de Secret Manager (nunca de la petición).
  //
  // El campo viejo de Firestore se pasa como puente: si esta empresa todavía no
  // tiene secreto, se migra ahí mismo y se borra el campo.
  const companySnap = await db.doc(`companies/${companyId}`).get();
  const legacy: string | undefined = (companySnap.data() as any)?.sri?.certificatePassword;
  const password = await readCertificatePassword(companyId, legacy);
  if (!password) {
    throw new Error('No se encontró la contraseña del certificado. Vuelva a subir el certificado .p12 desde la configuración.');
  }
  console.log('[sign-xml] Contraseña del certificado obtenida.');

  // 5. Sign XML using unified helper (parses .p12 and applies XAdES-BES internally)
  let signedXml: string;
  try {
    signedXml = signXmlContent(xmlContent, certBuffer, password);
    console.log('[sign-xml] XML firmado, longitud:', signedXml.length);
  } catch (err) {
    console.error('[sign-xml] Error firmando XML:', err);
    throw new Error(`Error al firmar el XML: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 7. Upload signed XML to Storage
  const signedXmlPath = `companies/${companyId}/xml/${invoiceId}-signed.xml`;
  const signedXmlFile = bucket.file(signedXmlPath);
  try {
    await signedXmlFile.save(Buffer.from(signedXml, 'utf8'), {
      metadata: { contentType: 'application/xml' },
    });
    console.log('[sign-xml] XML firmado subido a Storage:', signedXmlPath);
  } catch (err) {
    console.error('[sign-xml] Error subiendo XML firmado:', err);
    throw new Error('Error al guardar XML firmado en Storage');
  }

  await signedXmlFile.makePublic();
  const signedXmlUrl = `https://storage.googleapis.com/${signedXmlFile.bucket.name}/${signedXmlFile.name}`;

  // 8. Update Invoice
  const invoiceData = invoiceSnap.data() as any;
  const accessKey: string = invoiceData?.accessKey ?? '';

  await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
    xmlUrl: signedXmlUrl,
    sriStatus: 'signed',
    updatedAt: now,
  });

  console.log('[sign-xml] Factura actualizada — sriStatus: signed');
  return {
    invoiceId,
    accessKey,
    sriStatus:     'signed',
    signedXmlUrl,
    nextStep:      'sendToSri',
  };
}

// ─── Callable function ────────────────────────────────────────────────────────

export const signXml = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const { invoiceId, companyId } = request.data as {
    invoiceId: string;
    companyId: string;
  };

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
    return await signXmlInternal(invoiceId, companyId);
  } catch (err) {
    console.error('[sign-xml] Error callable:', err);
    const message = err instanceof Error ? err.message : 'Error firmando XML';
    throw new HttpsError('internal', message);
  }
});
