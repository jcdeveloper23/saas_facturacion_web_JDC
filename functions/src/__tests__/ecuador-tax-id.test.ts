import { buyerTaxIdProblem, isValidCedula, isValidRuc } from '../utils/ecuador-tax-id';

// Identificaciones ficticias: dígitos inventados con el verificador calculado.
const CEDULA_OK = '1712345675';
const CEDULA_GUAYAS = '0923456784';
const CEDULA_PROV30 = '3012345678';

describe('isValidCedula / isValidRuc (port de Conecta)', () => {
  it.each([
    [CEDULA_OK, true],
    [CEDULA_GUAYAS, true],
    [CEDULA_PROV30, true],          // provincia 30 se acepta (Conecta)
    ['1712345676', false],          // verificador
    ['2512345678', false],          // provincia 25
    ['1772345675', false],          // tercer dígito 7
  ])('cédula %s → %s', (v, ok) => expect(isValidCedula(v)).toBe(ok));

  it.each([
    [`${CEDULA_OK}001`, true],
    ['1791234567001', true],        // sociedad sin módulo 11 (S.A.S.)
    ['1760001234001', true],        // pública con 001
    ['1760012340001', true],        // pública con 0001
    ['9999999999999', true],
    [`${CEDULA_OK}002`, false],
    ['1712345676001', false],
    ['17123456750011', false],      // 14 dígitos
  ])('RUC %s → %s', (v, ok) => expect(isValidRuc(v)).toBe(ok));
});

describe('buyerTaxIdProblem', () => {
  it.each<[string, string, string | null]>([
    // Caso real de la factura 1860 de Weconnect Corp. (dígitos ficticios): 14 dígitos.
    ['17912345670011', 'RUC', 'El RUC debe tener 13 dígitos y terminar en 001 (tiene 14).'],
    ['1791234567001', 'RUC', null],
    ['1791234567001', '04', null],
    [`${CEDULA_OK}001`, 'RUC', null],
    ['1712345676001', 'RUC', 'El RUC no es válido (dígito verificador de la cédula).'],
    ['1791234567002', 'RUC', 'El RUC debe tener 13 dígitos y terminar en 001.'],
    ['179123456', 'RUC', 'El RUC debe tener 13 dígitos y terminar en 001 (tiene 9).'],
    ['1791234567-01', 'RUC', 'El RUC solo lleva números.'],
    ['1771234567001', 'RUC', 'El RUC no es válido (el tercer dígito debe ser 0-5, 6 o 9).'],
    ['9991234567001', 'RUC', 'El RUC no es válido (los dos primeros dígitos no son una provincia).'],
    [CEDULA_OK, 'CI', null],
    [CEDULA_OK, '05', null],
    [` ${CEDULA_OK} `, 'CI', null],
    ['171234567', 'CI', 'La cédula debe tener 10 dígitos (tiene 9).'],
    [`${CEDULA_OK}001`, 'CI', 'La cédula debe tener 10 dígitos (tiene 13).'],
    ['1712345676', 'CI', 'La cédula no es válida (dígito verificador).'],
    ['2512345678', 'CI', 'La cédula no es válida (los dos primeros dígitos no son una provincia).'],
    ['1772345675', 'CI', 'La cédula no es válida (el tercer dígito debe ser de 0 a 6).'],
    ['AB123456', 'PASAPORTE', null],
    ['X-998877', 'EXTERIOR', null],
    ['123456789012345678901', 'PASAPORTE', 'La identificación no puede tener más de 20 caracteres (tiene 21).'],
    ['9999999999999', 'CONSUMIDOR_FINAL', null],
    ['9999999999999', 'RUC', null],
    ['9999999999', 'CONSUMIDOR_FINAL', 'El consumidor final se identifica con 9999999999999.'],
    ['', 'RUC', 'Falta la identificación del comprador.'],
    ['   ', 'CI', 'Falta la identificación del comprador.'],
    // Tipo desconocido viaja como RUC en el XML y se valida como RUC.
    ['17912345670011', 'OTRO', 'El RUC debe tener 13 dígitos y terminar en 001 (tiene 14).'],
  ])('%s (%s)', (id, type, expected) => {
    expect(buyerTaxIdProblem(id, type)).toBe(expected);
  });
});
