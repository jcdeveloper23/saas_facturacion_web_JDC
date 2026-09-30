/**
 * accounting-setup.ts
 *
 * La «puesta en marcha» de la contabilidad de una empresa, desde el servidor.
 * La usa Conectate (etapa 3.1 del plan, 2026-09-30); la web de FacturaEc hace lo
 * mismo desde el navegador, sin asistente y con dos fallos que aquí no están:
 * los saldos iniciales en tres escrituras sueltas (podían duplicarse) y el
 * contador sin poder completarlos.
 *
 * Nada de esto se crea solo al dar de alta la empresa: sin plan de cuentas y sin
 * un ejercicio abierto, las facturas se emiten pero **no generan asiento** —y no
 * queda marca: solo les falta `accountingEntryId`—. El orden es:
 *   ① plan de cuentas → ② cuentas de los asientos (settings/accounting, con las
 *   estándar si no se tocan) → ③ ejercicio del año abierto → ④ saldos iniciales
 *   (opcional) → ⑤ recuperar los asientos que no se crearon.
 *
 * Solo el administrador de la empresa o el contador (decisión del usuario,
 * 2026-09-30), y `super_admin`.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { requireCompanyRole } from '../utils/callable-auth';
import { SRI_DONE } from '../utils/electronic-invoicing';
import { DEFAULT_CODES } from './utils/get-account-mapping';
import {
  ECUADOR_CHART_OF_ACCOUNTS_SEED, accountDocId, levelFromCode, parentCodeFromCode,
} from './utils/chart-seed';
import { generateJournalEntryFromInvoiceInternal } from './generate-journal-entry-from-invoice';
import { generateJournalEntryFromCreditNoteInternal } from './generate-journal-entry-from-credit-note';

const ROLES = ['admin', 'accountant'];

/**
 * Cuentas que los generadores usan fijas en el código (no se configuran):
 * compras, retenciones, cuentas por pagar y el cierre del ejercicio. Si faltan
 * en el plan, esos asientos saldrían con una cuenta inexistente.
 */
export const FIXED_CODES: Record<string, string> = {
  '1.1.05.001': 'IVA en compras',
  '2.1.01.001': 'Cuentas por pagar a proveedores',
  '2.1.04.002': 'Retención de IVA por pagar',
  '2.1.04.003': 'Retención en la fuente por pagar',
  '3.3.02.001': 'Utilidad del ejercicio',
  '3.3.02.002': 'Pérdida del ejercicio',
};

/** Nombres para el usuario de cada clave del mapeo. */
export const MAPPING_LABELS: Record<string, string> = {
  sales15: 'Ventas con IVA',
  sales0: 'Ventas con tarifa 0 %',
  salesExempt: 'Ventas exentas de IVA',
  ivaCollected: 'IVA en ventas',
  accountsReceivable: 'Cuentas por cobrar a clientes',
  inventory: 'Inventario',
  cogs: 'Costo de ventas',
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function readCompanyId(data: any): string {
  const companyId = typeof data?.companyId === 'string' ? data.companyId.trim() : '';
  if (!companyId) throw new HttpsError('invalid-argument', 'Falta la empresa.');
  return companyId;
}

function readYear(data: any): number {
  const y = Number(data?.year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new HttpsError('invalid-argument', 'El año no es válido.');
  return y;
}

type Cuenta = { code: string; name: string; isActive: boolean; allowsMovement: boolean };

/** Qué le pasa a una cuenta del mapeo o fija, o null si sirve. */
export function accountProblem(code: string, byCode: Map<string, Cuenta>): string | null {
  const c = byCode.get(code);
  if (!c) return 'no existe en el plan de cuentas';
  if (!c.isActive) return 'está inactiva';
  if (!c.allowsMovement) return 'es agrupadora: no admite movimientos';
  return null;
}

/** El mapeo efectivo: lo guardado y, para lo que falte, las cuentas estándar. */
export function effectiveMapping(saved: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, def] of Object.entries(DEFAULT_CODES)) {
    const v = saved?.[k];
    out[k] = typeof v === 'string' && v.trim() ? v.trim() : def;
  }
  return out;
}

