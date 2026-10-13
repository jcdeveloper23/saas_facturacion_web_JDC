import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Cédula y RUC del Ecuador — validador ÚNICO del front de FacturaEc.
 *
 * Cambio del 2026-10-13: se alineó con el del servidor
 * (`functions/src/utils/ecuador-tax-id.ts`, que es un port de Conecta,
 * `App_Web_Conectate/lib/features/accounting/customers/ecuador_tax_id.dart`).
 * Antes este archivo era más estricto que el servidor y rechazaba
 * identificaciones reales; ahora acepta EXACTAMENTE lo mismo:
 *
 *   · Provincia 30 (registrados en el exterior): se acepta (antes, no).
 *   · Tercer dígito 6: se acepta en cédulas (antes, no), y en RUC con '0001'
 *     o '001' (antes solo '0001' y con módulo 11).
 *   · Sociedades (tercer dígito 9): solo la forma (antes, módulo 11). El SRI
 *     emite RUC de S.A.S. que no cumplen el módulo 11.
 *   · Entidades públicas (tercer dígito 6): solo la forma.
 *   · Personas naturales: se sigue exigiendo el dígito verificador.
 *   · Pasaporte e identificación del exterior: hasta 20 caracteres.
 *   · 9999999999999: consumidor final.
 *
 * Si cambia la regla, cambiar los TRES: este archivo, ecuador-tax-id.ts y el
 * de Conecta. Los mensajes son los mismos que devuelve el servidor.
 */

export const CONSUMIDOR_FINAL_TAX_ID = '9999999999999';

/** Longitud máxima de la identificación en el XSD del SRI. */
export const MAX_TAX_ID_LENGTH = 20;

export type SriIdCode = '04' | '05' | '06' | '07' | '08';

// ─── Tipo de identificación ────────────────────────────────────────────────

const ALIASES: Record<string, SriIdCode> = {
  '04': '04', '4': '04', 'RUC': '04',
  '05': '05', '5': '05', 'CI': '05', 'CEDULA': '05', 'CÉDULA': '05',
  '06': '06', '6': '06', 'PASAPORTE': '06', 'PASSPORT': '06',
  '07': '07', '7': '07', 'CONSUMIDOR_FINAL': '07', 'CONSUMIDOR FINAL': '07', 'CF': '07',
  '08': '08', '8': '08', 'EXTERIOR': '08', 'IDENTIFICACION_EXTERIOR': '08', 'FOREIGN': '08',
};

/**
 * Código de la Tabla 6 del SRI a partir de cualquiera de las formas en que se
 * guarda el tipo ('RUC', 'CI', 'PASAPORTE', 'EXTERIOR', 'ruc', 'passport',
 * '04'…'08'). Vacío: se deduce de la identificación (9999999999999 → 07,
 * 10 dígitos → 05, si no 04). Texto desconocido → null.
 * Igual que `normalizeSriIdType` de functions/src/utils/sri-id-type.ts.
 */
export function normalizeTaxIdType(rawType: string | null | undefined, taxId?: string | null): SriIdCode | null {
  const t = (rawType ?? '').trim().toUpperCase();
  if (t) return ALIASES[t] ?? null;
  const v = (taxId ?? '').trim();
  if (v === CONSUMIDOR_FINAL_TAX_ID) return '07';
  if (/^\d{10}$/.test(v)) return '05';
  return '04';
}

/**
 * Texto de tipo para guardar cuando vino vacío (POS con el cliente por defecto
 * del terminal): el que entiende el generador del XML. Como
 * `inferBuyerTaxIdType` de functions/src/utils/sri-id-type.ts.
 */
export function inferBuyerTaxIdType(taxId: string | null | undefined): 'RUC' | 'CI' | 'CONSUMIDOR_FINAL' {
  const code = normalizeTaxIdType('', taxId);
  if (code === '07') return 'CONSUMIDOR_FINAL';
  if (code === '05') return 'CI';
  return 'RUC';
}

/** maxlength del campo según el tipo: cédula 10, RUC 13, el resto 20. */
export function taxIdMaxLength(rawType: string | null | undefined): number {
  const code = normalizeTaxIdType(rawType || 'RUC');
  if (code === '05') return 10;
  if (code === '04' || code === '07') return 13;
  return MAX_TAX_ID_LENGTH;
}

// ─── Cédula y RUC ──────────────────────────────────────────────────────────

/** Provincias 01–24, más la 30 de los registrados en el exterior. */
function validProvince(value: string): boolean {
  const p = parseInt(value.substring(0, 2), 10);
  return (p >= 1 && p <= 24) || p === 30;
}

