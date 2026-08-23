/**
 * sign-xml-helper.ts
 *
 * XAdES-BES enveloped signature for Ecuador SRI comprobantes.
 *
 * Namespace strategy (critical for C14N correctness) — matches the OFFICIAL
 * example in ANEXO 14 of the SRI's own "Ficha Técnica Comprobantes
 * Electrónicos — Esquema Offline" (v234): xmlns:ds AND xmlns:xades are BOTH
 * declared on <ds:Signature> itself. Every element under it — SignedInfo,
 * KeyInfo, Object, QualifyingProperties, SignedProperties — inherits BOTH,
 * so both must be included when canonicalizing any of those fragments
 * standalone for digest/signature computation — see withInheritedNs().
 * Getting this scope wrong produces digests that are internally
 * self-consistent but don't match the SRI's independently computed ones,
 * which it reports simply as "FIRMA INVALIDA".
 *
 * (An earlier version of this file split the two namespaces — xmlns:xades
 * declared only on QualifyingProperties — to mirror a third-party reference
 * implementation. That was reverted after reading the SRI's own spec, which
 * unambiguously declares both on ds:Signature in its worked example.)
 *
 * Also per that same official example (not just convention):
 *   - ds:Reference order inside SignedInfo: SignedProperties, then KeyInfo,
 *     then the comprobante (#comprobante) reference — see buildSignedXml().
 *   - The SignedProperties reference's Type attribute is the FIXED XAdES
 *     constant "http://uri.etsi.org/01903#SignedProperties" — NOT
 *     XADES_NS + "SignedProperties" (i.e. NOT ".../01903/v1.3.2#SignedProperties").
 *     These are two different, unrelated URIs; using the wrong one was a
 *     real bug present since this file's first version.
 *
 * C14N helpers:
 *   canonicalize() = stripXmlDeclaration → expandSelfClosingTags → sortAttributes
 *   ORDER MATTERS: expand must run before sort so the sort regex never sees "/>"
 *   and accidentally converts self-closing tags into unclosed start-tags.
 */

import * as forge from 'node-forge';
import { randomUUID } from 'crypto';

const DS_NS    = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
// Fixed XAdES constant for the SignedProperties Reference's Type attribute —
// NOT derived from XADES_NS. Per ETSI TS 101 903 / SRI Anexo 14 example.
const XADES_SIGNED_PROPERTIES_TYPE = 'http://uri.etsi.org/01903#SignedProperties';

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
export function c14n(xml: string): string {
  return sortAttributes(expandSelfClosingTags(stripXmlDeclaration(xml)));
}

/**
 * Adds xmlns:ds AND xmlns:xades to a fragment's root tag before canonicalizing
 * it — every signed fragment (SignedInfo, KeyInfo, SignedProperties) is a
 * descendant of ds:Signature, which declares both. Only for digest/signature
 * computation input — never for the XML actually embedded in the document.
 */
export function withInheritedNs(xml: string): string {
  return xml.replace(
    /^(<[a-zA-Z:][a-zA-Z0-9:._-]*)/,
    `$1 xmlns:ds="${DS_NS}" xmlns:xades="${XADES_NS}"`,
  );
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
  /** Additional certs (intermediate/root CA) from the .p12, embedded after the leaf in ds:X509Data — see chainCertificates below. */
  chainCertificates?: forge.pki.Certificate[];
}

