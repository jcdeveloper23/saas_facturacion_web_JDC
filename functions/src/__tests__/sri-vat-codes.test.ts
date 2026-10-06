/**
 * sri-vat-codes.test.ts
 *
 * La tabla 17 (código de porcentaje del IVA) en un solo sitio (2026-10-06).
 */

import { DEFAULT_COMPANY_TAX_RATES, sriVatCode } from '../utils/sri-vat-codes';

describe('sriVatCode', () => {
  it('sin configuración: la tabla del SRI', () => {
    expect(sriVatCode(0)).toBe('0');   // antes '2' (12 %)
    expect(sriVatCode(15)).toBe('4');  // en el POS y las ND era '3' (14 %)
    expect(sriVatCode(5)).toBe('5');
    expect(sriVatCode(8)).toBe('8');
    expect(sriVatCode(12)).toBe('2');
  });

  it('manda la configuración de plataforma, sin tomar exento/no objeto por el 0 %', () => {
    const config = [
      { vatPct: 0, sriCode: '6', isExempt: true },
      { vatPct: 0, sriCode: '0' },
      { vatPct: 15, sriCode: '4' },
    ];
    expect(sriVatCode(0, config)).toBe('0');
    expect(sriVatCode(15, config)).toBe('4');
  });

  it('una tarifa desconocida cae en la vigente, no en el 12 %', () => {
    expect(sriVatCode(7)).toBe('4');
  });

  it('las tarifas por defecto de una empresa nueva', () => {
    const porCodigo = Object.fromEntries(DEFAULT_COMPANY_TAX_RATES.map((t) => [t.code, t.sriCode]));
    expect(porCodigo).toEqual({ VAT15: '4', VAT5: '5', VAT0: '0', NOOBJ: '6', EXEMPT: '7' });
  });
});
