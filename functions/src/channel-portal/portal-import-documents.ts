/**
 * portalImportDocuments (F-2, Fase 1b de Mi Buseta)
 *
 * Importa a la contabilidad de una empresa del canal `mi-buseta` facturas (01)
 * y notas de crédito (04) que Mi Buseta **ya emitió y el SRI ya autorizó**. Lo
 * llama solo el tick de sincronización de Mi Buseta (`facturaEcSyncTick`), con
 * el token `channel_admin` del canal. Ver, en el repo de Mi Buseta,
 * `.claude/agents/facturaec/PLAN_SINCRONIZACION_FASE_1B.md` §3.3.
 *
 * Diferencias con `importInvoices` (que usa Conectate y no se toca):
 *   - no recibe XML ni totales: solo la clave de acceso; todo sale del SRI;
 *   - lo llama el gateway del canal, no el admin de la empresa;
 *   - es idempotente por clave de acceso (id del documento) y por `externalId`
 *     (`mibuseta:bill:70412`), y un repetido devuelve su asiento o por qué falta;
 *   - valida el ejercicio contable **antes** de escribir (sin ejercicio abierto
 *     el trigger no haría el asiento y nadie se enteraría);
 *   - acepta el ambiente 2 (producción) aunque la empresa esté en `testing`:
 *     aquí no se emite nada, solo se registra lo que el SRI ya autorizó;
 *   - `voided: true` (anulada en Mi Buseta, viva en el SRI) se guarda con
 *     `status: 'void'` + `isVoid: true` desde el primer write: ningún trigger
 *     la contabiliza (ver «Anuladas» abajo).
 *
 * Nunca envía nada al SRI: solo **consulta** la autorización (lectura). No
 * llama al generador de asientos: lo hace el trigger
 * `generateJournalEntryFromInvoice` / `…FromCreditNote` al nacer el documento
 * `issued` + `authorized`, y Mi Buseta lo recoge en una reverificación
 * (`duplicate`). Así no hay doble asiento.
 *
 * Anuladas: los triggers de asiento exigen `status === 'issued'`; el de
 * reversa (`onDocumentUpdated`) no corre en una creación y además exige la
 * transición `isVoid` false → true; `regenerateJournalEntries` filtra
 * `isVoid !== true` y `generate…Internal` devuelve `not_ready` si el estado no
 * es `issued|paid`; `onInvoiceStock` no resta (`stockProcessed` y
 * `stockRestored` ya en true) y `onInvoiceEmit` no la ve (`status` ≠ issued e
 * `imported`). Resultado: nunca tiene asiento.
 *
 * Anulada DESPUÉS de importarse (regla del 2026-11-17): Mi Buseta reenvía el
 * MISMO documento (misma clave y externalId) con `voided: true` y
 * `voidSeenAt`. El usuario la anuló a mano en el portal del SRI; aquí solo se
 * refleja (nunca se habla con el SRI). Si el documento está vivo se pasa a
 * `status: 'void'` + `isVoid: true` (+ `voidedAt` = voidSeenAt,
 * `voidedInOrigin`, `voidReason`) en una transacción, y esa transición
 * `isVoid` false → true la recoge el trigger `generateReversalFromInvoice`
 * (generate-reversal-entry.ts), que vale para facturas y NC (misma
 * colección): asiento espejo, original `cancelled` y `reversalEntryId` en el
 * documento. No se llama a ningún generador desde aquí. Antes de escribir:
 *   - el ejercicio del año de `voidSeenAt` (hora de Ecuador) tiene que estar
 *     abierto, y también el del comprobante (la reversa hereda el `periodId`
 *     del asiento original): `no_open_period` / `closed_period` sin escribir;
 *   - las mismas trabas que las reglas ponen a «Anular»: sin retenciones
 *     recibidas, anticipos ni recibos de caja aplicados, y sin cobro registrado
 *     (`paymentEntryId` / `isPaid`, decisión del usuario 2026-11-17) (`conflict`);
 *   - viva pero aún sin asiento y recién importada (< 90 s): el trigger de
 *     asiento puede estar en curso y escribiría su `accountingEntryId` sobre
 *     la anulada sin reversa; se devuelve `internal` (reintento). Pasado ese
 *     margen se anula igual: sin asiento no hay nada que revertir, y ningún
 *     generador ni `regenerateJournalEntries` contabiliza una anulada.
 * Ya anulada: `duplicate` + `voided` sin escribir. `voided: false` sobre una
 * anulada: `conflict` (no se des-anula).
 *
 * Request:  { companyId, documents: [{ accessKey, externalId, voided?, voidSeenAt? }] } (1..10)
 * Response: { results: [{ accessKey, externalId, status, reason?, fullNumber?, documentType?,
 *             fiscalYear?, total?, voided?, accountingEntryId?, reversalEntryId?, missingEntryReason? }],
 *             summary: { total, byStatus } }
 *
 * Los `status` son exactamente los que acepta `POST /facturaEcSync/v1/ack` de
 * bill-service (`FacturaEcSyncStateMachine.ACK_STATUSES`).
 */

