/**
 * validate-signature.ts
 *
 * Herramienta de diagnóstico local para verificar que la firma XAdES
 * generada es matemáticamente válida ANTES de hacer deploy.
 *
 * Uso:
 *   npx ts-node src/utils/validate-signature.ts <ruta.p12> <password>
 *
 * El script:
 *   1. Firma un XML de prueba mínimo
 *   2. Extrae ds:SignedInfo del resultado
 *   3. Verifica la firma RSA-SHA1 con la clave pública del certificado
 *   4. Verifica los 3 digests de Referencias
 *   5. Imprime PASS / FAIL con detalles
 */

import * as fs   from 'fs';
import * as forge from 'node-forge';
import { signXmlContent, c14n, withInheritedNs } from './sign-xml-helper';

const TEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.0.0">
  <infoTributaria>
    <ambiente>1</ambiente>
    <ruc>0151950045001</ruc>
    <razonSocial>EMPRESA TEST</razonSocial>
    <claveAcceso>1234567890123456789012345678901234567890123456789</claveAcceso>
    <codDoc>01</codDoc>
    <estab>001</estab>
    <ptoEmi>001</ptoEmi>
    <secuencial>000000001</secuencial>
  </infoTributaria>
</factura>`;

function sha1b64(data: string): string {
  const md = forge.md.sha1.create();
  md.update(forge.util.encodeUtf8(data));
  return forge.util.encode64(md.digest().bytes());
}

function between(xml: string, open: string, close: string): string {
  const s = xml.indexOf(open);
  const e = xml.indexOf(close, s);
  if (s === -1 || e === -1) throw new Error(`Tag not found: ${open}`);
  return xml.slice(s, e + close.length);
}

function extractText(xml: string, tag: string): string {
  const openMatch = xml.match(new RegExp(`<${tag}(\\s[^>]*)?>`));
  if (!openMatch || openMatch.index === undefined) return '';
  const s = openMatch.index + openMatch[0].length;
  const close = `</${tag}>`;
  const e = xml.indexOf(close, s);
  return e === -1 ? '' : xml.slice(s, e);
}

async function main() {
  const p12Path  = process.argv[2];
  const password = process.argv[3] ?? '';

  if (!p12Path) {
    console.error('Uso: npx ts-node src/utils/validate-signature.ts <ruta.p12> <password>');
    process.exit(1);
  }

  const p12Buffer = fs.readFileSync(p12Path);
  console.log('\n=== GENERANDO XML FIRMADO ===');
  let signedXml: string;
  try {
    signedXml = signXmlContent(TEST_XML, p12Buffer, password);
    console.log('OK — XML firmado generado');
  } catch (e) {
    console.error('FALLO al firmar:', e);
    process.exit(1);
  }

  // fs.writeFileSync('/tmp/signed_test.xml', signedXml, 'utf8');
  // console.log('XML guardado en /tmp/signed_test.xml');

  let passed = 0; let failed = 0;
  function check(label: string, ok: boolean, detail?: string) {
    if (ok) { console.log(`  ✓ ${label}`); passed++; }
    else     { console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failed++; }
  }

  console.log('\n=== VERIFICANDO FIRMA RSA-SHA1 ===');
  try {
    // Extract ds:SignedInfo (no xmlns:ds — inside ds:Signature which provides it)
    const siRaw = between(signedXml, '<ds:SignedInfo ', '</ds:SignedInfo>');
    const siC14n = c14n(withInheritedNs(siRaw));
    console.log('  canonical SignedInfo (primeros 120 chars):');
    console.log(' ', siC14n.slice(0, 120));

    // Extract ds:SignatureValue
    const sigVal = extractText(signedXml, 'ds:SignatureValue');

    // Extract certificate
    const certB64 = extractText(signedXml, 'ds:X509Certificate');
    const certDer = forge.util.decode64(certB64);
    const cert    = forge.pki.certificateFromAsn1(forge.asn1.fromDer(certDer));
    const pubKey  = cert.publicKey as forge.pki.rsa.PublicKey;

    // Verify RSA-SHA1
    const md = forge.md.sha1.create();
    md.update(forge.util.encodeUtf8(siC14n));
    const sigBytes = forge.util.decode64(sigVal);
    const ok = pubKey.verify(md.digest().bytes(), sigBytes);
    check('Firma RSA-SHA1 sobre ds:SignedInfo', ok);
  } catch (e) {
    check('Firma RSA-SHA1', false, String(e));
  }

  console.log('\n=== VERIFICANDO DIGESTS DE REFERENCIAS ===');

  // Reference 1: #comprobante
  try {
    const factura  = between(signedXml, '<factura ', '</factura>');
    // Remove ds:Signature child for enveloped-signature transform
    const withoutSig = factura.replace(/<ds:Signature[\s\S]*<\/ds:Signature>/, '');
    const computed = sha1b64(c14n(withoutSig));
    const inXml    = extractText(
      between(signedXml, 'Id="comprobante"', '</ds:Reference>'), 'ds:DigestValue');
    check('Digest #comprobante', computed === inXml,
      computed === inXml ? '' : `\n    computed=${computed}\n    inXml   =${inXml}`);
  } catch (e) { check('Digest #comprobante', false, String(e)); }

  // Reference 2: #Certificate<uuid> (ds:KeyInfo) — el Id es dinámico por firma
  try {
    const kiRaw    = between(signedXml, '<ds:KeyInfo Id=', '</ds:KeyInfo>');
    const computed  = sha1b64(c14n(withInheritedNs(kiRaw)));
    const kiId      = kiRaw.match(/Id="([^"]+)"/)?.[1];
    if (!kiId) throw new Error('No se encontró Id en ds:KeyInfo');
    const inXml   = (() => {
      const refStart = signedXml.indexOf(`URI="#${kiId}"`);
      const refBlock = signedXml.slice(refStart, signedXml.indexOf('</ds:Reference>', refStart));
      return extractText(refBlock, 'ds:DigestValue');
    })();
    check('Digest #Certificate (KeyInfo)', computed === inXml,
      computed === inXml ? '' : `\n    computed=${computed}\n    inXml   =${inXml}`);
  } catch (e) { check('Digest #Certificate', false, String(e)); }

  // Reference 3: #Signature-SignedProperties
  try {
    const spRaw   = between(signedXml, '<xades:SignedProperties Id=', '</xades:SignedProperties>');
    const computed = sha1b64(c14n(withInheritedNs(spRaw)));
    const inXml   = (() => {
      const refStart = signedXml.indexOf('Type="http://uri.etsi.org/01903');
      const refBlock = signedXml.slice(refStart, signedXml.indexOf('</ds:Reference>', refStart));
      return extractText(refBlock, 'ds:DigestValue');
    })();
    check('Digest #Signature-SignedProperties', computed === inXml,
      computed === inXml ? '' : `\n    computed=${computed}\n    inXml   =${inXml}`);
  } catch (e) { check('Digest #SignedProperties', false, String(e)); }

  console.log(`\n=== RESULTADO: ${passed} OK, ${failed} FALLIDOS ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
