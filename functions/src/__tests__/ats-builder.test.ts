/**
 * ats-builder.ts — el ATS según la ficha técnica 2025 y el XSD oficial del SRI
 * (src/accounting/ats/ats.xsd). Con xmllint instalado, cada XML se valida
 * contra el esquema; si falta xmllint o el XSD, esas pruebas se saltan.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  atsPeriod, buildAts, buildAnuladosRows, fmtDateEc, money, sanitizeRazonSocial,
  saleBases, purchaseBases, tipoEmision, tpIdCliente, tpIdProv, AtsBuildInput,
} from '../accounting/ats/ats-builder';

const XSD = path.resolve(__dirname, '../accounting/ats/ats.xsd');

function hasXmllint(): boolean {
  try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}
const canValidate = hasXmllint() && fs.existsSync(XSD);
const itXsd = canValidate ? it : it.skip;

function validate(xml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-xsd-'));
  const file = path.join(dir, 'AT.xml');
  fs.writeFileSync(file, Buffer.from(xml, 'latin1'));
  try {
    execFileSync('xmllint', ['--noout', '--schema', XSD, file], { stdio: 'pipe' });
    return '';
  } catch (e: any) {
    return String(e.stderr ?? e.message);
  }
}

/** Una fecha a mediodía de Ecuador del día dado. */
const ec = (y: number, m: number, d: number, h = 12) => new Date(Date.UTC(y, m - 1, d, h + 5));

function base(over: Partial<AtsBuildInput> = {}): AtsBuildInput {
  return {
    companyRuc: '1790012345001', companyName: 'Weconnect Corp.', year: 2026, month: 9,
    establishmentCodes: ['001'], invoices: [], debitNotes: [], purchases: [], retentionsById: {},
    voidedInvoices: [], voidedDebitNotes: [], voidedRetentions: [], ...over,
  };
}

const factura = (over: Record<string, any> = {}) => ({
  status: 'issued', sriStatus: 'authorized', isVoid: false, date: ec(2026, 9, 10),
  fullNumber: '001-001-000000010', seriesEstablishment: '001', seriesEmissionPoint: '001',
  customerTaxId: '1790011111001', customerTaxIdType: 'RUC',
  vatSummary: [{ vatPct: 15, taxableBase: 100, vatAmount: 15 }],
  lines: [{ vatPct: 15, subtotal: 100, vatAmount: 15 }],
  accessKey: '1009202601179001234500110010010000000101234567811',
  ...over,
});

const compra = (over: Record<string, any> = {}) => ({
  id: 'p1', status: 'received', date: ec(2026, 9, 12), supplierInvoiceDate: ec(2026, 9, 11),
  supplierInvoiceNumber: '002-001-000000777', supplierRuc: '0990000000001', supplierTaxIdType: 'RUC',
  supplierAccessKey: '1109202601099000000000120020010000007771234567811',
  sriDocumentType: '01', sriSustentoCode: '06',
  lines: [{ taxRate: 15, subtotal: 200, taxAmount: 30 }, { taxRate: 0, subtotal: 50, taxAmount: 0 }],
  subtotal: 250, totalTax: 30, ...over,
});

const tag = (xml: string, t: string) => [...xml.matchAll(new RegExp(`<${t}>([^<]*)</${t}>`, 'g'))].map((m) => m[1]);

