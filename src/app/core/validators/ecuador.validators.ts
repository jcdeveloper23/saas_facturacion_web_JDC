import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Ecuador tax ID validators — cédula and RUC.
 * Reference: SRI validation algorithms for Ecuador.
 *
 * Special case: "9999999999999" = Consumidor final (always valid).
 */

// ─── Cédula ──────────────────────────────────────────────────────────────────

/**
 * Validates a 10-digit Ecuador cédula using the official modulo-10 algorithm.
 */
export function isValidCedula(value: string): boolean {
  if (!value || value.length !== 10) return false;
  if (!/^\d{10}$/.test(value)) return false;

  const province = parseInt(value.substring(0, 2), 10);
  if (province < 1 || province > 24) return false;

  const thirdDigit = parseInt(value[2], 10);
  if (thirdDigit >= 6) return false; // natural person: 3rd digit 0-5

  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let product = parseInt(value[i], 10) * coefficients[i];
    if (product >= 10) product -= 9;
    sum += product;
  }
  const verifier = sum % 10 === 0 ? 0 : 10 - (sum % 10);
  return verifier === parseInt(value[9], 10);
}

// ─── RUC ────────────────────────────────────────────────────────────────────

/**
 * Validates a 13-digit Ecuador RUC.
 * Three types:
 *   Natural person: CI (10 digits) + "001"
 *   Private company: province(2) + "9" at pos 2 + 10 digits total + "001"
 *   Public entity:  province(2) + "6" at pos 2 + ... + "0001"
 */
export function isValidRuc(value: string): boolean {
  if (value === '9999999999999') return true; // Consumidor final
  if (!value || value.length !== 13) return false;
  if (!/^\d{13}$/.test(value)) return false;

  const thirdDigit = parseInt(value[2], 10);

  if (thirdDigit <= 5) {
    // Natural person: first 10 digits must be a valid cédula + last 3 = "001"
    return isValidCedula(value.substring(0, 10)) && value.substring(10) === '001';
  }

  if (thirdDigit === 9) {
    // Private company
    return validateRucPrivate(value);
  }

  if (thirdDigit === 6) {
    // Public entity
    return validateRucPublic(value);
  }

  return false;
}

function validateRucPrivate(ruc: string): boolean {
  const coefficients = [4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(ruc[i], 10) * coefficients[i];
  }
  const remainder = sum % 11;
  const verifier = remainder === 0 ? 0 : 11 - remainder;
  return verifier === parseInt(ruc[9], 10) && ruc.substring(10) === '001';
}

function validateRucPublic(ruc: string): boolean {
  const coefficients = [3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(ruc[i], 10) * coefficients[i];
  }
  const remainder = sum % 11;
  const verifier = remainder === 0 ? 0 : 11 - remainder;
  return verifier === parseInt(ruc[8], 10) && ruc.substring(9) === '0001';
}

// ─── Angular form validators ─────────────────────────────────────────────────

export function ecuadorTaxIdValidator(
  typeControlName = 'taxIdType'
): (control: AbstractControl) => ValidationErrors | null {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: string = (control.value ?? '').trim();
    if (!value) return null; // required handled separately

    const parent = control.parent;
    const type: string = parent?.get(typeControlName)?.value ?? 'RUC';

    if (type === 'PASAPORTE' || type === 'EXTERIOR') return null;

    if (type === 'CI') {
      return isValidCedula(value) ? null : { invalidCedula: true };
    }

    if (type === 'RUC') {
      return isValidRuc(value) ? null : { invalidRuc: true };
    }

    return null;
  };
}
