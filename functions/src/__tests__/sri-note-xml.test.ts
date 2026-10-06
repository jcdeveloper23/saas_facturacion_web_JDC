/**
 * sri-note-xml.test.ts
 *
 * XML de la nota de crédito y de la nota de débito (2026-10-06). La NC se
 * valida contra el XSD oficial del SRI que está en docs/ (con xmllint, si la
 * máquina lo tiene); la ND, contra el orden de la ficha técnica offline v2.34,
 * porque su XSD no está en el repo.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCreditNoteXml, buildDebitNoteXml, NoteIssuer } from '../utils/sri-note-xml';

// Todo inventado: emisor, comprador y clave no son de nadie.
const issuer: NoteIssuer = {
  ambiente: '1',
  razonSocial: 'EMPRESA INVENTADA S.A.',
  ruc: '1790000000001',
  accessKey: '0610202604179000000000110010010000000011234567811',
  establishment: '001',
  emissionPoint: '001',
  secuencial: '000000001',
  dirMatriz: 'CALLE FALSA 123',
  dirEstablecimiento: 'CALLE FALSA 123',
  obligadoContabilidad: 'NO',
};
const buyer = { tipoIdentificacion: '05', razonSocial: 'CLIENTE INVENTADO', identificacion: '1700000000' };
const supportDoc = { number: '001-001-000000045', date: new Date('2026-10-01T15:00:00Z') };
const issueDate = new Date('2026-10-06T15:00:00Z');

function hasXmllint(): boolean {
  try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

/** Valida contra el XSD; devuelve el error de xmllint o '' si cumple. */
function validate(xml: string, xsd: string): string {
  const docs = path.resolve(__dirname, '../../../docs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sri-xsd-'));
  const ncDir = fs.readdirSync(docs).find((d) => d.startsWith('XML y XSD Nota de Cr'))!;
  fs.copyFileSync(path.join(docs, ncDir, xsd), path.join(dir, xsd));
  fs.copyFileSync(path.join(docs, 'XML y XSD Factura', 'xmldsig-core-schema.xsd'), path.join(dir, 'xmldsig-core-schema.xsd'));
  fs.writeFileSync(path.join(dir, 'doc.xml'), xml);
  try {
    execFileSync('xmllint', ['--noout', '--schema', path.join(dir, xsd), path.join(dir, 'doc.xml')], { stdio: 'pipe' });
    return '';
  } catch (e: any) {
    return String(e.stderr ?? e.message);
  }
}

