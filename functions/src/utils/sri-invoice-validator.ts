/**
 * sri-invoice-validator.ts
 *
 * Capa de validación tributaria/estructural independiente de la generación
 * del XML. Se ejecuta ANTES de firmar — nunca debe firmarse/enviarse un
 * comprobante que falle aquí. Devuelve errores estructurados en vez de
 * lanzar excepciones, para que el llamador decida cómo mostrarlos.
 */

import { validateAccessKey } from './sri-access-key';
import { CONSUMIDOR_FINAL_TAX_ID, TIPO_IDENTIFICACION_COMPRADOR } from './sri-buyer-id';

export interface ValidationError {
  code:    string;
  field:   string;
  message: string;
}

export interface ValidationResult {
  valid:  boolean;
  errors: ValidationError[];
}

/** Tolerancia por redondeo de centavos al comparar sumas monetarias. */
const CENTS_TOLERANCE = 0.01;

function closeEnough(a: number, b: number, tolerance = CENTS_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

// ─── 1. Identificación del comprador ───────────────────────────────────────────

/**
 * Verifica que tipoIdentificacionComprador sea consistente con la
 * identificación real. Regla SRI: identificacionComprador = '9999999999999'
 * SIEMPRE debe ir con tipoIdentificacionComprador = '07' (Consumidor Final).
 * Ver también resolveTipoIdentificacionComprador() en sri-buyer-id.ts, que
 * auto-corrige esto al generar el XML — esta función existe para poder
 * VALIDAR explícitamente (p.ej. datos que ya vienen con el código resuelto
 * desde otro sistema, sin pasar por el resolver).
 */
export function validateBuyerIdentification(
  customerTaxId: string | undefined,
  tipoIdentificacionComprador: string | undefined,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!customerTaxId) {
    errors.push({ code: 'MISSING_BUYER_IDENTIFICATION', field: 'identificacionComprador', message: 'Falta la identificación del comprador.' });
    return errors;
  }
  if (!tipoIdentificacionComprador) {
    errors.push({ code: 'MISSING_BUYER_IDENTIFICATION_TYPE', field: 'tipoIdentificacionComprador', message: 'Falta el tipo de identificación del comprador.' });
    return errors;
  }

  const isConsumidorFinalId = customerTaxId.trim() === CONSUMIDOR_FINAL_TAX_ID;
  const isTypeConsumidorFinal = tipoIdentificacionComprador === TIPO_IDENTIFICACION_COMPRADOR.CONSUMIDOR_FINAL;

  if (isConsumidorFinalId && !isTypeConsumidorFinal) {
    errors.push({
      code:    'INVALID_BUYER_IDENTIFICATION_TYPE',
      field:   'tipoIdentificacionComprador',
      message: `Consumidor final (identificación ${CONSUMIDOR_FINAL_TAX_ID}) debe utilizar código 07, se recibió ${tipoIdentificacionComprador}.`,
    });
  }
  if (!isConsumidorFinalId && isTypeConsumidorFinal) {
    errors.push({
      code:    'INVALID_BUYER_IDENTIFICATION_TYPE',
      field:   'tipoIdentificacionComprador',
      message: `Código 07 (Consumidor Final) solo es válido con identificación ${CONSUMIDOR_FINAL_TAX_ID}, se recibió ${customerTaxId}.`,
    });
  }

  const validCodes: string[] = Object.values(TIPO_IDENTIFICACION_COMPRADOR);
  if (!validCodes.includes(tipoIdentificacionComprador)) {
    errors.push({
      code:    'UNKNOWN_BUYER_IDENTIFICATION_TYPE',
      field:   'tipoIdentificacionComprador',
      message: `Código de tipo de identificación desconocido: ${tipoIdentificacionComprador}.`,
    });
  }

  // RUC: 13 dígitos. Cédula: 10 dígitos. Consumidor Final: exactamente el placeholder fijo.
  if (tipoIdentificacionComprador === TIPO_IDENTIFICACION_COMPRADOR.RUC && !/^\d{13}$/.test(customerTaxId)) {
    errors.push({ code: 'INVALID_RUC_LENGTH', field: 'identificacionComprador', message: `RUC de comprador debe tener 13 dígitos: ${customerTaxId}` });
  }
  if (tipoIdentificacionComprador === TIPO_IDENTIFICACION_COMPRADOR.CEDULA && !/^\d{10}$/.test(customerTaxId)) {
    errors.push({ code: 'INVALID_CEDULA_LENGTH', field: 'identificacionComprador', message: `Cédula de comprador debe tener 10 dígitos: ${customerTaxId}` });
  }

  return errors;
}

// ─── 2. Totales de la factura ───────────────────────────────────────────────────

