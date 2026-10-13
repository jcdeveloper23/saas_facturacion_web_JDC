/**
 * invoice-discount.test.ts — descuento por línea de la factura (2026-10-13).
 *
 * Cálculo de createAndEmitInvoice (utils/invoice-discount.ts) y XML de la
 * factura (utils/sri-invoice-xml.ts), validado con xmllint contra los XSD
 * oficiales del SRI de docs/XML y XSD Factura/ (si la máquina tiene xmllint).
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  invoiceTotalDiscount, lineDiscountAmount, normalizeDiscountPct, priceInvoiceLines, round2,
} from '../utils/invoice-discount';
import { buildInvoiceXml, InvoiceXmlDoc, InvoiceXmlHeader, invoiceXmlAmounts } from '../utils/sri-invoice-xml';

// Cálculo de createAndEmitInvoice antes del 2026-10-13, copiado tal cual.
function oldCalc(lines: Array<{ quantity: number; unitPrice: number; discountPct?: number; vatPct: number }>) {
  const mapped = lines.map(line => {
    const grossLine = round2(line.quantity * line.unitPrice);
    const discount  = round2(grossLine * Number(line.discountPct ?? 0) / 100);
    const subtotal  = round2(grossLine - discount);
    const vatAmount = round2(subtotal * line.vatPct / 100);
    return { discount, subtotal, vatAmount };
  });
  const netAmount = round2(mapped.reduce((s, l) => s + l.subtotal, 0));
  const vatAmount = round2(mapped.reduce((s, l) => s + l.vatAmount, 0));
  return { mapped, netAmount, vatAmount, total: round2(netAmount + vatAmount) };
}

describe('priceInvoiceLines (createAndEmitInvoice)', () => {
  it('sin descuento: idéntico a antes, descuento 0 y bruto = neto', () => {
    const lines = [
      { quantity: 3, unitPrice: 0.335, vatPct: 15 },
      { quantity: 2, unitPrice: 21.33, vatPct: 15 },
      { quantity: 1, unitPrice: 10, vatPct: 0 },
    ];
    const p = priceInvoiceLines(lines);
    const o = oldCalc(lines);
    expect(p.lines.map(l => [l.subtotal, l.vatAmount])).toEqual(o.mapped.map(l => [l.subtotal, l.vatAmount]));
    expect([p.netAmount, p.vatAmount, p.total]).toEqual([o.netAmount, o.vatAmount, o.total]);
    expect(p.discountAmount).toBe(0);
    expect(p.grossAmount).toBe(p.netAmount);
  });

  it('10 % en una línea, con tarifas 15 % y 0 %', () => {
    const p = priceInvoiceLines([
      { quantity: 2, unitPrice: 50, discountPct: 10, vatPct: 15 },
      { quantity: 1, unitPrice: 20, vatPct: 0 },
    ]);
    expect(p.lines[0]).toMatchObject({ gross: 100, discount: 10, subtotal: 90, vatAmount: 13.5 });
    expect([p.grossAmount, p.discountAmount, p.netAmount, p.vatAmount, p.total]).toEqual([120, 10, 110, 13.5, 123.5]);
    expect(p.vatSummary).toEqual([
      { vatPct: 0, taxableBase: 20, vatAmount: 0 },
      { vatPct: 15, taxableBase: 90, vatAmount: 13.5 },
    ]);
    // Con descuento sigue siendo igual a la cuenta vieja: solo cambia lo que se guarda.
    expect(p.total).toBe(oldCalc([{ quantity: 2, unitPrice: 50, discountPct: 10, vatPct: 15 }, { quantity: 1, unitPrice: 20, vatPct: 0 }]).total);
  });

  it('100 %: la línea va en cero y el descuento es todo el bruto', () => {
    const p = priceInvoiceLines([
      { quantity: 1, unitPrice: 20, discountPct: 100, vatPct: 15 },
      { quantity: 1, unitPrice: 5, vatPct: 15 },
    ]);
    expect(p.lines[0]).toMatchObject({ gross: 20, discount: 20, subtotal: 0, vatAmount: 0 });
    expect([p.discountAmount, p.netAmount, p.total]).toEqual([20, 5, 5.75]);
  });

  it('redondeo: bruto y descuento a 2 decimales, y la resta', () => {
    const p = priceInvoiceLines([{ quantity: 3, unitPrice: 3.33, discountPct: 12.5, vatPct: 15 }]);
    expect(p.lines[0]).toMatchObject({ gross: 9.99, discount: 1.25, subtotal: 8.74, vatAmount: 1.31 });
  });

  it('tope 0–100 (validación del payload)', () => {
    expect(normalizeDiscountPct(undefined)).toBe(0);
    expect(normalizeDiscountPct(0)).toBe(0);
    expect(normalizeDiscountPct(100)).toBe(100);
    expect(normalizeDiscountPct('10,5')).toBe(10.5);
    expect(normalizeDiscountPct(-0.01)).toBeNull();
    expect(normalizeDiscountPct(100.01)).toBeNull();
    expect(normalizeDiscountPct('abc')).toBeNull();
    expect(normalizeDiscountPct(NaN)).toBeNull();
  });
});

describe('descuento de la factura guardada (XML y RIDE)', () => {
  it('Conecta: el descuento en dólares de cada línea', () => {
    expect(lineDiscountAmount({ quantity: 2, unitPrice: 50, discount: 10, discountPct: 10, subtotal: 90 })).toBe(10);
  });

  it('web de FacturaEc: solo discountPct → lo que va del bruto al neto', () => {
    expect(lineDiscountAmount({ quantity: 2, unitPrice: 50, discountPct: 10, subtotal: 90 })).toBe(10);
    expect(lineDiscountAmount({ quantity: 2, unitPrice: 50, subtotal: 100 })).toBe(0);
  });

  it('totalDescuento: Σ líneas, sin duplicar con discountAmount, + el adicional', () => {
    const lines = [
      { quantity: 2, unitPrice: 50, discount: 10, subtotal: 90 },
      { quantity: 1, unitPrice: 20, discount: 0, subtotal: 20 },
    ];
    expect(invoiceTotalDiscount(lines, 110)).toBe(10);
    // Descuento global de 5 sobre los netos (forma de la web).
    expect(invoiceTotalDiscount(lines, 105)).toBe(15);
  });
});

// ─── XML ──────────────────────────────────────────────────────────────────────

const header: InvoiceXmlHeader = {
  version: '1.0.0',
  ambiente: '1',
  tipoEmision: '1',
  razonSocial: 'EMPRESA INVENTADA S.A.',
  ruc: '1790000000001',
  accessKey: '1310202601179000000000110010010000000101234567818',
  establishment: '001',
  emissionPoint: '001',
  secuencial: '000000010',
  dirMatriz: 'CALLE FALSA 123',
  fechaEmision: '13/10/2026',
  dirEstablecimiento: 'CALLE FALSA 123',
  obligadoContabilidad: 'NO',
  tipoIdentificacionComprador: '05',
};

/** La factura tal como la guarda createAndEmitInvoice. Datos inventados. */
function storedInvoice(): InvoiceXmlDoc {
  const priced = priceInvoiceLines([
    { quantity: 2, unitPrice: 50, discountPct: 10, vatPct: 15 },
    { quantity: 1, unitPrice: 20, vatPct: 0 },
  ]);
  return {
    customerName: 'CLIENTE INVENTADO',
    customerTaxId: '1710034065',
    grossAmount: priced.grossAmount,
    discountAmount: priced.discountAmount,
    netAmount: priced.netAmount,
    total: priced.total,
    lines: priced.lines.map((l, i) => ({
      sku: i === 0 ? 'SERV-01' : 'LIB-01',
      description: i === 0 ? 'SERVICIO INVENTADO' : 'LIBRO INVENTADO',
      quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, discountPct: l.discountPct,
      subtotal: l.subtotal, vatPct: l.vatPct, vatAmount: l.vatAmount, unit: 'UNIDAD',
    })),
    paymentMethods: [{ code: '01', amount: priced.total, deadline: 0, timeUnit: 'dias' }],
  };
}

