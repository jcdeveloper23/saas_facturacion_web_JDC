/**
 * sign-xml-helper.ts
 *
 * XAdES-BES enveloped signature for Ecuador SRI comprobantes.
 *
 * Namespace strategy (critical for C14N correctness):
 *   ALL namespace declarations live ONLY on <ds:Signature>:
 *     xmlns:ds    = http://www.w3.org/2000/09/xmldsig#
 *     xmlns:xades = http://uri.etsi.org/01903/v1.3.2#
 *
 *   No child element (ds:SignedInfo, ds:KeyInfo, xades:SignedProperties, etc.)
 *   re-declares them.  This is required so that our standalone digest
 *   computations produce identical bytes to what the SRI computes when it
 *   canonicalizes each referenced element in-document-context (C14N 1.0
 *   does not re-emit namespace declarations already rendered by an ancestor).
 *
 * C14N helpers:
 *   canonicalize() = stripXmlDeclaration → expandSelfClosingTags → sortAttributes
 *   ORDER MATTERS: expand must run before sort so the sort regex never sees "/>"
 *   and accidentally converts self-closing tags into unclosed start-tags.
 */

import * as forge from 'node-forge';

const DS_NS    = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';

// ─── C14N helpers ─────────────────────────────────────────────────────────────

function stripXmlDeclaration(xml: string): string {
  // Remove <?xml...?> and the immediately following whitespace.
  // Do NOT call .trim() — that would remove internal whitespace (e.g. the \n
  // before </factura>) that C14N must preserve, causing a digest mismatch.
  return xml.replace(/<\?xml[^?]*\?>\s*/i, '');
}

/**
 * Expand <tag attr="..." /> → <tag attr="..."></tag>
 * Must run BEFORE sortAttributes — the sort regex would otherwise swallow
 * the "/" from "/>" and produce unclosed start-tags.
 */
function expandSelfClosingTags(xml: string): string {
  return xml.replace(
    /<([a-zA-Z:][a-zA-Z0-9:._-]*)(\s[^>]*)?\s*\/>/g,
    (_, tagName: string, attrs: string | undefined) => `<${tagName}${attrs ?? ''}></${tagName}>`,
  );
}

/**
 * Sort attributes within each opening tag: xmlns:* declarations first,
 * then regular attributes, both groups in lexicographic order.
 * Must run AFTER expandSelfClosingTags.
 */
function sortAttributes(xml: string): string {
  return xml.replace(
    /<([a-zA-Z:][a-zA-Z0-9:._-]*)(\s[^>]+)?>/g,
    (_match, tagName: string, attrsBlock: string | undefined) => {
      if (!attrsBlock?.trim()) return `<${tagName}>`;

      const attrRe = /(\S+)=(?:"([^"]*)"|'([^']*)')/g;
      const attrs: { key: string; val: string }[] = [];
      let m: RegExpExecArray | null;
      while ((m = attrRe.exec(attrsBlock)) !== null) {
        attrs.push({ key: m[1], val: m[2] ?? m[3] ?? '' });
      }
      attrs.sort((a, b) => {
        const aNs = a.key === 'xmlns' || a.key.startsWith('xmlns:');
        const bNs = b.key === 'xmlns' || b.key.startsWith('xmlns:');
        if (aNs && !bNs) return -1;
        if (!aNs && bNs) return 1;
        return a.key.localeCompare(b.key);
      });
      return `<${tagName} ${attrs.map(a => `${a.key}="${a.val}"`).join(' ')}>`;
    },
  );
}

/** Full C14N 1.0 approximation used for all digest and signing inputs. */
function c14n(xml: string): string {
  return sortAttributes(expandSelfClosingTags(stripXmlDeclaration(xml)));
}

// ─── Crypto ───────────────────────────────────────────────────────────────────

function sha1b64(data: string): string {
  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(data));
  return forge.util.encode64(md.digest().bytes());
}

function rsaSha1Sign(data: string, key: forge.pki.rsa.PrivateKey): string {
  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(data));
  return forge.util.encode64((key as any).sign(md));
}

// ─── XAdES-BES builder ────────────────────────────────────────────────────────

interface SigningContext {
  xmlContent:  string;
  certificate: forge.pki.Certificate;
  privateKey:  forge.pki.rsa.PrivateKey;
  idPrefix?:   string;
}

