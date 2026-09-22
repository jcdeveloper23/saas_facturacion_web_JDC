// Establecimientos: con qué establecimiento y punto de emisión sale cada
// comprobante al SRI, y la matriz que nace con cada empresa.
import * as admin from 'firebase-admin';
import {
  buildMainEstablishment,
  normalizeSriCode,
  resolveEmissionSeries,
} from '../utils/establishments';

describe('normalizeSriCode', () => {
  it('rellena a 3 dígitos', () => {
    expect(normalizeSriCode('1')).toBe('001');
    expect(normalizeSriCode(2)).toBe('002');
    expect(normalizeSriCode('010')).toBe('010');
  });

  it('rechaza 000, letras y más de 3 dígitos', () => {
    expect(normalizeSriCode('000')).toBeNull();
    expect(normalizeSriCode('A1')).toBeNull();
    expect(normalizeSriCode('1234')).toBeNull();
    expect(normalizeSriCode(undefined)).toBeNull();
  });
});

describe('resolveEmissionSeries', () => {
  const matriz = { establishment: '001', emissionPoint: '001' };

  it('una factura de la sucursal sale con el establecimiento de su serie, no el de la empresa', () => {
    expect(resolveEmissionSeries({ seriesEstablishment: '002', seriesEmissionPoint: '001' }, matriz))
      .toEqual({ establishment: '002', emissionPoint: '001' });
  });

  it('un comprobante sin serie usa el de la empresa', () => {
    expect(resolveEmissionSeries({}, matriz)).toEqual(matriz);
  });

  it('nunca mezcla el establecimiento del documento con el punto de la empresa', () => {
    expect(resolveEmissionSeries({ seriesEstablishment: '002' }, { establishment: '001', emissionPoint: '003' }))
      .toEqual({ establishment: '001', emissionPoint: '003' });
  });

  it('sin datos en ningún lado, 001-001', () => {
    expect(resolveEmissionSeries({}, undefined)).toEqual({ establishment: '001', emissionPoint: '001' });
  });
});

describe('buildMainEstablishment', () => {
  const now = admin.firestore.Timestamp.fromMillis(0);

  it('la matriz se guarda con su código como id y un punto de emisión', () => {
    const main = buildMainEstablishment({
      establishment: '1', emissionPoint: '2', address: ' Av. Solano ', city: 'Cuenca', now, createdBy: 'u1',
    });
    expect(main.id).toBe('001');
    expect(main.data).toMatchObject({
      code: '001', name: 'Matriz', address: 'Av. Solano', city: 'Cuenca', isMain: true, isActive: true,
      emissionPoints: [{ code: '002', name: 'Principal', isActive: true }],
    });
  });
});
