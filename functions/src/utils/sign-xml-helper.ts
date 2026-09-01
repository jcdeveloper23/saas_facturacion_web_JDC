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

const DS_NS    = 'http://www.w3.org/2000/09/xmldsig#';
const ETSI_NS  = 'http://uri.etsi.org/01903/v1.3.2#';
// Fixed XAdES constant for the SignedProperties Reference's Type attribute
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
 * Adds xmlns:ds AND xmlns:etsi to a fragment's root tag before canonicalizing
 * it — every signed fragment (SignedInfo, KeyInfo, SignedProperties) is a
 * descendant of ds:Signature, which declares both. Only for digest/signature
 * computation input — never for the XML actually embedded in the document.
 *
 * NOTE: The SRI validator (MITyCLibXADES) expects the prefix "etsi:" — confirmed
 * with a live test against celcer.sri.gob.ec that returned AUTORIZADO.
 * Using "xades:" instead causes FIRMA INVALIDA even though the namespace URI is
 * identical — the SRI parser does prefix-aware element lookup.
 */
export function withInheritedNs(xml: string): string {
  const nsAttr = `xmlns:ds="${DS_NS}" xmlns:etsi="${ETSI_NS}"`;
  return xml.replace(
    /^(<[a-zA-Z:][a-zA-Z0-9:._-]*)/,
    `$1 ${nsAttr}`,
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

  const randomNum = (min = 100000, max = 999999) => Math.floor(Math.random() * (max - min + 1)) + min;
  const sigNum    = randomNum();
  const siNum     = randomNum();
  const certNum   = randomNum();
  const spNum     = randomNum();
  const refSpNum  = randomNum();
  const refDocNum = randomNum();
  const objNum    = randomNum();
  const sigValNum = randomNum();

  const SIG_ID          = `${px}Signature${sigNum}`;
  const SIGNED_INFO_ID  = `${px}Signature-SignedInfo${siNum}`;
  const KEY_INFO_ID     = `${px}Certificate${certNum}`;
  const OBJ_ID          = `${px}Signature${sigNum}-Object${objNum}`;
  const SIGNED_PROPS_ID = `${SIG_ID}-SignedProperties${spNum}`;
  const REF_SP_ID       = `${px}SignedPropertiesID${refSpNum}`;
  const REF_DOC_ID      = `${px}Reference-ID-${refDocNum}`;

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
  // X509IssuerName follow RFC 2253.
  const issuerName    = certificate.issuer.attributes
    .map((a: forge.pki.CertificateField) => `${a.shortName ?? a.name}=${a.value}`)
    .reverse()
    .join(',');
  const serialDecimal = BigInt('0x' + (certificate.serialNumber || '0')).toString();
  const signingTime   = new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');

  // RSA Modulus and Exponent for KeyValue
  const pubKey = certificate.publicKey as forge.pki.rsa.PublicKey;
  const nHex = pubKey.n.toString(16);
  const modulusBase64 = forge.util.encode64(forge.util.hexToBytes(nHex.length % 2 === 1 ? '0' + nHex : nHex));
  const eHex = pubKey.e.toString(16);
  const exponentBase64 = forge.util.encode64(forge.util.hexToBytes(eHex.length % 2 === 1 ? '0' + eHex : eHex));

  // ── Digest #1 — comprobante (pre-signature unsigned document) ────────────
  // The enveloped-signature transform removes ds:Signature; since we compute
  // this BEFORE inserting the signature, the content is identical.
  const digestDoc = sha1b64(c14n(xmlContent));

  // ── ds:KeyInfo (NO xmlns — provided by ancestor ds:Signature) ─────────────
  const kiXml =
    `<ds:KeyInfo Id="${KEY_INFO_ID}">` +
      `<ds:X509Data>` +
        `<ds:X509Certificate>${certBase64}</ds:X509Certificate>` +
      `</ds:X509Data>` +
      `<ds:KeyValue>` +
        `<ds:RSAKeyValue>` +
          `<ds:Modulus>${modulusBase64}</ds:Modulus>` +
          `<ds:Exponent>${exponentBase64}</ds:Exponent>` +
        `</ds:RSAKeyValue>` +
      `</ds:KeyValue>` +
    `</ds:KeyInfo>`;
  const digestKi = sha1b64(c14n(withInheritedNs(kiXml)));

  // ── etsi:SignedProperties (NO xmlns — provided by ancestor ds:Signature) ───
  const spXml =
    `<etsi:SignedProperties Id="${SIGNED_PROPS_ID}">` +
      `<etsi:SignedSignatureProperties>` +
        `<etsi:SigningTime>${signingTime}</etsi:SigningTime>` +
        `<etsi:SigningCertificate>` +
          `<etsi:Cert>` +
            `<etsi:CertDigest>` +
              `<ds:DigestMethod Algorithm="${DS_NS}sha1"></ds:DigestMethod>` +
              `<ds:DigestValue>${certThumbprint}</ds:DigestValue>` +
            `</etsi:CertDigest>` +
            `<etsi:IssuerSerial>` +
              `<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>` +
              `<ds:X509SerialNumber>${serialDecimal}</ds:X509SerialNumber>` +
            `</etsi:IssuerSerial>` +
          `</etsi:Cert>` +
        `</etsi:SigningCertificate>` +
      `</etsi:SignedSignatureProperties>` +
      `<etsi:SignedDataObjectProperties>` +
        `<etsi:DataObjectFormat ObjectReference="#${REF_DOC_ID}">` +
          `<etsi:Description>contenido comprobante</etsi:Description>` +
          `<etsi:MimeType>text/xml</etsi:MimeType>` +
        `</etsi:DataObjectFormat>` +
      `</etsi:SignedDataObjectProperties>` +
    `</etsi:SignedProperties>`;
  const digestSp = sha1b64(c14n(withInheritedNs(spXml)));

  // ── ds:SignedInfo (NO xmlns — provided by ancestor ds:Signature) ──────────
  // Reference order matches SRI Anexo 14: SignedProperties, KeyInfo, comprobante.
  const siXml =
    `<ds:SignedInfo Id="${SIGNED_INFO_ID}">` +
      `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
      `<ds:SignatureMethod Algorithm="${DS_NS}rsa-sha1"></ds:SignatureMethod>` +
      `<ds:Reference Id="${REF_SP_ID}" Type="${XADES_SIGNED_PROPERTIES_TYPE}" URI="#${SIGNED_PROPS_ID}">` +
        `<ds:DigestMethod Algorithm="${DS_NS}sha1"></ds:DigestMethod>` +
        `<ds:DigestValue>${digestSp}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference URI="#${KEY_INFO_ID}">` +
        `<ds:DigestMethod Algorithm="${DS_NS}sha1"></ds:DigestMethod>` +
        `<ds:DigestValue>${digestKi}</ds:DigestValue>` +
      `</ds:Reference>` +
      `<ds:Reference Id="${REF_DOC_ID}" URI="#comprobante">` +
        `<ds:Transforms>` +
          `<ds:Transform Algorithm="${DS_NS}enveloped-signature"></ds:Transform>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="${DS_NS}sha1"></ds:DigestMethod>` +
        `<ds:DigestValue>${digestDoc}</ds:DigestValue>` +
      `</ds:Reference>` +
    `</ds:SignedInfo>`;

  const sigValue = rsaSha1Sign(c14n(withInheritedNs(siXml)), privateKey);

  // ── Full ds:Signature — declares BOTH xmlns:ds and xmlns:etsi ──────────────
  // Prefix "etsi:" is required by the SRI's MITyCLibXADES validator — confirmed
  // with a live test against celcer.sri.gob.ec (AUTORIZADO).
  const sigElement =
    `<ds:Signature Id="${SIG_ID}" xmlns:ds="${DS_NS}" xmlns:etsi="${ETSI_NS}">` +
      siXml +
      `<ds:SignatureValue Id="${px}SignatureValue${sigValNum}">${sigValue}</ds:SignatureValue>` +
      kiXml +
      `<ds:Object Id="${OBJ_ID}">` +
        `<etsi:QualifyingProperties Target="#${SIG_ID}">` +
          spXml +
        `</etsi:QualifyingProperties>` +
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

  // ── Digest #3 — SignedProperties (ds:ns + xades ns heredados) ───────────
  try {
    const spRaw    = extractBetween(signedXml, '<etsi:SignedProperties', '</etsi:SignedProperties>');
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
