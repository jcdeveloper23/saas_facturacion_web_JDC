/**
 * retention-sustento.test.ts
 *
 * El documento de sustento del comprobante de retención v2.0.0 (2026-10-06):
 * impuestos de la factura del proveedor, pagos y el número en 15 dígitos.
 */

import { buildSustento, ivaPercentageCode, supportDocDigits } from '../retentions/retention-sustento';
import { retentionNeedsEntry } from '../accounting/accounting-setup';

describe('código de porcentaje del IVA (tabla 17)', () => {
  it('0 %, 5 %, 12 %, 15 %', () => {
    expect(ivaPercentageCode(0)).toBe('0');
    expect(ivaPercentageCode(5)).toBe('5');
    expect(ivaPercentageCode(12)).toBe('2');
    expect(ivaPercentageCode(15)).toBe('4');
  });

  it('una tarifa desconocida no se inventa', () => {
    expect(() => ivaPercentageCode(7)).toThrow();
  });
});

describe('buildSustento', () => {
  it('con los impuestos de la compra: base, IVA por tarifa y forma de pago', () => {
    const s = buildSustento({
      supportDocTotal: 126.5,
      supportDocSubtotal: 110,
      supportDocTaxes: [
        { rate: 15, base: 60, amount: 9 },
        { rate: 15, base: 40, amount: 6 },
        { rate: 0, base: 10, amount: 0 },
      ],
      supportDocPaymentCode: '01',
    });
    expect(s.totalSinImpuestos).toBe(110);
    expect(s.importeTotal).toBe(126.5);
    expect(s.impuestos).toEqual([
      { codImpuesto: '2', codigoPorcentaje: '0', baseImponible: 10, tarifa: 0, valorImpuesto: 0 },
      { codImpuesto: '2', codigoPorcentaje: '4', baseImponible: 100, tarifa: 15, valorImpuesto: 15 },
    ]);
    expect(s.pagos).toEqual([{ formaPago: '01', total: 126.5 }]);
  });

  it('una retención de la web (solo el total): sustento válido con todo como base 0 % y pago 20', () => {
    const s = buildSustento({ supportDocTotal: 50 });
    expect(s.totalSinImpuestos).toBe(50);
    expect(s.impuestos).toEqual([
      { codImpuesto: '2', codigoPorcentaje: '0', baseImponible: 50, tarifa: 0, valorImpuesto: 0 },
    ]);
    expect(s.pagos).toEqual([{ formaPago: '20', total: 50 }]);
  });

  it('una forma de pago que no es de la tabla 24 cae en 20', () => {
    expect(buildSustento({ supportDocTotal: 1, supportDocPaymentCode: '99' }).pagos[0].formaPago).toBe('20');
  });
});

describe('supportDocDigits', () => {
  it('con guiones, y sin ellos', () => {
    expect(supportDocDigits('001-002-000000123')).toBe('001002000000123');
    expect(supportDocDigits('1-2-123')).toBe('001002000000123');
    expect(supportDocDigits('001002000000123')).toBe('001002000000123');
  });
});

describe('retentionNeedsEntry', () => {
  it('emitida, viva y sin asiento', () => {
    expect(retentionNeedsEntry({ status: 'issued' })).toBe(true);
    expect(retentionNeedsEntry({ status: 'draft' })).toBe(false);
    expect(retentionNeedsEntry({ status: 'issued', accountingEntryId: 'e' })).toBe(false);
    expect(retentionNeedsEntry({ status: 'issued', isVoid: true })).toBe(false);
  });
});