import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import {
  isChannelAdmin, isSuperAdmin, loadCompanyForCaller, readCaller, type Caller,
} from '../utils/channels';
import { calculateModulo11 } from '../utils/sri-access-key';
import {
  COD_DOC_FACTURA, COD_DOC_NOTA_CREDITO, SriDocument, SriXmlError, accessKeyProblem,
  buildImportedInvoiceDoc, counterFloors, counterUpdates, fullNumber, isCreditNote, parseSriXml,
  taxIdTypeFromSri,
} from '../utils/sri-xml-import';
import {
  SriAuthorizationResult, environmentOfAccessKey, querySriAuthorization,
} from '../utils/sri-authorization';
import { MAX_FIRESTORE_XML_CHARS, authorizationUrls } from '../invoices/import-invoices';

/** El único canal que importa por aquí (el `origin` queda estampado en cada documento). */
export const MI_BUSETA_CHANNEL = 'mi-buseta';
export const MAX_DOCUMENTS = 10;
const SRI_CONCURRENCY = 4;
const IMPORTED_VIA = 'portalImportDocuments';

export const EXTERNAL_ID_RE = /^mibuseta:(bill|nc):\d{1,18}$/;
const REQUEST_KEYS = new Set(['companyId', 'documents']);
const DOCUMENT_KEYS = new Set(['accessKey', 'externalId', 'voided', 'voidSeenAt']);

/** Lo que acepta el `ack` de bill-service, ni más ni menos. */
export type ImportDocStatus =
  | 'imported' | 'duplicate'
  | 'no_open_period' | 'closed_period'
  | 'not_authorized' | 'sri_unavailable'
  | 'conflict' | 'other_company' | 'other_environment' | 'invalid'
  /** Falla al escribir en Firestore/Storage: bill-service lo reintenta. */
  | 'internal';

/** `FacturaEcSyncStateMachine.MISSING_ENTRY_REASONS`. */
export type MissingEntryReason = 'no_open_period' | 'closed_period' | 'unknown';

export interface ImportDocResult {
  accessKey: string;
  externalId: string;
  status: ImportDocStatus;
  reason?: string;
  fullNumber?: string;
  documentType?: 'invoice' | 'creditNote';
  fiscalYear?: number;
  total?: number;
  /** El documento de FacturaEc está anulado (nunca tendrá asiento). */
  voided?: boolean;
  accountingEntryId?: string;
  /** Asiento de reversa de una anulada después de importarse (cuando ya existe). */
  reversalEntryId?: string;
  missingEntryReason?: MissingEntryReason;
}

export interface InputDocument {
  accessKey: string;
  externalId: string;
  voided: boolean;
  voidSeenAt: Date | null;
}

export type PeriodState = 'open' | 'closed' | 'none';

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Entrada ─────────────────────────────────────────────────────────────────

function plainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validación estricta del payload: cualquier forma rara es un error del gateway. */
export function readImportRequest(data: unknown): { companyId: string; documents: InputDocument[] } {
  if (!plainObject(data)) throw new HttpsError('invalid-argument', 'El payload debe ser un objeto.');
  const extra = Object.keys(data).filter((k) => !REQUEST_KEYS.has(k));
  if (extra.length) throw new HttpsError('invalid-argument', `Campos desconocidos: ${extra.join(', ')}.`);

  const companyId = typeof data.companyId === 'string' ? data.companyId.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(companyId)) throw new HttpsError('invalid-argument', "'companyId' inválido.");

  const raw = data.documents;
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpsError('invalid-argument', "'documents' debe traer al menos un documento.");
  if (raw.length > MAX_DOCUMENTS) throw new HttpsError('invalid-argument', `Como máximo ${MAX_DOCUMENTS} documentos por llamada.`);

  const keys = new Set<string>();
  const externals = new Set<string>();
  const documents = raw.map((d: unknown, i: number): InputDocument => {
    const at = `documents[${i}]`;
    if (!plainObject(d)) throw new HttpsError('invalid-argument', `${at} debe ser un objeto.`);
    const unknownKeys = Object.keys(d).filter((k) => !DOCUMENT_KEYS.has(k));
    if (unknownKeys.length) throw new HttpsError('invalid-argument', `${at}: campos desconocidos: ${unknownKeys.join(', ')}.`);
    if (typeof d.accessKey !== 'string' || !/^\d{49}$/.test(d.accessKey)) {
      throw new HttpsError('invalid-argument', `${at}.accessKey debe tener 49 dígitos.`);
    }
    if (typeof d.externalId !== 'string' || !EXTERNAL_ID_RE.test(d.externalId)) {
      throw new HttpsError('invalid-argument', `${at}.externalId debe ser mibuseta:(bill|nc):<id>.`);
    }
    if (d.voided !== undefined && typeof d.voided !== 'boolean') {
      throw new HttpsError('invalid-argument', `${at}.voided debe ser booleano.`);
    }
    let voidSeenAt: Date | null = null;
    if (d.voidSeenAt !== undefined && d.voidSeenAt !== null) {
      const t = typeof d.voidSeenAt === 'string' && d.voidSeenAt.length <= 40 ? new Date(d.voidSeenAt) : null;
      if (!t || isNaN(t.getTime())) throw new HttpsError('invalid-argument', `${at}.voidSeenAt debe ser una fecha ISO.`);
      voidSeenAt = t;
    }
    if (keys.has(d.accessKey)) throw new HttpsError('invalid-argument', `${at}.accessKey repetida en el lote.`);
    if (externals.has(d.externalId)) throw new HttpsError('invalid-argument', `${at}.externalId repetido en el lote.`);
    keys.add(d.accessKey);
    externals.add(d.externalId);
    return { accessKey: d.accessKey, externalId: d.externalId, voided: d.voided === true, voidSeenAt };
  });
  return { companyId, documents };
}

