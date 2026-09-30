/**
 * importInvoices
 *
 * Importa facturas y notas de crédito que la empresa ya emitió en otro sistema
 * y que el SRI ya autorizó. Antes lo escribía Conectate desde el navegador, y
 * para eso las reglas dejaban crear una factura ya «autorizada»: cualquiera con
 * permiso de escritura podía inventarse una. Ahora lo hace esta callable, y las
 * reglas ya no lo permiten (decisión del 2026-09-30).
 *
 * Por cada XML:
 *   1. lo vuelve a leer y valida su forma: RUC de la empresa, clave de acceso
 *      que cuadra con el comprobante, solo facturas (01) y notas de crédito (04);
 *   2. **le pregunta al SRI** por la clave y solo sigue si responde AUTORIZADO;
 *      desde ahí usa **el comprobante que devolvió el SRI**, no el subido;
 *   3. descarta los duplicados, por clave y por número;
 *   4. escribe en una transacción la factura (id = clave de acceso), el XML
 *      original y los contadores de numeración.
 *
 * Solo el **administrador de la empresa** (o `super_admin`). No manda nada al
 * SRI ni por correo y no mueve inventario (ver `buildImportedInvoiceDoc`).
 *
 * Request:  { companyId, files: [{ fileName, xml, customerId? }] } — hasta 25
 *           archivos y 8 000 000 caracteres por llamada.
 * Response: { results: [{ fileName, status, reason?, accessKey?, fullNumber?,
 *             invoiceId?, xmlStored? }] }
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { requireCompanyRole } from '../utils/callable-auth';
import {
  SriDocument, SriXmlError, buildImportedInvoiceDoc, counterFloors, counterUpdates,
  fullNumber, isCreditNote, parseSriXml, taxIdTypeFromSri,
} from '../utils/sri-xml-import';
import {
  SRI_AUTHORIZATION_URLS, SriEnvironment, environmentOfAccessKey, querySriAuthorization,
} from '../utils/sri-authorization';

export const MAX_FILES = 25;
export const MAX_TOTAL_CHARS = 8_000_000;
/** Cuánto XML cabe en un documento de Firestore, con margen (el límite es 1 MiB). */
export const MAX_FIRESTORE_XML_CHARS = 900_000;
/** Consultas al SRI a la vez. */
const SRI_CONCURRENCY = 4;

export type ImportStatus =
  | 'imported' | 'duplicate' | 'not_authorized' | 'other_company'
  | 'other_environment' | 'invalid' | 'sri_unavailable';

export interface ImportResult {
  fileName: string;
  status: ImportStatus;
  reason?: string;
  accessKey?: string;
  fullNumber?: string;
  invoiceId?: string;
  xmlStored?: 'firestore' | 'storage' | null;
}

interface InputFile { fileName: string; xml: string; customerId: string | null; }

/** El año en curso en Ecuador y en UTC: en Nochevieja difieren y los contadores usan los dos. */
function currentYears(now = new Date()): number[] {
  const ecuador = new Date(now.getTime() - 5 * 3600 * 1000).getUTCFullYear();
  return [...new Set([ecuador, now.getUTCFullYear()])];
}

/** La clave con que se compara un número: facturas y NC llevan secuenciales separados. */
const numberKey = (creditNote: boolean, full: string) => `${creditNote ? 'creditNote' : 'invoice'}|${full}`;

