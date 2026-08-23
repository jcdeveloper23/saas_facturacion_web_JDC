/**
 * sri-invoice-validator.test.ts
 *
 * Caso 3: Consumidor final con código incorrecto (04) → debe fallar.
 * Caso 4: IVA incorrecto → debe fallar.
 * Caso 5: Total incorrecto → debe fallar.
 */

import { validateBuyerIdentification, validateTotals, validateInvoiceForSri, TotalsInput } from '../utils/sri-invoice-validator';
import { generateAccessKey } from '../utils/sri-access-key';

describe('validateBuyerIdentification', () => {
  test('Caso 3: consumidor final (9999999999999) con código 04 → INVALID_BUYER_IDENTIFICATION_TYPE', () => {
    const errors = validateBuyerIdentification('9999999999999', '04');
    expect(errors.some(e => e.code === 'INVALID_BUYER_IDENTIFICATION_TYPE')).toBe(true);
  });

  test('consumidor final con código 07 → sin errores', () => {
    const errors = validateBuyerIdentification('9999999999999', '07');
    expect(errors).toHaveLength(0);
  });

  test('RUC normal con código 07 (consumidor final indebido) → error', () => {
    const errors = validateBuyerIdentification('1792146739001', '07');
    expect(errors.some(e => e.code === 'INVALID_BUYER_IDENTIFICATION_TYPE')).toBe(true);
  });

  test('RUC de 12 dígitos con código 04 → INVALID_RUC_LENGTH', () => {
    const errors = validateBuyerIdentification('179214673900', '04');
    expect(errors.some(e => e.code === 'INVALID_RUC_LENGTH')).toBe(true);
  });

  test('falta identificación → MISSING_BUYER_IDENTIFICATION', () => {
    const errors = validateBuyerIdentification(undefined, '04');
    expect(errors[0].code).toBe('MISSING_BUYER_IDENTIFICATION');
  });
});

describe('validateTotals', () => {
  const baseValidTotals: TotalsInput = {
    lines: [{ baseImponible: 8.70, valorImpuesto: 1.30, precioTotalSinImpuesto: 8.70 }],
    totalSinImpuestos: 8.70,
    totalImpuestoValor: 1.30,
    totalDescuento: 0,
    importeTotal: 10.00,
  };

  test('totales consistentes → sin errores', () => {
    expect(validateTotals(baseValidTotals)).toHaveLength(0);
  });

  test('Caso 4: IVA de línea alterado sin actualizar el total de impuestos → TOTALS_MISMATCH_TAX', () => {
    const tampered: TotalsInput = { ...baseValidTotals, totalImpuestoValor: 5.00 };
    const errors = validateTotals(tampered);
    expect(errors.some(e => e.code === 'TOTALS_MISMATCH_TAX')).toBe(true);
  });

  test('Caso 5: importeTotal alterado → TOTALS_MISMATCH_IMPORTE_TOTAL', () => {
    const tampered: TotalsInput = { ...baseValidTotals, importeTotal: 999.99 };
    const errors = validateTotals(tampered);
    expect(errors.some(e => e.code === 'TOTALS_MISMATCH_IMPORTE_TOTAL')).toBe(true);
  });

  test('base imponible de línea no cuadra con totalSinImpuestos → TOTALS_MISMATCH_BASE', () => {
    const tampered: TotalsInput = { ...baseValidTotals, totalSinImpuestos: 50 };
    const errors = validateTotals(tampered);
    expect(errors.some(e => e.code === 'TOTALS_MISMATCH_BASE')).toBe(true);
  });

  test('sin líneas → NO_LINES', () => {
    const errors = validateTotals({ ...baseValidTotals, lines: [] });
    expect(errors.some(e => e.code === 'NO_LINES')).toBe(true);
  });

  test('monto NaN en línea → NON_FINITE_LINE_AMOUNT', () => {
    const errors = validateTotals({
      ...baseValidTotals,
      lines: [{ baseImponible: NaN, valorImpuesto: 1.30, precioTotalSinImpuesto: 8.70 }],
    });
    expect(errors.some(e => e.code === 'NON_FINITE_LINE_AMOUNT')).toBe(true);
  });

  test('monto negativo en línea → NEGATIVE_LINE_AMOUNT', () => {
    const errors = validateTotals({
      ...baseValidTotals,
      lines: [{ baseImponible: -8.70, valorImpuesto: 1.30, precioTotalSinImpuesto: 8.70 }],
    });
    expect(errors.some(e => e.code === 'NEGATIVE_LINE_AMOUNT')).toBe(true);
  });

  test('tolerancia de redondeo de 1 centavo no dispara error', () => {
    const withinTolerance: TotalsInput = { ...baseValidTotals, importeTotal: 10.005 };
    expect(validateTotals(withinTolerance)).toHaveLength(0);
  });
});

describe('validateInvoiceForSri — agregador', () => {
  test('Caso 1 (factura normal) — todo válido → valid=true', () => {
    const key = generateAccessKey({
      fechaEmision: '10042026', tipoComprobante: '01', ruc: '1792146739001',
      ambiente: '1', establecimiento: '001', puntoEmision: '001',
      secuencial: '000000001', codigoNumerico: '12345678', tipoEmision: '1',
    });
    const result = validateInvoiceForSri({
      accessKey: key,
      customerTaxId: '9999999999999',
      tipoIdentificacionComprador: '07',
      totals: {
        lines: [{ baseImponible: 8.70, valorImpuesto: 1.30, precioTotalSinImpuesto: 8.70 }],
        totalSinImpuestos: 8.70,
        totalImpuestoValor: 1.30,
        totalDescuento: 0,
        importeTotal: 10.00,
      },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('clave inválida + comprador inconsistente + totales rotos → todos los errores presentes', () => {
    const result = validateInvoiceForSri({
      accessKey: '123',
      customerTaxId: '9999999999999',
      tipoIdentificacionComprador: '04',
      totals: {
        lines: [{ baseImponible: 8.70, valorImpuesto: 1.30, precioTotalSinImpuesto: 8.70 }],
        totalSinImpuestos: 8.70,
        totalImpuestoValor: 1.30,
        totalDescuento: 0,
        importeTotal: 999,
      },
    });
    expect(result.valid).toBe(false);
    const codes = result.errors.map(e => e.code);
    expect(codes).toContain('INVALID_LENGTH');
    expect(codes).toContain('INVALID_BUYER_IDENTIFICATION_TYPE');
    expect(codes).toContain('TOTALS_MISMATCH_IMPORTE_TOTAL');
  });
});
