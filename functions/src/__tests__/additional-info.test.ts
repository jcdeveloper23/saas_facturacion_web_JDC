/**
 * additional-info.test.ts
 *
 * La «Información adicional» del XML y del RIDE: campos de la empresa (plantillas),
 * los del comprobante (la placa de un conductor) y el correo del comprador. Lo que
 * importa: que nunca salga un campo vacío (el SRI rechaza el comprobante) y que no
 * se pase de 15.
 */

import { buildAdditionalInfo, validateAdditionalInfoInput } from '../utils/additional-info';

const company = { name: 'EMPRESA', ruc: '0190434990001' };

describe('buildAdditionalInfo', () => {
  it('junta los de la empresa, los de la factura y el correo del comprador', () => {
    const r = buildAdditionalInfo({
      companyFields: [{ nombre: 'Vendedor', valor: 'Caja ${company.name}' }],
      docFields: [{ nombre: 'Placa', valor: 'ABC-1234' }],
      doc: { customerEmail: 'cli@x.com' },
      company,
    });
    expect(r).toEqual([
      { nombre: 'Vendedor', valor: 'Caja EMPRESA' },
      { nombre: 'Placa', valor: 'ABC-1234' },
      { nombre: 'Email', valor: 'cli@x.com' },
    ]);
  });

  it('omite las plantillas que quedan vacías (antes el SRI rechazaba el XML)', () => {
    const r = buildAdditionalInfo({
      companyFields: [{ nombre: 'Referencia', valor: '${invoice.customerReference}' }],
      doc: {},
      company,
    });
    expect(r).toEqual([]);
  });

  it('no repite el correo si la empresa ya lo pone', () => {
    const r = buildAdditionalInfo({
      companyFields: [{ nombre: 'Correo', valor: '${customer.email}' }],
      doc: { customerEmail: 'cli@x.com' },
      company,
    });
    expect(r).toEqual([{ nombre: 'Correo', valor: 'cli@x.com' }]);
  });

  it('no pasa de 15 campos', () => {
    const docFields = Array.from({ length: 20 }, (_, i) => ({ nombre: `C${i}`, valor: 'x' }));
    expect(buildAdditionalInfo({ docFields, doc: {}, company })).toHaveLength(15);
  });
});

describe('validateAdditionalInfoInput', () => {
  it('acepta la placa y descarta filas vacías del formulario', () => {
    expect(validateAdditionalInfoInput([{ nombre: ' Placa ', valor: 'ABC-1234' }, { nombre: '', valor: '' }]))
      .toEqual([{ nombre: 'Placa', valor: 'ABC-1234' }]);
  });
  it('rechaza nombre sin valor y valor sin nombre', () => {
    expect(() => validateAdditionalInfoInput([{ nombre: 'Placa', valor: ' ' }])).toThrow('falta el valor');
    expect(() => validateAdditionalInfoInput([{ nombre: '', valor: 'x' }])).toThrow('falta el nombre');
  });
  it('cuenta los campos de la empresa en el tope de 15', () => {
    const f = Array.from({ length: 5 }, (_, i) => ({ nombre: `C${i}`, valor: 'x' }));
    expect(() => validateAdditionalInfoInput(f, 11)).toThrow('ya usa 11');
    expect(validateAdditionalInfoInput(f, 10)).toHaveLength(5);
  });
  it('sin información adicional, lista vacía', () => {
    expect(validateAdditionalInfoInput(undefined)).toEqual([]);
  });
});