function buildSignedXml(ctx: SigningContext): string {
  const { xmlContent, certificate, privateKey } = ctx;
  const px = ctx.idPrefix ?? '';
  const chainCerts = ctx.chainCertificates ?? [];

  // IDs únicos por firma (no constantes) — mismo patrón que un XAdES de referencia
  // (Odoo) confirmado AUTORIZADO por el SRI el mismo día con el mismo certificado.
  // Con IDs fijos idénticos en cada comprobante emitido, el SRI rechazaba con
  // "FIRMA INVALIDA" incluso con la firma matemáticamente válida y el XML
  // válido contra el XSD oficial — la única diferencia estructural restante
  // frente a una firma que sí se autorizó era el uso de Id constantes.
  const sigUuid   = randomUUID();
  const certUuid  = randomUUID();
  const propsUuid = randomUUID();

  const SIG_ID          = `${px}Signature${sigUuid}`;
  const SIGNED_INFO_ID  = `${px}Signature-SignedInfo${sigUuid}`;
  const KEY_INFO_ID     = `${px}Certificate${certUuid}`;
  const OBJ_ID          = `${px}Signature-xades-Signature${sigUuid}`;
  const SIGNED_PROPS_ID = `${SIG_ID}-SignedPropertiesID${propsUuid}`;
  const REF_DOC         = 'comprobante';
  const REF_SP          = `${px}SignedPropertiesID${propsUuid}`;

  // ── Certificate metadata ───────────────────────────────────────────────────
  const certAsn1    = forge.pki.certificateToAsn1(certificate);
  const certDer     = forge.asn1.toDer(certAsn1).getBytes();
  const certBase64  = forge.util.encode64(certDer);

  const certMd = forge.md.sha1.create();
  certMd.update(certDer);
  const certThumbprint = forge.util.encode64(certMd.digest().bytes());

  // RFC 2253 requires the DN string to go from most-specific to least-specific
  // component (CN, O, ..., C) — the REVERSE of the certificate's ASN.1
  // RDNSequence encoding order (C, O, ..., CN). XMLDSig §4.4.4 mandates
  // X509IssuerName follow RFC 2253. Not reversing produced a non-compliant
  // string that some SRI validators reject as "certificado alterado" even
  // though the signature bytes themselves were mathematically correct.
  const issuerName    = certificate.issuer.attributes
    .map((a: forge.pki.CertificateField) => `${a.shortName ?? a.name}=${a.value}`)
    .reverse()
    .join(',');
  const serialDecimal = BigInt('0x' + (certificate.serialNumber || '0')).toString();
  const signingTime   = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  // ── Digest #1 — comprobante (pre-signature unsigned document) ────────────
  // The enveloped-signature transform removes ds:Signature; since we compute
  // this BEFORE inserting the signature, the content is identical.
  const digestDoc = sha1b64(c14n(xmlContent));

  // ── ds:KeyInfo (NO xmlns — provided by ancestor ds:Signature) ─────────────
  // X509Data may carry the full chain (leaf + intermediate/root CA certs from
  // the .p12) — XMLDSig explicitly allows multiple X509Certificate elements.
  // Trying this because the Ficha Técnica's own validation order (§11 Anexo,
  // step "Validación Firma") explicitly checks "cadena de confianza" together
  // with signature validity under the same generic error.
  const chainCertsBase64 = chainCerts.map(c => {
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes();
    return forge.util.encode64(der);
  });
  const kiXml =
    `<ds:KeyInfo Id="${KEY_INFO_ID}">` +
      `<ds:X509Data>` +
        `<ds:X509Certificate>${certBase64}</ds:X509Certificate>` +
        chainCertsBase64.map(b64 => `<ds:X509Certificate>${b64}</ds:X509Certificate>`).join('') +
      `</ds:X509Data>` +
    `</ds:KeyInfo>`;
  const digestKi = sha1b64(c14n(withInheritedNs(kiXml)));

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
      `<xades:SignedDataObjectProperties>` +
        `<xades:DataObjectFormat ObjectReference="#${REF_DOC}">` +
          `<xades:Description>contenido comprobante</xades:Description>` +
          `<xades:MimeType>text/xml</xades:MimeType>` +
        `</xades:DataObjectFormat>` +
      `</xades:SignedDataObjectProperties>` +
    `</xades:SignedProperties>`;
  const digestSp = sha1b64(c14n(withInheritedNs(spXml)));

  // ── ds:SignedInfo (NO xmlns — provided by ancestor ds:Signature) ──────────
  // Reference order matches SRI Anexo 14: SignedProperties, KeyInfo, comprobante.
  const siXml =
    `<ds:SignedInfo Id="${SIGNED_INFO_ID}">` +
      `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
      `<ds:SignatureMethod Algorithm="${DS_NS}rsa-sha1"></ds:SignatureMethod>` +
      `<ds:Reference Id="${REF_SP}" Type="${XADES_SIGNED_PROPERTIES_TYPE}" URI="#${SIGNED_PROPS_ID}">` +
        `<ds:DigestMethod Algorithm="${DS_NS}sha1"></ds:DigestMethod>` +
        `<ds:DigestValue>${digestSp}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference URI="#${KEY_INFO_ID}">` +
        `<ds:DigestMethod Algorithm="${DS_NS}sha1"></ds:DigestMethod>` +
        `<ds:DigestValue>${digestKi}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference Id="${REF_DOC}" URI="#${REF_DOC}">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="${DS_NS}enveloped-signature"></ds:Transform>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="${DS_NS}sha1"></ds:DigestMethod>` +
        `<ds:DigestValue>${digestDoc}</ds:DigestValue>` +
      `</ds:Reference>` +
    `</ds:SignedInfo>`;

  const sigValue = rsaSha1Sign(c14n(withInheritedNs(siXml)), privateKey);

  // ── Full ds:Signature — declares BOTH xmlns:ds and xmlns:xades, matching
  // the SRI's own Anexo 14 example ────────────────────────────────────────
  const sigElement =
    `<ds:Signature Id="${SIG_ID}" xmlns:ds="${DS_NS}" xmlns:xades="${XADES_NS}">` +
      siXml +
      `<ds:SignatureValue Id="${px}SignatureValue${sigUuid}">${sigValue}</ds:SignatureValue>` +
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

// ─── Real cryptographic verification ───────────────────────────────────────────
// Re-derives every digest and the RSA-SHA1 signature from an ALREADY-SIGNED XML
// string and checks them against what's embedded in the document. Unlike mere
// self-consistency (signing and re-checking with the same code path), this is
// what actually proves the signature is mathematically valid — used as a
// mandatory guard right after signing (never send a signature we haven't
// verified) and by the CLI diagnostic tool for arbitrary signed XML files.

export interface DigestCheck {
  label:    string;
  expected: string;
  computed: string;
  pass:     boolean;
}

export interface CertificateInfo {
  subject:      string;
  issuer:       string;
  serialNumber: string;
  notBefore:    Date;
  notAfter:     Date;
  keySize:      number;
}

export interface SignatureVerificationResult {
  valid:                boolean;
  signatureValueValid:  boolean;
  digests:              DigestCheck[];
  certificate?:         CertificateInfo;
  certificateExpired?:  boolean;
  certificateNotYetValid?: boolean;
  errors:               string[];
}

function extractBetween(xml: string, openTagPrefix: string, closeTag: string): string {
  const s = xml.indexOf(openTagPrefix);
  if (s === -1) throw new Error(`No se encontró elemento que empiece con: ${openTagPrefix}`);
  const e = xml.indexOf(closeTag, s);
  if (e === -1) throw new Error(`No se encontró cierre de elemento: ${closeTag}`);
  return xml.slice(s, e + closeTag.length);
}

/** Extracts an element's text content, tolerating attributes on its opening tag. */
function extractText(xml: string, tag: string): string {
  const openMatch = xml.match(new RegExp(`<${tag}(\\s[^>]*)?>`));
  if (!openMatch || openMatch.index === undefined) throw new Error(`No se encontró el elemento <${tag}>.`);
  const s = openMatch.index + openMatch[0].length;
  const close = `</${tag}>`;
  const e = xml.indexOf(close, s);
  if (e === -1) throw new Error(`No se encontró el cierre de <${tag}>.`);
  return xml.slice(s, e);
}

export function verifySignedXml(signedXml: string): SignatureVerificationResult {
  const errors: string[]      = [];
  const digests: DigestCheck[] = [];
  let signatureValueValid      = false;
  let certificate: CertificateInfo | undefined;
  let certificateExpired: boolean | undefined;
  let certificateNotYetValid: boolean | undefined;

  // ── Certificate + SignatureValue verification ─────────────────────────────
  try {
    const certB64 = extractText(signedXml, 'ds:X509Certificate');
    const certDer = forge.util.decode64(certB64);
    const cert    = forge.pki.certificateFromAsn1(forge.asn1.fromDer(certDer));
    const pubKey  = cert.publicKey as forge.pki.rsa.PublicKey;

    const now = new Date();
    certificateExpired    = now > cert.validity.notAfter;
    certificateNotYetValid = now < cert.validity.notBefore;
    certificate = {
      subject:      cert.subject.attributes.map((a: forge.pki.CertificateField) => `${a.shortName ?? a.name}=${a.value}`).join(','),
      issuer:       cert.issuer.attributes.map((a: forge.pki.CertificateField) => `${a.shortName ?? a.name}=${a.value}`).join(','),
      serialNumber: cert.serialNumber,
      notBefore:    cert.validity.notBefore,
      notAfter:     cert.validity.notAfter,
      keySize:      (pubKey.n.bitLength?.() ?? 0),
    };
    if (certificateExpired)     errors.push(`Certificado expirado (notAfter: ${cert.validity.notAfter.toISOString()})`);
    if (certificateNotYetValid) errors.push(`Certificado aún no es válido (notBefore: ${cert.validity.notBefore.toISOString()})`);

    const siRaw   = extractBetween(signedXml, '<ds:SignedInfo', '</ds:SignedInfo>');
    const siC14n  = c14n(siRaw.includes('xmlns:ds') ? siRaw : withInheritedNs(siRaw));
    const sigVal  = extractText(signedXml, 'ds:SignatureValue');

    const md = forge.md.sha1.create();
    md.update(forge.util.encodeUtf8(siC14n));
    const sigBytes = forge.util.decode64(sigVal);
    signatureValueValid = pubKey.verify(md.digest().bytes(), sigBytes);
    if (!signatureValueValid) errors.push('SignatureValue no verifica contra ds:SignedInfo con la clave pública del certificado embebido.');
  } catch (err) {
    errors.push(`Error verificando SignatureValue: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Digest #1 — comprobante (enveloped-signature) ─────────────────────────
  try {
    const rootMatch = signedXml.match(/<(\w+)\s+id="comprobante"/);
    if (!rootMatch) throw new Error('No se encontró el elemento raíz con id="comprobante".');
    const rootTag = rootMatch[1];
    const full    = extractBetween(signedXml, `<${rootTag} `, `</${rootTag}>`);
    const withoutSig = full.replace(/<ds:Signature[\s\S]*<\/ds:Signature>/, '');
    const computed    = sha1b64(c14n(withoutSig));
    const refBlock    = extractBetween(signedXml, 'URI="#comprobante"', '</ds:Reference>');
    const expected     = extractText(refBlock, 'ds:DigestValue');
    digests.push({ label: 'Digest #comprobante', expected, computed, pass: expected === computed });
  } catch (err) {
    errors.push(`Error verificando digest #comprobante: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Digest #2 — KeyInfo ─────────────────────────────────────────────────────
  try {
    const kiRaw    = extractBetween(signedXml, '<ds:KeyInfo', '</ds:KeyInfo>');
    const computed  = sha1b64(c14n(withInheritedNs(kiRaw)));
    const kiIdMatch = kiRaw.match(/Id="([^"]+)"/);
    if (!kiIdMatch) throw new Error('ds:KeyInfo no tiene atributo Id.');
    const refStart = signedXml.indexOf(`URI="#${kiIdMatch[1]}"`);
    if (refStart === -1) throw new Error(`No se encontró ds:Reference con URI="#${kiIdMatch[1]}".`);
    const refBlock = signedXml.slice(refStart, signedXml.indexOf('</ds:Reference>', refStart) + '</ds:Reference>'.length);
    const expected  = extractText(refBlock, 'ds:DigestValue');
    digests.push({ label: 'Digest #KeyInfo', expected, computed, pass: expected === computed });
  } catch (err) {
    errors.push(`Error verificando digest #KeyInfo: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Digest #3 — SignedProperties (ds:ns + xades:ns heredados) ──────────────
  try {
    const spRaw    = extractBetween(signedXml, '<xades:SignedProperties', '</xades:SignedProperties>');
    const computed  = sha1b64(c14n(withInheritedNs(spRaw)));
    const refStart  = signedXml.indexOf('Type="http://uri.etsi.org/01903');
    if (refStart === -1) throw new Error('No se encontró ds:Reference con Type SignedProperties.');
    const refBlock  = signedXml.slice(refStart, signedXml.indexOf('</ds:Reference>', refStart) + '</ds:Reference>'.length);
    const expected   = extractText(refBlock, 'ds:DigestValue');
    digests.push({ label: 'Digest #SignedProperties', expected, computed, pass: expected === computed });
  } catch (err) {
    errors.push(`Error verificando digest #SignedProperties: ${err instanceof Error ? err.message : String(err)}`);
  }

  const valid = signatureValueValid
    && digests.length === 3
    && digests.every(d => d.pass)
    && !certificateExpired
    && !certificateNotYetValid;

  return { valid, signatureValueValid, digests, certificate, certificateExpired, certificateNotYetValid, errors };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function signXmlContent(
  xmlContent:   string,
  p12Buffer:    Buffer,
  certPassword: string,
  idPrefix?:    string,
  includeChain?: boolean,
): string {
  let certificate: forge.pki.Certificate;
  let privateKey:  forge.pki.rsa.PrivateKey;
  let chainCertificates: forge.pki.Certificate[] = [];

  try {
    const p12Der  = p12Buffer.toString('binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certPassword);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    if (certBags.length === 0) throw new Error('No se encontró certificado en el .p12.');

    let keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    if (!keyBag?.key) {
      keyBag = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
    }
    if (!keyBag?.key) throw new Error('No se encontró llave privada en el .p12.');

    privateKey = keyBag.key as forge.pki.rsa.PrivateKey;

    // Some ECIs (e.g. Lazzate) bundle the full chain (titular + CA emisora + raíz) in
    // the .p12, in no guaranteed order. Blindly taking bag[0] can embed a CA cert in
    // the XML instead of the end-entity cert that actually matches the private key —
    // the signature verifies mathematically but the SRI rejects it as "FIRMA INVALIDA"
    // because the embedded public key doesn't correspond to the signing key. Select the
    // certificate whose public key modulus/exponent actually match the private key.
    const matching = certBags.find(bag => {
      const pub = bag.cert?.publicKey as forge.pki.rsa.PublicKey | undefined;
      return !!pub && pub.n.compareTo(privateKey.n) === 0 && pub.e.compareTo(privateKey.e) === 0;
    });
    if (!matching?.cert) {
      throw new Error(
        `El .p12 contiene ${certBags.length} certificado(s) pero ninguno corresponde a la llave ` +
        `privada. Verifique que el archivo no esté corrupto o incompleto.`
      );
    }

    certificate = matching.cert;
    if (includeChain) {
      chainCertificates = certBags
        .filter(bag => bag !== matching)
        .map(bag => bag.cert)
        .filter((c): c is forge.pki.Certificate => !!c);
    }
  } catch (err) {
    throw new Error(`Error al parsear .p12: ${err instanceof Error ? err.message : err}`);
  }

  const signedXml = buildSignedXml({ xmlContent, certificate, privateKey, idPrefix, chainCertificates });

  // Never return a signature we haven't cryptographically verified ourselves —
  // catches canonicalization/namespace regressions before they ever reach the
  // SRI, instead of finding out from a "FIRMA INVALIDA" rejection.
  const verification = verifySignedXml(signedXml);
  if (!verification.valid) {
    throw new Error(
      `El XML firmado no pasó su propia verificación criptográfica — no se enviará al SRI. ` +
      `Errores: ${verification.errors.join('; ') || 'digest(s) no coinciden'}. ` +
      `Digests: ${verification.digests.map(d => `${d.label}=${d.pass ? 'OK' : 'FAIL'}`).join(', ')}`
    );
  }

  return signedXml;
}
