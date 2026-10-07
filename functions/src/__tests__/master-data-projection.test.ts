/**
 * master-data-projection.test.ts
 *
 * El aviso de datos maestros FacturaEc → canal (2026-10-07): qué se proyecta
 * de una persona y de un artículo, cuándo hay algo que avisar, el cuerpo del
 * aviso (contrato con Conecta) y qué se hace con la respuesta del receptor.
 */

import {
  buildPayload,
  personaProjection,
  productProjection,
  projectionChanged,
} from '../utils/master-data-projection';
import {
  RetryableDeliveryError,
  deliverNotice,
} from '../channel-sync/deliver-notice';

const persona = {
  taxIdType: 'RUC',
  taxId: '0190434990001',
  name: 'Weconnect',
  legalName: 'WECONNECT CORP. CIA. LTDA.',
  email: 'facturas@weconnect.com.ec',
  phone1: '0999999999',
  phone2: '072222222',
  isActive: true,
  roles: ['customer'],
  addresses: [
    { address: 'Bodega', city: 'Azogues', isBilling: false },
    { address: 'Av. Solano 1-23', city: 'Cuenca', isBilling: true },
  ],
  updatedAt: 1,
};

const product = {
  sku: 'GOR-01',
  name: 'Gorra',
  salePrice: 8.7,
  taxRate: 15,
  taxRateCode: 'IVA15',
  isActive: true,
  hasVariants: false,
  stockQty: 10,
  averageCost: 4,
  updatedAt: 1,
};

describe('personaProjection', () => {
  it('toma el teléfono de phone1 y la dirección de facturación', () => {
    expect(personaProjection(persona)).toEqual({
      taxIdType: 'RUC',
      taxId: '0190434990001',
      name: 'Weconnect',
      legalName: 'WECONNECT CORP. CIA. LTDA.',
      email: 'facturas@weconnect.com.ec',
      phone: '0999999999',
      address: 'Av. Solano 1-23',
      city: 'Cuenca',
      isActive: true,
    });
  });

  it('sin dirección de facturación usa la primera', () => {
    const p = personaProjection({
      ...persona,
      addresses: [
        { address: 'Primera', city: 'Loja' },
        { address: 'Segunda', city: 'Quito' },
      ],
    });
    expect(p.address).toBe('Primera');
    expect(p.city).toBe('Loja');
  });

  it('normaliza lo ausente a vacío y activo', () => {
    expect(personaProjection({})).toEqual({
      taxIdType: '', taxId: '', name: '', legalName: '', email: '',
      phone: '', address: '', city: '', isActive: true,
    });
    expect(personaProjection({ isActive: false }).isActive).toBe(false);
  });
});

describe('productProjection', () => {
  it('proyecta el artículo con números como number', () => {
    expect(productProjection({ ...product, salePrice: '8.70', taxRate: '15' })).toEqual({
      sku: 'GOR-01',
      name: 'Gorra',
      salePrice: 8.7,
      taxRate: 15,
      taxRateCode: 'IVA15',
      isActive: true,
      hasVariants: false,
    });
  });

  it('normaliza lo ausente', () => {
    expect(productProjection({})).toEqual({
      sku: '', name: '', salePrice: 0, taxRate: 0, taxRateCode: '',
      isActive: true, hasVariants: false,
    });
  });
});

describe('projectionChanged', () => {
  it('un cambio solo de stock, costo o updatedAt no avisa', () => {
    expect(projectionChanged('product', product,
      { ...product, stockQty: 3, averageCost: 5, updatedAt: 2 })).toBe(false);
    expect(projectionChanged('persona', persona,
      { ...persona, phone2: 'otro', roles: ['customer', 'supplier'], updatedAt: 2 })).toBe(false);
  });

  it('un cambio de precio, nombre o dirección de facturación sí avisa', () => {
    expect(projectionChanged('product', product, { ...product, salePrice: 9 })).toBe(true);
    expect(projectionChanged('persona', persona, { ...persona, legalName: 'OTRA' })).toBe(true);
    expect(projectionChanged('persona', persona, {
      ...persona,
      addresses: [{ address: 'Nueva', city: 'Cuenca', isBilling: true }],
    })).toBe(true);
  });

  it('alta y baja siempre avisan; nada contra nada, no', () => {
    expect(projectionChanged('product', null, product)).toBe(true);
    expect(projectionChanged('persona', persona, null)).toBe(true);
    expect(projectionChanged('persona', null, null)).toBe(false);
  });
});

describe('buildPayload', () => {
  it('arma el contrato con la proyección de después', () => {
    expect(buildPayload({
      kind: 'product', companyId: 'c1', id: 'p1',
      eventTime: '2026-10-07T12:00:00.000Z', before: null, after: product,
    })).toEqual({
      version: 1,
      kind: 'product',
      companyId: 'c1',
      id: 'p1',
      eventTime: '2026-10-07T12:00:00.000Z',
      deleted: false,
      data: productProjection(product),
    });
  });

  it('una baja va con deleted y data null', () => {
    const payload = buildPayload({
      kind: 'persona', companyId: 'c1', id: 'x', eventTime: 't', before: persona, after: null,
    });
    expect(payload.deleted).toBe(true);
    expect(payload.data).toBeNull();
  });
});

describe('deliverNotice', () => {
  const payload = buildPayload({
    kind: 'product', companyId: 'c1', id: 'p1', eventTime: 't', before: null, after: product,
  });
  const url = 'https://us-central1-work-cloud-df68a.cloudfunctions.net/facturaEcMasterDataSync';
  const getIdToken = jest.fn(async (aud: string) => `token-for-${aud}`);

  function fakeFetch(status: number, body = ''): jest.Mock {
    return jest.fn(async () => new Response(body, { status }));
  }

  it('2xx: entregado, con el token OIDC y el cuerpo JSON', async () => {
    const f = fakeFetch(200);
    await expect(deliverNotice(url, payload, { getIdToken, fetch: f }))
      .resolves.toEqual({ outcome: 'delivered', status: 200 });
    const [calledUrl, init] = f.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer token-for-${url}`);
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('4xx: rechazado, sin reintento', async () => {
    await expect(deliverNotice(url, payload, { getIdToken, fetch: fakeFetch(403, 'no') }))
      .resolves.toEqual({ outcome: 'rejected', status: 403, body: 'no' });
  });

  it('5xx: lanza para que Firestore reintente', async () => {
    await expect(deliverNotice(url, payload, { getIdToken, fetch: fakeFetch(503) }))
      .rejects.toBeInstanceOf(RetryableDeliveryError);
  });

  it('error de red: lanza para que Firestore reintente', async () => {
    const f = jest.fn(async () => { throw new Error('ECONNRESET'); });
    await expect(deliverNotice(url, payload, { getIdToken, fetch: f as unknown as typeof fetch }))
      .rejects.toBeInstanceOf(RetryableDeliveryError);
  });
});
