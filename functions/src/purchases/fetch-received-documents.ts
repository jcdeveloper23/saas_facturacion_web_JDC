/**
 * fetchReceivedDocuments
 *
 * Importar compras desde el reporte de «Comprobantes recibidos» del SRI
 * (2026-10-22). Ese TXT solo trae la clave de acceso y los totales de cada
 * factura; para registrar la compra con sus líneas hace falta el XML, y el
 * navegador no puede preguntarle al SRI (no tiene CORS). Esta callable recibe
 * las claves, le pide al SRI cada comprobante autorizado y lo devuelve.
 *
 * No escribe nada: las compras las crea Conecta como borrador, igual que con
 * «Importar XML», para que el contador revise sustento y cuentas.
 *
 * Por cada clave comprueba: forma y dígito verificador, que sea una factura
 * (codDoc 01), que sea de producción, que el SRI la tenga AUTORIZADA y que el
 * comprador sea la empresa (por su RUC; una persona natural compra también con
 * su cédula).
 *
 * Quién: los que registran compras (admin, vendedor y contador), como
 * `canWritePurchases()` en las reglas.
 *
 * Request:  { companyId, accessKeys: string[] } — hasta 25 por llamada.
 * Response: { results: [{ accessKey, status, reason?, xml? }] }
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { requireCompanyRole } from '../utils/callable-auth';
import { calculateModulo11 } from '../utils/sri-access-key';
import { SriXmlError, parseSriXml } from '../utils/sri-xml-import';
import {
  SriAuthorizationResult, environmentOfAccessKey, querySriAuthorization,
} from '../utils/sri-authorization';
import { authorizationUrls } from '../invoices/import-invoices';

export const MAX_KEYS = 25;
/** Consultas al SRI a la vez. */
const SRI_CONCURRENCY = 4;

export type ReceivedStatus =
  | 'ok' | 'invalid_key' | 'not_invoice' | 'testing' | 'not_authorized'
  | 'other_company' | 'invalid' | 'sri_unavailable';

export interface ReceivedResult {
  accessKey: string;
  status: ReceivedStatus;
  reason?: string;
  /** La autorización del SRI con el comprobante dentro, solo si `ok`. */
  xml?: string;
}

/** ¿Es el mismo contribuyente? 0106594385 y 0106594385001 son la misma persona. */
export function sameTaxpayer(a: string, b: string): boolean {
  const base = (id: string) => {
    const x = id.trim();
    return /^\d{10}001$/.test(x) ? x.slice(0, 10) : x;
  };
  return base(a) === base(b);
}

/** Lo que se puede decir de la clave antes de preguntarle al SRI; null si sirve. */
export function keyProblem(key: string): ReceivedResult | null {
  if (!/^\d{49}$/.test(key)) {
    return { accessKey: key, status: 'invalid_key', reason: 'La clave de acceso no tiene 49 dígitos.' };
  }
  if (calculateModulo11(key.slice(0, 48)) !== +key[48]) {
    return { accessKey: key, status: 'invalid_key', reason: 'El dígito verificador de la clave de acceso no cuadra.' };
  }
  if (key.slice(8, 10) !== '01') {
    return { accessKey: key, status: 'not_invoice', reason: 'No es una factura: solo se importan facturas como compras.' };
  }
  if (environmentOfAccessKey(key) !== 'production') {
    return { accessKey: key, status: 'testing',
      reason: 'Se emitió en el ambiente de pruebas del SRI: no tiene validez tributaria.' };
  }
  return null;
}

/** Con la respuesta del SRI, el resultado de una clave. */
export function classifyReceived(key: string, sri: SriAuthorizationResult, companyRuc: string): ReceivedResult {
  if (!sri.found) {
    return { accessKey: key, status: 'not_authorized', reason: 'El SRI no tiene ningún comprobante con esta clave de acceso.' };
  }
  if (sri.estado !== 'AUTORIZADO' || !sri.authorizedXml) {
    return { accessKey: key, status: 'not_authorized',
      reason: `El SRI lo tiene en estado ${sri.estado || 'desconocido'}${sri.mensaje ? `: ${sri.mensaje}` : ''}.` };
  }
  let doc;
  try {
    doc = parseSriXml(sri.authorizedXml);
  } catch (e) {
    return { accessKey: key, status: 'invalid',
      reason: `El comprobante que devolvió el SRI no se pudo leer: ${e instanceof SriXmlError ? e.message : String(e)}` };
  }
  if (doc.accessKey !== key || doc.codDoc !== '01') {
    return { accessKey: key, status: 'invalid', reason: 'El comprobante que devolvió el SRI no coincide con la clave.' };
  }
  if (!sameTaxpayer(doc.buyerId, companyRuc)) {
    return { accessKey: key, status: 'other_company',
      reason: `La factura está a nombre de ${doc.buyerName || 'otro comprador'} (${doc.buyerId}), no de la empresa (${companyRuc}).` };
  }
  return { accessKey: key, status: 'ok', xml: sri.authorizedXml };
}

function readInput(data: any): { companyId: string; keys: string[] } {
  const companyId = typeof data?.companyId === 'string' ? data.companyId.trim() : '';
  if (!companyId) throw new HttpsError('invalid-argument', 'Falta la empresa.');
  const raw = Array.isArray(data?.accessKeys) ? data.accessKeys : null;
  if (!raw || raw.length === 0) throw new HttpsError('invalid-argument', 'No llegó ninguna clave de acceso.');
  if (raw.length > MAX_KEYS) throw new HttpsError('invalid-argument', `Como máximo ${MAX_KEYS} claves por envío.`);
  const keys = [...new Set(raw.map((k: unknown) => String(k ?? '').trim()))] as string[];
  return { companyId, keys };
}

/** Corre `fn` sobre `items` con, como mucho, `n` a la vez, conservando el orden. */
async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export const fetchReceivedDocuments = onCall(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (request): Promise<{ results: ReceivedResult[] }> => {
    const { companyId, keys } = readInput(request.data);
    requireCompanyRole(request, companyId, ['admin', 'seller', 'accountant']);

    const db = admin.firestore();
    const company = (await db.doc(`companies/${companyId}`).get()).data() as any;
    if (!company) throw new HttpsError('not-found', 'La empresa no existe.');
    const companyRuc = String(company?.sri?.ruc ?? company?.ruc ?? '').trim();
    if (!companyRuc) {
      throw new HttpsError('failed-precondition',
        'La empresa no tiene RUC en su configuración del SRI: sin él no se puede comprobar que las facturas sean suyas.');
    }
    const urls = await authorizationUrls(db);

    const results = await mapLimit(keys, SRI_CONCURRENCY, async (key): Promise<ReceivedResult> => {
      const problem = keyProblem(key);
      if (problem) return problem;
      try {
        const sri = await querySriAuthorization(key, urls.production);
        return classifyReceived(key, sri, companyRuc);
      } catch (e: any) {
        console.warn('[fetchReceivedDocuments] El SRI no respondió', {
          companyId, accessKey: key, error: e?.message, code: e?.code, status: e?.response?.status,
        });
        return { accessKey: key, status: 'sri_unavailable', reason: 'El SRI no respondió. Se puede volver a intentar más tarde.' };
      }
    });
    console.log('[fetchReceivedDocuments]', {
      companyId, keys: keys.length,
      ok: results.filter((r) => r.status === 'ok').length,
    });
    return { results };
  },
);
