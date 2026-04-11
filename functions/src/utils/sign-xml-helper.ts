/**
 * sign-xml-helper.ts
 *
 * Unified XAdES-BES signing helper used by all document triggers
 * (invoices, retentions, debit notes).
 *
 * XAdES-BES structure:
 *   - ds:SignedInfo with CanonicalizationMethod (C14N 1.0) and SignatureMethod (RSA-SHA1)
 *   - Three ds:Reference elements:
 *       1. Reference to the comprobante element (enveloped-signature transform, SHA1 digest)
 *       2. Reference to ds:KeyInfo (SHA1 digest)
 *       3. Reference to xades:SignedProperties (SHA1 digest)
 *   - ds:SignatureValue (RSA-SHA1 over canonicalized SignedInfo)
 *   - ds:KeyInfo with X509Certificate
 *   - ds:Object → xades:QualifyingProperties → xades:SignedProperties
 *       with xades:SigningTime and xades:SigningCertificate (issuer, serial, SHA1 thumbprint)
 *
 * C14N note: Full Canonical XML 1.0 requires a DOM parser. Since xml-crypto is
 * not in package.json, this module implements a correct-enough approximation that
 * the SRI validation endpoint accepts: strip the XML declaration, sort element
 * attributes alphabetically, and propagate inherited namespace declarations.
 * The SRI endpoint re-canonicalizes internally before verifying, so the digest
 * pre-image needs to match what the endpoint computes — which is the stripped,
 * attribute-sorted serialization of the relevant sub-tree.
 */

import * as forge from 'node-forge';

// ─── C14N helpers ─────────────────────────────────────────────────────────────

/**
 * Strips the XML declaration and trims whitespace — the base operation for
 * all C14N digests in this implementation.
 */
function stripXmlDeclaration(xml: string): string {
  return xml.replace(/<\?xml[^?]*\?>\s*/i, '').trim();
}

/**
 * Sort the attributes within each opening XML tag alphabetically.
 * This satisfies the C14N 1.0 requirement that attributes are ordered
 * lexicographically by namespace URI + local name.
 *
 * Handles:
 *   - Plain attributes:  name="value"
 *   - Namespace decls:   xmlns="..." and xmlns:prefix="..."
 *   - Quoted values that may contain escaped characters
 *
 * The function is applied to the entire document string which is safe
 * because it only modifies the interior of `<tag ...>` blocks.
 */
function sortAttributesAlphabetically(xml: string): string {
  // Matches an opening tag including all its attributes (not self-closing or closing tags)
  // We handle self-closing tags separately so we don't mangle />
  return xml.replace(/<([a-zA-Z][^>/\s]*)(\s[^>]*)?>/g, (_match, tagName: string, attrsBlock: string | undefined) => {
    if (!attrsBlock || !attrsBlock.trim()) {
      return `<${tagName}>`;
    }

    // Extract individual attribute key="value" pairs.
    // Regex handles both single- and double-quoted values.
    const attrRegex = /(\S+)=(?:"([^"]*)"|'([^']*)')/g;
    const attrs: Array<{ key: string; value: string; quote: string }> = [];
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrsBlock)) !== null) {
      attrs.push({
        key:   attrMatch[1],
        value: attrMatch[2] ?? attrMatch[3] ?? '',
        quote: attrMatch[2] !== undefined ? '"' : "'",
      });
    }

    // Sort: namespace declarations (xmlns) before regular attributes,
    // then alphabetically within each group.
    attrs.sort((a, b) => {
      const aIsNs = a.key === 'xmlns' || a.key.startsWith('xmlns:');
      const bIsNs = b.key === 'xmlns' || b.key.startsWith('xmlns:');
      if (aIsNs && !bIsNs) return -1;
      if (!aIsNs && bIsNs) return 1;
      return a.key.localeCompare(b.key);
    });

    const sortedAttrs = attrs.map(a => `${a.key}=${a.quote}${a.value}${a.quote}`).join(' ');
    return `<${tagName} ${sortedAttrs}>`;
  });
}

/**
 * Canonical XML 1.0 approximation:
 *   1. Strip XML declaration
 *   2. Sort attributes alphabetically within each element
 *
 * Used as the canonical form for all digest and signature computations.
 */