// ─── Reglas puras ────────────────────────────────────────────────────────────

/**
 * Lo que se puede decidir solo con la clave, sin ir al SRI ni a Firestore.
 * null si sigue. `companyTesting`: la empresa de FacturaEc está en pruebas.
 */
export function precheckAccessKey(
  doc: Pick<InputDocument, 'accessKey' | 'externalId'>, companyRuc: string, companyTesting: boolean,
): { status: ImportDocStatus; reason: string } | null {
  const k = doc.accessKey;
  if (calculateModulo11(k.slice(0, 48)) !== +k[48]) {
    return { status: 'invalid', reason: 'El dígito verificador de la clave de acceso no cuadra.' };
  }
  const codDoc = k.slice(8, 10);
  if (codDoc !== COD_DOC_FACTURA && codDoc !== COD_DOC_NOTA_CREDITO) {
    return { status: 'invalid', reason: `Tipo de comprobante ${codDoc}: solo se importan facturas (01) y notas de crédito (04).` };
  }
  const kind = doc.externalId.split(':')[1];
  if ((kind === 'bill') !== (codDoc === COD_DOC_FACTURA)) {
    return { status: 'invalid', reason: `El externalId (${kind}) no corresponde al tipo de la clave (${codDoc}).` };
  }
  const ruc = k.slice(10, 23);
  if (ruc !== companyRuc) {
    return { status: 'other_company', reason: `La emitió el RUC ${ruc}, no el de la empresa (${companyRuc}).` };
  }
  const env = k.charAt(23);
  if (env !== '1' && env !== '2') return { status: 'invalid', reason: `Ambiente ${env} desconocido en la clave.` };
  // Ambiente 2 siempre (es lo que tiene validez tributaria); 1 solo si la empresa está en pruebas.
  if (env === '1' && !companyTesting) {
    return { status: 'other_environment',
      reason: 'Se emitió en el ambiente de pruebas del SRI y la empresa no está en pruebas: no tiene validez tributaria.' };
  }
  return null;
}

/** Estado del ejercicio de un año a partir de sus documentos de `accounting_periods`. */
export function periodStateOf(periods: Array<{ status?: unknown }>): PeriodState {
  if (periods.some((p) => p.status === 'open')) return 'open';
  if (periods.some((p) => p.status === 'closed')) return 'closed';
  return 'none'; // no existe o está bloqueado: el trigger tampoco contabilizaría
}

const isVoidedDoc = (d: Record<string, any>) => d['isVoid'] === true || d['status'] === 'void';
const isCreditNoteDoc = (d: Record<string, any>) => d['isCreditNote'] === true || d['documentType'] === 'creditNote';

