/**
 * sri-sustento-codes.test.ts
 *
 * La tabla 5 del ATS (sustento del comprobante) en un solo sitio (2026-10-08).
 */

import {
  SRI_SUSTENTO_CODES,
  givesVatCredit,
  isSriSustentoCode,
  normalizeSustentoCode,
  retentionSustentoCode,
  sriSustentoName,
} from '../utils/sri-sustento-codes';

describe('SRI_SUSTENTO_CODES (tabla 5 del ATS)', () => {
  it('trae del 00 al 15, sin repetir', () => {
    const codes = SRI_SUSTENTO_CODES.map((c) => c.code).sort();
    expect(codes).toEqual(['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15']);
  });

  it('los textos son los de la ficha, no los conceptos de renta de antes', () => {
    expect(sriSustentoName('01')).toBe('Crédito Tributario para declaración de IVA (servicios y bienes distintos de inventarios y activos fijos)');
    expect(sriSustentoName('02')).toBe('Costo o Gasto para declaración de IR (servicios y bienes distintos de inventarios y activos fijos)');
    expect(sriSustentoName('06')).toBe('Inventario - Crédito Tributario para declaración de IVA');
    expect(sriSustentoName('10')).toBe('Distribución de Dividendos, Beneficios o Utilidades');
    expect(sriSustentoName('20')).toBe('');   // «Anticipo de dividendos» no es de la tabla 5
  });
});

describe('givesVatCredit', () => {
  it('solo 01, 03 y 06 dan crédito tributario de IVA', () => {
    const conCredito = SRI_SUSTENTO_CODES.filter((c) => c.givesVatCredit).map((c) => c.code);
    expect(conCredito).toEqual(['01', '03', '06']);
    expect(givesVatCredit('1')).toBe(true);
    expect(givesVatCredit('07')).toBe(false);
    expect(givesVatCredit(undefined)).toBe(false);
  });
});

describe('normalizeSustentoCode / isSriSustentoCode', () => {
  it('rellena a dos dígitos', () => {
    expect(normalizeSustentoCode('1')).toBe('01');
    expect(normalizeSustentoCode(6)).toBe('06');
    expect(normalizeSustentoCode(' 02 ')).toBe('02');
    expect(normalizeSustentoCode(null)).toBe('');
  });

  it('el 00 ya no está vigente (hasta el 28/02/2015) y el 20 nunca existió', () => {
    expect(isSriSustentoCode('00')).toBe(false);
    expect(isSriSustentoCode('20')).toBe(false);
    expect(isSriSustentoCode('15')).toBe(true);
  });
});

describe('retentionSustentoCode (el <codSustento> de la retención)', () => {
  it('vacío → 01, como antes', () => {
    expect(retentionSustentoCode(undefined)).toBe('01');
    expect(retentionSustentoCode('')).toBe('01');
  });

  it('un código válido pasa normalizado', () => {
    expect(retentionSustentoCode('6')).toBe('06');
    expect(retentionSustentoCode('02')).toBe('02');
  });

  it('uno fuera de la tabla 5 se rechaza antes de firmar', () => {
    expect(() => retentionSustentoCode('20')).toThrow(/sustento tributario/);
    expect(() => retentionSustentoCode('00')).toThrow();
  });
});