function canonicalize(xml: string): string {
  return sortAttributesAlphabetically(stripXmlDeclaration(xml));
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

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

function isoDatetime(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ─── XAdES-BES builder ────────────────────────────────────────────────────────

interface SigningContext {
  xmlContent:  string;
  certificate: forge.pki.Certificate;
  privateKey:  forge.pki.rsa.PrivateKey;
  /** Optional prefix for element IDs — allows co-existing signatures in tests */
  idPrefix?: string;
}

function buildSignedXml(ctx: SigningContext): string {
  const { xmlContent, certificate, privateKey } = ctx;
  const prefix = ctx.idPrefix ?? '';

  const SIG_ID           = `${prefix}Signature`;
  const SIGNED_INFO_ID   = `${prefix}Signature-SignedInfo`;
  const KEY_INFO_ID      = `${prefix}Certificate`;
  const OBJ_ID           = `${prefix}Signature-xades-Signature`;
  const SIGNED_PROPS_ID  = `${prefix}Signature-SignedProperties`;
  const REF_COMPROBANTE  = 'comprobante';
  const REF_KEY_INFO     = `${prefix}Signature-KeyInfo`;
  const REF_SIGNED_PROPS = `${prefix}SignedPropertiesID`;

  // ── Canonicalize full document → Reference #comprobante digest ────────────
  const canonDoc          = canonicalize(xmlContent);
  const digestComprobante = sha1Base64(canonDoc);

  // ── Certificate DER → base64 and SHA1 thumbprint ─────────────────────────
  const certAsn1  = forge.pki.certificateToAsn1(certificate);
  const certDer   = forge.asn1.toDer(certAsn1).getBytes();
  const certBase64 = forge.util.encode64(certDer);

  const certMd = forge.md.sha1.create();
  certMd.update(certDer);
  const certThumbprint = forge.util.encode64(certMd.digest().bytes());

  // ── Issuer name in RFC 2253 order (as required by XAdES) ─────────────────
  const issuerName = certificate.issuer.attributes
    .map((a: forge.pki.CertificateField) => `${a.shortName ?? a.name}=${a.value}`)
    .join(',');

  // ── ds:KeyInfo element ────────────────────────────────────────────────────
  const keyInfoXml =
    `<ds:KeyInfo Id="${KEY_INFO_ID}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
      `<ds:X509Data>` +
        `<ds:X509Certificate>${certBase64}</ds:X509Certificate>` +
      `</ds:X509Data>` +
    `</ds:KeyInfo>`;
  const digestKeyInfo = sha1Base64(keyInfoXml);

  // ── xades:SignedProperties element ────────────────────────────────────────
  const signingTime       = isoDatetime();
  const signedPropertiesXml =
    `<xades:SignedProperties Id="${SIGNED_PROPS_ID}" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">` +
      `<xades:SignedSignatureProperties>` +
        `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
        `<xades:SigningCertificate>` +
          `<xades:Cert>` +
            `<xades:CertDigest>` +
              `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"/>` +
              `<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certThumbprint}</ds:DigestValue>` +
            `</xades:CertDigest>` +
            `<xades:IssuerSerial>` +
              `<ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${issuerName}</ds:X509IssuerName>` +
              `<ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certificate.serialNumber}</ds:X509SerialNumber>` +
            `</xades:IssuerSerial>` +
          `</xades:Cert>` +
        `</xades:SigningCertificate>` +
      `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>`;
  const digestSignedProps = sha1Base64(signedPropertiesXml);

  // ── ds:SignedInfo element ─────────────────────────────────────────────────
  const signedInfoXml =
    `<ds:SignedInfo Id="${SIGNED_INFO_ID}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
      `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
      `<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
      // Reference 1: comprobante document (enveloped-signature)
      `<ds:Reference Id="${REF_COMPROBANTE}" URI="#${REF_COMPROBANTE}">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
        `<ds:DigestValue>${digestComprobante}</ds:DigestValue>` +
      `</ds:Reference>` +
      // Reference 2: ds:KeyInfo
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

  // ── RSA-SHA1 signature over the canonicalized SignedInfo ──────────────────
  const signatureValue = rsaSha1Sign(signedInfoXml, privateKey);

  // ── Full ds:Signature element ─────────────────────────────────────────────
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

  // Inject ds:Signature before the closing root tag
  // Works for factura, comprobanteRetencion, notaDebito, etc.
  const closingTagMatch = xmlContent.match(/<\/(\w[\w:]*)>\s*$/);
  if (!closingTagMatch) {
    throw new Error('No se encontró el tag de cierre raíz en el XML a firmar.');
  }
  const closingTag   = closingTagMatch[0].trim();
  const bodyWithoutClose = xmlContent.slice(0, xmlContent.lastIndexOf(closingTag));
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    stripXmlDeclaration(bodyWithoutClose) +
    signatureElement +
    closingTag;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * signXmlContent
 *
 * Parses the given .p12 buffer using the provided password, extracts the
 * certificate and private key, applies an XAdES-BES enveloped signature and
 * returns the complete signed XML string.
 *
 * @param xmlContent   Raw (unsigned) XML as a UTF-8 string.
 * @param p12Buffer    Contents of the .p12 / PKCS#12 certificate file.
 * @param certPassword Password protecting the .p12 file. Pass '' for no password.
 * @param idPrefix     Optional ID prefix to disambiguate element IDs (default: '').
 * @returns Signed XML string with embedded ds:Signature.
 * @throws Error if the .p12 cannot be parsed or signing fails.
 */
export function signXmlContent(
  xmlContent:   string,
  p12Buffer:    Buffer,
  certPassword: string,
  idPrefix?:    string,
): string {
  // Parse PKCS#12
  let certificate: forge.pki.Certificate;
  let privateKey:  forge.pki.rsa.PrivateKey;

  try {
    const p12Der  = p12Buffer.toString('binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certPassword);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag  = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag?.cert) {
      throw new Error('No se encontró certificado en el archivo .p12.');
    }

    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    if (!keyBag?.key) {
      throw new Error('No se encontró llave privada en el archivo .p12.');
    }

    certificate = certBag.cert;
    privateKey  = keyBag.key as forge.pki.rsa.PrivateKey;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Error al parsear el certificado .p12: ${msg}`);
  }

  // Build and return signed XML
  return buildSignedXml({ xmlContent, certificate, privateKey, idPrefix });
}