/** Si una factura o NC debería tener asiento y no lo tiene. */
export function needsEntry(d: Record<string, any>): boolean {
  return ['issued', 'paid'].includes(d.status) && d.isVoid !== true
    && SRI_DONE(d.sriStatus) && !d.accountingEntryId;
}

async function loadAccounts(db: admin.firestore.Firestore, companyId: string): Promise<Map<string, Cuenta>> {
  const snap = await db.collection(`companies/${companyId}/chart_of_accounts`).get();
  const m = new Map<string, Cuenta>();
  for (const d of snap.docs) {
    const x = d.data();
    if (typeof x.code === 'string') {
      m.set(x.code, {
        code: x.code, name: String(x.name ?? ''), isActive: x.isActive !== false, allowsMovement: x.allowsMovement === true,
      });
    }
  }
  return m;
}

async function openPeriodOf(db: admin.firestore.Firestore, companyId: string, year: number) {
  const q = await db.collection(`companies/${companyId}/accounting_periods`)
    .where('year', '==', year).where('status', '==', 'open').limit(1).get();
  return q.empty ? null : q.docs[0];
}

// ─── ⓪ Estado ────────────────────────────────────────────────────────────────

/**
 * En qué punto está la puesta en marcha para un año. Payload: { companyId, year }.
 * `pendingEntries` cuenta las facturas y NC de ese año que deberían tener asiento
 * y no lo tienen (se recuperan con `regenerateJournalEntries`).
 */
