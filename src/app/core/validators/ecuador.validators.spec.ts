import { FormControl, FormGroup } from '@angular/forms';
import {
  buyerTaxIdProblem, ecuadorTaxIdValidator, inferBuyerTaxIdType, isValidCedula, isValidRuc,
  normalizeTaxIdType, retainedSubjectProblem, taxIdMaxLength, taxIdProblem,
} from './ecuador.validators';

// Mismos casos que functions/src/__tests__/ecuador-tax-id.test.ts y
// sri-id-type.test.ts: el front y el servidor aceptan lo mismo.
const CEDULA_OK = '1712345675';

describe('ecuador.validators (alineado con el servidor)', () => {
  it('cédula', () => {
    expect(isValidCedula(CEDULA_OK)).toBeTrue();
    expect(isValidCedula('0923456784')).toBeTrue();
    expect(isValidCedula('3012345678')).toBeTrue();   // provincia 30
    expect(isValidCedula('1712345676')).toBeFalse();  // verificador
    expect(isValidCedula('2512345678')).toBeFalse();  // provincia 25
    expect(isValidCedula('1772345675')).toBeFalse();  // tercer dígito 7
  });

  it('RUC', () => {
    expect(isValidRuc(`${CEDULA_OK}001`)).toBeTrue();
    expect(isValidRuc('1791234567001')).toBeTrue();   // sociedad sin módulo 11
    expect(isValidRuc('1760001234001')).toBeTrue();   // pública con 001
    expect(isValidRuc('1760012340001')).toBeTrue();   // pública con 0001
    expect(isValidRuc('9999999999999')).toBeTrue();
    expect(isValidRuc(`${CEDULA_OK}002`)).toBeFalse();
    expect(isValidRuc('17123456750011')).toBeFalse(); // 14 dígitos (factura 1860)
  });

  it('normalizeTaxIdType', () => {
    expect(normalizeTaxIdType('RUC')).toBe('04');
    expect(normalizeTaxIdType('cedula')).toBe('05');
    expect(normalizeTaxIdType('passport')).toBe('06');
    expect(normalizeTaxIdType('08')).toBe('08');
    expect(normalizeTaxIdType('', CEDULA_OK)).toBe('05');
    expect(normalizeTaxIdType('', '9999999999999')).toBe('07');
    expect(normalizeTaxIdType('NIT')).toBeNull();
    expect(inferBuyerTaxIdType(CEDULA_OK)).toBe('CI');
  });

  it('taxIdProblem: mensajes del servidor', () => {
    expect(taxIdProblem('17912345670011', 'RUC')).toContain('13 dígitos');
    expect(taxIdProblem(CEDULA_OK, 'RUC')).toContain('13 dígitos');
    expect(taxIdProblem('1712345676', 'CI')).toContain('dígito verificador');
    expect(taxIdProblem('A'.repeat(21), 'PASAPORTE')).toContain('20 caracteres');
    expect(taxIdProblem('A'.repeat(20), 'EXTERIOR')).toBeNull();
    expect(taxIdProblem('', 'RUC')).toBeNull();
    expect(buyerTaxIdProblem('', 'RUC')).toContain('Falta');
  });

  it('retainedSubjectProblem', () => {
    expect(retainedSubjectProblem('1791234567001', '04')).toBeNull();
    expect(retainedSubjectProblem('9999999999999', '04')).toContain('consumidor final');
    expect(retainedSubjectProblem(CEDULA_OK, '07')).toContain('consumidor final');
    expect(retainedSubjectProblem('17912345670011', '04')).toContain('13 dígitos');
  });

  it('taxIdMaxLength', () => {
    expect(taxIdMaxLength('CI')).toBe(10);
    expect(taxIdMaxLength('RUC')).toBe(13);
    expect(taxIdMaxLength('PASAPORTE')).toBe(20);
  });

  it('ecuadorTaxIdValidator lee el tipo del control hermano', () => {
    const form = new FormGroup({
      taxIdType: new FormControl('RUC'),
      taxId: new FormControl('', ecuadorTaxIdValidator('taxIdType')),
    });
    form.controls.taxId.setValue('17912345670011');
    expect(form.controls.taxId.errors?.['taxId']).toContain('13 dígitos');
    expect(form.controls.taxId.errors?.['invalidRuc']).toBeTrue();
    form.controls.taxIdType.setValue('PASAPORTE');
    form.controls.taxId.updateValueAndValidity();
    expect(form.controls.taxId.errors).toBeNull();
  });
});
