/**
 * Script temporal: firma una factura real y la envía DIRECTO a los
 * endpoints de PRUEBAS del SRI (celcer.sri.gob.ec), sin pasar por Firebase.
 * Permite iterar rápido sin depender de deploy + espera del usuario.
 *
 * Uso: npx ts-node src/utils/_scratch-sri-live-test.ts <secuencial9digitos>
 */
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { signXmlContent, verifySignedXml } from './sign-xml-helper';
import { generateAccessKey } from './sri-access-key';

const P12_PATH = '/Users/jeanscarlosrodriguez/Documents/jCarlos/SaasFacturacion/coreui-facturasec-front-web/docs/0151950045.p12';
const PASSWORD = fs.readFileSync('/Users/jeanscarlosrodriguez/Documents/jCarlos/SaasFacturacion/coreui-facturasec-front-web/docs/pass.txt', 'utf8').trim();

const RECEPTION_WSDL      = 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl';
const AUTHORIZATION_WSDL  = 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl';

function generarCodigoNumerico(): string {
  return String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
}

async function callSriReception(wsdlUrl: string, xmlBase64: string): Promise<string> {
  const serviceUrl = wsdlUrl.replace('?wsdl', '');
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion">
      <xml>${xmlBase64}</xml>
    </ns2:validarComprobante>
  </soap:Body>
</soap:Envelope>`;
  const response = await axios.post(serviceUrl, soapEnvelope, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' },
    timeout: 30000,
  });
  return String(response.data);
}

async function callSriAuthorization(wsdlUrl: string, accessKey: string): Promise<string> {
  const serviceUrl = wsdlUrl.replace('?wsdl', '');
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion">
      <claveAccesoComprobante>${accessKey}</claveAccesoComprobante>
    </ns2:autorizacionComprobante>
  </soap:Body>
</soap:Envelope>`;
  const response = await axios.post(serviceUrl, soapEnvelope, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' },
    timeout: 30000,
  });
  return String(response.data);
}

function fechaEmisionEC(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(d);
  const yyyy = parts.find(p => p.type === 'year')!.value;
  const mm   = parts.find(p => p.type === 'month')!.value;
  const dd   = parts.find(p => p.type === 'day')!.value;
  return `${dd}/${mm}/${yyyy}`;
}
function fechaClaveEC(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(d);
  const yyyy = parts.find(p => p.type === 'year')!.value;
  const mm   = parts.find(p => p.type === 'month')!.value;
  const dd   = parts.find(p => p.type === 'day')!.value;
  return `${dd}${mm}${yyyy}`;
}

async function main() {
  const secuencial = (process.argv[2] ?? '000000900').padStart(9, '0');
  const now = new Date();

  const accessKey = generateAccessKey({
    fechaEmision: fechaClaveEC(now),
    tipoComprobante: '01',
    ruc: '0151950045001',
    ambiente: '1',
    establecimiento: '001',
    puntoEmision: '001',
    secuencial,
    codigoNumerico: generarCodigoNumerico(),
    tipoEmision: '1',
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.0.0">
<infoTributaria>
<ambiente>1</ambiente>
<tipoEmision>1</tipoEmision>
<razonSocial>Jeans Carlos Rodriguez</razonSocial>
<ruc>0151950045001</ruc>
<claveAcceso>${accessKey}</claveAcceso>
<codDoc>01</codDoc>
<estab>001</estab>
<ptoEmi>001</ptoEmi>
<secuencial>${secuencial}</secuencial>
<dirMatriz>Cuenca Ecuador</dirMatriz>
</infoTributaria>
<infoFactura>
<fechaEmision>${fechaEmisionEC(now)}</fechaEmision>
<dirEstablecimiento>Cuenca Ecuador</dirEstablecimiento>
<obligadoContabilidad>SI</obligadoContabilidad>
<tipoIdentificacionComprador>07</tipoIdentificacionComprador>
<razonSocialComprador>CONSUMIDOR FINAL</razonSocialComprador>
<identificacionComprador>9999999999999</identificacionComprador>
<totalSinImpuestos>2.00</totalSinImpuestos>
<totalDescuento>0.00</totalDescuento>
<totalConImpuestos>
<totalImpuesto>
<codigo>2</codigo>
<codigoPorcentaje>4</codigoPorcentaje>
<baseImponible>2.00</baseImponible>
<valor>0.30</valor>
</totalImpuesto>
</totalConImpuestos>
<propina>0.00</propina>
<importeTotal>2.30</importeTotal>
<moneda>DOLAR</moneda>
<pagos>
<pago>
<formaPago>01</formaPago>
<total>2.30</total>
<plazo>0</plazo>
<unidadTiempo>dias</unidadTiempo>
</pago>
</pagos>
</infoFactura>
<detalles>
<detalle>
<codigoPrincipal>TEST01</codigoPrincipal>
<descripcion>Producto de prueba</descripcion>
<unidadMedida>UNIDAD</unidadMedida>
<cantidad>1.000000</cantidad>
<precioUnitario>2.00</precioUnitario>
<descuento>0.00</descuento>
<precioTotalSinImpuesto>2.00</precioTotalSinImpuesto>
<impuestos>
<impuesto>
<codigo>2</codigo>
<codigoPorcentaje>4</codigoPorcentaje>
<tarifa>15</tarifa>
<baseImponible>2.00</baseImponible>
<valor>0.30</valor>
</impuesto>
</impuestos>
</detalle>
</detalles>
</factura>`;

  console.log('=== Clave de acceso ===', accessKey);
  const p12Buffer = fs.readFileSync(P12_PATH);
  const signedXml = signXmlContent(xml, p12Buffer, PASSWORD);
  console.log('=== Firmado y auto-verificado OK (verifySignedXml pasó, si no habría lanzado) ===');

  const localCheck = verifySignedXml(signedXml);
  console.log('=== Verificación local ===', JSON.stringify({ valid: localCheck.valid, sigOk: localCheck.signatureValueValid, digests: localCheck.digests.map(d => `${d.label}:${d.pass}`) }));

  const outPath = path.join(__dirname, `../../live-${secuencial}.xml`);
  fs.writeFileSync(outPath, signedXml, 'utf8');
  console.log('=== XML guardado en ===', outPath);

  const xmlBase64 = Buffer.from(signedXml, 'utf8').toString('base64');

  console.log('\n=== Enviando a RECEPCIÓN (SRI real, ambiente pruebas) ===');
  const receptionResp = await callSriReception(RECEPTION_WSDL, xmlBase64);
  console.log(receptionResp);

  const estadoMatch = receptionResp.match(/<estado>([^<]+)<\/estado>/i);
  const estado = estadoMatch?.[1]?.trim().toUpperCase();
  console.log('\n=== ESTADO RECEPCIÓN ===', estado);

  if (estado !== 'RECIBIDA') {
    console.log('\n=== Rechazada en recepción, no se consulta autorización ===');
    return;
  }

  console.log('\n=== Esperando 5s y consultando AUTORIZACIÓN ===');
  await new Promise(r => setTimeout(r, 5000));
  const authResp = await callSriAuthorization(AUTHORIZATION_WSDL, accessKey);
  console.log(authResp);

  const authEstadoMatch = authResp.match(/<estado>([^<]+)<\/estado>/i);
  console.log('\n=== ESTADO AUTORIZACIÓN ===', authEstadoMatch?.[1]?.trim().toUpperCase());

  const msgMatch = authResp.match(/<informacionAdicional>([^<]*)<\/informacionAdicional>/i);
  if (msgMatch) console.log('=== informacionAdicional ===', msgMatch[1]);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
