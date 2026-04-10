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
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      'SOAPAction': '',
    },
    timeout: 30000,
  });
  return String(response.data);
}

// ─── Response parsers ─────────────────────────────────────────────────────────

function parseReceptionState(soapResponse: string): { state: string; mensaje: string } {
  const estadoMatch = soapResponse.match(/<estado>([^<]+)<\/estado>/i);
  const mensajeMatch = soapResponse.match(/<mensaje>([^<]+)<\/mensaje>/i);
  const informacionMatch = soapResponse.match(/<informacionAdicional>([^<]+)<\/informacionAdicional>/i);

  const state = estadoMatch?.[1]?.trim().toUpperCase() ?? 'DESCONOCIDO';
  const mensaje = mensajeMatch?.[1]?.trim() ?? informacionMatch?.[1]?.trim() ?? 'Sin detalle';
  return { state, mensaje };
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

type SriDocType = 'invoice' | 'retention' | 'debitNote';

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
): Promise<{ sriStatus: string; authorizationNumber?: string; authorizedAt?: Date; sriError?: string }> {
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
  const environment: 'testing' | 'production' =
    (companySnap.data() as Record<string, any>)['sri']?.['environment'] ?? 'testing';

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

  // 5. Convert to base64
  const xmlBase64 = xmlBuffer.toString('base64');

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
    return { sriStatus: 'rejected', sriError: `Error de red: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 7. Parse reception state
  const { state: receptionState, mensaje: receptionMensaje } = parseReceptionState(receptionResponse);
  console.log('[send-to-sri] Estado recepción:', receptionState, '|', receptionMensaje);

  if (receptionState !== 'RECIBIDA') {
    const sriError = `Rechazado en recepción: ${receptionMensaje}`;
    await db.doc(docPath).update({ sriStatus: 'rejected', sriError, updatedAt: now });
    return { sriStatus: 'rejected', sriError };
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
    await db.doc(docPath).update({
      sriStatus: 'pending',
      sriError: `Comprobante recibido, error al consultar autorización: ${err instanceof Error ? err.message : String(err)}`,
      updatedAt: now,
    });
    return { sriStatus: 'pending', sriError: `Error autorización: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 9. Parse authorization response
  const { authorizationNumber, authorizedAt, estado, mensaje } = parseAuthorizationResponse(authResponse);
  console.log('[send-to-sri] Estado autorización:', estado, '| número:', authorizationNumber);

  if (estado === 'AUTORIZADO' && authorizationNumber) {
    await db.doc(docPath).update({
      sriStatus: 'authorized',
      authorizationNumber,
      authorizedAt: authorizedAt ? admin.firestore.Timestamp.fromDate(authorizedAt) : now,
      sriError: admin.firestore.FieldValue.delete(),
      updatedAt: now,
    });
    console.log('[send-to-sri]', cfg.docLabel, 'AUTORIZADA:', authorizationNumber);
    return { sriStatus: 'authorized', authorizationNumber, authorizedAt: authorizedAt ?? new Date() };
  }

  const sriError = mensaje || `Estado de autorización: ${estado}`;
  await db.doc(docPath).update({ sriStatus: 'rejected', sriError, updatedAt: now });
  console.warn('[send-to-sri]', cfg.docLabel, 'NO autorizada:', sriError);
  return { sriStatus: 'rejected', sriError };
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
