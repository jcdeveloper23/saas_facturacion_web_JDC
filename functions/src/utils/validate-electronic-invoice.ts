/**
 * validate-electronic-invoice.ts
 *
 * Comando de diagnóstico: valida un XML de comprobante electrónico SRI ya
 * firmado (factura, nota de crédito, nota de débito o retención) contra
 * TODAS las verificaciones que este proyecto puede ejecutar realmente:
 * estructura, XSD oficial, clave de acceso, identificación del comprador,
 * totales, certificado y firma criptográfica (digests + RSA-SHA1).
 *
 * La validación XSD usa el binario `xmllint` (libxml2) contra los esquemas
 * oficiales en docs/XML y XSD Factura/factura_V*.xsd — SOLO corre local/CLI,
 * NO está conectada al flujo de producción de Cloud Functions porque no se
 * confirmó que `xmllint` exista en ese runtime (Firebase Functions Gen2 /
 * Cloud Run, Node 20). Si xmllint no está instalado donde corres este
 * comando, el chequeo se reporta como [?] no ejecutado, nunca como PASS falso.
 *
 * Uso:
 *   npx ts-node src/utils/validate-electronic-invoice.ts <archivo.xml>
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { verifySignedXml } from './sign-xml-helper';
import { validateAccessKey } from './sri-access-key';
import { validateBuyerIdentification, validateTotals } from './sri-invoice-validator';

const XSD_DIR = path.join(__dirname, '../../../docs/XML y XSD Factura');

function xmllintAvailable(): boolean {
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Valida el XML contra el XSD oficial correspondiente a su atributo version. Requiere xmllint. */
function validateAgainstXsd(xml: string): CheckResult {
  const versionMatch = xml.match(/<factura[^>]*\sversion="([^"]+)"/);
  const version = versionMatch?.[1];
  if (!version) {
    return { label: 'XSD oficial SRI', pass: false, detail: 'No se pudo determinar el atributo version de <factura>.' };
  }
  const xsdPath = path.join(XSD_DIR, `factura_V${version}.xsd`);
  if (!fs.existsSync(xsdPath)) {
    return { label: `XSD oficial SRI (v${version})`, pass: null, detail: `No se encontró ${xsdPath}. Versiones disponibles: ${fs.existsSync(XSD_DIR) ? fs.readdirSync(XSD_DIR).filter(f => f.endsWith('.xsd')).join(', ') : 'carpeta no encontrada'}.` };
  }
  if (!xmllintAvailable()) {
    return { label: `XSD oficial SRI (v${version})`, pass: null, detail: 'xmllint no está instalado/disponible en PATH — no se pudo ejecutar la validación XSD real (no se reporta como válido sin verificar).' };
  }
  try {
    const tmpFile = path.join(require('os').tmpdir(), `sri-xsd-check-${Date.now()}.xml`);
    fs.writeFileSync(tmpFile, xml, 'utf8');
    try {
      execFileSync('xmllint', ['--noout', '--schema', xsdPath, tmpFile], { stdio: 'pipe' });
      return { label: `XSD oficial SRI (v${version})`, pass: true };
    } catch (err: any) {
      const stderr = err?.stderr?.toString?.() ?? String(err);
      return { label: `XSD oficial SRI (v${version})`, pass: false, detail: stderr.trim() };
    } finally {
      fs.unlinkSync(tmpFile);
    }
  } catch (err) {
    return { label: `XSD oficial SRI (v${version})`, pass: null, detail: `Error ejecutando xmllint: ${err instanceof Error ? err.message : String(err)}` };
  }
}

interface CheckResult {
  label:   string;
  pass:    boolean | null; // null = no verificado (falta info/herramienta)
  detail?: string;
}

function extractText(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m?.[1];
}

function extractAllNumbers(xml: string, tag: string): number[] {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g');
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(parseFloat(m[1]));
  return out;
}

function extractDetalles(xml: string): Array<{ baseImponible: number; valorImpuesto: number; precioTotalSinImpuesto: number }> {
  const detalleBlocks = xml.match(/<detalle>[\s\S]*?<\/detalle>/g) ?? [];
  return detalleBlocks.map(block => ({
    precioTotalSinImpuesto: parseFloat(extractText(block, 'precioTotalSinImpuesto') ?? '0'),
    baseImponible:          parseFloat(extractText(block, 'baseImponible') ?? '0'),
    valorImpuesto:          parseFloat(extractText(block, 'valor') ?? '0'),
  }));
}

