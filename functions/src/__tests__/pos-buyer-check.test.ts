import { posBuyerCheck } from '../pos/pos-buyer-check';

const CEDULA_OK = '1712345675';

describe('posBuyerCheck', () => {
  it('cliente válido: se factura con su tipo', () => {
    expect(posBuyerCheck(CEDULA_OK, 'CI')).toEqual({ taxIdType: 'CI', problem: null });
    expect(posBuyerCheck('1791234567001', 'RUC').problem).toBeNull();
    expect(posBuyerCheck('9999999999999', '').problem).toBeNull();
  });

  it('tipo vacío (cliente por defecto del terminal): se deduce', () => {
    expect(posBuyerCheck(CEDULA_OK, '')).toEqual({ taxIdType: 'CI', problem: null });
    expect(posBuyerCheck('9999999999999', undefined).taxIdType).toBe('CONSUMIDOR_FINAL');
    expect(posBuyerCheck('1791234567001', null).taxIdType).toBe('RUC');
  });

  it('sin comprador: no se convierte en consumidor final', () => {
    const r = posBuyerCheck('', '');
    expect(r.problem).toContain('no tiene identificación');
    expect(r.taxIdType).toBe('RUC');
  });

  it('RUC de 14 dígitos: no se factura', () => {
    const r = posBuyerCheck('17912345670011', 'RUC');
    expect(r.problem).toContain('Factura no emitida');
    expect(r.problem).toContain('13 dígitos');
  });

  it('cédula mal escrita', () => {
    expect(posBuyerCheck('1712345676', 'CI').problem).toContain('dígito verificador');
  });

  it('pasaporte hasta 20', () => {
    expect(posBuyerCheck('P1234567', 'PASAPORTE').problem).toBeNull();
    expect(posBuyerCheck('P'.repeat(21), 'PASAPORTE').problem).toContain('20 caracteres');
  });
});