/** Cédula de 10 dígitos, módulo 10 del Registro Civil (tercer dígito 0–6). */
export function isValidCedula(value: string): boolean {
  if (!value || value.length !== 10) return false;
  if (!/^\d{10}$/.test(value)) return false;
  if (!validProvince(value)) return false;
  if (parseInt(value[2], 10) > 6) return false;

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

/** RUC de 13 dígitos: persona natural, sociedad privada o entidad pública. */
export function isValidRuc(value: string): boolean {
  if (value === CONSUMIDOR_FINAL_TAX_ID) return true;
  if (!value || value.length !== 13) return false;
  if (!/^\d{13}$/.test(value)) return false;
  if (!validProvince(value)) return false;

  const third = parseInt(value[2], 10);
  if (third <= 5) return isValidCedula(value.substring(0, 10)) && value.substring(10) === '001';
  if (third === 9) return value.substring(10) === '001';
  if (third === 6) return value.substring(9) === '0001' || value.substring(10) === '001';
  return false;
}

// ─── Qué está mal ──────────────────────────────────────────────────────────

/**
 * Qué le pasa a una identificación de comprador o proveedor, o null si está
 * bien. Mismos mensajes que `buyerTaxIdProblem` del servidor. Vacío → null
 * (el «requerido» va aparte, con Validators.required).
 */
export function taxIdProblem(taxIdRaw: string | null | undefined, rawType: string | null | undefined): string | null {
  const value = (taxIdRaw ?? '').trim();
  if (!value) return null;
  if (value === CONSUMIDOR_FINAL_TAX_ID) return null;

  const code = normalizeTaxIdType(rawType, value);
  if (code === null) return `El tipo de identificación «${rawType}» no se reconoce.`;

  if (code === '07') return `El consumidor final se identifica con ${CONSUMIDOR_FINAL_TAX_ID}.`;

  if (code === '06' || code === '08') {
    return value.length > MAX_TAX_ID_LENGTH
      ? `La identificación no puede tener más de ${MAX_TAX_ID_LENGTH} caracteres (tiene ${value.length}).`
      : null;
  }

  if (code === '05') {
    if (!/^\d+$/.test(value)) return 'La cédula solo lleva números.';
    if (value.length !== 10) return `La cédula debe tener 10 dígitos (tiene ${value.length}).`;
    if (!validProvince(value)) return 'La cédula no es válida (los dos primeros dígitos no son una provincia).';
    if (parseInt(value[2], 10) > 6) return 'La cédula no es válida (el tercer dígito debe ser de 0 a 6).';
    return isValidCedula(value) ? null : 'La cédula no es válida (dígito verificador).';
  }

  // RUC
  if (!/^\d+$/.test(value)) return 'El RUC solo lleva números.';
  if (value.length !== 13) return `El RUC debe tener 13 dígitos y terminar en 001 (tiene ${value.length}).`;
  if (!validProvince(value)) return 'El RUC no es válido (los dos primeros dígitos no son una provincia).';
  const third = parseInt(value[2], 10);
  if (third <= 5) {
    if (value.substring(10) !== '001') return 'El RUC debe tener 13 dígitos y terminar en 001.';
    return isValidCedula(value.substring(0, 10)) ? null : 'El RUC no es válido (dígito verificador de la cédula).';
  }
  if (third === 9) return value.substring(10) === '001' ? null : 'El RUC debe tener 13 dígitos y terminar en 001.';
  if (third === 6) return isValidRuc(value) ? null : 'El RUC de una entidad pública debe terminar en 0001 o 001.';
  return 'El RUC no es válido (el tercer dígito debe ser 0-5, 6 o 9).';
}

/**
 * Comprador de una factura (o del POS) ANTES de emitir: además de lo de
 * `taxIdProblem`, el vacío es un problema (no se convierte en consumidor final).
 */
export function buyerTaxIdProblem(taxId: string | null | undefined, rawType: string | null | undefined): string | null {
  if (!(taxId ?? '').trim()) return 'Falta la identificación del comprador.';
  return taxIdProblem(taxId, rawType);
}

/**
 * Proveedor al que se le retiene. Como `retainedSubjectIdCheck` del servidor:
 * no hay retención a consumidor final.
 */
export function retainedSubjectProblem(taxId: string | null | undefined, rawType: string | null | undefined): string | null {
  const value = (taxId ?? '').trim();
  if (!value) return 'Falta la identificación del proveedor (sujeto retenido).';
  const code = normalizeTaxIdType(rawType, value);
  if (code === null) {
    return `El tipo de identificación del proveedor («${rawType}») no se reconoce: use RUC, cédula, pasaporte o identificación del exterior.`;
  }
  if (code === '07' || value === CONSUMIDOR_FINAL_TAX_ID) {
    return 'Una retención no se emite a consumidor final: el proveedor necesita su RUC, cédula o pasaporte.';
  }
  return taxIdProblem(value, code);
}

// ─── Validator de Angular ──────────────────────────────────────────────────

/**
 * Validator del FormControl de la identificación. Lee el tipo del control
 * hermano `typeControlName` (re-validar al cambiar el tipo).
 *
 * Error: `{ taxId: '<mensaje>' }`, más la clave vieja (`invalidCedula`,
 * `invalidRuc` o `invalidId`) para las plantillas que aún la miran.
 */
export function ecuadorTaxIdValidator(typeControlName = 'taxIdType'): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: string = (control.value ?? '').trim();
    if (!value) return null; // required handled separately

    const type: string = control.parent?.get(typeControlName)?.value ?? 'RUC';
    const problem = taxIdProblem(value, type);
    if (!problem) return null;

    const code = normalizeTaxIdType(type, value);
    const legacyKey = code === '05' ? 'invalidCedula' : code === '04' ? 'invalidRuc' : 'invalidId';
    return { taxId: problem, [legacyKey]: true };
  };
}