function buildSignedXml(ctx: SigningContext): string {
  const { xmlContent, certificate, privateKey } = ctx;
  const px = ctx.idPrefix ?? '';

  const SIG_ID          = `${px}Signature`;
  const SIGNED_INFO_ID  = `${px}Signature-SignedInfo`;
  const KEY_INFO_ID     = `${px}Certificate`;
  const OBJ_ID          = `${px}Signature-xades-Signature`;
  const SIGNED_PROPS_ID = `${px}Signature-SignedProperties`;
  const REF_DOC         = 'comprobante';
  const REF_KI          = `${px}Signature-KeyInfo`;
  const REF_SP          = `${px}SignedPropertiesID`;

  // ── Certificate metadata ───────────────────────────────────────────────────
  const certAsn1    = forge.pki.certificateToAsn1(certificate);
  const certDer     = forge.asn1.toDer(certAsn1).getBytes();
  const certBase64  = forge.util.encode64(certDer);

  const certMd = forge.md.sha1.create();
  certMd.update(certDer);
  const certThumbprint = forge.util.encode64(certMd.digest().bytes());

  const issuerName    = certificate.issuer.attributes
    .map((a: forge.pki.CertificateField) => `${a.shortName ?? a.name}=${a.value}`)
    .join(',');
  const serialDecimal = BigInt('0x' + (certificate.serialNumber || '0')).toString();
  const signingTime   = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  // ── Digest #1 — comprobante (pre-signature unsigned document) ────────────
  // The enveloped-signature transform removes ds:Signature; since we compute
  // this BEFORE inserting the signature, the content is identical.
  const digestDoc = sha1b64(c14n(xmlContent));

  // ── ds:KeyInfo (NO xmlns:ds — provided by ancestor ds:Signature) ──────────
  const kiXml =
    `<ds:KeyInfo Id="${KEY_INFO_ID}">` +
      `<ds:X509Data>` +
        `<ds:X509Certificate>${certBase64}</ds:X509Certificate>` +
      `</ds:X509Data>` +
    `</ds:KeyInfo>`;
  const digestKi = sha1b64(c14n(kiXml));

  // ── xades:SignedProperties (NO xmlns — all provided by ancestor ds:Signature) ─
  const spXml =
    `<xades:SignedProperties Id="${SIGNED_PROPS_ID}">` +
      `<xades:SignedSignatureProperties>` +
        `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
        `<xades:SigningCertificate>` +
          `<xades:Cert>` +
            `<xades:CertDigest>` +
              `<ds:DigestMethod Algorithm="${DS_NS}sha1"></ds:DigestMethod>` +
              `<ds:DigestValue>${certThumbprint}</ds:DigestValue>` +
            `</xades:CertDigest>` +
            `<xades:IssuerSerial>` +
              `<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>` +
              `<ds:X509SerialNumber>${serialDecimal}</ds:X509SerialNumber>` +
            `</xades:IssuerSerial>` +
          `</xades:Cert>` +
        `</xades:SigningCertificate>` +
      `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>`;
  const digestSp = sha1b64(c14n(spXml));

  // ── ds:SignedInfo (NO xmlns:ds — provided by ancestor ds:Signature) ───────
  const siXml =
    `<ds:SignedInfo Id="${SIGNED_INFO_ID}">` +
      `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
      `<ds:SignatureMethod Algorithm="${DS_NS}rsa-sha1"></ds:SignatureMethod>` +
      `<ds:Reference Id="${REF_DOC}" URI="#${REF_DOC}">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="${DS_NS}enveloped-signature"></ds:Transform>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="${DS_NS}sha1"></ds:DigestMethod>` +
        `<ds:DigestValue>${digestDoc}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference Id="${REF_KI}" URI="#${KEY_INFO_ID}">` +
        `<ds:DigestMethod Algorithm="${DS_NS}sha1"></ds:DigestMethod>` +
        `<ds:DigestValue>${digestKi}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference Id="${REF_SP}" Type="${XADES_NS}SignedProperties" URI="#${SIGNED_PROPS_ID}">` +
        `<ds:DigestMethod Algorithm="${DS_NS}sha1"></ds:DigestMethod>` +
        `<ds:DigestValue>${digestSp}</ds:DigestValue>` +
      `</ds:Reference>` +
    `</ds:SignedInfo>`;

  // c14n(siXml) matches SRI's canonical ds:SignedInfo because ds:SignedInfo has
  // no inline xmlns:ds (it would be stripped by SRI's C14N ancestor propagation).
  const sigValue = rsaSha1Sign(c14n(siXml), privateKey);

  // ── Full ds:Signature — ONLY place where namespaces are declared ──────────
  const sigElement =
    `<ds:Signature Id="${SIG_ID}" xmlns:ds="${DS_NS}" xmlns:xades="${XADES_NS}">` +
      siXml +
      `<ds:SignatureValue>${sigValue}</ds:SignatureValue>` +
      kiXml +
      `<ds:Object Id="${OBJ_ID}">` +
        `<xades:QualifyingProperties Target="#${SIG_ID}">` +
          spXml +
        `</xades:QualifyingProperties>` +
      `</ds:Object>` +
    `</ds:Signature>`;

  // Inject before closing root tag (works for factura, retencion, notaDebito…)
  const closingMatch = xmlContent.match(/<\/(\w[\w:]*)>\s*$/);
  if (!closingMatch) throw new Error('No se encontró tag de cierre raíz en el XML.');
  const closingTag       = closingMatch[0].trim();
  const bodyWithoutClose = xmlContent.slice(0, xmlContent.lastIndexOf(closingTag));

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    stripXmlDeclaration(bodyWithoutClose) +
    sigElement +
    closingTag;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function signXmlContent(
  xmlContent:   string,
  p12Buffer:    Buffer,
  certPassword: string,
  idPrefix?:    string,
): string {
  let certificate: forge.pki.Certificate;
  let privateKey:  forge.pki.rsa.PrivateKey;

  try {
    const p12Der  = p12Buffer.toString('binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certPassword);

    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
    if (!certBag?.cert) throw new Error('No se encontró certificado en el .p12.');

    const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    if (!keyBag?.key) throw new Error('No se encontró llave privada en el .p12.');

    certificate = certBag.cert;
    privateKey  = keyBag.key as forge.pki.rsa.PrivateKey;
  } catch (err) {
    throw new Error(`Error al parsear .p12: ${err instanceof Error ? err.message : err}`);
  }

  return buildSignedXml({ xmlContent, certificate, privateKey, idPrefix });
}