export interface TotalsInput {
  lines: Array<{ baseImponible: number; valorImpuesto: number; precioTotalSinImpuesto: number }>;
  totalSinImpuestos: number;
  totalImpuestoValor: number; // suma de <valor> en totalConImpuestos
  totalDescuento:     number;
  importeTotal:        number;
}

/**
 * Verifica la aritmética tributaria: la suma de bases/impuestos de las líneas
 * debe cuadrar con los totales de cabecera, y totalSinImpuestos + impuestos
 * (- descuento ya aplicado en la base) debe cuadrar con importeTotal.
 * NO recalcula IVA con tarifas — eso lo hace el catálogo tributario en la
 * capa de negocio; esto solo verifica que los números que van al XML sean
 * internamente consistentes entre sí.
 */
export function validateTotals(input: TotalsInput): ValidationError[] {
  const errors: ValidationError[] = [];

  const sumLineBase = input.lines.reduce((s, l) => s + l.baseImponible, 0);
  const sumLineTax   = input.lines.reduce((s, l) => s + l.valorImpuesto, 0);
  const sumLineTotal = input.lines.reduce((s, l) => s + l.precioTotalSinImpuesto, 0);

  if (!closeEnough(sumLineBase, input.totalSinImpuestos)) {
    errors.push({
      code: 'TOTALS_MISMATCH_BASE', field: 'totalSinImpuestos',
      message: `Suma de bases imponibles de línea (${sumLineBase.toFixed(2)}) no coincide con totalSinImpuestos (${input.totalSinImpuestos.toFixed(2)}).`,
    });
  }
  if (!closeEnough(sumLineTax, input.totalImpuestoValor)) {
    errors.push({
      code: 'TOTALS_MISMATCH_TAX', field: 'totalConImpuestos',
      message: `Suma de IVA de línea (${sumLineTax.toFixed(2)}) no coincide con el total de impuestos declarado (${input.totalImpuestoValor.toFixed(2)}).`,
    });
  }
  if (!closeEnough(sumLineTotal, input.totalSinImpuestos)) {
    errors.push({
      code: 'TOTALS_MISMATCH_LINE_TOTAL', field: 'precioTotalSinImpuesto',
      message: `Suma de precioTotalSinImpuesto de línea (${sumLineTotal.toFixed(2)}) no coincide con totalSinImpuestos (${input.totalSinImpuestos.toFixed(2)}).`,
    });
  }

  const expectedTotal = input.totalSinImpuestos + input.totalImpuestoValor;
  if (!closeEnough(expectedTotal, input.importeTotal)) {
    errors.push({
      code: 'TOTALS_MISMATCH_IMPORTE_TOTAL', field: 'importeTotal',
      message: `totalSinImpuestos + impuestos (${expectedTotal.toFixed(2)}) no coincide con importeTotal (${input.importeTotal.toFixed(2)}).`,
    });
  }

  if (input.lines.length === 0) {
    errors.push({ code: 'NO_LINES', field: 'detalles', message: 'La factura no tiene líneas de detalle.' });
  }
  for (const [i, l] of input.lines.entries()) {
    if (!Number.isFinite(l.baseImponible) || !Number.isFinite(l.valorImpuesto) || !Number.isFinite(l.precioTotalSinImpuesto)) {
      errors.push({ code: 'NON_FINITE_LINE_AMOUNT', field: `detalles[${i}]`, message: `Línea ${i} tiene un monto no finito (NaN/Infinity).` });
    }
    if (l.baseImponible < 0 || l.valorImpuesto < 0 || l.precioTotalSinImpuesto < 0) {
      errors.push({ code: 'NEGATIVE_LINE_AMOUNT', field: `detalles[${i}]`, message: `Línea ${i} tiene un monto negativo.` });
    }
  }

  return errors;
}

// ─── 3. Agregador ────────────────────────────────────────────────────────────────

export interface InvoiceValidationInput {
  accessKey:                    string;
  customerTaxId:                string | undefined;
  tipoIdentificacionComprador:  string | undefined;
  totals:                       TotalsInput;
}

/** Ejecuta todas las validaciones antes de firmar. Nunca firmar si valid=false. */
export function validateInvoiceForSri(input: InvoiceValidationInput): ValidationResult {
  const errors: ValidationError[] = [];

  const akResult = validateAccessKey(input.accessKey);
  if (!akResult.valid) {
    errors.push(...akResult.errors.map(e => ({ code: e.code, field: `accessKey.${e.field}`, message: e.message })));
  }

  errors.push(...validateBuyerIdentification(input.customerTaxId, input.tipoIdentificacionComprador));
  errors.push(...validateTotals(input.totals));

  return { valid: errors.length === 0, errors };
}
