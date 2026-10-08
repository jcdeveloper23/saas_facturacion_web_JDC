import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { getAccountMapping } from './utils/get-account-mapping';
import {
  ReceivedRetentionDoc, buildReceivedRetentionLines, receivableFromSaleEntry,
  receivedRetentionCents, resolveReceivedRetentionAccount,
} from './utils/received-retention';

// ─── Asiento de una retención recibida de un cliente (2026-10-08) ─────────────
//
//   Debe  1.1.05.006 Retenciones IVA                 = IVA retenido
//   Debe  1.1.05.005 Retenciones en la Fuente IR     = renta retenida
//   Haber Cuentas por cobrar (la del asiento de la venta)
//
// Exige un ejercicio abierto para el año de la retención (`fiscalYear`), como
// los demás. Asiento, contador y back-reference (`accountingEntryId`) van en
// UNA transacción que vuelve a mirar accountingEntryId: si el trigger y la
// recuperación (regenerateJournalEntries) corren a la vez, solo uno lo crea.
// La anulación (isVoid) la revierte generateReversalFromReceivedRetention.

export type GenerateJournalEntryResult = { created: boolean; entryId?: string; reason?: string };

export async function generateJournalEntryFromReceivedRetentionInternal(
  companyId: string,
  retentionId: string,
): Promise<GenerateJournalEntryResult> {
  const db = admin.firestore();
  const docRef = db.doc(`companies/${companyId}/receivedRetentions/${retentionId}`);
  const snap = await docRef.get();
  if (!snap.exists) return { created: false, reason: 'not_found' };
  const r = snap.data() as ReceivedRetentionDoc;

  if (r.accountingEntryId) return { created: false, reason: 'already_exists', entryId: r.accountingEntryId };
  if (r.status !== 'registered' || r.isVoid === true) return { created: false, reason: 'not_ready' };
  const { iva, renta } = receivedRetentionCents(r);
  if (iva + renta <= 0) return { created: false, reason: 'no_taxes' };

  const year = parseInt(String(r.fiscalYear ?? ''), 10);
  if (!Number.isFinite(year)) return { created: false, reason: 'not_ready' };
  const periodsSnap = await db.collection(`companies/${companyId}/accounting_periods`)
    .where('year', '==', year).where('status', '==', 'open').limit(1).get();
  if (periodsSnap.empty) {
    console.warn('[generateJournalEntryFromReceivedRetention] No hay período contable abierto para el año', year);
    return { created: false, reason: 'no_open_period' };
  }
  const periodId = periodsSnap.docs[0].id;

  // Cuentas: las del plan de la empresa (1.1.05.006 / 1.1.05.005, o su
  // respaldo) y la CxC del asiento de la venta.
  const codes = [
    '1.1.05.006', '1.1.05.005', '1.1.05.002', '1.1.05.003',
  ];
  const [accountsSnap, mapping] = await Promise.all([
    db.collection(`companies/${companyId}/chart_of_accounts`).where('code', 'in', codes).get(),
    getAccountMapping(companyId),
  ]);
  // Si la empresa no tiene ninguna de las cuatro, puede ser que no tenga plan
  // cargado: se mira si tiene alguna cuenta antes de decir que faltan.
  const existing = new Map<string, string>();
  for (const d of accountsSnap.docs) {
    const x = d.data();
    if (typeof x.code === 'string' && x.isActive !== false) existing.set(x.code, String(x.name ?? x.code));
  }
  if (existing.size === 0) {
    const any = await db.collection(`companies/${companyId}/chart_of_accounts`).limit(1).get();
    if (!any.empty) existing.set('__plan__', '');
  }
  const ivaAcc = resolveReceivedRetentionAccount('iva', existing);
  const rentaAcc = resolveReceivedRetentionAccount('renta', existing);
  for (const [k, a] of [['IVA', ivaAcc], ['renta', rentaAcc]] as const) {
    if (a.fallbackUsed) {
      console.warn(`[generateJournalEntryFromReceivedRetention] La empresa ${companyId} no tiene la cuenta estándar de retenciones de ${k}: se usa ${a.account.code}.`);
    } else if (a.missing) {
      console.warn(`[generateJournalEntryFromReceivedRetention] La empresa ${companyId} no tiene ${a.account.code} en su plan: el asiento la usa igual (volver a sembrar el plan la crea).`);
    }
  }

  let receivable = mapping.accountsReceivable;
  if (r.invoiceId) {
    const inv = await db.doc(`companies/${companyId}/invoices/${r.invoiceId}`).get();
    const saleEntryId = inv.get('accountingEntryId');
    if (typeof saleEntryId === 'string' && saleEntryId) {
      const sale = await db.doc(`companies/${companyId}/journal_entries/${saleEntryId}`).get();
      receivable = receivableFromSaleEntry(sale.get('lines')) ?? receivable;
    }
  }

  const drafts = buildReceivedRetentionLines(r, { iva: ivaAcc.account, renta: rentaAcc.account, receivable });
  const lines = drafts.map((l) => ({ id: crypto.randomUUID(), costCenterId: null, costCenterName: null, ...l }));
  const total = (iva + renta) / 100;

  const now = admin.firestore.Timestamp.now();
  const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  const key = `journal_${year}`;
  const reference = r.number || retentionId;

  const created = await db.runTransaction(async (tx) => {
    const [fresh, counter] = await Promise.all([tx.get(docRef), tx.get(counterRef)]);
    if (fresh.get('accountingEntryId') || fresh.get('isVoid') === true) return false;
    const number = ((counter.data()?.[key] as number) ?? 0) + 1;
    tx.set(counterRef, { [key]: number }, { merge: true });
    tx.set(entryRef, {
      number,
      date: r.date ?? now,
      description: `Retención recibida ${reference}${r.customerName ? ` — ${r.customerName}` : ''}`
        + `${r.invoiceNumber ? ` (Fact. ${r.invoiceNumber})` : ''}`,
      periodId,
      periodYear: year,
      type: 'automatic',
      status: 'posted',
      reference,
      referenceId: retentionId,
      lines,
      accountCodes: [...new Set(lines.map((l) => l.accountCode))],
      totalDebit: total,
      totalCredit: total,
      isBalanced: true,
      createdBy: 'system',
      createdAt: now,
      updatedAt: now,
    });
    tx.update(docRef, { accountingEntryId: entryRef.id, accountingError: admin.firestore.FieldValue.delete(), updatedAt: now });
    return true;
  });

  return created ? { created: true, entryId: entryRef.id } : { created: false, reason: 'already_exists' };
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const generateJournalEntryFromReceivedRetention = onDocumentWritten(
  'companies/{companyId}/receivedRetentions/{retentionId}',
  async (event) => {
    if (!event.data?.after.exists) return;
    const before = event.data.before.exists ? event.data.before.data() as ReceivedRetentionDoc : undefined;
    const after = event.data.after.data() as ReceivedRetentionDoc;
    const nowRegistered = before?.status !== 'registered' && after.status === 'registered';
    if (!nowRegistered || after.accountingEntryId || after.isVoid === true) return;

    const { companyId, retentionId } = event.params;
    try {
      const result = await generateJournalEntryFromReceivedRetentionInternal(companyId, retentionId);
      if (!result.created) {
        console.warn('[generateJournalEntryFromReceivedRetention] No se generó asiento:', result.reason, retentionId);
      }
    } catch (err) {
      console.error('[generateJournalEntryFromReceivedRetention] Error:', err);
    }
  },
);
