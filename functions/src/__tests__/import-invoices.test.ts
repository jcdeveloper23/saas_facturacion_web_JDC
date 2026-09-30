/**
 * import-invoices.test.ts
 *
 * La importación de facturas y notas de crédito desde XML (`importInvoices`):
 * leer el comprobante, comprobar su clave de acceso, leer la respuesta del SRI
 * y armar el documento y los contadores. Solo lógica pura, sin Firestore ni red.
 *
 * Los XML son sintéticos: los reales traen datos de terceros y no entran al repo.
 */

import { calculateModulo11 } from '../utils/sri-access-key';
import {
  accessKeyProblem, buildImportedInvoiceDoc, counterFloors, counterUpdates, fullNumber,
  parseSriXml, SriXmlError,
} from '../utils/sri-xml-import';
import { environmentOfAccessKey, parseSriAuthorizationResponse } from '../utils/sri-authorization';

const RUC = '0190434990001';

function clave(o: { fecha: string; cod: string; amb: string; estab: string; pto: string; sec: number }) {
  const k48 = `${o.fecha}${o.cod}${RUC}${o.amb}${o.estab}${o.pto}${String(o.sec).padStart(9, '0')}12345678` + '1';
  return k48 + calculateModulo11(k48);
}

function factura(o: Partial<{ sec: number; amb: string; fecha: string; ruc: string; claveOverride: string; cod: string }> = {}) {
  const sec = o.sec ?? 1843;
  const amb = o.amb ?? '2';
  const fecha = o.fecha ?? '01/09/2026';
  const k = o.claveOverride ?? clave({ fecha: fecha.replace(/\//g, ''), cod: o.cod ?? '01', amb, estab: '001', pto: '001', sec });
  return `<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="2.1.0">
<infoTributaria><ambiente>${amb}</ambiente><tipoEmision>1</tipoEmision><razonSocial>EMPRESA DE PRUEBA</razonSocial>
<ruc>${o.ruc ?? RUC}</ruc><claveAcceso>${k}</claveAcceso><codDoc>${o.cod ?? '01'}</codDoc><estab>001</estab><ptoEmi>001</ptoEmi>
<secuencial>${String(sec).padStart(9, '0')}</secuencial></infoTributaria>
<infoFactura><fechaEmision>${fecha}</fechaEmision><tipoIdentificacionComprador>04</tipoIdentificacionComprador>
<razonSocialComprador>CLIENTE S.A.</razonSocialComprador><identificacionComprador>1790012345001</identificacionComprador>
<direccionComprador>Quito</direccionComprador><totalSinImpuestos>100.00</totalSinImpuestos><totalDescuento>0.00</totalDescuento>
<totalConImpuestos><totalImpuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><baseImponible>100.00</baseImponible><valor>15.00</valor></totalImpuesto></totalConImpuestos>
<importeTotal>115.00</importeTotal><pagos><pago><formaPago>20</formaPago><total>115.00</total><plazo>30</plazo><unidadTiempo>dias</unidadTiempo></pago></pagos></infoFactura>
<detalles><detalle><codigoPrincipal>ABC-1</codigoPrincipal><descripcion>Servicio</descripcion><cantidad>2</cantidad>
<precioUnitario>50.00</precioUnitario><descuento>0</descuento><precioTotalSinImpuesto>100.00</precioTotalSinImpuesto>
<impuestos><impuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><tarifa>15</tarifa><baseImponible>100.00</baseImponible><valor>15.00</valor></impuesto></impuestos></detalle></detalles>
<infoAdicional><campoAdicional nombre="Email">cliente@example.com</campoAdicional></infoAdicional></factura>`;
}

const autorizado = (xml: string, k: string, estado = 'AUTORIZADO') =>
  `<?xml version="1.0"?><autorizacion><estado>${estado}</estado><numeroAutorizacion>${k}</numeroAutorizacion>` +
  `<fechaAutorizacion>2026-09-01T10:36:55-05:00</fechaAutorizacion><comprobante><![CDATA[${xml}]]></comprobante></autorizacion>`;

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function soap(autorizaciones: { estado: string; xml: string; numero: string; mensaje?: string }[]) {
  return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
    `<ns2:autorizacionComprobanteResponse xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><RespuestaAutorizacionComprobante>` +
    `<numeroComprobantes>${autorizaciones.length}</numeroComprobantes><autorizaciones>` +
    autorizaciones.map((a) => `<autorizacion><estado>${a.estado}</estado><numeroAutorizacion>${a.numero}</numeroAutorizacion>` +
      `<fechaAutorizacion>2026-09-01T10:36:55-05:00</fechaAutorizacion><ambiente>PRODUCCIÓN</ambiente>` +
      `<comprobante>${escapar(a.xml)}</comprobante>` +
      (a.mensaje ? `<mensajes><mensaje><identificador>43</identificador><mensaje>${a.mensaje}</mensaje></mensaje></mensajes>` : '') +
      `</autorizacion>`).join('') +
    `</autorizaciones></RespuestaAutorizacionComprobante></ns2:autorizacionComprobanteResponse></soap:Body></soap:Envelope>`;
}

describe('parseSriXml', () => {
  it('lee una factura suelta', () => {
    const d = parseSriXml(factura());
    expect(d.issuerRuc).toBe(RUC);
    expect(fullNumber(d)).toBe('001-001-000001843');
    expect(d.issueDate).toEqual({ y: 2026, m: 9, d: 1 });
    expect(d.total).toBe(115);
    expect(d.lines[0]).toMatchObject({ code: 'ABC-1', quantity: 2, subtotal: 100, vatPct: 15, vatAmount: 15 });
    expect(d.vatTotals).toEqual([{ vatPct: 15, base: 100, amount: 15 }]);
    expect(d.payments[0]).toEqual({ code: '20', amount: 115, deadline: 30, timeUnit: 'dias' });
    expect(d.buyerEmail).toBe('cliente@example.com');
    expect(d.hasAuthorization).toBe(false);
  });

  it('lee la autorización con el comprobante en CDATA', () => {
    const x = factura();
    const k = parseSriXml(x).accessKey;
    const d = parseSriXml(autorizado(x, k));
    expect(d.hasAuthorization).toBe(true);
    expect(d.authorizationStatus).toBe('AUTORIZADO');
    expect(d.authorizationNumber).toBe(k);
    expect(d.authorizedAt?.toISOString()).toBe('2026-09-01T15:36:55.000Z');
  });

  it('rechaza una clave de acceso que no corresponde al comprobante', () => {
    const otra = parseSriXml(factura({ sec: 99 })).accessKey;
    expect(() => parseSriXml(factura({ claveOverride: otra }))).toThrow('no corresponde');
  });

  it('rechaza un dígito verificador malo', () => {
    const k = parseSriXml(factura()).accessKey;
    const mala = k.slice(0, 48) + ((+k[48] + 1) % 10);
    expect(() => parseSriXml(factura({ claveOverride: mala }))).toThrow('dígito verificador');
  });

  it('rechaza lo que no es factura ni nota de crédito', () => {
    expect(() => parseSriXml('<comprobanteRetencion/>')).toThrow(SriXmlError);
    expect(() => parseSriXml('no es xml <')).toThrow('bien formado');
  });

  it('accessKeyProblem acepta la clave correcta', () => {
    const d = parseSriXml(factura());
    expect(accessKeyProblem(d.accessKey, {
      codDoc: '01', ruc: RUC, environment: '2', establishment: '001', emissionPoint: '001', sequential: 1843, issueDate: d.issueDate,
    })).toBeNull();
  });
});

describe('parseSriAuthorizationResponse', () => {
  const x = factura();
  const k = parseSriXml(x).accessKey;

  it('devuelve la autorización lista para guardar y volver a leer', () => {
    const r = parseSriAuthorizationResponse(soap([{ estado: 'AUTORIZADO', xml: x, numero: k }]));
    expect(r).toMatchObject({ found: true, estado: 'AUTORIZADO', numeroAutorizacion: k });
    const d = parseSriXml(r.authorizedXml);
    expect(d.accessKey).toBe(k);
    expect(d.authorizationStatus).toBe('AUTORIZADO');
    expect(d.total).toBe(115);
  });

  it('con varios intentos se queda con el autorizado', () => {
    const r = parseSriAuthorizationResponse(soap([
      { estado: 'NO AUTORIZADO', xml: x, numero: '', mensaje: 'ERROR' },
      { estado: 'AUTORIZADO', xml: x, numero: k },
    ]));
    expect(r.estado).toBe('AUTORIZADO');
  });

  it('explica un rechazo con el mensaje del SRI', () => {
    const r = parseSriAuthorizationResponse(soap([{ estado: 'NO AUTORIZADO', xml: x, numero: '', mensaje: 'CLAVE ACCESO REGISTRADA' }]));
    expect(r).toMatchObject({ found: true, estado: 'NO AUTORIZADO', mensaje: 'CLAVE ACCESO REGISTRADA' });
  });

  it('sin autorizaciones: no encontrado', () => {
    expect(parseSriAuthorizationResponse(soap([])).found).toBe(false);
  });

  it('el ambiente sale del dígito 24 de la clave', () => {
    expect(environmentOfAccessKey(k)).toBe('production');
    expect(environmentOfAccessKey(parseSriXml(factura({ amb: '1' })).accessKey)).toBe('testing');
  });
});

describe('buildImportedInvoiceDoc', () => {
  const d = parseSriXml(autorizado(factura(), parseSriXml(factura()).accessKey));
  const doc = buildImportedInvoiceDoc(d, { uid: 'u1', fileName: 'f.xml', customerId: 'c1', productIdsBySku: { 'ABC-1': 'p1' } });

  it('nace autorizada y fuera de los disparadores de envío e inventario', () => {
    expect(doc).toMatchObject({
      status: 'issued', sriStatus: 'authorized', stockProcessed: true, stockRestored: true,
      imported: true, verifiedWithSri: true, authorizationVerified: true, source: 'xml_import',
      sriEnvironment: 'production', fiscalYear: '2026', fullNumber: '001-001-000001843',
      customerId: 'c1', customerTaxIdType: 'RUC', total: 115, vatAmount: 15, netAmount: 100,
    });
    expect((doc.lines as any[])[0]).toMatchObject({ productId: 'p1', sku: 'ABC-1' });
    expect(doc.date).toEqual(new Date(Date.UTC(2026, 8, 1, 17)));
    expect(doc.isCreditNote).toBeUndefined();
  });
});

describe('contadores', () => {
  const d = parseSriXml(factura({ sec: 1843, fecha: '01/09/2025' }));

  it('sube el del año del comprobante y los del año en curso', () => {
    expect(counterFloors([d], [2026])).toEqual({ '001_001_2025': 1843, '001_001_2026': 1843 });
  });

  it('solo escribe lo que sube', () => {
    expect(counterUpdates({ '001_001_2026': 2000, '001_001_2025': 10 }, { '001_001_2025': 1843, '001_001_2026': 1843 }))
      .toEqual({ '001_001_2025': 1843 });
  });
});