/** Resultado `duplicate` a partir del documento que ya está en FacturaEc. */
export function duplicateResult(
  input: Pick<InputDocument, 'accessKey' | 'externalId'>, existing: Record<string, any>, period: PeriodState,
): ImportDocResult {
  const year = parseInt(String(existing['fiscalYear'] ?? ''), 10);
  const out: ImportDocResult = {
    accessKey: input.accessKey,
    externalId: input.externalId,
    status: 'duplicate',
    reason: 'Ya está en la empresa.',
    fullNumber: typeof existing['fullNumber'] === 'string' ? existing['fullNumber'] : undefined,
    documentType: isCreditNoteDoc(existing) ? 'creditNote' : 'invoice',
    fiscalYear: Number.isFinite(year) ? year : undefined,
    total: typeof existing['total'] === 'number' ? r2(existing['total']) : undefined,
  };
  if (isVoidedDoc(existing)) out.voided = true;
  if (typeof existing['accountingEntryId'] === 'string' && existing['accountingEntryId']) {
    out.accountingEntryId = existing['accountingEntryId'];
    if (isVoidedDoc(existing)) {
      if (typeof existing['reversalEntryId'] === 'string' && existing['reversalEntryId']) {
        out.reversalEntryId = existing['reversalEntryId'];
        out.reason = 'Ya está en la empresa, anulada: su asiento está revertido.';
      } else if (typeof existing['reversalError'] === 'string' && existing['reversalError']) {
        out.reason = `Ya está en la empresa, anulada, sin reversa: ${existing['reversalError']}`;
      } else {
        out.reason = 'Ya está en la empresa, anulada: la reversa de su asiento está en curso.';
      }
    }
  } else if (isVoidedDoc(existing)) {
    out.reason = 'Ya está en la empresa, anulada: no lleva asiento.';
  } else {
    out.missingEntryReason = period === 'none' ? 'no_open_period' : period === 'closed' ? 'closed_period' : 'unknown';
    out.reason = period === 'open'
      ? 'Ya está en la empresa y todavía no tiene asiento (en curso, o hay que regenerarlo desde la puesta en marcha).'
      : `Ya está en la empresa sin asiento: el ejercicio ${out.fiscalYear ?? ''} ${period === 'closed' ? 'está cerrado' : 'no está abierto'}.`;
  }
  return out;
}

export function summarize(results: ImportDocResult[]): { total: number; byStatus: Record<string, number> } {
  const byStatus: Record<string, number> = {};
  for (const r of results) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return { total: results.length, byStatus };
}

// ─── Núcleo ──────────────────────────────────────────────────────────────────

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

function currentYears(now = new Date()): number[] {
  const ecuador = new Date(now.getTime() - 5 * 3600 * 1000).getUTCFullYear();
  return [...new Set([ecuador, now.getUTCFullYear()])];
}

const numberKey = (creditNote: boolean, full: string) => `${creditNote ? 'creditNote' : 'invoice'}|${full}`;

/** Caller autorizado: super_admin, o channel_admin del canal mi-buseta. */
function requireMiBusetaCaller(request: CallableRequest<unknown>): Caller {
  const caller = readCaller(request);
  if (isSuperAdmin(caller)) return caller;
  if (isChannelAdmin(caller) && caller.channelId === MI_BUSETA_CHANNEL) return caller;
  throw new HttpsError('permission-denied', `Solo el administrador del canal '${MI_BUSETA_CHANNEL}'.`);
}

type Ready = { input: InputDocument; i: number; doc: SriDocument; authorizedXml: string };

/** Año contable (hora de Ecuador, UTC-5) de un instante. */
export function ecuadorYear(d: Date): number {
  return new Date(d.getTime() - 5 * 3600 * 1000).getUTCFullYear();
}

/** Margen tras importar en el que el trigger de asiento puede seguir en curso. */
export const ENTRY_IN_FLIGHT_MS = 90 * 1000;
/** Cuánto espera la callable a que el trigger de reversa deje `reversalEntryId`. */
export const REVERSAL_WAIT = { ms: 8000, pollMs: 400 };

const cents = (d: Record<string, any>, field: string, key = 'cents') => Number(d[field]?.[key] ?? 0) || 0;

/**
 * Lo que impide anular un documento vivo, como las reglas de «Anular»
 * (firestore.rules: invoiceWithoutReceivedRetentions, invoiceAdvancesGuard,
 * invoiceCashVouchersGuard). null si se puede.
 */
export function voidBlocker(d: Record<string, any>): string | null {
  if (cents(d, 'receivedRetentions', 'ivaCents') + cents(d, 'receivedRetentions', 'rentaCents') > 0) {
    return 'Tiene retenciones recibidas vivas en FacturaEc: hay que anularlas antes.';
  }
  if (cents(d, 'advancesApplied') > 0) return 'Tiene anticipos aplicados en FacturaEc: hay que desaplicarlos antes.';
  if (cents(d, 'cashVouchersApplied') > 0 || d['paidBy'] === 'cashVoucher') {
    return 'Tiene recibos de caja en FacturaEc: hay que anularlos antes.';
  }
  // Decisión del usuario (2026-11-17): cobrada (p. ej. por banco) = el asiento de cobro no se revierte solo;
  // se bloquea para que el contador deshaga el cobro antes.
  if (d['paymentEntryId'] || d['isPaid'] === true) {
    return 'Está cobrada en FacturaEc: el contador debe anular el cobro antes de anular la factura.';
  }
  if (d['status'] === 'cancelled') return 'El documento está cancelado en FacturaEc.';
  return null;
}

const tsMillis = (v: any): number | null => (v && typeof v.toDate === 'function' ? v.toDate().getTime() : null);

