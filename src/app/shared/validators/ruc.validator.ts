import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Returns an error string if the cédula is invalid, null if valid. */
export function validateCedula(value: string): string | null {
  if (!/^\d{10}$/.test(value)) return 'La cédula debe tener exactamente 10 dígitos';

  const province = parseInt(value.substring(0, 2), 10);
  if (province < 1 || province > 24) return 'Código de provincia inválido (01–24)';

  const thirdDigit = parseInt(value[2], 10);
  if (thirdDigit > 5) return 'Tercer dígito de cédula inválido (debe ser 0–5)';

  // Módulo 10
  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let product = parseInt(value[i], 10) * coefficients[i];
    if (product > 9) product -= 9;
    sum += product;
  }
  const verifier = sum % 10 === 0 ? 0 : 10 - (sum % 10);
  if (verifier !== parseInt(value[9], 10)) return 'Cédula inválida (dígito verificador incorrecto)';
  return null;
}

/** Returns an error string if the RUC is invalid, null if valid. */
export function validateRuc(value: string): string | null {
  if (!/^\d{13}$/.test(value)) return 'El RUC debe tener exactamente 13 dígitos';

  const province = parseInt(value.substring(0, 2), 10);
  if (province < 1 || province > 24) return 'Código de provincia inválido (01–24)';

  const establishment = parseInt(value.substring(10), 10);
  if (establishment < 1) return 'El código de establecimiento debe ser >= 001';

  const thirdDigit = parseInt(value[2], 10);

  if (thirdDigit >= 0 && thirdDigit <= 5) {
    // Persona natural — mismo algoritmo que cédula (primeros 9 dígitos, verifier en pos 9)
    const cedulaError = validateCedula(value.substring(0, 10));
    return cedulaError;
  }

  if (thirdDigit === 9) {
    // Persona jurídica
    const coefficients = [4, 3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(value[i], 10) * coefficients[i];
    const remainder = sum % 11;
    const verifier = remainder === 0 ? 0 : 11 - remainder;
    if (verifier !== parseInt(value[9], 10)) return 'RUC inválido (dígito verificador incorrecto)';
    return null;
  }

  if (thirdDigit === 6) {
    // Entidad pública
    const coefficients = [3, 2, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += parseInt(value[i], 10) * coefficients[i];
    const remainder = sum % 11;
    const verifier = remainder === 0 ? 0 : 11 - remainder;
    if (verifier !== parseInt(value[8], 10)) return 'RUC inválido (dígito verificador incorrecto)';
    return null;
  }

  return 'Tercer dígito del RUC inválido';
}

// ─── Validators ────────────────────────────────────────────────────────────────

/**
 * Ecuador RUC validator (13 dígitos).
 * Soporta persona natural (dígito 3 = 0–5), jurídica (= 9) y entidad pública (= 6).
 */
export function ecuadorRucValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value as string)?.trim();
    if (!value) return null;
    const error = validateRuc(value);
    return error ? { rucInvalid: error } : null;
  };
}

/**
 * Ecuador cédula validator (10 dígitos).
 * Solo para personas naturales que facturan con cédula.
 */
export function ecuadorCedulaValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value as string)?.trim();
    if (!value) return null;
    const error = validateCedula(value);
    return error ? { rucInvalid: error } : null;  // rucInvalid para reutilizar getError() existente
  };
}

/**
 * Validador dinámico: acepta RUC o cédula según el tipo indicado.
 * Usa el valor del control hermano `taxIdType` del mismo FormGroup.
 */
export function ecuadorTaxIdValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value as string)?.trim();
    if (!value) return null;
    const type = control.parent?.get('taxIdType')?.value as 'ruc' | 'cedula' | undefined;
    const error = type === 'cedula' ? validateCedula(value) : validateRuc(value);
    return error ? { rucInvalid: error } : null;
  };
}
