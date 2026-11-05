/**
 * sri-settlement-xml.test.ts
 *
 * XML de la liquidación de compra (codDoc 03, versión 1.1.0), 2026-11-05.
 * Se valida contra el XSD oficial del SRI que está en «docs/XML y XSD Liquidacion/»
 * (con xmllint, si la máquina lo tiene).
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildPurchaseSettlementXml,
  PurchaseSettlementXmlInput,
  SettlementIssuer,
} from '../utils/sri-settlement-xml';

// Todo inventado: emisor, proveedor y clave no son de nadie.
const issuer: SettlementIssuer = {
  ambiente: '1',
  razonSocial: 'EMPRESA INVENTADA S.A.',
  ruc: '1790000000001',
  accessKey: '0511202603179000000000110010010000000011234567811',
  establishment: '001',
  emissionPoint: '001',
  secuencial: '000000001',
  dirMatriz: 'CALLE FALSA 123',
  dirEstablecimiento: 'CALLE FALSA 123',
  obligadoContabilidad: 'SI',
};

function baseInput(): PurchaseSettlementXmlInput {
  return {
    issuer,
    supplier: { tipoIdentificacion: '05', razonSocial: 'PROVEEDOR INVENTADO', identificacion: '1700000000', direccion: 'Barrio Inventado, Quito' },
    issueDate: new Date('2026-11-05T15:00:00Z'),
    totalSinImpuestos: 150,
    totalDescuento: 5,
    taxGroups: [
      { vatCode: '4', vatRate: 15, base: 100, tax: 15 },
      { vatCode: '0', vatRate: 0, base: 50, tax: 0 },
    ],
    importeTotal: 165,
    payments: [{ code: '01', total: 165 }],
    lines: [
      { code: 'SERV-1', description: 'Servicio de jardinería', quantity: 1, unitPrice: 105, discount: 5, lineTotal: 100, vatCode: '4', vatRate: 15, vatAmount: 15 },
      { description: 'Maíz en grano\n(quintal)', unit: 'qq', quantity: 2.123456, unitPrice: 23.551, discount: 0, lineTotal: 50, vatCode: '0', vatRate: 0, vatAmount: 0 },
    ],
    additionalInfo: [
      { nombre: 'RUC Proveedor', valor: '0190434990001' },
      { nombre: 'Vacío', valor: '' },
    ],
  };
}

function hasXmllint(): boolean {
  try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

/** Valida contra el XSD oficial; devuelve el error de xmllint o '' si cumple. */
function validate(xml: string): string {
  const src = path.resolve(__dirname, '../../../docs/XML y XSD Liquidacion');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sri-lc-xsd-'));
  for (const f of ['LiquidacionCompra_V1.1.0.xsd', 'xmldsig-core-schema.xsd']) {
    fs.copyFileSync(path.join(src, f), path.join(dir, f));
  }
  fs.writeFileSync(path.join(dir, 'doc.xml'), xml);
  try {
    execFileSync('xmllint', ['--noout', '--nonet', '--schema', path.join(dir, 'LiquidacionCompra_V1.1.0.xsd'), path.join(dir, 'doc.xml')], { stdio: 'pipe' });
    return '';
  } catch (e: any) {
    return String(e.stderr ?? e.message);
  }
}

const itXsd = hasXmllint() ? it : it.skip;

describe('buildPurchaseSettlementXml', () => {
  itXsd('cumple el XSD oficial LiquidacionCompra_V1.1.0', () => {
    expect(validate(buildPurchaseSettlementXml(baseInput()))).toBe('');
  });

  itXsd('cumple el XSD con pasaporte, plazo, sin dirección de establecimiento ni infoAdicional', () => {
    const input = baseInput();
    input.supplier = { tipoIdentificacion: '06', razonSocial: 'PROVEEDOR EXTRANJERO', identificacion: 'AB123456', direccion: 'Calle 1' };
    input.issuer = { ...issuer, dirEstablecimiento: undefined, contribuyenteEspecial: '12345' };
    input.payments = [{ code: '20', total: 165, term: 30, timeUnit: 'dias' }];
    input.additionalInfo = [];
    expect(validate(buildPurchaseSettlementXml(input))).toBe('');
  });

  itXsd('la validación no es vacía: un XML fuera de orden falla', () => {
    const xml = buildPurchaseSettlementXml(baseInput()).replace('<moneda>DOLAR</moneda>', '');
    const broken = xml.replace('<importeTotal>', '<moneda>DOLAR</moneda><importeTotal>');
    expect(validate(broken)).not.toBe('');
  });

  it('lleva codDoc 03, versión 1.1.0 y los datos del proveedor', () => {
    const xml = buildPurchaseSettlementXml(baseInput());
    expect(xml).toContain('<liquidacionCompra id="comprobante" version="1.1.0">');
    expect(xml).toContain('<codDoc>03</codDoc>');
    expect(xml).toContain('<tipoIdentificacionProveedor>05</tipoIdentificacionProveedor>');
    expect(xml).toContain('<identificacionProveedor>1700000000</identificacionProveedor>');
    expect(xml).toContain('<direccionProveedor>Barrio Inventado, Quito</direccionProveedor>');
    expect(xml).toContain('<importeTotal>165.00</importeTotal>');
  });

  it('usa 6 decimales en cantidad y precio y quita saltos de línea', () => {
    const xml = buildPurchaseSettlementXml(baseInput());
    expect(xml).toContain('<cantidad>2.123456</cantidad>');
    expect(xml).toContain('<precioUnitario>23.551000</precioUnitario>');
    expect(xml).toContain('<descripcion>Maíz en grano (quintal)</descripcion>');
  });

  it('omite los campos adicionales vacíos y conserva el RUC Proveedor', () => {
    const xml = buildPurchaseSettlementXml(baseInput());
    expect(xml).toContain('<campoAdicional nombre="RUC Proveedor">0190434990001</campoAdicional>');
    expect(xml).not.toContain('nombre="Vacío"');
  });

  it('forma de pago fuera de la tabla 24 → 20; sin pagos → uno por el total', () => {
    const input = baseInput();
    input.payments = [{ code: '99', total: 165 }];
    expect(buildPurchaseSettlementXml(input)).toContain('<formaPago>20</formaPago>');
    input.payments = [];
    const xml = buildPurchaseSettlementXml(input);
    expect(xml).toContain('<formaPago>20</formaPago>');
    expect(xml).toContain('<total>165.00</total>');
  });

  it('rechaza RUC, consumidor final y exterior en la primera entrega (D-LC4)', () => {
    for (const t of ['04', '07', '08']) {
      const input = baseInput();
      (input.supplier as any).tipoIdentificacion = t;
      expect(() => buildPurchaseSettlementXml(input)).toThrow(/no admitido/);
    }
  });

  it('rechaza una liquidación sin detalles', () => {
    const input = baseInput();
    input.lines = [];
    expect(() => buildPurchaseSettlementXml(input)).toThrow(/al menos un detalle/);
  });
});
