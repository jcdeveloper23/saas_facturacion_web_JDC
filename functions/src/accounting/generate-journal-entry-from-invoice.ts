import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { getAccountMapping } from './utils/get-account-mapping';
import { SRI_DONE } from '../utils/electronic-invoicing';

// ─── Types (mirrored from frontend models to avoid cross-module imports) ──────

interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  vatPct: number;
  vatAmount: number;
  total: number;
  averageCost?: number;  // costo promedio del producto al momento de la venta
}

interface VatSummaryLine {
  vatPct: number;
  taxableBase: number;
  vatAmount: number;
}

interface InvoiceDoc {
  status: string;
  sriStatus?: string;
  fullNumber: string;
  date: admin.firestore.Timestamp;
  customerId: string;
  customerName: string;
  netAmount: number;
  vatAmount: number;
  total: number;
  vatSummary: VatSummaryLine[];
  lines: InvoiceLine[];
  fiscalYear: string;
  accountingEntryId?: string;
  isCreditNote?: boolean;
}

interface JournalEntryLine {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  costCenterId: string | null;
  costCenterName: string | null;
  description: string;
}

// Account mapping is resolved per-company from companies/{id}/settings/accounting
// falling back to Ecuador standard codes. See utils/get-account-mapping.ts

function round2(n: number): number { return Math.round(n * 100) / 100; }

// ─── Build journal entry lines for an invoice ─────────────────────────────────

function buildInvoiceLines(invoice: InvoiceDoc, accounts: { sales15: { code: string; name: string }; sales0: { code: string; name: string }; salesExempt: { code: string; name: string }; ivaCollected: { code: string; name: string }; accountsReceivable: { code: string; name: string }; cogs: { code: string; name: string }; inventory: { code: string; name: string } }): JournalEntryLine[] {
  const lines: JournalEntryLine[] = [];

  // Debit: Accounts Receivable (total including IVA)
  lines.push({
    id:            crypto.randomUUID(),
    accountCode:   accounts.accountsReceivable.code,
    accountName:   accounts.accountsReceivable.name,
    debit:         round2(invoice.total),
    credit:        0,
    costCenterId:  null,
    costCenterName:null,
    description:   `${invoice.customerName} — ${invoice.fullNumber}`
  });

  // Credit: Sales per VAT rate
  for (const vat of (invoice.vatSummary ?? [])) {
    let salesAccount: { code: string; name: string };
    if (vat.vatPct === 0) {
      salesAccount = accounts.sales0;
    } else if (vat.vatPct > 0) {
      salesAccount = accounts.sales15; // covers 5%, 8%, 15%
    } else {
      salesAccount = accounts.salesExempt;
    }

    if (vat.taxableBase > 0) {
      lines.push({
        id:            crypto.randomUUID(),
        accountCode:   salesAccount.code,
        accountName:   salesAccount.name,
        debit:         0,
        credit:        round2(vat.taxableBase),
        costCenterId:  null,
        costCenterName:null,
        description:   `Ventas ${vat.vatPct}% IVA — ${invoice.fullNumber}`
      });
    }

    // Credit: IVA collected
    if (vat.vatAmount > 0) {
      lines.push({
        id:            crypto.randomUUID(),
        accountCode:   accounts.ivaCollected.code,
        accountName:   accounts.ivaCollected.name,
        debit:         0,
        credit:        round2(vat.vatAmount),
        costCenterId:  null,
        costCenterName:null,
        description:   `IVA ${vat.vatPct}% — ${invoice.fullNumber}`
      });
    }
  }

  // Fallback if vatSummary is empty or not available
  if ((invoice.vatSummary ?? []).length === 0) {
    lines.push({
      id:            crypto.randomUUID(),
      accountCode:   accounts.sales15.code,
      accountName:   accounts.sales15.name,
      debit:         0,
      credit:        round2(invoice.netAmount),
      costCenterId:  null,
      costCenterName:null,
      description:   `Ventas — ${invoice.fullNumber}`
    });
    if (invoice.vatAmount > 0) {
      lines.push({
        id:            crypto.randomUUID(),
        accountCode:   accounts.ivaCollected.code,
        accountName:   accounts.ivaCollected.name,
        debit:         0,
        credit:        round2(invoice.vatAmount),
        costCenterId:  null,
        costCenterName:null,
        description:   `IVA — ${invoice.fullNumber}`
      });
    }
  }

  // COGS: Costo de Ventas por cada línea con averageCost > 0 (productos con inventario)
  for (const invLine of (invoice.lines ?? [])) {
    if (!invLine.averageCost || invLine.averageCost <= 0) continue;
    const cogs = round2(invLine.quantity * invLine.averageCost);
    if (cogs <= 0) continue;

    lines.push({
      id:            crypto.randomUUID(),
      accountCode:   accounts.cogs.code,
      accountName:   accounts.cogs.name,
      debit:         cogs,
      credit:        0,
      costCenterId:  null,
      costCenterName:null,
      description:   `COGS: ${invLine.description} — ${invoice.fullNumber}`
    });
    lines.push({
      id:            crypto.randomUUID(),
      accountCode:   accounts.inventory.code,
      accountName:   accounts.inventory.name,
      debit:         0,
      credit:        cogs,
      costCenterId:  null,
      costCenterName:null,
      description:   `Salida inventario: ${invLine.description} — ${invoice.fullNumber}`
    });
  }

  return lines;
}

