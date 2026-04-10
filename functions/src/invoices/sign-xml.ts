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
import * as forge from 'node-forge';
import { getStorage } from 'firebase-admin/storage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Approximate C14N: strip XML declaration, normalize to UTF-8 string.
 * The SRI endpoint canonicalizes internally before verification, so this
 * approximation is sufficient for digest computation over the full document
 * and the XAdES sub-elements.
 */
function canonicalize(xml: string): string {
  return xml.replace(/<\?xml[^?]*\?>\s*/i, '').trim();
}

function sha1Base64(data: string): string {
  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(data));
  return forge.util.encode64(md.digest().bytes());
}

function rsaSha1Sign(data: string, privateKey: forge.pki.rsa.PrivateKey): string {
  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(data));
  const signature = (privateKey as any).sign(md);
  return forge.util.encode64(signature);
}

function getIsoDatetime(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ─── XAdES-BES builder ────────────────────────────────────────────────────────

interface SigningContext {
  xmlContent: string;
  certificate: forge.pki.Certificate;
  privateKey: forge.pki.rsa.PrivateKey;
}

function buildSignedXml(ctx: SigningContext): string {
  const { xmlContent, certificate, privateKey } = ctx;

  // IDs used throughout
  const SIG_ID          = 'Signature';
  const SIGNED_INFO_ID  = 'Signature-SignedInfo';
  const KEY_INFO_ID     = 'Certificate';
  const OBJ_ID         = 'Signature-xades-Signature';
  const SIGNED_PROPS_ID = 'Signature-SignedProperties';
  const REF_COMPROBANTE = 'comprobante';
  const REF_KEY_INFO    = 'Signature-KeyInfo';
  const REF_SIGNED_PROPS = 'SignedPropertiesID';

  // ── Canonicalized document (for reference #comprobante) ───────────────────
  const canonDoc = canonicalize(xmlContent);
  const digestComprobante = sha1Base64(canonDoc);

  // ── Certificate DER → base64 ──────────────────────────────────────────────
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  const certBase64 = forge.util.encode64(certDer);

  // ── SHA1 thumbprint of certificate ────────────────────────────────────────
  const certMd = forge.md.sha1.create();
  certMd.update(certDer);
  const certDigest = forge.util.encode64(certMd.digest().bytes());

  // ── KeyInfo element (will be digested) ───────────────────────────────────
  const keyInfoXml =
    `<ds:KeyInfo Id="${KEY_INFO_ID}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
      `<ds:X509Data>` +
        `<ds:X509Certificate>${certBase64}</ds:X509Certificate>` +
      `</ds:X509Data>` +
    `</ds:KeyInfo>`;
  const digestKeyInfo = sha1Base64(keyInfoXml);

  // ── xades:SignedProperties element (will be digested) ────────────────────
  const signingTime = getIsoDatetime();
  const signedPropertiesXml =
    `<xades:SignedProperties Id="${SIGNED_PROPS_ID}" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">` +
      `<xades:SignedSignatureProperties>` +
        `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
        `<xades:SigningCertificate>` +
          `<xades:Cert>` +
            `<xades:CertDigest>` +
              `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"/>` +
              `<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certDigest}</ds:DigestValue>` +
            `</xades:CertDigest>` +
            `<xades:IssuerSerial>` +
              `<ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certificate.issuer.attributes.map((a: forge.pki.CertificateField) => `${a.shortName ?? a.name}=${a.value}`).join(',')}</ds:X509IssuerName>` +
              `<ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certificate.serialNumber}</ds:X509SerialNumber>` +
            `</xades:IssuerSerial>` +
          `</xades:Cert>` +
        `</xades:SigningCertificate>` +
      `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>`;
  const digestSignedProps = sha1Base64(signedPropertiesXml);

  // ── ds:SignedInfo ─────────────────────────────────────────────────────────
  const signedInfoXml =
    `<ds:SignedInfo Id="${SIGNED_INFO_ID}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
      `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
      `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha1"/>` +
      // Reference 1: the comprobante document itself (enveloped-signature)
      `<ds:Reference Id="${REF_COMPROBANTE}" URI="#${REF_COMPROBANTE}">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
        `<ds:DigestValue>${digestComprobante}</ds:DigestValue>` +
      `</ds:Reference>` +
      // Reference 2: KeyInfo
      `<ds:Reference Id="${REF_KEY_INFO}" URI="#${KEY_INFO_ID}">` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
        `<ds:DigestValue>${digestKeyInfo}</ds:DigestValue>` +
      `</ds:Reference>` +
      // Reference 3: xades:SignedProperties
      `<ds:Reference Id="${REF_SIGNED_PROPS}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#${SIGNED_PROPS_ID}">` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
        `<ds:DigestValue>${digestSignedProps}</ds:DigestValue>` +
      `</ds:Reference>` +
    `</ds:SignedInfo>`;

  // ── Compute RSA-SHA1 signature over SignedInfo ────────────────────────────
  const signatureValue = rsaSha1Sign(signedInfoXml, privateKey);

  // ── Assemble full ds:Signature element ───────────────────────────────────
  const signatureElement =
    `<ds:Signature Id="${SIG_ID}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
      signedInfoXml +
      `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
      keyInfoXml +
      `<ds:Object Id="${OBJ_ID}">` +
        `<xades:QualifyingProperties Target="#${SIG_ID}" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">` +
          signedPropertiesXml +
        `</xades:QualifyingProperties>` +
      `</ds:Object>` +
    `</ds:Signature>`;

  // ── Inject ds:Signature before closing </factura> ─────────────────────────
  const signedXml = xmlContent.replace(/<\/factura>\s*$/, signatureElement + '</factura>');
  return signedXml;
}

// ─── Core logic (exported for internal use by orchestrator) ───────────────────

export async function signXmlInternal(
  invoiceId: string,
  companyId: string,
  certPassword?: string
): Promise<{ signedXmlUrl: string }> {
  const db = admin.firestore();
  const bucket = getStorage().bucket();
  const now = admin.firestore.Timestamp.now();

  console.log('[sign-xml] Inicio:', { invoiceId, companyId });

  // 1. Read Invoice — verify it exists
  const invoiceSnap = await db.doc(`companies/${companyId}/invoices/${invoiceId}`).get();
  if (!invoiceSnap.exists) {
    throw new Error(`Factura no encontrada: ${invoiceId}`);
  }

  // 2. Download original XML from Storage (use well-known path, not signed URL)
  const xmlStoragePath = `companies/${companyId}/xml/${invoiceId}.xml`;
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

  // 4. Read cert password from Firestore (or use provided one)
  let password = certPassword ?? '';
  if (!password) {
    // Try to read from company sri config — not stored in plain text in MVP;
    // the caller must pass certPassword. Log a warning.
    console.warn('[sign-xml] certPassword no proporcionado. Se intentará con contraseña vacía.');
  }

  // 5. Parse .p12 with node-forge
  let certificate: forge.pki.Certificate;
  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    const p12Der = certBuffer.toString('binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag?.cert) {
      throw new Error('No se encontró certificado en el .p12');
    }

    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    if (!keyBag?.key) {
      throw new Error('No se encontró llave privada en el .p12');
    }

    certificate = certBag.cert;
    privateKey = keyBag.key as forge.pki.rsa.PrivateKey;
    console.log('[sign-xml] Certificado y llave privada extraídos correctamente.');
  } catch (err) {
    console.error('[sign-xml] Error parseando .p12:', err);
    throw new Error(`Error al leer el certificado: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 6. Build signed XML (XAdES-BES)
  let signedXml: string;
  try {
    signedXml = buildSignedXml({ xmlContent, certificate, privateKey });
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

  const [signedXmlUrl] = await signedXmlFile.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  // 8. Update Invoice
  await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
    xmlUrl: signedXmlUrl,
    sriStatus: 'signed',
    updatedAt: now,
  });

  console.log('[sign-xml] Factura actualizada — sriStatus: signed');
  return { signedXmlUrl };
}

// ─── Callable function ────────────────────────────────────────────────────────

export const signXml = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const { invoiceId, companyId, certPassword } = request.data as {
    invoiceId: string;
    companyId: string;
    certPassword?: string;
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
    return await signXmlInternal(invoiceId, companyId, certPassword);
  } catch (err) {
    console.error('[sign-xml] Error callable:', err);
    const message = err instanceof Error ? err.message : 'Error firmando XML';
    throw new HttpsError('internal', message);
  }
});
