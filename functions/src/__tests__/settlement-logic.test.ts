/**
 * settlement-logic.test.ts — liquidación de compra (codDoc 03), 2026-11-05.
 * Validación del pedido, totales y quién emite. Datos inventados.
 */

import {
  SettlementPayload,
  canIssueSettlement,
  computeSettlement,
  isSettlementAuthorizedPending,
  isSettlementReadyToEmit,
  settlementCounterKey,
  settlementFullNumber,
  settlementPayloadProblem,
  settlementSupplierIdType,
} from '../purchases/settlement/settlement-logic';
import { buildPurchaseSettlementXml } from '../utils/sri-settlement-xml';

function payload(): SettlementPayload {
  return {
    companyId: 'c1',
    supplier: { name: 'Proveedor Inventado', taxId: '1710034065', taxIdType: 'CI', address: 'Quito' },
    sriSustentoCode: '01',
    paymentMethodCode: '01',
    lines: [
      { description: 'Servicio', qty: 1, unitCost: 100, discount: 10, taxRate: 15 },
      { description: 'Maíz', qty: 3, unitCost: 10.333, taxRate: 0 },
    ],
  };
}

describe('quién emite (D-LC2)', () => {
  it('admin, contador y vendedor sí; cajero y solo lectura no', () => {
    for (const r of ['admin', 'accountant', 'seller', 'super_admin']) expect(canIssueSettlement(r)).toBe(true);
    for (const r of ['cashier', 'read_only', undefined]) expect(canIssueSettlement(r)).toBe(false);
  });
});

describe('tipo de identificación del proveedor (D-LC4)', () => {
  it('cédula y pasaporte, en texto o código', () => {
    expect(settlementSupplierIdType('CI')).toBe('05');
    expect(settlementSupplierIdType('05')).toBe('05');
    expect(settlementSupplierIdType('pasaporte')).toBe('06');
    expect(settlementSupplierIdType('06')).toBe('06');
  });
  it('RUC, consumidor final y exterior no', () => {
    for (const t of ['RUC', '04', 'CONSUMIDOR_FINAL', '07', 'EXTERIOR', '08', '']) {
      expect(settlementSupplierIdType(t)).toBeNull();
    }
  });
});

describe('settlementPayloadProblem', () => {
  it('un pedido completo pasa', () => {
    expect(settlementPayloadProblem(payload())).toBeNull();
  });
  it('proveedor con RUC: debe darte factura', () => {
    const p = payload();
    p.supplier.taxIdType = 'RUC';
    expect(settlementPayloadProblem(p)).toMatch(/cédula o pasaporte/);
  });
  it('cédula con dígito verificador malo', () => {
    const p = payload();
    p.supplier.taxId = '1710034066';
    expect(settlementPayloadProblem(p)).toMatch(/proveedor|cédula/i);
  });
  it('sin dirección del proveedor', () => {
    const p = payload();
    p.supplier.address = ' ';
    expect(settlementPayloadProblem(p)).toMatch(/dirección/);
  });
  it('sustento, forma de pago, IVA y descuento fuera de rango', () => {
    let p = payload(); p.sriSustentoCode = '99';
    expect(settlementPayloadProblem(p)).toMatch(/sustento/);
    p = payload(); p.paymentMethodCode = '22';
    expect(settlementPayloadProblem(p)).toMatch(/forma de pago/);
    p = payload(); p.lines[0].taxRate = 12;
    expect(settlementPayloadProblem(p)).toMatch(/IVA de la línea 1/);
    p = payload(); p.lines[1].discount = 101;
    expect(settlementPayloadProblem(p)).toMatch(/descuento de la línea 2/);
  });
  it('sin líneas o en cero', () => {
    let p = payload(); p.lines = [];
    expect(settlementPayloadProblem(p)).toMatch(/al menos una línea/);
    p = payload(); p.lines = [{ description: 'x', qty: 1, unitCost: 0, taxRate: 0 }];
    expect(settlementPayloadProblem(p)).toMatch(/valer algo/);
  });
  it('fecha mal escrita', () => {
    const p = payload(); p.date = '05/11/2026';
    expect(settlementPayloadProblem(p)).toMatch(/AAAA-MM-DD/);
  });
});