export function runDiagnostics(xml: string): CheckResult[] {
  const results: CheckResult[] = [];

  // ── Estructura básica ─────────────────────────────────────────────────────
  const wellFormed = xml.trim().startsWith('<?xml') && /<\/\w+>\s*$/.test(xml.trim());
  results.push({ label: 'XML bien formado (declaración + tag de cierre)', pass: wellFormed });

  const hasBom = xml.charCodeAt(0) === 0xFEFF;
  results.push({ label: 'UTF-8 sin BOM', pass: !hasBom });

  const declaresUtf8 = /encoding="UTF-8"/i.test(xml);
  results.push({ label: 'Declara encoding UTF-8', pass: declaresUtf8 });

  // ── XSD oficial (xmllint contra docs/XML y XSD Factura/factura_V*.xsd) ────
  results.push(validateAgainstXsd(xml));

  // ── RUC / clave de acceso ───────────────────────────────────────────────────
  const ruc = extractText(xml, 'ruc');
  results.push({ label: 'RUC presente', pass: !!ruc && /^\d{13}$/.test(ruc), detail: ruc });

  const accessKey = extractText(xml, 'claveAcceso');
  if (accessKey) {
    const akResult = validateAccessKey(accessKey);
    results.push({ label: 'Clave de acceso — estructura', pass: akResult.valid, detail: akResult.errors.map(e => e.message).join('; ') || undefined });
    results.push({ label: 'Dígito verificador (módulo 11)', pass: !akResult.errors.some(e => e.code === 'INVALID_CHECK_DIGIT') });
  } else {
    results.push({ label: 'Clave de acceso — estructura', pass: false, detail: 'No se encontró <claveAcceso>.' });
    results.push({ label: 'Dígito verificador (módulo 11)', pass: null });
  }

  // ── Comprador ────────────────────────────────────────────────────────────────
  const buyerId   = extractText(xml, 'identificacionComprador');
  const buyerType = extractText(xml, 'tipoIdentificacionComprador');
  const buyerErrors = validateBuyerIdentification(buyerId, buyerType);
  results.push({ label: 'Identificación del comprador', pass: buyerErrors.length === 0, detail: buyerErrors.map(e => e.message).join('; ') || undefined });

  // ── Totales ──────────────────────────────────────────────────────────────────
  const totalSinImpuestos = parseFloat(extractText(xml, 'totalSinImpuestos') ?? 'NaN');
  const importeTotal      = parseFloat(extractText(xml, 'importeTotal') ?? 'NaN');
  const totalDescuento    = parseFloat(extractText(xml, 'totalDescuento') ?? '0');
  const impuestoValores   = extractAllNumbers(xml.match(/<totalConImpuestos>[\s\S]*?<\/totalConImpuestos>/)?.[0] ?? '', 'valor');
  const totalImpuestoValor = impuestoValores.reduce((s, v) => s + v, 0);
  const lines = extractDetalles(xml);

  if (Number.isFinite(totalSinImpuestos) && Number.isFinite(importeTotal) && lines.length > 0) {
    const totalErrors = validateTotals({ lines, totalSinImpuestos, totalImpuestoValor, totalDescuento, importeTotal });
    results.push({ label: 'Totales — consistencia aritmética', pass: totalErrors.length === 0, detail: totalErrors.map(e => e.message).join('; ') || undefined });
  } else {
    results.push({ label: 'Totales — consistencia aritmética', pass: false, detail: 'No se pudieron extraer totalSinImpuestos/importeTotal/detalles del XML.' });
  }
  results.push({ label: 'Forma de pago presente', pass: /<formaPago>/.test(xml) });

  // ── Certificado + firma criptográfica real ──────────────────────────────────
  const hasSignature = xml.includes('<ds:Signature');
  if (!hasSignature) {
    results.push({ label: 'Firma XAdES presente', pass: false });
    return results;
  }
  results.push({ label: 'Firma XAdES presente', pass: true });

  let verification: ReturnType<typeof verifySignedXml> | undefined;
  try {
    verification = verifySignedXml(xml);
  } catch (err) {
    results.push({ label: 'Verificación criptográfica', pass: false, detail: err instanceof Error ? err.message : String(err) });
    return results;
  }

  if (verification.certificate) {
    results.push({ label: 'Certificado — subject', pass: true, detail: verification.certificate.subject });
    results.push({ label: 'Certificado — issuer', pass: true, detail: verification.certificate.issuer });
    results.push({ label: `Certificado vigente (${verification.certificate.notBefore.toISOString().slice(0, 10)} .. ${verification.certificate.notAfter.toISOString().slice(0, 10)})`, pass: !verification.certificateExpired && !verification.certificateNotYetValid });
  } else {
    results.push({ label: 'Certificado', pass: false, detail: 'No se pudo extraer/parsear el certificado del XML.' });
  }

  for (const d of verification.digests) {
    results.push({ label: d.label, pass: d.pass, detail: d.pass ? undefined: `esperado=${d.expected} calculado=${d.computed}` });
  }
  results.push({ label: 'SignatureValue (RSA-SHA1)', pass: verification.signatureValueValid });
  results.push({ label: 'XAdES-BES 1.3.2 (namespace http://uri.etsi.org/01903/v1.3.2#)', pass: xml.includes('http://uri.etsi.org/01903/v1.3.2#') });

  return results;
}

function printReport(results: CheckResult[]): boolean {
  console.log('========================================');
  console.log('VALIDACIÓN FACTURA ELECTRÓNICA SRI');
  console.log('========================================\n');

  let allPass = true;
  for (const r of results) {
    const mark = r.pass === null ? '[?]' : r.pass ? '[✓]' : '[✗]';
    if (r.pass === false) allPass = false;
    console.log(`${mark} ${r.label}`);
    if (r.detail && (r.pass === false || r.pass === null)) {
      console.log(`      ${r.detail}`);
    }
  }

  console.log('\n========================================');
  const hasUnverified = results.some(r => r.pass === null);
  if (!allPass) {
    console.log('RESULTADO: INVÁLIDO');
  } else if (hasUnverified) {
    console.log('RESULTADO: VÁLIDO (con verificaciones pendientes — ver [?] arriba)');
  } else {
    console.log('RESULTADO: VÁLIDO');
  }
  console.log('========================================');
  return allPass;
}

/* istanbul ignore next -- CLI entry point, no cubierto por tests unitarios */
function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: npx ts-node src/utils/validate-electronic-invoice.ts <archivo.xml>');
    process.exit(1);
  }
  const xml = fs.readFileSync(filePath, 'utf8');
  const results = runDiagnostics(xml);
  const ok = printReport(results);
  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  main();
}
