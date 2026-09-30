/**
 * sri-authorization.ts
 *
 * Preguntarle al SRI por un comprobante, por su clave de acceso, y quedarse con
 * la autorización **tal como la da el SRI**: estado, número, fecha y el
 * comprobante que autorizó. Lo usa `importInvoices` para no fiarse del XML que
 * se sube: lo que se guarda es lo que devolvió el SRI.
 *
 * Es el mismo servicio (`AutorizacionComprobantesOffline`) y el mismo sobre SOAP
 * que ya usa `checkSriStatus`.
 */

import axios from 'axios';
import * as https from 'https';
import { create } from 'xmlbuilder2';

export const SRI_AUTHORIZATION_URLS = {
  testing: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  production: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
} as const;

export type SriEnvironment = keyof typeof SRI_AUTHORIZATION_URLS;

/** El ambiente al que pertenece una clave de acceso (dígito 24: 1 pruebas, 2 producción). */
export const environmentOfAccessKey = (key: string): SriEnvironment =>
  key.charAt(23) === '2' ? 'production' : 'testing';

export interface SriAuthorizationResult {
  /** El SRI tiene al menos una autorización para esa clave. */
  found: boolean;
  /** `AUTORIZADO`, `NO AUTORIZADO`… de la autorización elegida; '' si no hay. */
  estado: string;
  numeroAutorizacion: string;
  fechaAutorizacion: string;
  /** El primer mensaje del SRI, si trae (sirve para explicar un rechazo). */
  mensaje: string;
  /**
   * La autorización como documento XML propio —`<autorizacion>` con el
   * comprobante en CDATA—, igual a lo que se descarga del portal del SRI. Vacío
   * si no hay autorización.
   */
  authorizedXml: string;
}

const hijos = (e: any): any[] => Array.from(e?.childNodes ?? []).filter((c: any) => c.nodeType === 1);
const descendientes = (e: any): any[] => hijos(e).flatMap((c) => [c, ...descendientes(c)]);
const hijo = (e: any, n: string) => hijos(e).find((c) => c.localName === n);
const textoHijo = (e: any, n: string) => (hijo(e, n)?.textContent ?? '').trim();

/**
 * Lee la respuesta SOAP del SRI. Si hay varias autorizaciones (un intento
 * rechazado y luego uno autorizado), se queda con la AUTORIZADA; si ninguna lo
 * está, con la primera, para poder explicar por qué no.
 */
export function parseSriAuthorizationResponse(soap: string): SriAuthorizationResult {
  const vacio: SriAuthorizationResult = {
    found: false, estado: '', numeroAutorizacion: '', fechaAutorizacion: '', mensaje: '', authorizedXml: '',
  };
  let raiz: any;
  try {
    raiz = (create(soap.trim()).node as any).documentElement;
  } catch {
    throw new Error('El SRI devolvió una respuesta que no es XML.');
  }
  const autorizaciones = descendientes(raiz).filter((e) => e.localName === 'autorizacion');
  if (autorizaciones.length === 0) return vacio;

  const elegida = autorizaciones.find((a) => textoHijo(a, 'estado').toUpperCase() === 'AUTORIZADO') ?? autorizaciones[0];
  const estado = textoHijo(elegida, 'estado').toUpperCase();
  const numero = textoHijo(elegida, 'numeroAutorizacion');
  const fecha = textoHijo(elegida, 'fechaAutorizacion');
  const ambiente = textoHijo(elegida, 'ambiente');
  const comprobante = (hijo(elegida, 'comprobante')?.textContent ?? '').trim();
  // El SRI anida `<mensajes><mensaje><identificador/><mensaje>texto</mensaje>…`:
  // el texto es el `mensaje` que ya no tiene hijos.
  const mensaje = (descendientes(elegida).find((e) => e.localName === 'mensaje' && hijos(e).length === 0)?.textContent ?? '').trim();

  // CDATA no admite `]]>` dentro: se parte, como se hace siempre.
  const cdata = comprobante.split(']]>').join(']]]]><![CDATA[>');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const authorizedXml = comprobante
    ? '<?xml version="1.0" encoding="UTF-8"?>\n<autorizacion>\n' +
      `  <estado>${esc(estado)}</estado>\n` +
      `  <numeroAutorizacion>${esc(numero)}</numeroAutorizacion>\n` +
      `  <fechaAutorizacion>${esc(fecha)}</fechaAutorizacion>\n` +
      (ambiente ? `  <ambiente>${esc(ambiente)}</ambiente>\n` : '') +
      `  <comprobante><![CDATA[${cdata}]]></comprobante>\n` +
      '</autorizacion>\n'
    : '';

  return { found: true, estado, numeroAutorizacion: numero, fechaAutorizacion: fecha, mensaje, authorizedXml };
}

/**
 * Conexión nueva en cada consulta. Desde Node 20 el agente reutiliza sockets
 * (`keepAlive`), y el SRI cierra los inactivos: reutilizar uno ya cerrado da
 * `ECONNRESET` (visto el 2026-09-30 en la primera importación real).
 */
const sriAgent = new https.Agent({ keepAlive: false });

/** Esperas entre intentos cuando el SRI corta la conexión o no contesta. */
const RETRY_DELAYS_MS = [1000, 3000];

/** Fallo de red (sin respuesta HTTP): vale la pena reintentar. Un 4xx/5xx del SRI, no. */
export function isNetworkError(e: any): boolean {
  return !e?.response && ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'ERR_SOCKET_CONNECTION_TIMEOUT']
    .includes(String(e?.code ?? ''));
}

/**
 * Pregunta al SRI por la clave. Reintenta dos veces si el SRI corta la conexión
 * o no contesta, como hace `sendToSri`; si aun así no responde, lanza.
 */
export async function querySriAuthorization(accessKey: string, wsdlUrl: string): Promise<SriAuthorizationResult> {
  for (let intento = 0; ; intento++) {
    try {
      return await querySriAuthorizationOnce(accessKey, wsdlUrl);
    } catch (e) {
      if (intento >= RETRY_DELAYS_MS.length || !isNetworkError(e)) throw e;
      console.warn('[sri-authorization] El SRI no respondió; reintento', { accessKey, intento: intento + 1, code: (e as any)?.code });
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[intento]));
    }
  }
}

async function querySriAuthorizationOnce(accessKey: string, wsdlUrl: string): Promise<SriAuthorizationResult> {
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion">
      <claveAccesoComprobante>${accessKey}</claveAccesoComprobante>
    </ns2:autorizacionComprobante>
  </soap:Body>
</soap:Envelope>`;
  const res = await axios.post(wsdlUrl.replace('?wsdl', ''), soap, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', SOAPAction: '' },
    timeout: 30000,
    responseType: 'text',
    httpsAgent: sriAgent,
  });
  return parseSriAuthorizationResponse(String(res.data));
}
