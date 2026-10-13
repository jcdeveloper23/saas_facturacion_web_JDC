/**
 * ecuador-tax-id.ts
 *
 * Cédula y RUC del Ecuador, validados en el servidor antes de emitir.
 *
 * Es un port SIN CAMBIOS de la lógica de Conecta
 * (`App_Web_Conectate/lib/features/accounting/customers/ecuador_tax_id.dart`),
 * que desde el 2026-09-28 es más permisiva a propósito que la del front de
 * FacturaEc (`src/app/core/validators/ecuador.validators.ts`). Donde difieren,
 * manda la de Conecta (decisión del 2026-09-28):
 *
 *   · Sociedades (tercer dígito 9): solo la forma. El SRI emite RUC de S.A.S.
 *     que no cumplen el módulo 11; el front de FacturaEc los rechaza.
 *   · Provincia 30 (registrados en el exterior): se acepta.
 *   · Tercer dígito 6: se acepta en cédulas, y en RUC con '0001' o '001'.
 *
 * A las personas naturales se les sigue exigiendo el dígito verificador.
 *
 * Por qué existe (2026-10-13): la factura 1860 de Weconnect Corp. salió con un
 * «RUC» de 14 dígitos y el SRI la dejó NO AUTORIZADA (identificador 69, «ERROR
 * EN LA IDENTIFICACION DEL RECEPTOR»). Una clave rechazada no se reenvía: se
 * pierde el número. Mejor frenarlo antes de numerar.
 */

import { mapTipoIdentificacion, TIPO_IDENTIFICACION_COMPRADOR, CONSUMIDOR_FINAL_TAX_ID } from './sri-buyer-id';

/** Longitud máxima de `identificacionComprador` en el XSD de la factura. */
export const MAX_BUYER_ID_LENGTH = 20;

/** Provincias 01–24, más la 30 de los registrados en el exterior. */
function provinciaValida(value: string): boolean {
  const provincia = parseInt(value.substring(0, 2), 10);
  return (provincia >= 1 && provincia <= 24) || provincia === 30;
}

/** Cédula de 10 dígitos, módulo 10 del Registro Civil. */
export function isValidCedula(value: string): boolean {
  if (value.length !== 10) return false;
  if (!/^\d{10}$/.test(value)) return false;
  if (!provinciaValida(value)) return false;

  // 0-5 es persona natural; el 6 aparece en cédulas reales. Del 7 en adelante no.
  const tercero = parseInt(value[2], 10);
  if (tercero > 6) return false;

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let producto = parseInt(value[i], 10) * coeficientes[i];
    if (producto >= 10) producto -= 9;
    suma += producto;
  }
  const verificador = suma % 10 === 0 ? 0 : 10 - (suma % 10);
  return verificador === parseInt(value[9], 10);
}

/** RUC de 13 dígitos: persona natural, sociedad privada o entidad pública. */
export function isValidRuc(value: string): boolean {
  if (value === CONSUMIDOR_FINAL_TAX_ID) return true;
  if (value.length !== 13) return false;
  if (!/^\d{13}$/.test(value)) return false;

  if (!provinciaValida(value)) return false;
  const tercero = parseInt(value[2], 10);

  // Persona natural: su cédula, con dígito verificador, más '001'.
  if (tercero <= 5) {
    return isValidCedula(value.substring(0, 10)) && value.substring(10) === '001';
  }
  // Sociedad: solo la forma.
  if (tercero === 9) return value.substring(10) === '001';
  // Entidad pública: '0001' clásico, o '001'.
  if (tercero === 6) {
    return value.substring(9) === '0001' || value.substring(10) === '001';
  }
  return false;
}

/**
 * Qué le pasa a la identificación del comprador, o null si está bien.
 *
 * `taxIdType` admite el texto de Conecta/FacturaEc (RUC, CI, PASAPORTE,
 * CONSUMIDOR_FINAL, EXTERIOR) o el código del SRI (04–08); se resuelve con
 * `mapTipoIdentificacion`, la misma función que decide el tipo en el XML, así
 * que se valida exactamente lo que se va a enviar (un tipo desconocido viaja
 * como RUC y se valida como RUC).
 */
export function buyerTaxIdProblem(taxIdRaw: string | undefined | null, taxIdType: string | undefined | null): string | null {
  const valor = (taxIdRaw ?? '').trim();
  if (!valor) return 'Falta la identificación del comprador.';

  // El 9999999999999 es consumidor final con cualquier tipo (sri-buyer-id).
  if (valor === CONSUMIDOR_FINAL_TAX_ID) return null;

  const code = mapTipoIdentificacion(taxIdType ?? undefined);

  if (code === TIPO_IDENTIFICACION_COMPRADOR.CONSUMIDOR_FINAL) {
    return `El consumidor final se identifica con ${CONSUMIDOR_FINAL_TAX_ID}.`;
  }

  if (code === TIPO_IDENTIFICACION_COMPRADOR.PASAPORTE || code === TIPO_IDENTIFICACION_COMPRADOR.IDENTIFICACION_EXTERIOR) {
    if (valor.length > MAX_BUYER_ID_LENGTH) {
      return `La identificación no puede tener más de ${MAX_BUYER_ID_LENGTH} caracteres (tiene ${valor.length}).`;
    }
    return null;
  }

  if (code === TIPO_IDENTIFICACION_COMPRADOR.CEDULA) {
    if (!/^\d+$/.test(valor)) return 'La cédula solo lleva números.';
    if (valor.length !== 10) return `La cédula debe tener 10 dígitos (tiene ${valor.length}).`;
    if (!provinciaValida(valor)) return 'La cédula no es válida (los dos primeros dígitos no son una provincia).';
    if (parseInt(valor[2], 10) > 6) return 'La cédula no es válida (el tercer dígito debe ser de 0 a 6).';
    return isValidCedula(valor) ? null : 'La cédula no es válida (dígito verificador).';
  }

  // RUC
  if (!/^\d+$/.test(valor)) return 'El RUC solo lleva números.';
  if (valor.length !== 13) return `El RUC debe tener 13 dígitos y terminar en 001 (tiene ${valor.length}).`;
  if (!provinciaValida(valor)) return 'El RUC no es válido (los dos primeros dígitos no son una provincia).';
  const tercero = parseInt(valor[2], 10);
  if (tercero <= 5) {
    if (valor.substring(10) !== '001') return 'El RUC debe tener 13 dígitos y terminar en 001.';
    return isValidCedula(valor.substring(0, 10)) ? null : 'El RUC no es válido (dígito verificador de la cédula).';
  }
  if (tercero === 9) {
    return valor.substring(10) === '001' ? null : 'El RUC debe tener 13 dígitos y terminar en 001.';
  }
  if (tercero === 6) {
    return isValidRuc(valor) ? null : 'El RUC de una entidad pública debe terminar en 0001 o 001.';
  }
  return 'El RUC no es válido (el tercer dígito debe ser 0-5, 6 o 9).';
}