describe('periodo y formatos', () => {
  it('el mes va en días de Ecuador (UTC−5)', () => {
    const p = atsPeriod(2026, 9);
    expect(p.start.toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(p.mesXml).toBe('09');
  });
  it('semestral: 06 y 12 (ficha p. 5, tabla 1)', () => {
    expect(atsPeriod(2026, 1, 1).mesXml).toBe('06');
    const s2 = atsPeriod(2026, 1, 2);
    expect(s2.mesXml).toBe('12');
    expect(s2.start.toISOString()).toBe('2026-07-01T05:00:00.000Z');
    expect(s2.end.toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });
  it('la fecha se escribe con el día de Ecuador', () => {
    // 30/09 a las 23:00 en Quito = 01/10 04:00 UTC.
    expect(fmtDateEc(new Date('2026-10-01T04:00:00Z'))).toBe('30/09/2026');
  });
  it('money desde centavos, sin errores de coma flotante', () => {
    expect(money(10)).toBe('0.10');
    expect(money(123456)).toBe('1234.56');
    expect(money(-5)).toBe('-0.05');
  });
  it('razón social sin tildes ni símbolos (razonSocialType)', () => {
    expect(sanitizeRazonSocial('Weconnect Corp.')).toBe('Weconnect Corp');
    expect(sanitizeRazonSocial('LEANDRO LEÓN & Cía. Ltda.')).toBe('LEANDRO LEON Cia Ltda');
    expect(sanitizeRazonSocial('Muñoz')).toBe('Munoz');
  });
});

describe('tablas de la ficha', () => {
  it('tipo de emisión: E electrónica, F física (tabla 20, p. 84)', () => {
    expect(tipoEmision('authorized')).toBe('E');
    expect(tipoEmision('not_required')).toBe('F');
    expect(tipoEmision('plan_feature_disabled')).toBe('F');
  });
  it('tpIdCliente (tabla 2): consumidor final 07, exterior 06', () => {
    expect(tpIdCliente('9999999999999', 'RUC')).toBe('07');
    expect(tpIdCliente('0102030405', 'CEDULA')).toBe('05');
    expect(tpIdCliente('X123', 'EXTERIOR')).toBe('06');
  });
  it('tpIdProv (tabla 2): 01 RUC, 02 cédula, 03 exterior; sin tipo, por el número', () => {
    expect(tpIdProv('RUC', '')).toBe('01');
    expect(tpIdProv('', '0102030405')).toBe('02');
    expect(tpIdProv('PASAPORTE', 'AB123')).toBe('03');
  });
});

describe('bases', () => {
  it('vatSummary manda (descuento global) y el 0 % se reparte en no objeto y exento por las líneas', () => {
    const { bases, fromLines } = saleBases({
      vatSummary: [{ vatPct: 15, taxableBase: 90, vatAmount: 13.5 }, { vatPct: 0, taxableBase: 45, vatAmount: 0 }],
      lines: [
        { vatPct: 15, subtotal: 100, vatAmount: 15 },
        { vatPct: 0, subtotal: 20, sriTaxCode: '0' },
        { vatPct: 0, subtotal: 20, sriTaxCode: '6' },
        { vatPct: 0, subtotal: 10, sriTaxCode: '7' },
      ],
    });
    expect(fromLines).toBe(false);
    expect(bases.grav).toBe(9000);
    expect(bases.iva).toBe(1350);
    expect(bases.noObj).toBe(1800);
    expect(bases.exe).toBe(900);
    expect(bases.zero).toBe(1800);
  });
  it('sin vatSummary, de las líneas', () => {
    const r = saleBases({ lines: [{ vatPct: 15, subtotal: 10, vatAmount: 1.5 }, { vatPct: 0, subtotal: 5 }] });
    expect(r.fromLines).toBe(true);
    expect(r.bases).toEqual({ noObj: 0, zero: 500, grav: 1000, exe: 0, iva: 150 });
  });
  it('compras: 0 % a baseImponible, 6 a baseNoGraIva, 7 a baseImpExe', () => {
    expect(purchaseBases({
      lines: [
        { taxRate: 15, subtotal: 100, taxAmount: 15 },
        { taxRate: 0, subtotal: 10 },
        { taxRate: 0, subtotal: 20, vatCode: '6' },
        { taxRate: 0, subtotal: 30, sriTaxCode: '7' },
      ],
    })).toEqual({ grav: 10000, iva: 1500, zero: 1000, noObj: 2000, exe: 3000 });
  });
});

describe('buildAts', () => {
  it('ventas: factura 18, NC 04 restando, ND 05; totalVentas = bases sin IVA', () => {
    const r = buildAts(base({
      invoices: [
        factura(),
        factura({ fullNumber: '001-001-000000011', isCreditNote: true, documentType: 'creditNote',
          vatSummary: [{ vatPct: 15, taxableBase: 20, vatAmount: 3 }] }),
      ],
      debitNotes: [{ status: 'issued', sriStatus: 'authorized', date: ec(2026, 9, 15), fullNumber: '001-001-000000001',
        seriesEstablishment: '001', customerTaxId: '1790011111001', customerTaxIdType: 'RUC',
        totalSinImpuestos: 10, vatPct: 15, vatAmount: 1.5 }],
    }));
    expect(tag(r.xml, 'tipoComprobante')).toEqual(['18', '04', '05']);
    expect(tag(r.xml, 'tipoEmision')).toEqual(['E', 'E', 'E']);
    expect(tag(r.xml, 'totalVentas')).toEqual(['90.00']); // 100 − 20 + 10
    expect(tag(r.xml, 'ventasEstab')).toEqual(['90.00']);
    expect(r.summary.ventas.montoIva).toBe(13.5);       // 15 − 3 + 1.5
    expect(r.summary.ventas).toMatchObject({ facturas: 1, notasCredito: 1, notasDebito: 1 });
  });

  it('excluye borradores, anuladas, en camino y rechazadas, y avisa', () => {
    const r = buildAts(base({
      invoices: [
        factura({ status: 'draft' }),
        factura({ isVoid: true }),
        factura({ sriStatus: 'pending' }),
        factura({ sriStatus: 'rejected' }),
        factura({ sriStatus: 'not_required' }),
        factura({ date: ec(2026, 10, 1, 0) }), // fuera del mes (Ecuador)
      ],
    }));
    expect(r.summary.ventas.facturas).toBe(1);
    expect(tag(r.xml, 'tipoEmision')).toEqual(['F']);
    expect(r.summary.excluidas).toEqual({ enProceso: 1, rechazadas: 1 });
    expect(r.warnings.join(' ')).toMatch(/camino al SRI/);
  });

  it('una factura del 30/09 a las 23:00 de Quito es de septiembre', () => {
    const r = buildAts(base({ invoices: [factura({ date: new Date('2026-10-01T04:00:00Z') })] }));
    expect(r.summary.ventas.facturas).toBe(1);
  });

  it('todos los establecimientos activos, con 0 si no vendieron', () => {
    const r = buildAts(base({ establishmentCodes: ['001', '002'], invoices: [factura()] }));
    expect(tag(r.xml, 'numEstabRuc')).toEqual(['002']);
    expect(tag(r.xml, 'codEstab')).toEqual(['001', '002']);
    expect(tag(r.xml, 'ventasEstab')).toEqual(['100.00', '0.00']);
  });

  it('compras: bases separadas, sustento normalizado, retención de IVA solo con la ligada autorizada', () => {
    const r = buildAts(base({
      purchases: [compra({ sriSustentoCode: '6', retentionId: 'r1' }), compra({ id: 'p2', totalVatRetention: 9 })],
      retentionsById: {
        r1: { status: 'issued', sriStatus: 'authorized', fullNumber: '001-001-000000005', date: ec(2026, 9, 12),
          authorizationNumber: '1209202607179001234500110010010000000051234567811',
          taxes: [{ taxCode: '2', pctCode: '2', rate: 70, taxableBase: 30, retainedAmount: 21 },
            { taxCode: '1', pctCode: '312', rate: 1.75, taxableBase: 200, retainedAmount: 3.5 }] },
      },
    }));
    expect(tag(r.xml, 'codSustento')).toEqual(['06', '06']);
    expect(tag(r.xml, 'baseImponible')).toEqual(['50.00', '50.00']);
    expect(tag(r.xml, 'baseImpGrav')).toEqual(['200.00', '200.00']);
    expect(tag(r.xml, 'valorRetServicios')).toEqual(['21.00', '0.00']);
    // Sin retención ligada: 0, no un 30 % inventado.
    expect(tag(r.xml, 'valorRetBienes')).toEqual(['0.00', '0.00']);
    expect(tag(r.xml, 'codRetAir')).toEqual(['312', '332']);
    expect(tag(r.xml, 'secRetencion1')).toEqual(['5']);
    expect(r.summary.retenciones).toEqual({ documentos: 1, iva: 21, renta: 3.5 });
  });

  it('una retención no autorizada se ignora y se avisa', () => {
    const r = buildAts(base({
      purchases: [compra({ retentionId: 'r1' })],
      retentionsById: { r1: { status: 'issued', sriStatus: 'rejected', taxes: [{ taxCode: '2', rate: 30, retainedAmount: 9 }] } },
    }));
    expect(tag(r.xml, 'valorRetBienes')).toEqual(['0.00']);
    expect(r.xml).not.toContain('estabRetencion1');
    expect(r.warnings.join(' ')).toMatch(/no está autorizada/);
  });

  it('excluirInformativa332 quita la línea 332, no la compra', () => {
    const r = buildAts(base({ purchases: [compra()], excluirInformativa332: true }));
    expect(r.summary.compras.documentos).toBe(1);
    expect(r.xml).not.toContain('<air>');
  });

  it('compras: solo recibidas o pagadas', () => {
    const r = buildAts(base({ purchases: [compra({ status: 'draft' }), compra({ status: 'cancelled' }), compra({ status: 'paid' })] }));
    expect(r.summary.compras.documentos).toBe(1);
  });

  it('anulados: solo comprobantes propios, en rangos, con su tipo de la tabla 4', () => {
    const v = (n: number, extra: Record<string, any> = {}) => factura({
      isVoid: true, status: 'void', voidedAt: ec(2026, 9, 20), fullNumber: `001-001-00000000${n}`,
      accessKey: '', authorizationNumber: '', sriStatus: 'not_required', ...extra,
    });
    const r = buildAts(base({
      voidedInvoices: [v(1), v(2), v(3), v(5), v(6, { sriStatus: 'rejected' })],
      voidedRetentions: [{ status: 'void', isVoid: true, sriStatus: 'authorized', voidedAt: ec(2026, 9, 21),
        fullNumber: '001-001-000000009', authorizationNumber: '2109202607179001234500110010010000000091234567811' }],
    }));
    expect(r.excelData.anulados.map((a) => [a.tipoComprobante, a.secuencialInicio, a.secuencialFin]))
      .toEqual([['01', 1, 3], ['01', 5, 5], ['07', 9, 9]]);
  });

  it('rangos: autorizaciones distintas no se juntan', () => {
    const rows = buildAnuladosRows([
      { tipoComprobante: '01', establecimiento: '001', puntoEmision: '001', secuencial: 1, autorizacion: '111' },
      { tipoComprobante: '01', establecimiento: '001', puntoEmision: '001', secuencial: 2, autorizacion: '222' },
    ]);
    expect(rows).toHaveLength(2);
  });

  it('semestral RIMPE: regimenMicroempresa = SI y mes 12', () => {
    const r = buildAts(base({ semestre: 2, invoices: [factura()] }));
    expect(tag(r.xml, 'regimenMicroempresa')).toEqual(['SI']);
    expect(tag(r.xml, 'Mes')).toEqual(['12']);
    expect(r.filenameBase).toBe('AT122026');
    expect(r.summary.ventas.facturas).toBe(1);
  });

  it('consumidor final sin parteRelVtas', () => {
    const r = buildAts(base({ invoices: [factura({ customerTaxId: '9999999999999', customerTaxIdType: 'RUC' })] }));
    expect(tag(r.xml, 'tpIdCliente')).toEqual(['07']);
    expect(r.xml).not.toContain('parteRelVtas');
  });

  it('el Excel coincide con el XML', () => {
    const r = buildAts(base({ invoices: [factura()], purchases: [compra()] }));
    expect(r.excelData.totalVentas).toBe(100);
    expect(r.excelData.compras[0]).toMatchObject({ baseImponible: 50, baseImpGrav: 200, codRetAir: '332' });
    expect(r.excelData.ventas[0]).toMatchObject({ tipoComprobante: '18', tipoEmision: 'E', baseImpGrav: 100 });
  });

  it('retenciones recibidas: valorRetIva y valorRetRenta por cliente, por la fecha de la retención (ficha p. 37)', () => {
    const rr = (over: Record<string, any> = {}) => ({
      status: 'registered', isVoid: false, date: ec(2026, 9, 14), invoiceSriStatus: 'authorized',
      customerTaxId: '1790011111001', customerTaxIdType: 'RUC', ivaCents: 1050, rentaCents: 175, ...over,
    });
    const r = buildAts(base({
      invoices: [factura()],
      receivedRetentions: [
        rr(),
        rr({ ivaCents: 450, rentaCents: 0 }),
        rr({ date: ec(2026, 8, 30) }),                       // de agosto: no entra
        rr({ status: 'void', isVoid: true }),                // anulada: no entra
        rr({ customerTaxId: '0990000000001', ivaCents: 0, rentaCents: 100 }), // sin ventas en el mes
      ],
    }));
    expect(tag(r.xml, 'valorRetIva')).toEqual(['15.00', '0.00']);
    expect(tag(r.xml, 'valorRetRenta')).toEqual(['1.75', '1.00']);
    expect(tag(r.xml, 'numeroComprobantes')).toEqual(['1', '0']);
    expect(r.summary.retencionesRecibidas).toEqual({ documentos: 3, iva: 15, renta: 2.75 });
    expect(r.excelData.ventas[0]).toMatchObject({ valorRetIva: 15, valorRetRenta: 1.75 });
    expect(r.warnings.some((w) => w.includes('sin ventas en él'))).toBe(true);
    // totalVentas no cambia: solo cuentan las bases.
    expect(tag(r.xml, 'totalVentas')).toEqual(['100.00']);
  });

  it('sin retenciones recibidas, valorRetIva y valorRetRenta en 0', () => {
    const r = buildAts(base({ invoices: [factura()] }));
    expect(tag(r.xml, 'valorRetIva')).toEqual(['0.00']);
    expect(r.summary.retencionesRecibidas).toEqual({ documentos: 0, iva: 0, renta: 0 });
  });
});

describe('XSD oficial del SRI (xmllint)', () => {
  if (!canValidate) {
    // eslint-disable-next-line no-console
    console.warn('[ats-builder.test] Sin xmllint o sin ats.xsd: se saltan las validaciones contra el esquema.');
  }

  itXsd('un mes vacío cumple el esquema', () => {
    expect(validate(buildAts(base()).xml)).toBe('');
  });

  itXsd('un mes completo (ventas, NC, ND, compras con y sin retención, anulados, exportación) cumple el esquema', () => {
    const r = buildAts(base({
      establishmentCodes: ['001', '002'],
      invoices: [
        factura({ paymentMethods: [{ code: '20' }] }),
        factura({ customerTaxId: '9999999999999', sriStatus: 'not_required',
          vatSummary: [{ vatPct: 0, taxableBase: 12.34, vatAmount: 0 }], lines: [{ vatPct: 0, subtotal: 12.34, sriTaxCode: '7' }] }),
        factura({ fullNumber: '001-001-000000011', isCreditNote: true, vatSummary: [{ vatPct: 15, taxableBase: 20, vatAmount: 3 }] }),
        factura({ fullNumber: '002-001-000000003', seriesEstablishment: '002', customerTaxId: '0102030405', customerTaxIdType: 'CEDULA',
          exportData: { exportType: '03', shipmentDate: ec(2026, 9, 9), fobValue: 100 } }),
      ],
      debitNotes: [{ status: 'issued', sriStatus: 'authorized', date: ec(2026, 9, 15), fullNumber: '001-001-000000001',
        seriesEstablishment: '001', customerTaxId: '1790011111001', customerTaxIdType: 'RUC', totalSinImpuestos: 10, vatPct: 15, vatAmount: 1.5 }],
      purchases: [
        compra({ retentionId: 'r1', paymentMethodCode: '20', lines: [{ taxRate: 15, subtotal: 1000, taxAmount: 150 }] }),
        compra({ id: 'p2', supplierRuc: '0102030405', supplierTaxIdType: '', supplierAccessKey: '', supplierInvoiceNumber: 'F-45',
          lines: [{ taxRate: 0, subtotal: 5, vatCode: '6' }, { taxRate: 0, subtotal: 7, vatCode: '7' }] }),
      ],
      retentionsById: {
        r1: { status: 'issued', sriStatus: 'authorized', fullNumber: '001-001-000000005', date: ec(2026, 9, 12),
          authorizationNumber: '1209202607179001234500110010010000000051234567811',
          taxes: [{ taxCode: '2', pctCode: '1', rate: 30, taxableBase: 150, retainedAmount: 45 },
            { taxCode: '1', pctCode: '3440', rate: 2.75, taxableBase: 1000, retainedAmount: 27.5 }] },
      },
      voidedInvoices: [factura({ isVoid: true, status: 'void', voidedAt: ec(2026, 9, 20), fullNumber: '001-001-000000004' })],
      voidedRetentions: [{ status: 'void', isVoid: true, sriStatus: 'authorized', voidedAt: ec(2026, 9, 21),
        fullNumber: '001-001-000000009', authorizationNumber: '2109202607179001234500110010010000000091234567811' }],
    }));
    expect(validate(r.xml)).toBe('');
  });

  itXsd('la validación sí detecta errores (como los del generador anterior)', () => {
    const ok = buildAts(base({ invoices: [factura()], purchases: [compra()] })).xml;
    // El generador anterior escribía <parteRel> en ventas y <pagoLocExt> fuera de <pagoExterior>.
    expect(validate(ok.replace(/parteRelVtas/g, 'parteRel'))).not.toBe('');
    expect(validate(ok.replace(/<pagoExterior>[\s\S]*?<\/pagoExterior>/, '<pagoLocExt>01</pagoLocExt>'))).not.toBe('');
    expect(validate(ok.replace(/<valorRetBienes>[^<]*<\/valorRetBienes>/, ''))).not.toBe('');
  });

  itXsd('con retenciones recibidas (y un cliente sin ventas en el mes) cumple el esquema', () => {
    const r = buildAts(base({
      invoices: [factura({ paymentMethods: [{ code: '20' }] })],
      receivedRetentions: [
        { status: 'registered', date: ec(2026, 9, 14), customerTaxId: '1790011111001', customerTaxIdType: 'RUC',
          invoiceSriStatus: 'authorized', ivaCents: 1050, rentaCents: 175 },
        { status: 'registered', date: ec(2026, 9, 20), customerTaxId: '0102030405', customerTaxIdType: 'CEDULA',
          invoiceSriStatus: 'authorized', ivaCents: 0, rentaCents: 100 },
      ],
    }));
    expect(tag(r.xml, 'valorRetIva')).toEqual(['10.50', '0.00']);
    expect(validate(r.xml)).toBe('');
  });

  itXsd('semestral cumple el esquema', () => {
    expect(validate(buildAts(base({ semestre: 1, invoices: [factura({ date: ec(2026, 3, 3) })] })).xml)).toBe('');
  });
});
