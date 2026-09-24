import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { getStorage } from 'firebase-admin/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SriEndpoints {
  receptionUrl: string;
  authorizationUrl: string;
}

interface SriPlatformConfig {
  endpoints: {
    testing: SriEndpoints;
    production: SriEndpoints;
  };
}

// Default SRI web service URLs (Ecuador)
const SRI_DEFAULTS = {
  testing: {
    receptionUrl:    'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    authorizationUrl:'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
  production: {
    receptionUrl:    'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    authorizationUrl:'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
};

// ─── SOAP calls ───────────────────────────────────────────────────────────────

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
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      'SOAPAction': '',
    },
    timeout: 30000,
    // Aceptar cualquier HTTP status: el SRI a veces devuelve 500 con un SOAP Fault
    // en el body. Sin esto axios lanza la excepción y perdemos el cuerpo de respuesta.
    validateStatus: () => true,
  });
  if (response.status >= 500) {
    console.warn('[send-to-sri] SRI recepción HTTP', response.status, '— body:', String(response.data).substring(0, 1000));
  }
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
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      'SOAPAction': '',
    },
    timeout: 30000,
    validateStatus: () => true,
  });
  if (response.status >= 500) {
    console.warn('[send-to-sri] SRI autorización HTTP', response.status, '— body:', String(response.data).substring(0, 1000));
  }
  return String(response.data);
}

// ─── Response parsers ─────────────────────────────────────────────────────────

interface SriMessage {
  identificador?: string;
  mensaje: string;
  informacionAdicional?: string;
  tipo?: string;
}

/**
 * Extrae TODOS los <mensaje> (con sus hijos identificador/mensaje/informacionAdicional/tipo)
 * de una respuesta SOAP del SRI. Tanto recepción como autorización pueden devolver varios
 * mensajes a la vez (ej. múltiples errores de validación); los parsers anteriores solo
 * tomaban el primero, perdiendo detalle útil para diagnóstico (identificador, informacionAdicional).
 */
function parseAllMessages(soapResponse: string): SriMessage[] {
  const messages: SriMessage[] = [];
  const blockRe = /<mensaje>\s*(?:<identificador>([^<]*)<\/identificador>\s*)?<mensaje>([^<]*)<\/mensaje>\s*(?:<informacionAdicional>([^<]*)<\/informacionAdicional>\s*)?(?:<tipo>([^<]*)<\/tipo>\s*)?<\/mensaje>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(soapResponse)) !== null) {
    messages.push({
      identificador: m[1]?.trim() || undefined,
      mensaje: m[2]?.trim() ?? '',
      informacionAdicional: m[3]?.trim() || undefined,
      tipo: m[4]?.trim() || undefined,
    });
  }
  return messages;
}

function parseReceptionState(soapResponse: string): { state: string; mensaje: string; detalle: string } {
  // SOAP Fault (HTTP 500): el SRI retorna <faultstring> en vez de <estado>
  const faultMatch = soapResponse.match(/<faultstring>([^<]+)<\/faultstring>/i);
  if (faultMatch) {
    return { state: 'FAULT', mensaje: faultMatch[1].trim(), detalle: '' };
  }

  const estadoMatch      = soapResponse.match(/<estado>([^<]+)<\/estado>/i);
  const mensajeMatch     = soapResponse.match(/<mensaje>([^<]+)<\/mensaje>/i);
  const informacionMatch = soapResponse.match(/<informacionAdicional>([^<]+)<\/informacionAdicional>/i);

  const state   = estadoMatch?.[1]?.trim().toUpperCase() ?? 'DESCONOCIDO';
  const mensaje = mensajeMatch?.[1]?.trim() ?? 'Sin detalle';
  const detalle = informacionMatch?.[1]?.trim() ?? '';
  return { state, mensaje, detalle };
}

