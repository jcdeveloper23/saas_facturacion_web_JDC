import { shouldProcessInvoice, invoiceBuyerProblem } from '../invoices/invoice-buyer-check';

// RUC de sociedad válido por forma y cédula válida (módulo 10).
const RUC_OK = '0190434990001';
const CEDULA_OK = '1710034065';

describe('invoiceBuyerProblem (onInvoiceEmit, 2026-10-13)', () => {
  it('RUC de 14 dígitos → motivo claro (caso factura 1860)', () => {
    const p = invoiceBuyerProblem({ customerTaxId: '01904349900011', customerTaxIdType: 'RUC' });
    expect(p).toBe('Identificación del comprador 01904349900011: El RUC debe tener 13 dígitos y terminar en 001 (tiene 14).');
  });

  it('identificación válida → null (sigue el pipeline)', () => {
    expect(invoiceBuyerProblem({ customerTaxId: RUC_OK, customerTaxIdType: 'RUC' })).toBeNull();
    expect(invoiceBuyerProblem({ customerTaxId: CEDULA_OK, customerTaxIdType: 'CI' })).toBeNull();
    expect(invoiceBuyerProblem({ customerTaxId: CEDULA_OK, customerIdentificationType: '05' })).toBeNull();
    expect(invoiceBuyerProblem({ customerTaxId: 'AB123456', customerTaxIdType: 'PASAPORTE' })).toBeNull();
    expect(invoiceBuyerProblem({ customerTaxId: '9999999999999', customerTaxIdType: 'RUC' })).toBeNull();
    expect(invoiceBuyerProblem({ customerTaxId: ` ${RUC_OK} `, customerTaxIdType: 'ruc' })).toBeNull();
  });

  it('tipo de texto desconocido viaja como RUC: un RUC válido pasa igual que antes', () => {
    expect(invoiceBuyerProblem({ customerTaxId: RUC_OK, customerTaxIdType: 'loquesea' })).toBeNull();
  });

  it('nota de crédito: mismo control, con su nombre', () => {
    const p = invoiceBuyerProblem({ isCreditNote: true, customerTaxId: '123', customerTaxIdType: 'CI' });
    expect(p).toBe('Identificación del comprador de la nota de crédito 123: La cédula debe tener 10 dígitos (tiene 3).');
    expect(invoiceBuyerProblem({ documentType: 'creditNote', customerTaxId: RUC_OK, customerTaxIdType: 'RUC' })).toBeNull();
  });

  it('sin identificación', () => {
    expect(invoiceBuyerProblem({ customerTaxId: '  ' })).toBe('Identificación del comprador: falta la identificación.');
  });

  it('tipo vacío con una cédula: se envía como RUC y se explica', () => {
    const p = invoiceBuyerProblem({ customerTaxId: CEDULA_OK, customerTaxIdType: '' });
    expect(p).toContain('El RUC debe tener 13 dígitos');
    expect(p).toContain('elija el tipo «Cédula»');
  });

  it('código explícito fuera de la Tabla 6', () => {
    expect(invoiceBuyerProblem({ customerTaxId: RUC_OK, customerIdentificationType: 'RUC' }))
      .toContain('no es de la Tabla 6');
  });
});

describe('shouldProcessInvoice', () => {
  it('emitida sin sriStatus → se procesa (primer envío y reintento tras corregir)', () => {
    expect(shouldProcessInvoice({ status: 'issued' })).toBe(true);
    expect(shouldProcessInvoice({ status: 'issued', sriStatus: null, sriError: null })).toBe(true);
  });

  it('con sriStatus no se procesa (pending, invalid_data, authorized…): sin bucles', () => {
    for (const s of ['pending', 'invalid_data', 'authorized', 'rejected', 'not_required']) {
      expect(shouldProcessInvoice({ status: 'issued', sriStatus: s })).toBe(false);
    }
  });

  it('importada se salta, aunque le borren el estado', () => {
    expect(shouldProcessInvoice({ status: 'issued', sriStatus: 'authorized', imported: true })).toBe(false);
    expect(shouldProcessInvoice({ status: 'issued', imported: true })).toBe(false);
  });

  it('no emitida o borrada', () => {
    expect(shouldProcessInvoice({ status: 'draft' })).toBe(false);
    expect(shouldProcessInvoice({ status: 'void' })).toBe(false);
    expect(shouldProcessInvoice(null)).toBe(false);
  });
});