// ─── Reusable core (called by the trigger AND by the manual regeneration callable) ──

export type GenerateJournalEntryResult = { created: boolean; entryId?: string; reason?: string };

export async function generateJournalEntryFromInvoiceInternal(
  companyId: string,
  invoiceId: string
): Promise<GenerateJournalEntryResult> {
  const db = admin.firestore();

  const docRef = db.doc(`companies/${companyId}/invoices/${invoiceId}`);
  const snap   = await docRef.get();
  if (!snap.exists) return { created: false, reason: 'not_found' };

  const after = snap.data() as InvoiceDoc;

  // Skip credit notes — handled by generateJournalEntryFromCreditNoteInternal
  if (after.isCreditNote) return { created: false, reason: 'is_credit_note' };
  if (after.accountingEntryId) return { created: false, reason: 'already_exists', entryId: after.accountingEntryId };

  if (after.status !== 'issued' || !SRI_DONE(after.sriStatus)) {
    return { created: false, reason: 'not_ready' };
  }

  const now = admin.firestore.Timestamp.now();

  // Resolve active accounting period for the invoice year
  const periodsSnap = await db
    .collection(`companies/${companyId}/accounting_periods`)
    .where('year', '==', parseInt(after.fiscalYear ?? new Date().getFullYear().toString()))
    .where('status', '==', 'open')
    .limit(1)
    .get();

  if (periodsSnap.empty) {
    console.warn('[generateJournalEntryFromInvoice] No hay período contable abierto para el año', after.fiscalYear);
    return { created: false, reason: 'no_open_period' };
  }

  const periodDoc  = periodsSnap.docs[0];
  const periodId   = periodDoc.id;
  const periodYear = parseInt(after.fiscalYear ?? new Date().getFullYear().toString());

  // Get next journal entry number (atomic)
  const key        = `journal_${periodYear}`;
  const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
  let entryNumber  = 1;

  await db.runTransaction(async tx => {
    const counterSnap = await tx.get(counterRef);
    const current     = (counterSnap.data()?.[key] as number) ?? 0;
    entryNumber       = current + 1;
    tx.set(counterRef, { [key]: entryNumber }, { merge: true });
  });

  // Resolve account codes from company-level settings (falls back to defaults)
  const accounts = await getAccountMapping(companyId);
  const lines    = buildInvoiceLines(after, accounts);

  const totalDebit  = round2(lines.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  const isBalanced  = totalDebit === totalCredit;

  if (!isBalanced) {
    console.error('[generateJournalEntryFromInvoice] Asiento descuadrado:', { totalDebit, totalCredit });
  }

  // Create journal entry
  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  const entry = {
    number:      entryNumber,
    date:        after.date ?? now,
    description: `Factura de Venta ${after.fullNumber} — ${after.customerName}`,
    periodId,
    periodYear,
    type:        'automatic',
    status:      'posted',
    reference:   after.fullNumber,
    referenceId: invoiceId,
    lines,
    totalDebit,
    totalCredit,
    isBalanced,
    createdBy:   'system',
    createdAt:   now,
    updatedAt:   now
  };

  await entryRef.set(entry);

  // Back-reference on the invoice
  await docRef.update({
    accountingEntryId: entryRef.id,
    updatedAt:         now
  });

  console.log('[generateJournalEntryFromInvoice] Asiento creado:', entryRef.id, 'balanceado:', isBalanced);

  return { created: true, entryId: entryRef.id };
}

// ─── Trigger ──────────────────────────────────────────────────────────────────
// onDocumentWritten (no onDocumentUpdated): también debe dispararse cuando la
// factura se CREA ya en estado 'issued' (p. ej. POS o "Emitir" directo sin
// pasar por borrador), caso en el que antes nunca se generaba el asiento.

export const generateJournalEntryFromInvoice = onDocumentWritten(
  'companies/{companyId}/invoices/{invoiceId}',
  async (event) => {
    if (!event.data?.after.exists) return; // documento eliminado

    const before = event.data.before.exists ? event.data.before.data() as InvoiceDoc : undefined;
    const after  = event.data.after.data() as InvoiceDoc;

    if (after.isCreditNote) return;

    const statusChangedToIssued = before?.status !== 'issued' && after.status === 'issued' && SRI_DONE(after.sriStatus);
    const sriJustResolved = after.status === 'issued'
      && !SRI_DONE(before?.sriStatus)
      && SRI_DONE(after.sriStatus);

    const entryAlreadyCreated = !!after.accountingEntryId;

    if ((!statusChangedToIssued && !sriJustResolved) || entryAlreadyCreated) return;

    const { companyId, invoiceId } = event.params;
    console.log('[generateJournalEntryFromInvoice] Creando asiento para factura:', invoiceId, 'empresa:', companyId);

    try {
      const result = await generateJournalEntryFromInvoiceInternal(companyId, invoiceId);
      if (!result.created) {
        console.warn('[generateJournalEntryFromInvoice] No se generó asiento:', result.reason);
      }
    } catch (err) {
      console.error('[generateJournalEntryFromInvoice] Error:', err);
    }
  }
);
