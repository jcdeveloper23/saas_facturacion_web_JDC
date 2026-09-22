// Establecimientos: con qué establecimiento y punto de emisión sale cada
// comprobante al SRI, y la matriz que nace con cada empresa.
import * as admin from 'firebase-admin';
import {
  buildMainEstablishment,
  canUseEmissionPoint,
  missingEmissionPoints,
  normalizeEmissionPointList,
  normalizeSriCode,
  resolveDefaultEmissionPoint,
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


describe('normalizeEmissionPointList', () => {
  it('normaliza a EEE-PPP, quita repetidos y ordena', () => {
    expect(normalizeEmissionPointList(['2-1', '001-002', '002-001'])).toEqual(['001-002', '002-001']);
  });
  it('sin lista es vacía, que significa todos', () => {
    expect(normalizeEmissionPointList(undefined)).toEqual([]);
    expect(normalizeEmissionPointList([])).toEqual([]);
  });
  it('rechaza puntos sin establecimiento, con 000 y lo que no es lista', () => {
    expect(() => normalizeEmissionPointList(['002'])).toThrow(/inválido/);
    expect(() => normalizeEmissionPointList(['001-000'])).toThrow(/inválido/);
    expect(() => normalizeEmissionPointList('001-001')).toThrow(/lista/);
  });
});

describe('resolveDefaultEmissionPoint', () => {
  it('el pedido, si está en la lista', () => {
    expect(resolveDefaultEmissionPoint('2-1', ['001-001', '002-001'])).toBe('002-001');
  });
  it('si no está en la lista o no se pide, el primero', () => {
    expect(resolveDefaultEmissionPoint('003-001', ['001-001', '002-001'])).toBe('001-001');
    expect(resolveDefaultEmissionPoint(undefined, ['002-001'])).toBe('002-001');
  });
  it('con la lista vacía (todos), el pedido o ninguno', () => {
    expect(resolveDefaultEmissionPoint('001-002', [])).toBe('001-002');
    expect(resolveDefaultEmissionPoint(null, [])).toBeNull();
  });
  it('rechaza un pedido inválido', () => {
    expect(() => resolveDefaultEmissionPoint('abc', [])).toThrow(/inválido/);
  });
});

describe('missingEmissionPoints', () => {
  const establishments = [
    { code: '001', isActive: true, emissionPoints: [{ code: '001' }, { code: '002', isActive: false }] },
    { code: '002', isActive: false, emissionPoints: [{ code: '001' }] },
  ];
  it('solo cuentan los puntos activos de establecimientos activos', () => {
    expect(missingEmissionPoints(['001-001', '001-002', '002-001', '003-001'], establishments))
      .toEqual(['001-002', '002-001', '003-001']);
  });
});

describe('canUseEmissionPoint', () => {
  it('sin puntos asignados, todos', () => {
    expect(canUseEmissionPoint([], 'cashier', '002', '001')).toBe(true);
    expect(canUseEmissionPoint(undefined, 'seller', '002', '001')).toBe(true);
  });
  it('con asignados, solo esos: el mismo establecimiento con otro punto no vale', () => {
    expect(canUseEmissionPoint(['002-001'], 'cashier', '002', '001')).toBe(true);
    expect(canUseEmissionPoint(['002-001'], 'cashier', '002', '002')).toBe(false);
    expect(canUseEmissionPoint(['002-001'], 'cashier', '001', '001')).toBe(false);
  });
  it('el admin, siempre todos', () => {
    expect(canUseEmissionPoint(['002-001'], 'admin', '001', '003')).toBe(true);
  });
});