function readInput(data: any): { companyId: string; files: InputFile[] } {
  const companyId = typeof data?.companyId === 'string' ? data.companyId.trim() : '';
  if (!companyId) throw new HttpsError('invalid-argument', 'Falta la empresa.');
  const raw = Array.isArray(data?.files) ? data.files : null;
  if (!raw || raw.length === 0) throw new HttpsError('invalid-argument', 'No llegó ningún archivo.');
  if (raw.length > MAX_FILES) {
    throw new HttpsError('invalid-argument', `Como máximo ${MAX_FILES} archivos por envío.`);
  }
  const files: InputFile[] = raw.map((f: any, i: number) => {
    if (typeof f?.xml !== 'string' || f.xml.trim() === '') {
      throw new HttpsError('invalid-argument', `El archivo ${i + 1} llegó vacío.`);
    }
    return {
      fileName: typeof f.fileName === 'string' && f.fileName ? f.fileName.slice(0, 300) : `archivo-${i + 1}.xml`,
      xml: f.xml,
      customerId: typeof f.customerId === 'string' && f.customerId.trim() ? f.customerId.trim() : null,
    };
  });
  const total = files.reduce((s, f) => s + f.xml.length, 0);
  if (total > MAX_TOTAL_CHARS) {
    throw new HttpsError('invalid-argument', 'El envío es demasiado grande: mándalo en tandas más pequeñas.');
  }
  return { companyId, files };
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

async function authorizationUrls(db: admin.firestore.Firestore): Promise<Record<SriEnvironment, string>> {
  const urls: Record<SriEnvironment, string> = { ...SRI_AUTHORIZATION_URLS };
  try {
    const cfg = (await db.doc('platform/defaults/sriConfig/data').get()).data() as any;
    for (const env of ['testing', 'production'] as SriEnvironment[]) {
      const u = cfg?.endpoints?.[env]?.authorizationUrl;
      if (typeof u === 'string' && u) urls[env] = u;
    }
  } catch { /* se usan las del SRI */ }
  return urls;
}

type Checked =
  | { ok: false; result: ImportResult }
  | { ok: true; file: InputFile; doc: SriDocument; authorizedXml: string };

export const importInvoices = onCall(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (request): Promise<{ results: ImportResult[] }> => {
    const { companyId, files } = readInput(request.data);
    requireCompanyRole(request, companyId, ['admin']);
    const uid = request.auth!.uid;

    const db = admin.firestore();
    const companyRef = db.doc(`companies/${companyId}`);
    const company = (await companyRef.get()).data() as any;
    if (!company) throw new HttpsError('not-found', 'La empresa no existe.');
    const companyRuc = String(company?.sri?.ruc ?? company?.ruc ?? '').trim();
    if (!companyRuc) {
      throw new HttpsError('failed-precondition',
        'La empresa no tiene RUC en su configuración del SRI: sin él no se puede comprobar de quién es cada comprobante.');
    }
    const env = String(company?.sri?.environment ?? '');
    const companyInProduction = env === 'production' || env === '2';
    const urls = await authorizationUrls(db);

    // ── 1 y 2: forma del XML y consulta al SRI ──────────────────────────────
    const checked = await mapLimit(files, SRI_CONCURRENCY, async (file): Promise<Checked> => {
      const base = { fileName: file.fileName };
      let subido: SriDocument;
      try {
        subido = parseSriXml(file.xml);
      } catch (e) {
        return { ok: false, result: { ...base, status: 'invalid', reason: e instanceof SriXmlError ? e.message : 'No se pudo leer.' } };
      }
      const ids = { accessKey: subido.accessKey, fullNumber: fullNumber(subido) };
      if (subido.issuerRuc !== companyRuc) {
        return { ok: false, result: { ...base, ...ids, status: 'other_company',
          reason: `La emitió el RUC ${subido.issuerRuc}, no el de la empresa (${companyRuc}).` } };
      }
      if (subido.environment === '1' && companyInProduction) {
        return { ok: false, result: { ...base, ...ids, status: 'other_environment',
          reason: 'Se emitió en el ambiente de pruebas del SRI: no tiene validez tributaria y la empresa ya factura en producción.' } };
      }

      let sri;
      try {
        sri = await querySriAuthorization(subido.accessKey, urls[environmentOfAccessKey(subido.accessKey)]);
      } catch (e: any) {
        console.warn('[importInvoices] El SRI no respondió', {
          companyId, accessKey: subido.accessKey, error: e?.message, code: e?.code, status: e?.response?.status,
        });
        return { ok: false, result: { ...base, ...ids, status: 'sri_unavailable',
          reason: 'El SRI no respondió. Se puede volver a intentar más tarde.' } };
      }
      if (!sri.found) {
        return { ok: false, result: { ...base, ...ids, status: 'not_authorized',
          reason: 'El SRI no tiene ningún comprobante con esta clave de acceso.' } };
      }
      if (sri.estado !== 'AUTORIZADO' || !sri.numeroAutorizacion || !sri.authorizedXml) {
        return { ok: false, result: { ...base, ...ids, status: 'not_authorized',
          reason: `El SRI lo tiene en estado ${sri.estado || 'desconocido'}${sri.mensaje ? `: ${sri.mensaje}` : ''}.` } };
      }

      // Desde aquí, lo que dice el SRI.
      let doc: SriDocument;
      try {
        doc = parseSriXml(sri.authorizedXml);
      } catch (e) {
        return { ok: false, result: { ...base, ...ids, status: 'invalid',
          reason: `El comprobante que devolvió el SRI no se pudo leer: ${e instanceof Error ? e.message : e}` } };
      }
      if (doc.accessKey !== subido.accessKey || doc.issuerRuc !== companyRuc) {
        return { ok: false, result: { ...base, ...ids, status: 'invalid',
          reason: 'El comprobante que devolvió el SRI no coincide con el archivo.' } };
      }
      return { ok: true, file, doc, authorizedXml: sri.authorizedXml };
    });

    const results: ImportResult[] = checked.map((c) => (c.ok ? { fileName: c.file.fileName, status: 'imported' } : c.result));
    const invoices = companyRef.collection('invoices');

    // ── 3: duplicados ───────────────────────────────────────────────────────
    const candidatos = checked
      .map((c, i) => ({ c, i }))
      .filter((x): x is { c: Extract<Checked, { ok: true }>; i: number } => x.c.ok);

    // Número ya usado en la empresa → con qué clave de acceso.
    const numerosExistentes = new Map<string, string>();
    const numeros = [...new Set(candidatos.map(({ c }) => fullNumber(c.doc)))];
    for (let i = 0; i < numeros.length; i += 30) {
      const snap = await invoices.where('fullNumber', 'in', numeros.slice(i, i + 30)).get();
      for (const d of snap.docs) {
        const m = d.data();
        numerosExistentes.set(
          numberKey(m.isCreditNote === true || m.documentType === 'creditNote', String(m.fullNumber ?? '')),
          String(m.accessKey ?? d.id));
      }
    }

    const vistasClave = new Set<string>();
    const vistosNumero = new Set<string>();
    const aEscribir: { c: Extract<Checked, { ok: true }>; i: number }[] = [];
    for (const x of candidatos) {
      const d = x.c.doc;
      const num = numberKey(isCreditNote(d), fullNumber(d));
      const ids = { accessKey: d.accessKey, fullNumber: fullNumber(d) };
      const existente = numerosExistentes.get(num);
      if (existente !== undefined) {
        results[x.i] = { fileName: x.c.file.fileName, ...ids, status: 'duplicate',
          reason: existente === d.accessKey
            ? 'Ya está en la empresa.'
            : `La empresa ya tiene ${isCreditNote(d) ? 'una nota de crédito' : 'una factura'} ${fullNumber(d)} con otra clave de acceso.` };
        continue;
      }
      if (vistasClave.has(d.accessKey)) {
        results[x.i] = { fileName: x.c.file.fileName, ...ids, status: 'duplicate', reason: 'Repetida: otro de los archivos es el mismo comprobante.' };
        continue;
      }
      if (vistosNumero.has(num)) {
        results[x.i] = { fileName: x.c.file.fileName, ...ids, status: 'duplicate', reason: 'Otro de los archivos trae el mismo número con otra clave de acceso.' };
        continue;
      }
      vistasClave.add(d.accessKey);
      vistosNumero.add(num);
      aEscribir.push(x);
    }

    // ── Clientes y artículos ────────────────────────────────────────────────
    const personas = companyRef.collection('personas');
    const customerIds = new Map<number, string | null>();
    for (const { c, i } of aEscribir) {
      const d = c.doc;
      const taxId = d.buyerId.trim();
      if (taxIdTypeFromSri(d.buyerIdType, taxId) === 'CONSUMIDOR_FINAL' || !taxId) { customerIds.set(i, null); continue; }
      let id: string | null = null;
      if (c.file.customerId) {
        // El id que manda el cliente solo se acepta si la ficha es de ese comprador.
        const s = await personas.doc(c.file.customerId).get();
        if (s.exists && String(s.data()?.taxId ?? '').trim() === taxId) id = s.id;
      }
      if (!id) {
        const q = await personas.where('taxId', '==', taxId).limit(1).get();
        id = q.empty ? null : q.docs[0].id;
      }
      customerIds.set(i, id);
    }

    const productIdsBySku: Record<string, string> = {};
    const skus = [...new Set(aEscribir.flatMap(({ c }) => c.doc.lines.map((l) => l.code.trim())).filter((s) => s))];
    for (let i = 0; i < skus.length; i += 30) {
      const tanda = skus.slice(i, i + 30);
      const snap = await companyRef.collection('products').where('sku', 'in', tanda).get();
      for (const d of snap.docs) {
        const sku = String(d.data().sku ?? '').trim().toUpperCase();
        if (sku && !productIdsBySku[sku]) productIdsBySku[sku] = d.id;
      }
    }

    // ── 4: escribir, un comprobante por transacción ─────────────────────────
    const bucket = admin.storage().bucket();
    const counterRef = companyRef.collection('counters').doc('invoices');
    const years = currentYears();

    for (const { c, i } of aEscribir) {
      const d = c.doc;
      const ids = { accessKey: d.accessKey, fullNumber: fullNumber(d) };
      const enFirestore = c.authorizedXml.length <= MAX_FIRESTORE_XML_CHARS;
      const storagePath = `companies/${companyId}/imported-xml/${d.accessKey}.xml`;
      try {
        if (!enFirestore) {
          // Antes de la transacción: si esta falla, el archivo queda huérfano pero
          // inofensivo, y el reintento lo reescribe.
          await bucket.file(storagePath).save(c.authorizedXml, { contentType: 'application/xml; charset=utf-8', resumable: false });
        }
        const escrita = await db.runTransaction(async (tx) => {
          const invoiceRef = invoices.doc(d.accessKey);
          const [ya, contador] = await Promise.all([tx.get(invoiceRef), tx.get(counterRef)]);
          if (ya.exists) return false;

          const cambios = counterUpdates(contador.data(), counterFloors([d], years));
          if (Object.keys(cambios).length > 0) tx.set(counterRef, cambios, { merge: true });

          const now = admin.firestore.FieldValue.serverTimestamp();
          tx.set(invoiceRef, {
            ...buildImportedInvoiceDoc(d, {
              uid, fileName: c.file.fileName, customerId: customerIds.get(i) ?? null, productIdsBySku,
            }),
            importedXmlId: enFirestore ? d.accessKey : null,
            importedXmlPath: enFirestore ? null : storagePath,
            importedAt: now,
            updatedAt: now,
          });
          if (enFirestore) {
            tx.set(companyRef.collection('imported-xml').doc(d.accessKey), {
              invoiceId: d.accessKey,
              accessKey: d.accessKey,
              fullNumber: fullNumber(d),
              fileName: c.file.fileName,
              xml: c.authorizedXml,
              source: 'sri',
              createdBy: uid,
              createdAt: now,
            });
          }
          return true;
        });
        results[i] = escrita
          ? { fileName: c.file.fileName, ...ids, status: 'imported', invoiceId: d.accessKey, xmlStored: enFirestore ? 'firestore' : 'storage' }
          : { fileName: c.file.fileName, ...ids, status: 'duplicate', reason: 'Ya está en la empresa.' };
      } catch (e: any) {
        console.error('[importInvoices] No se pudo escribir', { companyId, accessKey: d.accessKey, error: e?.message });
        results[i] = { fileName: c.file.fileName, ...ids, status: 'invalid', reason: 'No se pudo guardar. Intenta de nuevo.' };
      }
    }

    console.log('[importInvoices]', {
      companyId, uid,
      total: files.length,
      porEstado: results.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {}),
    });
    return { results };
  },
);