const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, 'g'))].map(m => m[1]);

describe('XML de la factura con descuento por línea', () => {
  it('detalle: descuento y precioTotalSinImpuesto = cantidad × precio − descuento', () => {
    const xml = buildInvoiceXml({ header, invoice: storedInvoice(), infoAdicional: [{ nombre: 'Email', valor: 'a@example.com' }] });
    expect(tag(xml, 'descuento')).toEqual(['10.00', '0.00']);
    expect(tag(xml, 'precioTotalSinImpuesto')).toEqual(['90.00', '20.00']);
    expect(tag(xml, 'totalSinImpuestos')).toEqual(['110.00']);
    expect(tag(xml, 'totalDescuento')).toEqual(['10.00']);
    expect(tag(xml, 'importeTotal')).toEqual(['123.50']);
    // totalConImpuestos: 15 % (código 4) sobre 90 y 0 % (código 0) sobre 20; luego los detalles.
    expect(tag(xml, 'baseImponible')).toEqual(['90.00', '20.00', '90.00', '20.00']);
    expect(tag(xml, 'codigoPorcentaje')).toEqual(['4', '0', '4', '0']);
  });

  it('sin descuento: totalDescuento 0.00 y descuento 0.00 en cada detalle', () => {
    const priced = priceInvoiceLines([{ quantity: 1, unitPrice: 10, vatPct: 15 }]);
    const xml = buildInvoiceXml({
      header,
      invoice: {
        customerName: 'X', customerTaxId: '1710034065', grossAmount: priced.grossAmount,
        discountAmount: 0, netAmount: priced.netAmount, total: priced.total,
        lines: [{ description: 'A', quantity: 1, unitPrice: 10, discount: 0, subtotal: 10, vatPct: 15, vatAmount: 1.5 }],
      },
    });
    expect(tag(xml, 'totalDescuento')).toEqual(['0.00']);
    expect(tag(xml, 'descuento')).toEqual(['0.00']);
  });

  it('factura de la web (solo discountPct): el descuento de la línea ya no sale en 0', () => {
    const a = invoiceXmlAmounts({
      customerName: 'X', customerTaxId: '1', grossAmount: 90, discountAmount: 0, netAmount: 90, total: 103.5,
      lines: [{ description: 'A', quantity: 2, unitPrice: 50, discountPct: 10, subtotal: 90, vatPct: 15, vatAmount: 13.5 }],
    });
    expect(a.detalles[0].lineDisc).toBe(10);
    expect(a.totalDescuento).toBe(10);
  });

  it('totales que no cuadran: no se genera', () => {
    const inv = storedInvoice();
    inv.total = 999;
    expect(() => buildInvoiceXml({ header, invoice: inv })).toThrow(/inconsistentes/);
  });
});