function parseAuthorizationResponse(soapResponse: string): {
  authorizationNumber: string | null;
  authorizedAt: Date | null;
  estado: string;
  mensaje: string;
} {
  const numMatch   = soapResponse.match(/<numeroAutorizacion>([^<]+)<\/numeroAutorizacion>/i);
  const fechaMatch = soapResponse.match(/<fechaAutorizacion>([^<]+)<\/fechaAutorizacion>/i);
  const estadoMatch = soapResponse.match(/<estado>([^<]+)<\/estado>/i);
  const mensajeMatch = soapResponse.match(/<mensaje>([^<]+)<\/mensaje>/i);

  const authorizationNumber = numMatch?.[1]?.trim() ?? null;
  const fechaStr = fechaMatch?.[1]?.trim() ?? null;
  const estado = estadoMatch?.[1]?.trim().toUpperCase() ?? 'DESCONOCIDO';
  const mensaje = mensajeMatch?.[1]?.trim() ?? '';

  let authorizedAt: Date | null = null;
  if (fechaStr) {
    // SRI returns datetime in format "dd/MM/yyyy HH:mm:ss" or ISO
    const isoAttempt = new Date(fechaStr);
    if (!isNaN(isoAttempt.getTime())) {
      authorizedAt = isoAttempt;
    } else {
      // Try "dd/MM/yyyy HH:mm:ss"
      const parts = fechaStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (parts) {
        authorizedAt = new Date(
          `${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}:${parts[5]}:${parts[6]}-05:00`
        );
      }
    }
  }

  return { authorizationNumber, authorizedAt, estado, mensaje };
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  backoffMs: number[]
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = backoffMs[attempt] ?? backoffMs[backoffMs.length - 1];
        console.warn(`[send-to-sri] Intento ${attempt + 1} fallido. Reintentando en ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ─── Document-type config ─────────────────────────────────────────────────────

type SriDocType = 'invoice' | 'retention' | 'debitNote' | 'creditNote';

interface DocTypeConfig {
  collection: string;
  signedXmlPath: (id: string, companyId: string) => string;
  docLabel: string;
}

const DOC_TYPE_CONFIGS: Record<SriDocType, DocTypeConfig> = {
  invoice: {
    collection: 'invoices',
    signedXmlPath: (id, cid) => `companies/${cid}/xml/${id}-signed.xml`,
    docLabel: 'Factura',
  },
  retention: {
    collection: 'retentions',
    signedXmlPath: (id, cid) => `companies/${cid}/xml/ret-${id}-signed.xml`,
    docLabel: 'Retención',
  },
  debitNote: {
    collection: 'debitNotes',
    signedXmlPath: (id, cid) => `companies/${cid}/xml/dn-${id}-signed.xml`,
    docLabel: 'Nota de Débito',
  },
  creditNote: {
    collection: 'invoices',                                              // NC viven en la misma colección que facturas
    signedXmlPath: (id, cid) => `companies/${cid}/xml/${id}-signed.xml`, // sign-xml.ts guarda con {invoiceId}-signed.xml
    docLabel: 'Nota de Crédito',
  },
};

// ─── Core logic (exported for internal use by orchestrator) ───────────────────

/**
 * Unified sendToSri handler for all document types.
 * docType defaults to 'invoice' for backward compatibility.
 */
export async function sendToSriInternal(
  documentId: string,
  companyId: string,
  docType: SriDocType = 'invoice'
): Promise<{ documentId: string; companyId: string; sriStatus: string; authorizationNumber?: string; authorizedAt?: Date; estado?: string; mensaje?: string; detalle?: string; sriError?: string; nextStep?: string }> {
  const db = admin.firestore();
  const bucket = getStorage().bucket();
  const now = admin.firestore.Timestamp.now();
  const cfg = DOC_TYPE_CONFIGS[docType];
  const docPath = `companies/${companyId}/${cfg.collection}/${documentId}`;

  console.log('[send-to-sri] Inicio:', { documentId, companyId, docType });

  // 1. Read document
  const docSnap = await db.doc(docPath).get();
  if (!docSnap.exists) {
    throw new Error(`${cfg.docLabel} no encontrada: ${documentId}`);
  }
  const accessKey: string = (docSnap.data() as Record<string, any>)['accessKey'];
  if (!accessKey) {
    throw new Error(`${cfg.docLabel} sin clave de acceso. Ejecute generateXml primero.`);
  }

  // 2. Read Company to get environment
  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) throw new Error(`Empresa no encontrada: ${companyId}`);
  // Solo 'production' manda al SRI de verdad. Todo lo demás es pruebas, y eso
  // incluye los valores viejos: hay empresas dadas de alta con '1', el código
  // del SRI, y con ese valor `SRI_DEFAULTS[environment]` quedaba en undefined y
  // el envío moría con un error que no decía nada (visto el 2026-09-24).
  const environment: 'testing' | 'production' =
    `${(companySnap.data() as Record<string, any>)['sri']?.['environment'] ?? ''}` ===
    'production'
      ? 'production'
      : 'testing';

  // 3. Read platform SRI config for endpoints
  const platformConfigSnap = await db.doc('platform/defaults/sriConfig/data').get();
  const platformConfig = platformConfigSnap.exists
    ? (platformConfigSnap.data() as SriPlatformConfig)
    : null;
  const endpoints: SriEndpoints =
    platformConfig?.endpoints?.[environment] ?? SRI_DEFAULTS[environment];

  console.log('[send-to-sri] Entorno:', environment, '| URL:', endpoints.receptionUrl);

  // 4. Download signed XML from Storage
  const signedXmlPath = cfg.signedXmlPath(documentId, companyId);
  let xmlBuffer: Buffer;
  try {
    [xmlBuffer] = await bucket.file(signedXmlPath).download();
    console.log('[send-to-sri] XML firmado descargado, bytes:', xmlBuffer.length);
  } catch (err) {
    console.error('[send-to-sri] Error descargando XML firmado:', err);
    throw new Error('No se encontró el XML firmado en Storage. Ejecute signXml primero.');
  }

  // 5. Convert to base64 and log XML preview for diagnosis
  const xmlText = xmlBuffer.toString('utf8');
  console.log('[send-to-sri] === XML FIRMADO — primeros 3000 chars ===');
  console.log(xmlText.substring(0, 3000));
  console.log('[send-to-sri] === FIN PREVIEW — total chars:', xmlText.length, '===');

  // Quick structural checks
  const hasSignature    = xmlText.includes('<ds:Signature');
  const hasFactura      = xmlText.includes('<factura ') || xmlText.includes('<factura>');
  const hasFirmaOK      = xmlText.includes('</ds:Signature>');
  console.log('[send-to-sri] Checks — hasFactura:', hasFactura, '| hasSignature:', hasSignature, '| firmaCompleta:', hasFirmaOK);

  const xmlBase64 = Buffer.from(xmlText, 'utf8').toString('base64');

  // 6. Send to SRI reception (retry 3 times: 1s, 2s, 4s backoff)
  let receptionResponse: string;
  try {
    receptionResponse = await withRetry(
      () => callSriReception(endpoints.receptionUrl, xmlBase64),
      3,
      [1000, 2000, 4000]
    );
  } catch (err) {
    console.error('[send-to-sri] Error de red en recepción SRI:', err);
    await db.doc(docPath).update({
      sriStatus: 'rejected',
      sriError: `Error de red: ${err instanceof Error ? err.message : String(err)}`,
      updatedAt: now,
    });
    const sriError = `Error de red: ${err instanceof Error ? err.message : String(err)}`;
    return { documentId, companyId, sriStatus: 'rejected', sriError };
  }

  // 7. Parse reception state — log full SOAP response for diagnosis
  console.log('[send-to-sri] === SOAP RESPUESTA RECEPCIÓN (primeros 2000 chars) ===');
  console.log(receptionResponse.substring(0, 2000));
  console.log('[send-to-sri] === FIN RESPUESTA ===');

  const { state: receptionState, mensaje: receptionMensaje, detalle: receptionDetalle } = parseReceptionState(receptionResponse);
  const receptionMessages = parseAllMessages(receptionResponse);
  console.log('[send-to-sri] Estado recepción:', receptionState, '|', receptionMensaje, '| Detalle:', receptionDetalle);

  // El SRI devuelve «CLAVE ACCESO REGISTRADA» (identificador 43) cuando ya
  // recibió ese comprobante antes. No es un rechazo: casi siempre significa que
  // el primer envío llegó y quedó autorizado, y lo que falló fue algo posterior
  // de nuestro lado. Si eso se tratara como rechazo, el reenvío dejaría la
  // factura marcada como rechazada aquí y autorizada en el SRI, con números que
  // no cuadran. Se sigue a consultar la autorización, que trae la original.
  const claveYaRegistrada = receptionMessages.some(
    (m) =>
      m.identificador?.trim() === '43' ||
      /CLAVE ACCESO REGISTRADA/i.test(`${m.mensaje ?? ''}`),
  );
  if (claveYaRegistrada) {
    console.log('[send-to-sri] El SRI ya tenía esta clave. Se consulta su autorización.');
  }

  if (receptionState !== 'RECIBIDA' && !claveYaRegistrada) {
    const sriError = receptionDetalle
      ? `${receptionMensaje}: ${receptionDetalle}`
      : receptionMensaje;
    await db.doc(docPath).update({
      sriStatus: 'rejected',
      sriError,
      sriReceptionResponse: receptionResponse,
      sriMessages: receptionMessages,
      updatedAt: now,
    });
    return { documentId, companyId, sriStatus: 'rejected', estado: receptionState, mensaje: receptionMensaje, detalle: receptionDetalle, sriError };
  }

  // 8. Query authorization
  console.log('[send-to-sri] Comprobante RECIBIDA. Consultando autorización...');
  let authResponse: string;
  try {
    await new Promise(resolve => setTimeout(resolve, 5000));
    authResponse = await withRetry(
      () => callSriAuthorization(endpoints.authorizationUrl, accessKey),
      1,
      [5000]
    );
  } catch (err) {
    console.error('[send-to-sri] Error consultando autorización:', err);
    const sriError = `Comprobante recibido, error al consultar autorización: ${err instanceof Error ? err.message : String(err)}`;
    await db.doc(docPath).update({
      sriStatus: 'pending',
      sriError,
      sriReceptionResponse: receptionResponse,
      updatedAt: now,
    });
    return { documentId, companyId, sriStatus: 'pending', sriError };
  }

  // 9. Parse authorization response
  const { authorizationNumber, authorizedAt, estado, mensaje } = parseAuthorizationResponse(authResponse);
  const authMessages = parseAllMessages(authResponse);
  console.log('[send-to-sri] Estado autorización:', estado, '| número:', authorizationNumber);

  if (estado === 'AUTORIZADO' && authorizationNumber) {
    await db.doc(docPath).update({
      sriStatus: 'authorized',
      authorizationNumber,
      authorizedAt: authorizedAt ? admin.firestore.Timestamp.fromDate(authorizedAt) : now,
      sriError: admin.firestore.FieldValue.delete(),
      sriReceptionResponse: receptionResponse,
      sriAuthorizationResponse: authResponse,
      sriMessages: authMessages,
      updatedAt: now,
    });
    console.log('[send-to-sri]', cfg.docLabel, 'AUTORIZADA:', authorizationNumber);
    return {
      documentId,
      companyId,
      sriStatus: 'authorized',
      authorizationNumber,
      authorizedAt: authorizedAt ?? new Date(),
      estado,
      mensaje,
      nextStep: 'generatePdf',
    };
  }

  const sriError = mensaje || `Estado de autorización: ${estado}`;
  await db.doc(docPath).update({
    sriStatus: 'rejected',
    sriError,
    sriReceptionResponse: receptionResponse,
    sriAuthorizationResponse: authResponse,
    sriMessages: authMessages,
    updatedAt: now,
  });
  console.warn('[send-to-sri]', cfg.docLabel, 'NO autorizada:', sriError);
  return { documentId, companyId, sriStatus: 'rejected', estado, mensaje, sriError };
}

// ─── Callable function (unified for all document types) ───────────────────────

export const sendToSri = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const {
    invoiceId,      // legacy param
    documentId,     // new param
    documentType,   // 'invoice' | 'retention' | 'debitNote'
    companyId,
  } = request.data as {
    invoiceId?: string;
    documentId?: string;
    documentType?: string;
    companyId: string;
  };

  const id = documentId ?? invoiceId;
  const docType = (documentType as SriDocType | undefined) ?? 'invoice';

  if (!id || typeof id !== 'string') {
    throw new HttpsError('invalid-argument', 'documentId es requerido.');
  }
  if (!companyId || typeof companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }
  if (!DOC_TYPE_CONFIGS[docType]) {
    throw new HttpsError('invalid-argument', `documentType inválido: ${docType}`);
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }

  try {
    return await sendToSriInternal(id, companyId, docType);
  } catch (err) {
    console.error('[send-to-sri] Error callable:', err);
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Error enviando al SRI');
  }
});
