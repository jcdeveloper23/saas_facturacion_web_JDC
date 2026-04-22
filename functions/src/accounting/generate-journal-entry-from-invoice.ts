import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

// ─── Types (mirrored from frontend models to avoid cross-module imports) ──────

interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  vatPct: number;
  vatAmount: number;
  total: number;
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
  accountingEntryId?: string; // set when journal entry is created
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

// ─── Default account mapping for invoice journal entries ─────────────────────
// These codes assume the Ecuador standard chart of accounts.
// Companies can override them via platform/defaults/accountingConfig.

const DEFAULT_ACCOUNTS = {
  accountsReceivable: { code: '1.1.02.001', name: 'Cuentas por Cobrar Clientes' },
  sales15:            { code: '4.1.01.001', name: 'Ventas 15% IVA' },
  sales0:             { code: '4.1.01.002', name: 'Ventas 0% IVA' },
  salesExempt:        { code: '4.1.01.003', name: 'Ventas Exentas de IVA' },
  ivaCollected:       { code: '2.1.04.001', name: 'IVA en Ventas' },
};

function round2(n: number): number { return Math.round(n * 100) / 100; }

// ─── Build journal entry lines for an invoice ─────────────────────────────────

function buildInvoiceLines(invoice: InvoiceDoc, accounts: typeof DEFAULT_ACCOUNTS): JournalEntryLine[] {
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

  return lines;
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const generateJournalEntryFromInvoice = onDocumentUpdated(
  'companies/{companyId}/invoices/{invoiceId}',
  async (event) => {
    const before = event.data?.before.data() as InvoiceDoc | undefined;
    const after  = event.data?.after.data()  as InvoiceDoc | undefined;
    if (!before || !after) return;

    // Trigger: invoice status changed to 'issued' AND sriStatus is 'authorized' or not required
    const statusChangedToIssued = before.status !== 'issued' && after.status === 'issued';
    const sriAuthorized         = after.sriStatus === 'authorized' || after.sriStatus === 'not_required';
    const entryAlreadyCreated   = !!after.accountingEntryId;

    if (!statusChangedToIssued || !sriAuthorized || entryAlreadyCreated) return;

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

      // Resolve account codes (use defaults, could be extended to read company overrides)
      const accounts = DEFAULT_ACCOUNTS;
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