export const accountingSetupStatus = onCall(async (request) => {
  const companyId = readCompanyId(request.data);
  const year = readYear(request.data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();

  const [accounts, settings, period, invoices] = await Promise.all([
    loadAccounts(db, companyId),
    db.doc(`companies/${companyId}/settings/accounting`).get(),
    openPeriodOf(db, companyId, year),
    db.collection(`companies/${companyId}/invoices`).where('fiscalYear', '==', String(year)).get(),
  ]);

  const mapping = effectiveMapping(settings.data()?.accountMapping);
  const mappingItems = Object.entries(mapping).map(([key, code]) => ({
    key, label: MAPPING_LABELS[key] ?? key, code,
    name: accounts.get(code)?.name ?? '',
    problem: accounts.size ? accountProblem(code, accounts) : null,
    isDefault: code === (DEFAULT_CODES as Record<string, string>)[key],
  }));
  const fixedItems = Object.entries(FIXED_CODES).map(([code, label]) => ({
    code, label, name: accounts.get(code)?.name ?? '',
    problem: accounts.size ? accountProblem(code, accounts) : null,
  }));

  return {
    year,
    accounts: { count: accounts.size, seedCount: ECUADOR_CHART_OF_ACCOUNTS_SEED.length },
    mapping: { saved: settings.exists, items: mappingItems, fixed: fixedItems },
    period: period ? {
      id: period.id,
      year,
      status: period.get('status'),
      openingEntryId: period.get('openingEntryId') ?? null,
    } : null,
    pendingEntries: invoices.docs.filter((d) => needsEntry(d.data())).length,
  };
});

// ─── ① Plan de cuentas ───────────────────────────────────────────────────────

/**
 * Carga el plan de cuentas estándar. Idempotente: se salta los códigos que ya
 * existen (también los que se crearon a mano) y usa el mismo id que la web.
 * Payload: { companyId }.
 */
export const seedChartOfAccounts = onCall(async (request) => {
  const companyId = readCompanyId(request.data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth!.uid;

  const existentes = await loadAccounts(db, companyId);
  const nuevas = ECUADOR_CHART_OF_ACCOUNTS_SEED.filter((e) => !existentes.has(e.code));
  const col = db.collection(`companies/${companyId}/chart_of_accounts`);
  const now = admin.firestore.Timestamp.now();
  for (let i = 0; i < nuevas.length; i += 400) {
    const batch = db.batch();
    for (const e of nuevas.slice(i, i + 400)) {
      batch.set(col.doc(accountDocId(e.code)), {
        code: e.code,
        name: e.name,
        type: e.type,
        nature: e.nature,
        level: levelFromCode(e.code),
        parentCode: parentCodeFromCode(e.code),
        isActive: true,
        isAuxiliary: e.allowsMovement,
        allowsMovement: e.allowsMovement,
        createdBy: uid,
        createdAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
  }
  console.log('[seedChartOfAccounts]', { companyId, uid, created: nuevas.length, skipped: existentes.size });
  return { created: nuevas.length, skipped: ECUADOR_CHART_OF_ACCOUNTS_SEED.length - nuevas.length };
});

// ─── ③ Ejercicio ─────────────────────────────────────────────────────────────

/**
 * Abre el ejercicio contable de un año (uno por año, como en FacturaEc). Si ya
 * hay uno abierto, lo devuelve sin crear otro. Payload: { companyId, year }.
 */
export const openAccountingPeriod = onCall(async (request) => {
  const companyId = readCompanyId(request.data);
  const year = readYear(request.data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();
  const uid = request.auth!.uid;
  const col = db.collection(`companies/${companyId}/accounting_periods`);

  // Id determinístico por año: dos toques seguidos no crean dos ejercicios.
  const ref = col.doc(`y${year}`);
  const result = await db.runTransaction(async (tx) => {
    const otroAbierto = await tx.get(col.where('year', '==', year).where('status', '==', 'open').limit(1));
    if (!otroAbierto.empty) return { id: otroAbierto.docs[0].id, created: false };
    const actual = await tx.get(ref);
    if (actual.exists) {
      throw new HttpsError('failed-precondition',
        `El ejercicio ${year} existe y está ${actual.get('status') === 'closed' ? 'cerrado' : 'bloqueado'}. Se reabre desde la web de FacturaEc.`);
    }
    const now = admin.firestore.Timestamp.now();
    tx.set(ref, {
      year,
      name: `Ejercicio ${year}`,
      // Medianoche de Ecuador (UTC-5).
      startDate: admin.firestore.Timestamp.fromDate(new Date(Date.UTC(year, 0, 1, 5))),
      endDate: admin.firestore.Timestamp.fromDate(new Date(Date.UTC(year + 1, 0, 1, 4, 59, 59))),
      status: 'open',
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });
    return { id: ref.id, created: true };
  });
  console.log('[openAccountingPeriod]', { companyId, year, uid, ...result });
  return result;
});

// ─── ④ Saldos iniciales ──────────────────────────────────────────────────────

/**
 * Carga los saldos iniciales como asiento de apertura del ejercicio, en una sola
 * transacción: numera el asiento, lo deja contabilizado y lo enlaza al ejercicio.
 * Payload: { companyId, periodId, lines: [{ code, debit, credit }] }.
 */
export const saveOpeningBalances = onCall(async (request) => {
  const companyId = readCompanyId(request.data);
  requireCompanyRole(request, companyId, ROLES);
  const periodId = typeof request.data?.periodId === 'string' ? request.data.periodId : '';
  if (!periodId) throw new HttpsError('invalid-argument', 'Falta el ejercicio.');
  const raw = Array.isArray(request.data?.lines) ? request.data.lines : [];
  const db = admin.firestore();
  const uid = request.auth!.uid;

  const accounts = await loadAccounts(db, companyId);
  const lines = raw
    .map((l: any) => ({ code: String(l?.code ?? '').trim(), debit: r2(Number(l?.debit) || 0), credit: r2(Number(l?.credit) || 0) }))
    .filter((l: any) => l.debit > 0 || l.credit > 0);
  if (lines.length === 0) throw new HttpsError('invalid-argument', 'No hay ningún saldo.');
  for (const l of lines) {
    if (l.debit < 0 || l.credit < 0) throw new HttpsError('invalid-argument', `La cuenta ${l.code} tiene un valor negativo.`);
    if (l.debit > 0 && l.credit > 0) throw new HttpsError('invalid-argument', `La cuenta ${l.code} tiene debe y haber a la vez.`);
    const p = accountProblem(l.code, accounts);
    if (p) throw new HttpsError('invalid-argument', `La cuenta ${l.code} ${p}.`);
  }
  const totalDebit = r2(lines.reduce((s: number, l: any) => s + l.debit, 0));
  const totalCredit = r2(lines.reduce((s: number, l: any) => s + l.credit, 0));
  if (totalDebit !== totalCredit) {
    throw new HttpsError('invalid-argument',
      `El asiento no cuadra: debe $${totalDebit.toFixed(2)} y haber $${totalCredit.toFixed(2)}.`);
  }

  const periodRef = db.doc(`companies/${companyId}/accounting_periods/${periodId}`);
  const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();

  const res = await db.runTransaction(async (tx) => {
    const [period, counter] = await Promise.all([tx.get(periodRef), tx.get(counterRef)]);
    if (!period.exists) throw new HttpsError('not-found', 'El ejercicio no existe.');
    if (period.get('status') !== 'open') throw new HttpsError('failed-precondition', 'El ejercicio no está abierto.');
    if (period.get('openingEntryId')) {
      throw new HttpsError('already-exists', 'Este ejercicio ya tiene saldos iniciales.');
    }
    const year = Number(period.get('year'));
    const key = `journal_${year}`;
    const number = (Number(counter.get(key)) || 0) + 1;
    const now = admin.firestore.Timestamp.now();
    tx.set(counterRef, { [key]: number }, { merge: true });
    tx.set(entryRef, {
      number,
      date: period.get('startDate'),
      description: `Saldos iniciales — ${period.get('name') ?? `Ejercicio ${year}`}`,
      periodId,
      periodYear: year,
      type: 'opening',
      status: 'posted',
      reference: 'Saldos iniciales',
      referenceId: periodId,
      lines: lines.map((l: any, i: number) => ({
        id: `l${i + 1}`,
        accountCode: l.code,
        accountName: accounts.get(l.code)!.name,
        debit: l.debit,
        credit: l.credit,
        costCenterId: null,
        costCenterName: null,
        description: 'Saldo inicial',
      })),
      accountCodes: [...new Set(lines.map((l: any) => l.code))],
      totalDebit,
      totalCredit,
      isBalanced: true,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });
    tx.update(periodRef, { openingEntryId: entryRef.id, updatedAt: now, updatedBy: uid });
    return { entryId: entryRef.id, number };
  });
  console.log('[saveOpeningBalances]', { companyId, periodId, uid, ...res, lines: lines.length, totalDebit });
  return { ...res, totalDebit, totalCredit };
});

// ─── ⑤ Recuperar asientos ────────────────────────────────────────────────────

/**
 * Contabiliza las facturas y notas de crédito de un año que deberían tener
 * asiento y no lo tienen (emitidas o cobradas, autorizadas o sin SRI, no
 * anuladas). Pasa por los mismos generadores que los disparadores, así que el
 * asiento sale igual que si se hubiera creado al emitir. Payload:
 * { companyId, year }. Devuelve cuántos se crearon y por qué no los demás.
 */
export const regenerateJournalEntries = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  const companyId = readCompanyId(request.data);
  const year = readYear(request.data);
  requireCompanyRole(request, companyId, ROLES);
  const db = admin.firestore();

  if (!(await openPeriodOf(db, companyId, year))) {
    throw new HttpsError('failed-precondition', `Primero abre el ejercicio ${year}.`);
  }
  const snap = await db.collection(`companies/${companyId}/invoices`).where('fiscalYear', '==', String(year)).get();
  const pendientes = snap.docs.filter((d) => needsEntry(d.data()));

  let created = 0;
  const motivos: Record<string, number> = {};
  const errores: string[] = [];
  for (const d of pendientes) {
    const x = d.data();
    const esNota = x.isCreditNote === true || x.documentType === 'creditNote';
    try {
      const r = esNota
        ? await generateJournalEntryFromCreditNoteInternal(companyId, d.id)
        : await generateJournalEntryFromInvoiceInternal(companyId, d.id);
      if (r.created) created++;
      else motivos[r.reason ?? 'desconocido'] = (motivos[r.reason ?? 'desconocido'] ?? 0) + 1;
    } catch (e: any) {
      motivos.error = (motivos.error ?? 0) + 1;
      if (errores.length < 5) errores.push(`${x.fullNumber ?? d.id}: ${e?.message ?? e}`);
    }
  }
  console.log('[regenerateJournalEntries]', { companyId, year, pendientes: pendientes.length, created, motivos });
  return { pending: pendientes.length, created, skipped: motivos, errors: errores };
});