/** Los hijos directos de un elemento, en orden. */
function childrenOf(xml: string, parent: string): string[] {
  const body = xml.match(new RegExp(`<${parent}(?:\\s[^>]*)?>([\\s\\S]*?)</${parent}>`))?.[1] ?? '';
  const names: string[] = [];
  let depth = 0;
  for (const m of body.matchAll(/<(\/?)([A-Za-z]+)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (closing) { depth--; continue; }
    if (depth === 0) names.push(name);
    if (!selfClosing) depth++;
  }
  return names;
}

const creditNote = (over: Partial<Parameters<typeof buildCreditNoteXml>[0]> = {}) => buildCreditNoteXml({
  issuer, buyer, issueDate, supportDoc,
  totalSinImpuestos: 30,
  valorModificacion: 33,
  taxGroups: [{ vatCode: '4', base: 20, tax: 3 }, { vatCode: '0', base: 10, tax: 0 }],
  motivo: 'Devolución de mercadería',
  lines: [
    { code: 'ART-1', description: 'ARTÍCULO UNO', quantity: 2, unitPrice: 10.123456, discount: 0.25, lineTotal: 20, vatCode: '4', vatRate: 15, vatAmount: 3 },
    { code: '', description: 'SERVICIO\nTÉCNICO', quantity: 1, unitPrice: 10, discount: 0, lineTotal: 10, vatCode: '0', vatRate: 0, vatAmount: 0 },
  ],
  additionalInfo: [{ nombre: 'Email', valor: 'cliente@example.com' }, { nombre: 'Vacío', valor: '' }],
  ...over,
});

describe('nota de crédito', () => {
  (hasXmllint() ? it : it.skip)('cumple el XSD NotaCredito_V1.1.0 del SRI', () => {
    expect(validate(creditNote(), 'NotaCredito_V1.1.0.xsd')).toBe('');
  });

  (hasXmllint() ? it : it.skip)('por valor (descuento sin devolver mercadería): 1 × valor, también cumple el XSD', () => {
    // Como la arma Conecta en el modo «Descuento o ajuste de valor»: cantidad
    // 1, precio = la base que se acredita, sin descuento.
    const xml = creditNote({
      totalSinImpuestos: 5,
      valorModificacion: 5.75,
      taxGroups: [{ vatCode: '4', base: 5, tax: 0.75 }],
      motivo: 'Descuento concedido',
      lines: [{ code: 'PR001', description: 'AUDÍFONOS BT', quantity: 1, unitPrice: 5, discount: 0, lineTotal: 5, vatCode: '4', vatRate: 15, vatAmount: 0.75 }],
    });
    expect(validate(xml, 'NotaCredito_V1.1.0.xsd')).toBe('');
    expect(xml).toContain('<cantidad>1.000000</cantidad>');
    expect(xml).toContain('<precioTotalSinImpuesto>5.00</precioTotalSinImpuesto>');
  });

  it('sale como versión 1.1.0 (6 decimales en cantidad y precio)', () => {
    const xml = creditNote();
    expect(xml).toContain('<notaCredito id="comprobante" version="1.1.0">');
    expect(xml).toContain('<precioUnitario>10.123456</precioUnitario>');
  });

  it('el detalle va con codigoInterno, sin unidadMedida ni numAutDocSustento', () => {
    const xml = creditNote();
    expect(xml).toContain('<codigoInterno>ART-1</codigoInterno>');
    expect(xml).toContain('<codigoInterno>SIN-CODIGO</codigoInterno>');
    expect(xml).not.toContain('codigoPrincipal');
    expect(xml).not.toContain('unidadMedida');
    expect(xml).not.toContain('numAutDocSustento');
    expect(xml).toContain('<descripcion>SERVICIO TÉCNICO</descripcion>');
  });

  it('infoAdicional sin campos vacíos', () => {
    const xml = creditNote();
    expect(xml).toContain('<campoAdicional nombre="Email">cliente@example.com</campoAdicional>');
    expect(xml).not.toContain('Vacío');
  });
});

const debitNote = (over: Partial<Parameters<typeof buildDebitNoteXml>[0]> = {}) => buildDebitNoteXml({
  issuer: { ...issuer, accessKey: issuer.accessKey.replace(/^(\d{8})04/, '$105') },
  buyer, issueDate, supportDoc,
  totalSinImpuestos: 50,
  vatCode: '4',
  vatRate: 15,
  vatAmount: 7.5,
  valorTotal: 57.5,
  paymentCode: '01',
  motivos: [{ razon: 'Interés por mora', valor: 40 }, { razon: 'Gastos de cobranza', valor: 10 }],
  additionalInfo: [{ nombre: 'RUC Proveedor', valor: '0190434990001' }],
  ...over,
});

describe('nota de débito', () => {
  it('sigue el orden de la ficha técnica', () => {
    const xml = debitNote();
    expect(childrenOf(xml, 'notaDebito')).toEqual(['infoTributaria', 'infoNotaDebito', 'motivos', 'infoAdicional']);
    expect(childrenOf(xml, 'infoNotaDebito')).toEqual([
      'fechaEmision', 'dirEstablecimiento', 'tipoIdentificacionComprador', 'razonSocialComprador',
      'identificacionComprador', 'obligadoContabilidad', 'codDocModificado', 'numDocModificado',
      'fechaEmisionDocSustento', 'totalSinImpuestos', 'impuestos', 'valorTotal', 'pagos',
    ]);
    expect(childrenOf(xml, 'impuesto')).toEqual(['codigo', 'codigoPorcentaje', 'tarifa', 'baseImponible', 'valor']);
    expect(childrenOf(xml, 'pago')).toEqual(['formaPago', 'total']);
  });

  it('valorTotal y pagos; nada de importeTotal, moneda ni autorización del sustento', () => {
    const xml = debitNote();
    expect(xml).toContain('<valorTotal>57.50</valorTotal>');
    expect(xml).toContain('<formaPago>01</formaPago>');
    expect(xml).toContain('<total>57.50</total>');
    expect(xml).not.toContain('importeTotal');
    expect(xml).not.toContain('moneda');
    expect(xml).not.toContain('numAutorizacionDocSustento');
    expect(xml).toContain('<codDoc>05</codDoc>');
    expect(xml).toContain('<numDocModificado>001-001-000000045</numDocModificado>');
  });

  it('con IVA 0 % también lleva su impuesto, y sin forma de pago va la 20', () => {
    const xml = debitNote({ vatCode: '0', vatRate: 0, vatAmount: 0, valorTotal: 50, paymentCode: '' });
    expect(xml).toContain('<codigoPorcentaje>0</codigoPorcentaje>');
    expect(xml).toContain('<tarifa>0.00</tarifa>');
    expect(xml).toContain('<formaPago>20</formaPago>');
  });

  it('los motivos con dos decimales', () => {
    const xml = debitNote();
    expect(xml).toContain('<razon>Interés por mora</razon>');
    expect(xml).toContain('<valor>40.00</valor>');
  });
});

import { debitNoteNeedsEntry } from '../accounting/accounting-setup';

describe('debitNoteNeedsEntry («Contabilizar lo pendiente»)', () => {
  it('emitida, viva, sin asiento y con el SRI resuelto', () => {
    expect(debitNoteNeedsEntry({ status: 'issued', sriStatus: 'authorized' })).toBe(true);
    expect(debitNoteNeedsEntry({ status: 'issued', sriStatus: 'not_required' })).toBe(true);
    expect(debitNoteNeedsEntry({ status: 'issued', sriStatus: 'rejected' })).toBe(false);
    expect(debitNoteNeedsEntry({ status: 'issued' })).toBe(false);
    expect(debitNoteNeedsEntry({ status: 'issued', sriStatus: 'authorized', accountingEntryId: 'e' })).toBe(false);
    expect(debitNoteNeedsEntry({ status: 'issued', sriStatus: 'authorized', isVoid: true })).toBe(false);
  });
});
