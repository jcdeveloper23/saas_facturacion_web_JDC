/**
 * fetch-received-documents.test.ts
 *
 * Compras desde el TXT de «Comprobantes recibidos» del SRI: qué claves se
 * descartan antes de preguntar al SRI y cómo se lee su respuesta. Lógica pura,
 * sin Firestore ni red. Los XML son sintéticos.
 */

import { calculateModulo11 } from '../utils/sri-access-key';
import { classifyReceived, keyProblem, sameTaxpayer } from '../purchases/fetch-received-documents';
import { SriAuthorizationResult } from '../utils/sri-authorization';

const PROVEEDOR = '1790012345001';
const EMPRESA = '0190434990001';

function clave(o: Partial<{ cod: string; amb: string; ruc: string }> = {}) {
  const k48 = `21102026${o.cod ?? '01'}${o.ruc ?? PROVEEDOR}${o.amb ?? '2'}001001000000123123456781`;
  return k48 + calculateModulo11(k48);
}

function factura(key: string, comprador = EMPRESA, cod = '01') {
  return `<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.1.0">
<infoTributaria><ambiente>2</ambiente><tipoEmision>1</tipoEmision><razonSocial>PROVEEDOR S.A.</razonSocial>
<ruc>${PROVEEDOR}</ruc><claveAcceso>${key}</claveAcceso><codDoc>${cod}</codDoc><estab>001</estab><ptoEmi>001</ptoEmi>
<secuencial>000000123</secuencial></infoTributaria>
<infoFactura><fechaEmision>21/10/2026</fechaEmision><tipoIdentificacionComprador>04</tipoIdentificacionComprador>
<razonSocialComprador>MI EMPRESA</razonSocialComprador><identificacionComprador>${comprador}</identificacionComprador>
<totalSinImpuestos>100.00</totalSinImpuestos><totalDescuento>0.00</totalDescuento>
<totalConImpuestos><totalImpuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><baseImponible>100.00</baseImponible><valor>15.00</valor></totalImpuesto></totalConImpuestos>
<importeTotal>115.00</importeTotal><pagos><pago><formaPago>20</formaPago><total>115.00</total></pago></pagos></infoFactura>
<detalles><detalle><codigoPrincipal>A1</codigoPrincipal><descripcion>Papel</descripcion><cantidad>1</cantidad>
<precioUnitario>100.00</precioUnitario><descuento>0</descuento><precioTotalSinImpuesto>100.00</precioTotalSinImpuesto>
<impuestos><impuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><tarifa>15</tarifa><baseImponible>100.00</baseImponible><valor>15.00</valor></impuesto></impuestos>
</detalle></detalles></factura>`;
}

function autorizado(xml: string, estado = 'AUTORIZADO'): SriAuthorizationResult {
  return {
    found: true, estado, numeroAutorizacion: estado === 'AUTORIZADO' ? '1' : '', fechaAutorizacion: '', mensaje: '',
    authorizedXml: `<autorizacion><estado>${estado}</estado><comprobante><![CDATA[${xml}]]></comprobante></autorizacion>`,
  };
}

describe('keyProblem', () => {
  test('una factura de producción con la clave bien formada pasa', () => {
    expect(keyProblem(clave())).toBeNull();
  });
  test('rechaza claves que no son de 49 dígitos', () => {
    expect(keyProblem('123')?.status).toBe('invalid_key');
  });
  test('rechaza un dígito verificador que no cuadra', () => {
    const k = clave();
    const malo = k.slice(0, 48) + ((+k[48] + 1) % 10);
    expect(keyProblem(malo)?.status).toBe('invalid_key');
  });
  test('solo facturas: una retención o una NC no se importan como compra', () => {
    expect(keyProblem(clave({ cod: '07' }))?.status).toBe('not_invoice');
    expect(keyProblem(clave({ cod: '04' }))?.status).toBe('not_invoice');
  });
  test('una factura del ambiente de pruebas no se importa', () => {
    expect(keyProblem(clave({ amb: '1' }))?.status).toBe('testing');
  });
});

describe('classifyReceived', () => {
  test('autorizada y a nombre de la empresa → ok con el XML', () => {
    const k = clave();
    const r = classifyReceived(k, autorizado(factura(k)), EMPRESA);
    expect(r.status).toBe('ok');
    expect(r.xml).toContain(k);
  });
  test('el SRI no la conoce', () => {
    const r = classifyReceived(clave(), { found: false, estado: '', numeroAutorizacion: '', fechaAutorizacion: '', mensaje: '', authorizedXml: '' }, EMPRESA);
    expect(r.status).toBe('not_authorized');
    expect(r.xml).toBeUndefined();
  });
  test('NO AUTORIZADO no se importa', () => {
    const k = clave();
    expect(classifyReceived(k, autorizado(factura(k), 'NO AUTORIZADO'), EMPRESA).status).toBe('not_authorized');
  });
  test('a nombre de otro comprador', () => {
    const k = clave();
    const r = classifyReceived(k, autorizado(factura(k, '0912345678001')), EMPRESA);
    expect(r.status).toBe('other_company');
    expect(r.xml).toBeUndefined();
  });
  test('persona natural: la cédula y su RUC son el mismo comprador', () => {
    const k = clave();
    expect(classifyReceived(k, autorizado(factura(k, '0106594385')), '0106594385001').status).toBe('ok');
  });
  test('el comprobante del SRI no es el de la clave', () => {
    const k = clave();
    const otra = clave({ ruc: '1790099999001' });
    expect(classifyReceived(k, autorizado(factura(otra)), EMPRESA).status).toBe('invalid');
  });
});

describe('sameTaxpayer', () => {
  test('cédula y RUC de persona natural', () => {
    expect(sameTaxpayer('0106594385', '0106594385001')).toBe(true);
    expect(sameTaxpayer('0190434990001', '0190434990001')).toBe(true);
    expect(sameTaxpayer('0190434990001', '1790012345001')).toBe(false);
  });
});