describe('computeSettlement', () => {
  const { lines, totals } = computeSettlement(payload().lines, () => 'id');
  it('líneas a 2 decimales, sin productId (no mueve stock, D-LC5)', () => {
    expect(lines[0]).toMatchObject({ productId: '', subtotal: 90, discountAmount: 10, taxAmount: 13.5, total: 103.5 });
    expect(lines[1]).toMatchObject({ productId: '', subtotal: 31, discountAmount: 0, taxAmount: 0 });
  });
  it('totales y grupos de IVA', () => {
    expect(totals).toEqual({
      subtotal: 121, totalDiscount: 10, totalTax: 13.5, total: 134.5,
      taxGroups: [{ vatRate: 15, base: 90, tax: 13.5 }, { vatRate: 0, base: 31, tax: 0 }],
    });
  });
  it('lo que suma el XML cuadra con la compra', () => {
    const xml = buildPurchaseSettlementXml({
      issuer: {
        ambiente: '1', razonSocial: 'X', ruc: '1790000000001', accessKey: '0'.repeat(49),
        establishment: '001', emissionPoint: '001', secuencial: '000000001', dirMatriz: 'X', obligadoContabilidad: 'SI',
      },
      supplier: { tipoIdentificacion: '05', razonSocial: 'P', identificacion: '1710034065', direccion: 'Q' },
      issueDate: new Date('2026-11-05T17:00:00Z'),
      totalSinImpuestos: totals.subtotal,
      totalDescuento: totals.totalDiscount,
      taxGroups: totals.taxGroups.map((g) => ({ ...g, vatCode: g.vatRate ? '4' : '0' })),
      importeTotal: totals.total,
      payments: [],
      lines: lines.map((l) => ({
        description: l.description, quantity: l.qty, unitPrice: l.unitCost, discount: l.discountAmount,
        lineTotal: l.subtotal, vatCode: l.taxRate ? '4' : '0', vatRate: l.taxRate, vatAmount: l.taxAmount,
      })),
      additionalInfo: [],
    });
    expect(xml).toContain('<totalSinImpuestos>121.00</totalSinImpuestos>');
    expect(xml).toContain('<importeTotal>134.50</importeTotal>');
  });
});

describe('numeración y disparo', () => {
  it('número y clave del contador', () => {
    expect(settlementFullNumber('001', '002', 45)).toBe('001-002-000000045');
    expect(settlementCounterKey('001', '002', 2026)).toBe('LC_001_002_2026');
  });
  it('solo emite una liquidación nuestra, enviada, sin anular y sin estado del SRI', () => {
    const ok = { issuedByCompany: true, sriDocumentType: '03', status: 'sent' };
    expect(isSettlementReadyToEmit(ok)).toBe(true);
    expect(isSettlementReadyToEmit({ ...ok, sriStatus: 'pending' })).toBe(false);
    expect(isSettlementReadyToEmit({ ...ok, issuedByCompany: undefined })).toBe(false);
    expect(isSettlementReadyToEmit({ ...ok, sriDocumentType: '01' })).toBe(false);
    expect(isSettlementReadyToEmit({ ...ok, status: 'received' })).toBe(false);
    expect(isSettlementReadyToEmit({ ...ok, isVoid: true })).toBe(false);
  });
  it('autorizada pero aún enviada → falta recibirla (también si llega por checkSriStatus)', () => {
    const ok = { issuedByCompany: true, sriDocumentType: '03', status: 'sent', sriStatus: 'authorized' };
    expect(isSettlementAuthorizedPending(ok)).toBe(true);
    expect(isSettlementAuthorizedPending({ ...ok, status: 'received' })).toBe(false);
    expect(isSettlementAuthorizedPending({ ...ok, sriStatus: 'rejected' })).toBe(false);
    expect(isSettlementAuthorizedPending({ ...ok, issuedByCompany: false })).toBe(false);
    expect(isSettlementReadyToEmit(ok)).toBe(false);
  });
});
