import {
  normalizeSriIdType, inferSriIdType, inferBuyerTaxIdType, retainedSubjectIdCheck,
} from '../utils/sri-id-type';

// Identificaciones ficticias con el verificador calculado (las de ecuador-tax-id.test.ts).
const CEDULA_OK = '1712345675';

describe('normalizeSriIdType', () => {
  it.each([
    ['04', '04'], ['4', '04'], ['RUC', '04'], ['ruc', '04'],
    ['05', '05'], ['CI', '05'], ['cedula', '05'], ['Cédula', '05'],
    ['06', '06'], ['PASAPORTE', '06'], ['passport', '06'],
    ['07', '07'], ['CONSUMIDOR_FINAL', '07'], ['consumidor final', '07'],
    ['08', '08'], ['EXTERIOR', '08'],
    [' 04 ', '04'],
  ])('%s → %s', (raw, code) => expect(normalizeSriIdType(raw)).toBe(code));

  it('un texto desconocido no se adivina', () => {
    expect(normalizeSriIdType('NIT')).toBeNull();
    expect(normalizeSriIdType('09')).toBeNull();
  });

  it('vacío: se deduce de la identificación', () => {
    expect(normalizeSriIdType('', CEDULA_OK)).toBe('05');
    expect(normalizeSriIdType(undefined, `${CEDULA_OK}001`)).toBe('04');
    expect(normalizeSriIdType(null, '9999999999999')).toBe('07');
    expect(normalizeSriIdType('', 'AB123')).toBe('04');
  });
});

describe('inferSriIdType / inferBuyerTaxIdType', () => {
  it('por la forma', () => {
    expect(inferSriIdType(CEDULA_OK)).toBe('05');
    expect(inferSriIdType('')).toBe('04');
    expect(inferBuyerTaxIdType(CEDULA_OK)).toBe('CI');
    expect(inferBuyerTaxIdType('9999999999999')).toBe('CONSUMIDOR_FINAL');
    expect(inferBuyerTaxIdType('1791234567001')).toBe('RUC');
  });
});

describe('retainedSubjectIdCheck', () => {
  it.each([
    ['1791234567001', '04'],          // sociedad (S.A.S. sin módulo 11)
    ['1791234567001', 'RUC'],
    [`${CEDULA_OK}001`, 'ruc'],
    [CEDULA_OK, '05'],
    [CEDULA_OK, 'CI'],
    ['AB1234567', 'PASAPORTE'],
    ['AB1234567', 'passport'],
    ['X-99887766', '08'],
    ['1760012340001', '04'],          // pública con 0001
  ])('válida: %s (%s)', (id, type) => {
    const r = retainedSubjectIdCheck(id, type);
    expect(r.problem).toBeNull();
    expect(r.code).toMatch(/^0[4-8]$/);
  });

  it('el código que va al XML es el del SRI, no el texto', () => {
    expect(retainedSubjectIdCheck('1791234567001', 'RUC').code).toBe('04');
    expect(retainedSubjectIdCheck('AB1234567', 'passport').code).toBe('06');
  });

  it('RUC de 14 dígitos (el caso de la factura 1860)', () => {
    const r = retainedSubjectIdCheck('17912345670011', '04');
    expect(r.problem).toContain('13 dígitos');
    expect(r.problem).toContain('proveedor');
  });

  it('cédula con verificador malo', () => {
    expect(retainedSubjectIdCheck('1712345676', '05').problem).toContain('dígito verificador');
  });

  it('cédula escrita con tipo RUC', () => {
    expect(retainedSubjectIdCheck(CEDULA_OK, '04').problem).toContain('13 dígitos');
  });

  it('pasaporte de más de 20 caracteres', () => {
    expect(retainedSubjectIdCheck('A'.repeat(21), '06').problem).toContain('20 caracteres');
  });

  it('sin identificación', () => {
    expect(retainedSubjectIdCheck('  ', '04').problem).toContain('Falta');
  });

  it('consumidor final no recibe retenciones', () => {
    expect(retainedSubjectIdCheck('9999999999999', '04').problem).toContain('consumidor final');
    expect(retainedSubjectIdCheck(CEDULA_OK, '07').problem).toContain('consumidor final');
  });

  it('tipo desconocido', () => {
    const r = retainedSubjectIdCheck(CEDULA_OK, 'NIT');
    expect(r.code).toBeNull();
    expect(r.problem).toContain('no se reconoce');
  });
});
