/**
 * sri-access-key.test.ts — generateAccessKey / validateAccessKey / calculateModulo11
 */

import { generateAccessKey, validateAccessKey, calculateModulo11, assertValidAccessKey, AccessKeyParts } from '../utils/sri-access-key';

const VALID_PARTS: AccessKeyParts = {
  fechaEmision:    '10042026',
  tipoComprobante: '01',
  ruc:             '1792146739001',
  ambiente:        '1',
  establecimiento: '001',
  puntoEmision:    '001',
  secuencial:      '000000042',
  codigoNumerico:  '87654321',
  tipoEmision:     '1',
};

describe('generateAccessKey', () => {
  test('produce una clave de 49 dígitos', () => {
    const key = generateAccessKey(VALID_PARTS);
    expect(key).toHaveLength(49);
    expect(/^\d{49}$/.test(key)).toBe(true);
  });

  test('el dígito verificador coincide con calculateModulo11 de los primeros 48', () => {
    const key = generateAccessKey(VALID_PARTS);
    const clave48 = key.slice(0, 48);
    expect(key.slice(48)).toBe(String(calculateModulo11(clave48)));
  });

  test('lanza si alguna parte produce una clave de longitud != 48', () => {
    expect(() => generateAccessKey({ ...VALID_PARTS, ruc: '123' })).toThrow(/longitud/i);
  });
});

describe('validateAccessKey — caso válido', () => {
  test('una clave generada por generateAccessKey es válida', () => {
    const key = generateAccessKey(VALID_PARTS);
    const result = validateAccessKey(key);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('assertValidAccessKey no lanza para una clave válida', () => {
    const key = generateAccessKey(VALID_PARTS);
    expect(() => assertValidAccessKey(key)).not.toThrow();
  });
});

describe('validateAccessKey — casos inválidos (caso 6 del pedido: dígito modificado)', () => {
  test('longitud incorrecta', () => {
    const result = validateAccessKey('123');
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_LENGTH');
  });

  test('caracteres no numéricos', () => {
    const key = generateAccessKey(VALID_PARTS);
    const tampered = key.slice(0, 10) + 'A' + key.slice(11);
    const result = validateAccessKey(tampered);
    expect(result.valid).toBe(false);
  });

  test('último dígito (verificador) modificado → INVALID_CHECK_DIGIT', () => {
    const key = generateAccessKey(VALID_PARTS);
    const lastDigit = key[48];
    const wrongDigit = String((parseInt(lastDigit, 10) + 1) % 10);
    const tampered = key.slice(0, 48) + wrongDigit;
    const result = validateAccessKey(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_CHECK_DIGIT')).toBe(true);
  });

  test('mes inválido (13) en la fecha', () => {
    const key = generateAccessKey({ ...VALID_PARTS, fechaEmision: '10132026' });
    const result = validateAccessKey(key);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_DATE')).toBe(true);
  });

  test('día inválido (32) en la fecha', () => {
    const key = generateAccessKey({ ...VALID_PARTS, fechaEmision: '32012026' });
    const result = validateAccessKey(key);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_DATE')).toBe(true);
  });

  test('tipo de comprobante desconocido', () => {
    const key = generateAccessKey({ ...VALID_PARTS, tipoComprobante: '99' });
    const result = validateAccessKey(key);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_DOC_TYPE')).toBe(true);
  });

  test('ambiente inválido (solo 1 o 2 son válidos)', () => {
    const key = generateAccessKey({ ...VALID_PARTS, ambiente: '9' });
    const result = validateAccessKey(key);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_ENVIRONMENT')).toBe(true);
  });

  test('establecimiento en 000', () => {
    const key = generateAccessKey({ ...VALID_PARTS, establecimiento: '000' });
    const result = validateAccessKey(key);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_ESTABLISHMENT')).toBe(true);
  });

  test('secuencial en 000000000', () => {
    const key = generateAccessKey({ ...VALID_PARTS, secuencial: '000000000' });
    const result = validateAccessKey(key);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_SEQUENCE')).toBe(true);
  });

  test('tipo de emisión inválido', () => {
    const key = generateAccessKey({ ...VALID_PARTS, tipoEmision: '5' });
    const result = validateAccessKey(key);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_EMISSION_TYPE')).toBe(true);
  });

  test('assertValidAccessKey lanza para una clave inválida', () => {
    expect(() => assertValidAccessKey('123')).toThrow(/inválida/i);
  });
});
