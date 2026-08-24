import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { getAccountMapping } from './utils/get-account-mapping';
import { SRI_DONE } from '../utils/electronic-invoicing';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditNoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  taxRate: number;
  taxAmount: number;
  averageCost?: number;  // para revertir COGS si aplica
}

interface VatSummaryLine {
  vatPct: number;
  taxableBase: number;
  vatAmount: number;
}

interface CreditNoteDoc {
  status: string;
  sriStatus?: string;
  isCreditNote: boolean;
  fullNumber: string;
  date: admin.firestore.Timestamp;
  customerId?: string;
  customerName: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  taxableBase: number;
  vatSummary?: VatSummaryLine[];
  lines: CreditNoteLine[];
  fiscalYear?: string;
  rectifiedInvoiceNumber?: string;
  creditNoteMotivo?: string;
  accountingEntryId?: string;
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

function round2(n: number): number { return Math.round(n * 100) / 100; }

// ─── Build credit note journal entry lines ────────────────────────────────────
// Asiento inverso al de la factura: devolvemos ingreso y anulamos IVA cobrado.
// Débito: Ventas (reversa del ingreso), Débito: IVA en Ventas
// Crédito: Cuentas por Cobrar (reducción de la deuda del cliente)

function buildCreditNoteLines(note: CreditNoteDoc, accounts: { sales15: { code: string; name: string }; sales0: { code: string; name: string }; salesExempt: { code: string; name: string }; ivaCollected: { code: string; name: string }; accountsReceivable: { code: string; name: string }; cogs: { code: string; name: string }; inventory: { code: string; name: string } }): JournalEntryLine[] {
  const lines: JournalEntryLine[] = [];
  const ref = note.fullNumber;

  // Credit: Accounts Receivable (reduce CxC — el cliente ya no nos debe ese monto)
  lines.push({
    id:            crypto.randomUUID(),
    accountCode:   accounts.accountsReceivable.code,
    accountName:   accounts.accountsReceivable.name,
    debit:         0,
    credit:        round2(note.total),
    costCenterId:  null,
    costCenterName:null,
    description:   `NC: ${note.customerName} — ${ref}`
  });

  // Debit: Reverse sales revenue per VAT rate
  const vatSummary = note.vatSummary ?? [];

  if (vatSummary.length > 0) {
    for (const vat of vatSummary) {
      let salesAccount: { code: string; name: string };
      if (vat.vatPct === 0) {
        salesAccount = accounts.sales0;
      } else if (vat.vatPct > 0) {
        salesAccount = accounts.sales15;
      } else {
        salesAccount = accounts.salesExempt;
      }

      if (vat.taxableBase > 0) {
        lines.push({
          id:            crypto.randomUUID(),
          accountCode:   salesAccount.code,
          accountName:   salesAccount.name,
          debit:         round2(vat.taxableBase),
          credit:        0,
          costCenterId:  null,
          costCenterName:null,
          description:   `Reversa venta ${vat.vatPct}% IVA — ${ref}`
        });
      }

      // Debit: IVA collected (reverse the IVA credit)
      if (vat.vatAmount > 0) {
        lines.push({
          id:            crypto.randomUUID(),
          accountCode:   accounts.ivaCollected.code,
          accountName:   accounts.ivaCollected.name,
          debit:         round2(vat.vatAmount),
          credit:        0,
          costCenterId:  null,
          costCenterName:null,
          description:   `Reversa IVA ${vat.vatPct}% — ${ref}`
        });
      }
    }
  } else {
    // Fallback: use note totals
    lines.push({
      id:            crypto.randomUUID(),
      accountCode:   accounts.sales15.code,
      accountName:   accounts.sales15.name,
      debit:         round2(note.subtotal),
      credit:        0,
      costCenterId:  null,
      costCenterName:null,
      description:   `Reversa venta — ${ref}`
    });
    if (note.vatAmount > 0) {
      lines.push({
        id:            crypto.randomUUID(),
        accountCode:   accounts.ivaCollected.code,
        accountName:   accounts.ivaCollected.name,
        debit:         round2(note.vatAmount),
        credit:        0,
        costCenterId:  null,
        costCenterName:null,
        description:   `Reversa IVA — ${ref}`
      });
    }
  }

  // COGS reversal: if the credit note involves inventory products, reverse the COGS
  for (const invLine of (note.lines ?? [])) {
    if (!invLine.averageCost || invLine.averageCost <= 0) continue;
    const cogs = round2(invLine.quantity * invLine.averageCost);
    if (cogs <= 0) continue;

    // Reverse COGS: credit Costo de Ventas, debit Inventario (re-ingresa mercadería)
    lines.push({
      id:            crypto.randomUUID(),
      accountCode:   accounts.inventory.code,
      accountName:   accounts.inventory.name,
      debit:         cogs,
      credit:        0,
      costCenterId:  null,
      costCenterName:null,
      description:   `Reingreso inventario NC: ${invLine.description} — ${ref}`
    });
    lines.push({
      id:            crypto.randomUUID(),
      accountCode:   accounts.cogs.code,
      accountName:   accounts.cogs.name,
      debit:         0,
      credit:        cogs,
      costCenterId:  null,
      costCenterName:null,
      description:   `Reversa COGS NC: ${invLine.description} — ${ref}`
    });
  }

  return lines;
}

// ─── Reusable core (called by the trigger AND by the manual regeneration callable) ──

export type GenerateJournalEntryResult = { created: boolean; entryId?: string; reason?: string };

export async function generateJournalEntryFromCreditNoteInternal(
  companyId: string,
  invoiceId: string
): Promise<GenerateJournalEntryResult> {
  const db = admin.firestore();

  const docRef = db.doc(`companies/${companyId}/invoices/${invoiceId}`);
  const snap   = await docRef.get();
  if (!snap.exists) return { created: false, reason: 'not_found' };

  const after = snap.data() as CreditNoteDoc;

  if (!after.isCreditNote) return { created: false, reason: 'not_credit_note' };
  if (after.accountingEntryId) return { created: false, reason: 'already_exists', entryId: after.accountingEntryId };

  if (after.status !== 'issued' || !SRI_DONE(after.sriStatus)) {
    return { created: false, reason: 'not_ready' };
  }

  const now = admin.firestore.Timestamp.now();
  const fiscalYear = after.fiscalYear ?? new Date().getFullYear().toString();

  // Resolve open accounting period
  const periodsSnap = await db
    .collection(`companies/${companyId}/accounting_periods`)
    .where('year',   '==', parseInt(fiscalYear))
    .where('status', '==', 'open')
    .limit(1)
    .get();

  if (periodsSnap.empty) {
    console.warn('[generateJournalEntryFromCreditNote] No hay período contable abierto para el año', fiscalYear);
    return { created: false, reason: 'no_open_period' };
  }

  const periodDoc  = periodsSnap.docs[0];
  const periodId   = periodDoc.id;
  const periodYear = parseInt(fiscalYear);

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

  const accounts = await getAccountMapping(companyId);
  const lines    = buildCreditNoteLines(after, accounts);

  const totalDebit  = round2(lines.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

  if (!isBalanced) {
    console.error('[generateJournalEntryFromCreditNote] Asiento descuadrado — NO se crea:', { totalDebit, totalCredit, invoiceId });
    return { created: false, reason: 'unbalanced' };
  }

  const desc = after.rectifiedInvoiceNumber
    ? `Nota de Crédito ${after.fullNumber} — Anula ${after.rectifiedInvoiceNumber}`
    : `Nota de Crédito ${after.fullNumber} — ${after.customerName}`;

  const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
  await entryRef.set({
    number:      entryNumber,
    date:        after.date ?? now,
    description: desc,
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
  });

  await docRef.update({
    accountingEntryId: entryRef.id,
    updatedAt:         now
  });

  console.log('[generateJournalEntryFromCreditNote] Asiento NC creado:', entryRef.id, 'balanceado:', isBalanced);

  return { created: true, entryId: entryRef.id };
}

// ─── Trigger ──────────────────────────────────────────────────────────────────
// onDocumentWritten: cubre también el caso en que la NC se cree directamente
// ya en estado 'issued' (poco común hoy, ya que el flujo normal la crea en
// 'draft', pero mantiene consistencia con el resto de generadores).

export const generateJournalEntryFromCreditNote = onDocumentWritten(
  'companies/{companyId}/invoices/{invoiceId}',
  async (event) => {
    if (!event.data?.after.exists) return;

    const before = event.data.before.exists ? event.data.before.data() as CreditNoteDoc : undefined;
    const after  = event.data.after.data() as CreditNoteDoc;

    if (!after.isCreditNote) return;

    const statusChangedToIssued = before?.status !== 'issued' && after.status === 'issued' && SRI_DONE(after.sriStatus);
    const sriJustResolved       = after.status === 'issued' && !SRI_DONE(before?.sriStatus) && SRI_DONE(after.sriStatus);
    const entryAlreadyCreated   = !!after.accountingEntryId;

    if ((!statusChangedToIssued && !sriJustResolved) || entryAlreadyCreated) return;

    const { companyId, invoiceId } = event.params;
    console.log('[generateJournalEntryFromCreditNote] Creando asiento NC:', invoiceId, 'empresa:', companyId);

    try {
      const result = await generateJournalEntryFromCreditNoteInternal(companyId, invoiceId);
      if (!result.created) {
        console.warn('[generateJournalEntryFromCreditNote] No se generó asiento:', result.reason);
      }
    } catch (err) {
      console.error('[generateJournalEntryFromCreditNote] Error:', err);
    }
  }
);
