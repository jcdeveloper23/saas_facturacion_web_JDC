import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { getAccountMapping } from './utils/get-account-mapping';

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

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const generateJournalEntryFromInvoice = onDocumentUpdated(
  'companies/{companyId}/invoices/{invoiceId}',
  async (event) => {
    const before = event.data?.before.data() as InvoiceDoc | undefined;
    const after  = event.data?.after.data()  as InvoiceDoc | undefined;
    if (!before || !after) return;

    // Skip credit notes — handled by generateJournalEntryFromCreditNote
    if (after.isCreditNote) return;

    const SRI_DONE = (s?: string) => s === 'authorized' || s === 'not_required';

    // Case A: status transitions to 'issued' AND sriStatus already resolved
    //   (manual invoices authorized at the same time)
    const statusChangedToIssued = before.status !== 'issued' && after.status === 'issued' && SRI_DONE(after.sriStatus);

    // Case B: invoice was already 'issued' (e.g. created by POS) and sriStatus
    //   just transitioned to authorized/not_required
    const sriJustResolved = after.status === 'issued'
      && !SRI_DONE(before.sriStatus)
      && SRI_DONE(after.sriStatus);

    const entryAlreadyCreated = !!after.accountingEntryId;

    if ((!statusChangedToIssued && !sriJustResolved) || entryAlreadyCreated) return;

    const { companyId, invoiceId } = event.params;
    const db  = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    console.log('[generateJournalEntryFromInvoice] Creando asiento para factura:', invoiceId, 'empresa:', companyId);

    try {
      // Resolve active accounting period for the invoice year
      const periodsSnap = await db
        .collection(`companies/${companyId}/accounting_periods`)
        .where('year', '==', parseInt(after.fiscalYear ?? new Date().getFullYear().toString()))
        .where('status', '==', 'open')
        .limit(1)
        .get();

      if (periodsSnap.empty) {
        console.warn('[generateJournalEntryFromInvoice] No hay período contable abierto para el año', after.fiscalYear);
        return;
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
      await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
        accountingEntryId: entryRef.id,
        updatedAt:         now
      });

      console.log('[generateJournalEntryFromInvoice] Asiento creado:', entryRef.id, 'balanceado:', isBalanced);

    } catch (err) {
      console.error('[generateJournalEntryFromInvoice] Error:', err);
    }
  }
);
