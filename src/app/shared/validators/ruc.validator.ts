import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Ecuador RUC validator.
 * Validates the 13-digit RUC for natural persons (digit 3 = 0–5),
 * juridical persons (digit 3 = 9), and public entities (digit 3 = 6).
 */
export function ecuadorRucValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value as string)?.trim();
    if (!value) return null;

    if (!/^\d{13}$/.test(value)) {
      return { rucInvalid: 'El RUC debe tener exactamente 13 dígitos' };
    }

    const province = parseInt(value.substring(0, 2), 10);
    if (province < 1 || province > 24) {
      return { rucInvalid: 'Código de provincia inválido (01–24)' };
    }

    const establishment = parseInt(value.substring(10), 10);
    if (establishment < 1) {
      return { rucInvalid: 'El código de establecimiento debe ser >= 001' };
    }

    const thirdDigit = parseInt(value[2], 10);

    if (thirdDigit >= 0 && thirdDigit <= 5) {
      // Natural person — same algorithm as Cédula
      const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
      let sum = 0;
      for (let i = 0; i < 9; i++) {
        let product = parseInt(value[i], 10) * coefficients[i];
        if (product > 9) product -= 9;
        sum += product;
      }
      const verifier = sum % 10 === 0 ? 0 : 10 - (sum % 10);
      if (verifier !== parseInt(value[9], 10)) {
        return { rucInvalid: 'RUC inválido (dígito verificador incorrecto)' };
      }
      return null;
    }

    if (thirdDigit === 9) {
      // Juridical person
      const coefficients = [4, 3, 2, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < 9; i++) {
        sum += parseInt(value[i], 10) * coefficients[i];
      }
      const remainder = sum % 11;
      const verifier = remainder === 0 ? 0 : 11 - remainder;
      if (verifier !== parseInt(value[9], 10)) {
        return { rucInvalid: 'RUC inválido (dígito verificador incorrecto)' };
      }
      return null;
    }

    if (thirdDigit === 6) {
      // Public entity
      const coefficients = [3, 2, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < 8; i++) {
        sum += parseInt(value[i], 10) * coefficients[i];
      }
      const remainder = sum % 11;
      const verifier = remainder === 0 ? 0 : 11 - remainder;
      if (verifier !== parseInt(value[8], 10)) {
        return { rucInvalid: 'RUC inválido (dígito verificador incorrecto)' };
      }
      return null;
    }

    return { rucInvalid: 'Tercer dígito del RUC inválido' };
  };
}