function hasXmllint(): boolean {
  try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

function validate(xml: string, xsd: string): string {
  const src = path.resolve(__dirname, '../../../docs/XML y XSD Factura');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factura-xsd-'));
  fs.copyFileSync(path.join(src, xsd), path.join(dir, xsd));
  fs.copyFileSync(path.join(src, 'xmldsig-core-schema.xsd'), path.join(dir, 'xmldsig-core-schema.xsd'));
  fs.writeFileSync(path.join(dir, 'doc.xml'), xml);
  try {
    execFileSync('xmllint', ['--noout', '--schema', path.join(dir, xsd), path.join(dir, 'doc.xml')], { stdio: 'pipe' });
    return '';
  } catch (e: any) {
    return String(e.stderr ?? e.message);
  }
}

describe('XSD oficial de la factura (xmllint)', () => {
  const run = hasXmllint() && fs.existsSync(path.resolve(__dirname, '../../../docs/XML y XSD Factura')) ? it : it.skip;
  for (const version of ['1.0.0', '1.1.0']) {
    run(`con descuento en una línea y tarifas 15 % y 0 % cumple factura_V${version}.xsd`, () => {
      const xml = buildInvoiceXml({
        header: { ...header, version },
        invoice: storedInvoice(),
        infoAdicional: [{ nombre: 'Email', valor: 'cliente@example.com' }],
      });
      expect(validate(xml, `factura_V${version}.xsd`)).toBe('');
    });
    run(`con 100 % de descuento en una línea cumple factura_V${version}.xsd`, () => {
      const priced = priceInvoiceLines([
        { quantity: 1, unitPrice: 20, discountPct: 100, vatPct: 15 },
        { quantity: 1, unitPrice: 5, vatPct: 0 },
      ]);
      const xml = buildInvoiceXml({
        header: { ...header, version },
        invoice: {
          customerName: 'X', customerTaxId: '1710034065', netAmount: priced.netAmount, total: priced.total,
          grossAmount: priced.grossAmount, discountAmount: priced.discountAmount,
          lines: priced.lines.map(l => ({ description: 'A', quantity: l.quantity, unitPrice: l.unitPrice,
            discount: l.discount, subtotal: l.subtotal, vatPct: l.vatPct, vatAmount: l.vatAmount })),
        },
      });
      expect(tag(xml, 'totalDescuento')).toEqual(['20.00']);
      expect(validate(xml, `factura_V${version}.xsd`)).toBe('');
    });
  }
});
