import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';

// Default SRI WS authorization URLs
const SRI_AUTH_DEFAULTS = {
  testing:    'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  production: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
};

type SriDocType = 'invoice' | 'retention' | 'debitNote';

const COLLECTION_MAP: Record<SriDocType, string> = {
  invoice:   'invoices',
  retention: 'retentions',
  debitNote: 'debitNotes',
};

const DOC_LABEL: Record<SriDocType, string> = {
  invoice:   'Factura',
  retention: 'Retención',
  debitNote: 'Nota de Débito',
};

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

function parseAuthorizationResponse(soapResponse: string): {
  authorizationNumber: string | null;
  authorizedAt: Date | null;
  estado: string;
  mensaje: string;
} {
  const numMatch    = soapResponse.match(/<numeroAutorizacion>([^<]+)<\/numeroAutorizacion>/i);
  const fechaMatch  = soapResponse.match(/<fechaAutorizacion>([^<]+)<\/fechaAutorizacion>/i);
  const estadoMatch = soapResponse.match(/<estado>([^<]+)<\/estado>/i);
  const mensajeMatch = soapResponse.match(/<mensaje>([^<]+)<\/mensaje>/i);

  const authorizationNumber = numMatch?.[1]?.trim() ?? null;
  const fechaStr = fechaMatch?.[1]?.trim() ?? null;
  const estado   = estadoMatch?.[1]?.trim().toUpperCase() ?? 'DESCONOCIDO';
  const mensaje  = mensajeMatch?.[1]?.trim() ?? '';

  let authorizedAt: Date | null = null;
  if (fechaStr) {
    const isoAttempt = new Date(fechaStr);
    if (!isNaN(isoAttempt.getTime())) {
      authorizedAt = isoAttempt;
    } else {
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

/**
 * checkSriStatus
 *
 * Callable: queries the SRI WS directly to check the authorization status of
 * any electronic document (invoice, retention, debitNote) by its access key.
 * Updates the document in Firestore with the latest status.
 *
 * Params:
 *   documentId   — ID of the document (also accepts `invoiceId` for backward compat)
 *   companyId    — company ID
 *   documentType — 'invoice' | 'retention' | 'debitNote' (default: 'invoice')
 */
export const checkSriStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const data = request.data as {
    documentId?:   string;
    invoiceId?:    string;   // backward compat
    companyId:     string;
    documentType?: string;
  };

  const documentId = data.documentId ?? data.invoiceId;
  const { companyId } = data;
  const docType = (data.documentType as SriDocType | undefined) ?? 'invoice';

  if (!documentId || typeof documentId !== 'string') {
    throw new HttpsError('invalid-argument', 'documentId es requerido.');
  }
  if (!companyId || typeof companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }
  if (!COLLECTION_MAP[docType]) {
    throw new HttpsError('invalid-argument', `documentType inválido: ${docType}`);
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }

  const db         = admin.firestore();
  const collection = COLLECTION_MAP[docType];
  const docLabel   = DOC_LABEL[docType];

  // ── Read document ─────────────────────────────────────────────────────────
  const docSnap = await db.doc(`companies/${companyId}/${collection}/${documentId}`).get();
  if (!docSnap.exists) {
    throw new HttpsError('not-found', `${docLabel} no encontrada: ${documentId}`);
  }

  const doc = docSnap.data() as Record<string, any>;
  const accessKey: string | undefined = doc['accessKey'];

  if (!accessKey) {
    throw new HttpsError(
      'failed-precondition',
      `${docLabel} sin clave de acceso. Debe generarse el XML primero.`
    );
  }

  // ── Read SRI environment ─────────────────────────────────────────────────
  const companySnap = await db.doc(`companies/${companyId}`).get();
  const companyData = companySnap.data() as Record<string, any> | undefined;
  const environment: 'testing' | 'production' =
    companyData?.['sri']?.['environment'] === 'production' ? 'production' : 'testing';

  let authorizationUrl = SRI_AUTH_DEFAULTS[environment];
  try {
    const configSnap = await db.doc('platform/defaults/sriConfig/data').get();
    const config = configSnap.data() as Record<string, any> | undefined;
    const fromDb  = config?.['endpoints']?.[environment]?.['authorizationUrl'];
    if (fromDb) authorizationUrl = fromDb;
  } catch { /* use default */ }

  console.log('[checkSriStatus] Consultando SRI:', { documentId, docType, companyId, environment, accessKey });

  // ── Call SRI WS ──────────────────────────────────────────────────────────
  let soapResponse: string;
  try {
    soapResponse = await callSriAuthorization(authorizationUrl, accessKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error de red al consultar SRI';
    console.error('[checkSriStatus] Error SOAP:', err);
    throw new HttpsError('unavailable', `Error al consultar el SRI: ${msg}`);
  }

  const result = parseAuthorizationResponse(soapResponse);
  console.log('[checkSriStatus] Respuesta SRI:', result);

  // ── Update Firestore ─────────────────────────────────────────────────────
  const now = admin.firestore.Timestamp.now();
  const update: Record<string, any> = { updatedAt: now };

  if (result.estado === 'AUTORIZADO' && result.authorizationNumber) {
    update['sriStatus']           = 'authorized';
    update['authorizationNumber'] = result.authorizationNumber;
    update['sriError']            = null;
    if (result.authorizedAt) {
      update['authorizedAt'] = admin.firestore.Timestamp.fromDate(result.authorizedAt);
    }
  } else if (result.estado === 'NO AUTORIZADO' || result.estado === 'RECHAZADO') {
    update['sriStatus'] = 'rejected';
    update['sriError']  = result.mensaje || 'Rechazado por SRI';
  }
  // PENDIENTE or unknown — no state change

  if (Object.keys(update).length > 1) {
    await db.doc(`companies/${companyId}/${collection}/${documentId}`).update(update);
  }

  return {
    sriStatus:           update['sriStatus'] ?? doc['sriStatus'],
    authorizationNumber: update['authorizationNumber'] ?? doc['authorizationNumber'] ?? null,
    estado:              result.estado,
    mensaje:             result.mensaje,
  };
});