export async function importDocuments(
  db: Firestore, caller: Caller, companyId: string, documents: InputDocument[],
): Promise<{ results: ImportDocResult[]; summary: { total: number; byStatus: Record<string, number> } }> {
  const company = await loadCompanyForCaller(db, caller, companyId);
  if (company['channelId'] !== MI_BUSETA_CHANNEL) {
    throw new HttpsError('permission-denied', `La empresa '${companyId}' no es del canal '${MI_BUSETA_CHANNEL}'.`);
  }
  if (!['active', 'trial'].includes(String(company['status'] ?? ''))) {
    throw new HttpsError('failed-precondition', `La empresa '${companyId}' no está activa.`);
  }
  const companyRuc = String(company['sri']?.['ruc'] ?? '').trim();
  if (!/^\d{13}$/.test(companyRuc)) {
    throw new HttpsError('failed-precondition', 'La empresa no tiene RUC en su configuración del SRI.');
  }
  const env = String(company['sri']?.['environment'] ?? '');
  const companyTesting = env === 'testing' || env === '1';

  const companyRef = db.doc(`companies/${companyId}`);
  const invoices = companyRef.collection('invoices');
  const results: Array<ImportDocResult | undefined> = new Array(documents.length);
  const base = (d: InputDocument) => ({ accessKey: d.accessKey, externalId: d.externalId });

  // Ejercicio por año, una lectura por año del lote.
  const periodCache = new Map<number, Promise<PeriodState>>();
  const periodOf = (year: number): Promise<PeriodState> => {
    if (!Number.isFinite(year)) return Promise.resolve('none');
    if (!periodCache.has(year)) {
      periodCache.set(year, companyRef.collection('accounting_periods').where('year', '==', year).get()
        .then((s) => periodStateOf(s.docs.map((x) => x.data()))));
    }
    return periodCache.get(year)!;
  };

  // ── 1 y 2: la clave, y si ya existe (por clave o por externalId) ──────────
  const toSri: Array<{ input: InputDocument; i: number }> = [];
  const toVoid: Array<{ input: InputDocument; i: number }> = [];
  for (let i = 0; i < documents.length; i++) {
    const d = documents[i];
    const pre = precheckAccessKey(d, companyRuc, companyTesting);
    if (pre) { results[i] = { ...base(d), ...pre }; continue; }

    const existing = await invoices.doc(d.accessKey).get();
    if (existing.exists) {
      const data = existing.data() as Record<string, any>;
      if (data['externalId'] && data['externalId'] !== d.externalId) {
        results[i] = { ...base(d), status: 'conflict',
          reason: `La clave ya está importada con otro externalId (${data['externalId']}).` };
      } else if (isVoidedDoc(data) && !d.voided) {
        results[i] = { ...duplicateResult(d, data, 'open'), status: 'conflict',
          reason: 'En FacturaEc está anulada y no se des-anula.' };
      } else if (!isVoidedDoc(data) && d.voided) {
        toVoid.push({ input: d, i });
      } else {
        results[i] = duplicateResult(d, data, await periodOf(parseInt(String(data['fiscalYear'] ?? ''), 10)));
      }
      continue;
    }
    const byExternal = await invoices.where('externalId', '==', d.externalId).limit(1).get();
    if (!byExternal.empty) {
      results[i] = { ...base(d), status: 'conflict',
        reason: `El externalId ya está importado con otra clave de acceso (${byExternal.docs[0].id}).` };
      continue;
    }
    toSri.push({ input: d, i });
  }

  // ── 2b: anuladas en Mi Buseta después de importarse ───────────────────────
  const waitReversal: Array<{ i: number; input: InputDocument }> = [];
  for (const { input, i } of toVoid) {
    results[i] = await voidImported(input, i);
  }

  async function voidImported(input: InputDocument, i: number): Promise<ImportDocResult> {
    const ref = invoices.doc(input.accessKey);
    const current = (await ref.get()).data() as Record<string, any>;
    const fiscalYear = parseInt(String(current['fiscalYear'] ?? ''), 10);
    const voidAt = input.voidSeenAt ?? new Date();
    const voidYear = ecuadorYear(voidAt);
    const head = duplicateResult(input, current, 'open');
    const ids = { ...base(input), fullNumber: head.fullNumber, documentType: head.documentType,
      fiscalYear: head.fiscalYear, total: head.total };

    // Ejercicio: el del año de la anulación y el del comprobante (la reversa hereda su periodId).
    const entryId = typeof current['accountingEntryId'] === 'string' && current['accountingEntryId'] ? current['accountingEntryId'] : null;
    let entryPeriod: string | null = null;
    if (entryId) {
      const entry = await companyRef.collection('journal_entries').doc(entryId).get();
      const periodId = entry.exists ? entry.data()?.['periodId'] : null;
      if (typeof periodId === 'string' && periodId) {
        const p = await companyRef.collection('accounting_periods').doc(periodId).get();
        entryPeriod = p.exists ? String(p.data()?.['status'] ?? '') : 'none';
      }
    }
    const docYear = await periodOf(fiscalYear);
    const atVoid = await periodOf(voidYear);
    if (docYear === 'closed' || entryPeriod === 'closed') {
      return { ...ids, status: 'closed_period', reason: `El ejercicio ${fiscalYear} del comprobante está cerrado: no se anula ni se revierte.` };
    }
    if (atVoid === 'closed') {
      return { ...ids, status: 'closed_period', reason: `El ejercicio ${voidYear} de la anulación está cerrado.` };
    }
    if (atVoid === 'none') {
      return { ...ids, status: 'no_open_period', reason: `No hay ejercicio ${voidYear} abierto para la anulación.` };
    }
    if (entryId && (docYear !== 'open' || (entryPeriod !== null && entryPeriod !== 'open'))) {
      return { ...ids, status: 'no_open_period', reason: `El ejercicio ${fiscalYear} del asiento original no está abierto: la reversa caería en él.` };
    }

    try {
      const outcome = await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const d = s.data() as Record<string, any> | undefined;
        if (!d) return { kind: 'gone' as const };
        if (d['externalId'] && d['externalId'] !== input.externalId) return { kind: 'external' as const, other: String(d['externalId']) };
        if (isVoidedDoc(d)) return { kind: 'already' as const, data: d };
        const blocked = voidBlocker(d);
        if (blocked) return { kind: 'blocked' as const, reason: blocked };
        const hasEntry = typeof d['accountingEntryId'] === 'string' && d['accountingEntryId'] !== '';
        const importedAt = tsMillis(d['importedAt']);
        if (!hasEntry && importedAt !== null && Date.now() - importedAt < ENTRY_IN_FLIGHT_MS) {
          return { kind: 'in_flight' as const };
        }
        const now = admin.firestore.FieldValue.serverTimestamp();
        tx.update(ref, {
          status: 'void',
          isVoid: true,
          voidedInOrigin: true,
          voidedAt: admin.firestore.Timestamp.fromDate(voidAt),
          voidedBy: caller.uid,
          voidReason: 'Anulada en Mi Buseta después de importarse (el usuario la anuló en el portal del SRI).',
          updatedAt: now,
          updatedBy: caller.uid,
        });
        return { kind: 'voided' as const, hasEntry };
      });
      switch (outcome.kind) {
        case 'gone': return { ...ids, status: 'internal', reason: 'El documento desapareció mientras se anulaba; se reintentará.' };
        case 'external': return { ...ids, status: 'conflict', reason: `La clave ya está importada con otro externalId (${outcome.other}).` };
        case 'already': return duplicateResult(input, outcome.data, 'open');
        case 'blocked': return { ...ids, status: 'conflict', reason: outcome.reason };
        case 'in_flight': return { ...ids, status: 'internal', reason: 'Recién importada y su asiento aún no está: se reintentará.' };
        case 'voided':
          if (outcome.hasEntry) waitReversal.push({ i, input });
          return { ...ids, status: 'duplicate', voided: true,
            ...(entryId ? { accountingEntryId: entryId } : {}),
            reason: outcome.hasEntry
              ? 'Anulada: la reversa del asiento está en curso.'
              : 'Anulada: no tenía asiento, no hay nada que revertir.' };
      }
    } catch (e: any) {
      console.error('[portalImportDocuments] No se pudo anular', { companyId, accessKey: input.accessKey, error: e?.message });
      return { ...ids, status: 'internal', reason: 'No se pudo anular; se reintentará.' };
    }
  }

  // ── 3: el SRI (solo consulta) ─────────────────────────────────────────────
  const urls = toSri.length ? await authorizationUrls(db) : null;
  const ready: Ready[] = [];
  const sriChecked = await mapLimit(toSri, SRI_CONCURRENCY, async ({ input, i }) => {
    let sri: SriAuthorizationResult;
    try {
      sri = await querySriAuthorization(input.accessKey, urls![environmentOfAccessKey(input.accessKey)]);
    } catch (e: any) {
      console.warn('[portalImportDocuments] El SRI no respondió', { companyId, accessKey: input.accessKey, error: e?.message, code: e?.code });
      return { i, result: { ...base(input), status: 'sri_unavailable' as const, reason: 'El SRI no respondió.' } };
    }
    if (!sri.found) {
      return { i, result: { ...base(input), status: 'not_authorized' as const, reason: 'El SRI no tiene ningún comprobante con esta clave.' } };
    }
    if (sri.estado !== 'AUTORIZADO' || !sri.numeroAutorizacion || !sri.authorizedXml) {
      return { i, result: { ...base(input), status: 'not_authorized' as const,
        reason: `El SRI lo tiene en estado ${sri.estado || 'desconocido'}${sri.mensaje ? `: ${sri.mensaje}` : ''}.` } };
    }
    let doc: SriDocument;
    try {
      doc = parseSriXml(sri.authorizedXml);
    } catch (e) {
      return { i, result: { ...base(input), status: 'invalid' as const,
        reason: `El comprobante del SRI no se pudo leer: ${e instanceof SriXmlError || e instanceof Error ? e.message : e}` } };
    }
    const problem = doc.accessKey !== input.accessKey ? 'El SRI devolvió otro comprobante.'
      : doc.issuerRuc !== companyRuc ? 'El comprobante del SRI es de otro RUC.'
      : accessKeyProblem(input.accessKey, {
        codDoc: doc.codDoc, ruc: doc.issuerRuc, environment: doc.environment, establishment: doc.establishment,
        emissionPoint: doc.emissionPoint, sequential: doc.sequential, issueDate: doc.issueDate,
      });
    if (problem) return { i, result: { ...base(input), status: 'invalid' as const, reason: problem } };
    return { i, ready: { input, i, doc, authorizedXml: sri.authorizedXml } };
  });
  for (const c of sriChecked) {
    if ('ready' in c && c.ready) ready.push(c.ready); else results[c.i] = (c as any).result;
  }

  const ids = (r: Ready) => ({
    ...base(r.input),
    fullNumber: fullNumber(r.doc),
    documentType: (isCreditNote(r.doc) ? 'creditNote' : 'invoice') as 'invoice' | 'creditNote',
    fiscalYear: r.doc.issueDate.y,
    total: r2(r.doc.total),
  });

  // ── 4: ejercicio contable del año del comprobante, antes de escribir ──────
  const withPeriod: Ready[] = [];
  for (const r of ready) {
    const p = await periodOf(r.doc.issueDate.y);
    if (p === 'open') { withPeriod.push(r); continue; }
    results[r.i] = p === 'closed'
      ? { ...ids(r), status: 'closed_period', reason: `El ejercicio ${r.doc.issueDate.y} está cerrado.` }
      : { ...ids(r), status: 'no_open_period', reason: `No hay ejercicio ${r.doc.issueDate.y} abierto.` };
  }

  // ── 5: mismo número con otra clave ────────────────────────────────────────
  const existingNumbers = new Map<string, string>();
  const numbers = [...new Set(withPeriod.map((r) => fullNumber(r.doc)))];
  for (let i = 0; i < numbers.length; i += 30) {
    const snap = await invoices.where('fullNumber', 'in', numbers.slice(i, i + 30)).get();
    for (const d of snap.docs) {
      const m = d.data();
      existingNumbers.set(numberKey(isCreditNoteDoc(m), String(m['fullNumber'] ?? '')), String(m['accessKey'] ?? d.id));
    }
  }
  const seenNumbers = new Set<string>();
  const toWrite: Ready[] = [];
  for (const r of withPeriod) {
    const nk = numberKey(isCreditNote(r.doc), fullNumber(r.doc));
    const other = existingNumbers.get(nk);
    if ((other !== undefined && other !== r.input.accessKey) || seenNumbers.has(nk)) {
      results[r.i] = { ...ids(r), status: 'conflict',
        reason: `La empresa ya tiene ${isCreditNote(r.doc) ? 'una nota de crédito' : 'una factura'} ${fullNumber(r.doc)} con otra clave de acceso.` };
      continue;
    }
    seenNumbers.add(nk);
    toWrite.push(r);
  }

  // ── Clientes y artículos (como importInvoices) ────────────────────────────
  const customerIds = new Map<number, string | null>();
  for (const r of toWrite) {
    const taxId = r.doc.buyerId.trim();
    if (!taxId || taxIdTypeFromSri(r.doc.buyerIdType, taxId) === 'CONSUMIDOR_FINAL') { customerIds.set(r.i, null); continue; }
    const q = await companyRef.collection('personas').where('taxId', '==', taxId).limit(1).get();
    customerIds.set(r.i, q.empty ? null : q.docs[0].id);
  }
  const productIdsBySku: Record<string, string> = {};
  const skus = [...new Set(toWrite.flatMap((r) => r.doc.lines.map((l) => l.code.trim())).filter((s) => s))];
  for (let i = 0; i < skus.length; i += 30) {
    const snap = await companyRef.collection('products').where('sku', 'in', skus.slice(i, i + 30)).get();
    for (const d of snap.docs) {
      const sku = String(d.data()['sku'] ?? '').trim().toUpperCase();
      if (sku && !productIdsBySku[sku]) productIdsBySku[sku] = d.id;
    }
  }

  // ── 6: escribir, un comprobante por transacción ───────────────────────────
  const counterRef = companyRef.collection('counters').doc('invoices');
  const years = currentYears();
  for (const r of toWrite) {
    const d = r.doc;
    const inFirestore = r.authorizedXml.length <= MAX_FIRESTORE_XML_CHARS;
    const storagePath = `companies/${companyId}/imported-xml/${d.accessKey}.xml`;
    try {
      if (!inFirestore) {
        await admin.storage().bucket().file(storagePath)
          .save(r.authorizedXml, { contentType: 'application/xml; charset=utf-8', resumable: false });
      }
      const outcome = await db.runTransaction(async (tx) => {
        const invoiceRef = invoices.doc(d.accessKey);
        const [already, counter, sameExternal] = await Promise.all([
          tx.get(invoiceRef), tx.get(counterRef), tx.get(invoices.where('externalId', '==', r.input.externalId).limit(1)),
        ]);
        if (already.exists) return { kind: 'exists' as const, data: already.data() as Record<string, any> };
        if (!sameExternal.empty) return { kind: 'external' as const, otherId: sameExternal.docs[0].id };

        const changes = counterUpdates(counter.data(), counterFloors([d], years));
        if (Object.keys(changes).length > 0) tx.set(counterRef, changes, { merge: true });

        const now = admin.firestore.FieldValue.serverTimestamp();
        const record: Record<string, unknown> = {
          ...buildImportedInvoiceDoc(d, {
            uid: caller.uid, fileName: `${d.accessKey}.xml`, customerId: customerIds.get(r.i) ?? null, productIdsBySku,
          }),
          externalId: r.input.externalId,
          origin: MI_BUSETA_CHANNEL,
          importedVia: IMPORTED_VIA,
          importedXmlId: inFirestore ? d.accessKey : null,
          importedXmlPath: inFirestore ? null : storagePath,
          importedAt: now,
          updatedAt: now,
        };
        if (r.input.voided) {
          // Anulada en Mi Buseta antes de importarse: nace anulada (ver cabecera).
          Object.assign(record, {
            status: 'void',
            isVoid: true,
            voidedInOrigin: true,
            voidedAt: r.input.voidSeenAt ? admin.firestore.Timestamp.fromDate(r.input.voidSeenAt) : now,
            voidedBy: caller.uid,
            voidReason: 'Anulada en Mi Buseta antes de importarse (en el SRI sigue autorizada).',
          });
        }
        tx.set(invoiceRef, record);
        if (inFirestore) {
          tx.set(companyRef.collection('imported-xml').doc(d.accessKey), {
            invoiceId: d.accessKey, accessKey: d.accessKey, fullNumber: fullNumber(d), fileName: `${d.accessKey}.xml`,
            xml: r.authorizedXml, source: 'sri', origin: MI_BUSETA_CHANNEL, createdBy: caller.uid, createdAt: now,
          });
        }
        return { kind: 'written' as const };
      });

      if (outcome.kind === 'written') {
        results[r.i] = r.input.voided
          ? { ...ids(r), status: 'imported', voided: true, reason: 'Importada anulada: no lleva asiento.' }
          : { ...ids(r), status: 'imported' };
      } else if (outcome.kind === 'exists') {
        results[r.i] = outcome.data['externalId'] && outcome.data['externalId'] !== r.input.externalId
          ? { ...ids(r), status: 'conflict', reason: `La clave ya está importada con otro externalId (${outcome.data['externalId']}).` }
          : duplicateResult(r.input, outcome.data, 'open');
      } else {
        results[r.i] = { ...ids(r), status: 'conflict',
          reason: `El externalId ya está importado con otra clave de acceso (${outcome.otherId}).` };
      }
    } catch (e: any) {
      // Falla transitoria de Firestore/Storage: «internal» lleva a reintento en bill-service.
      console.error('[portalImportDocuments] No se pudo escribir', { companyId, accessKey: d.accessKey, error: e?.message });
      results[r.i] = { ...ids(r), status: 'internal', reason: 'No se pudo guardar; se reintentará.' };
    }
  }

  // ── 7: esperar (poco) a que el trigger de reversa deje su asiento ─────────
  const deadline = Date.now() + REVERSAL_WAIT.ms;
  let pending = waitReversal;
  while (pending.length && Date.now() < deadline) {
    await new Promise((ok) => setTimeout(ok, REVERSAL_WAIT.pollMs));
    const still: typeof pending = [];
    for (const w of pending) {
      const d = (await invoices.doc(w.input.accessKey).get()).data() as Record<string, any> | undefined;
      if (d && (d['reversalEntryId'] || d['reversalError'])) results[w.i] = duplicateResult(w.input, d, 'open');
      else still.push(w);
    }
    pending = still;
  }

  const final = results.map((r, i) => r ?? { ...base(documents[i]), status: 'invalid' as const, reason: 'Sin resultado.' });
  const summary = summarize(final);
  console.log('[portalImportDocuments]', { companyId, uid: caller.uid, ...summary });
  return { results: final, summary };
}

export const portalImportDocuments = onCall(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    const caller = requireMiBusetaCaller(request);
    const { companyId, documents } = readImportRequest(request.data);
    return importDocuments(admin.firestore(), caller, companyId, documents);
  },
);
