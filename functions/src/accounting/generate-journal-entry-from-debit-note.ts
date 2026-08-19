import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { getAccountMapping } from './utils/get-account-mapping';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebitNoteDoc {
  status:    string;
  sriStatus?: string;
  fullNumber: string;
  date:       admin.firestore.Timestamp;
  customerId?:   string;
  customerName:  string;
  totalSinImpuestos: number;
  vatPct:    number;
  vatAmount: number;
  total:     number;
  fiscalYear?: string;
  originalInvoiceNumber?: string;
  accountingEntryId?: string;
}

interface JournalEntryLine {
  id:             string;
  accountCode:    string;
  accountName:    string;
  debit:          number;
  credit:         number;
  costCenterId:   string | null;
  costCenterName: string | null;
  description:    string;
}

// Account mapping is resolved per-company from companies/{id}/settings/accounting

function round2(n: number): number { return Math.round(n * 100) / 100; }

// ─── Build debit note journal entry lines ─────────────────────────────────────
// Una nota de débito INCREMENTA la obligación del cliente (ej. ajuste en precio).
// Débito:  Cuentas por Cobrar  (aumenta lo que nos deben)
// Crédito: Ingresos por Ventas (aumenta el ingreso)
// Crédito: IVA en Ventas       (aumenta el IVA generado)

function buildDebitNoteLines(note: DebitNoteDoc, accounts: { sales15: { code: string; name: string }; sales0: { code: string; name: string }; salesExempt: { code: string; name: string }; ivaCollected: { code: string; name: string }; accountsReceivable: { code: string; name: string } }): JournalEntryLine[] {
  const lines: JournalEntryLine[] = [];
  const ref = note.fullNumber;

  // Debit: Accounts Receivable (the client now owes us more)
  lines.push({
    id:             crypto.randomUUID(),
    accountCode:    accounts.accountsReceivable.code,
    accountName:    accounts.accountsReceivable.name,
    debit:          round2(note.total),
    credit:         0,
    costCenterId:   null,
    costCenterName: null,
    description:    `ND: ${note.customerName} — ${ref}`
  });

  // Determine sales account by VAT rate
  const salesAccount = note.vatPct > 0
    ? (note.vatPct >= 15 ? accounts.sales15 : accounts.salesExempt)
    : accounts.sales0;

  // Credit: Sales revenue (base amount)
  if (note.totalSinImpuestos > 0) {
    lines.push({
      id:             crypto.randomUUID(),
      accountCode:    salesAccount.code,
      accountName:    salesAccount.name,
      debit:          0,
      credit:         round2(note.totalSinImpuestos),
      costCenterId:   null,
      costCenterName: null,
      description:    `Ingreso ND ${note.vatPct}% IVA — ${ref}`
    });
  }

  // Credit: IVA collected (VAT amount)
  if (note.vatAmount > 0) {
    lines.push({
      id:             crypto.randomUUID(),
      accountCode:    accounts.ivaCollected.code,
      accountName:    accounts.ivaCollected.name,
      debit:          0,
      credit:         round2(note.vatAmount),
      costCenterId:   null,
      costCenterName: null,
      description:    `IVA ND ${note.vatPct}% — ${ref}`
    });
  }

  return lines;
}

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const generateJournalEntryFromDebitNote = onDocumentUpdated(
  'companies/{companyId}/debitNotes/{debitNoteId}',
  async (event) => {
    const before = event.data?.before.data() as DebitNoteDoc | undefined;
    const after  = event.data?.after.data()  as DebitNoteDoc | undefined;
    if (!before || !after) return;

    const SRI_DONE = (s?: string) => s === 'authorized' || s === 'not_required';

    // Trigger when status → issued (and SRI done) OR when SRI status just resolved
    const statusChangedToIssued = before.status !== 'issued' && after.status === 'issued' && SRI_DONE(after.sriStatus);
    const sriJustResolved       = after.status === 'issued' && !SRI_DONE(before.sriStatus) && SRI_DONE(after.sriStatus);
    const entryAlreadyCreated   = !!after.accountingEntryId;

    if ((!statusChangedToIssued && !sriJustResolved) || entryAlreadyCreated) return;

    const { companyId, debitNoteId } = event.params;
    const db  = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    const fiscalYear = after.fiscalYear ?? new Date().getFullYear().toString();

    console.log('[generateJournalEntryFromDebitNote] Creando asiento ND:', debitNoteId, 'empresa:', companyId);

    try {
      // Resolve open accounting period
      const periodsSnap = await db
        .collection(`companies/${companyId}/accounting_periods`)
        .where('year',   '==', parseInt(fiscalYear))
        .where('status', '==', 'open')
        .limit(1)
        .get();

      if (periodsSnap.empty) {
        console.warn('[generateJournalEntryFromDebitNote] No hay período contable abierto para el año', fiscalYear);
        return;
      }

      const periodDoc  = periodsSnap.docs[0];
      const periodId   = periodDoc.id;
      const periodYear = parseInt(fiscalYear);

      // Atomic counter for journal entry number
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
      const lines    = buildDebitNoteLines(after, accounts);

      const totalDebit  = round2(lines.reduce((s, l) => s + l.debit,  0));
      const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
      const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

      if (!isBalanced) {
        console.error('[generateJournalEntryFromDebitNote] Asiento descuadrado:', { totalDebit, totalCredit });
      }

      const desc = after.originalInvoiceNumber
        ? `Nota de Débito ${after.fullNumber} — Ajuste ${after.originalInvoiceNumber}`
        : `Nota de Débito ${after.fullNumber} — ${after.customerName}`;

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
        referenceId: debitNoteId,
        referenceType: 'debit_note',
        lines,
        totalDebit,
        totalCredit,
        isBalanced,
        createdBy:   'system',
        createdAt:   now,
        updatedAt:   now
      });

      await db.doc(`companies/${companyId}/debitNotes/${debitNoteId}`).update({
        accountingEntryId: entryRef.id,
        updatedAt:         now
      });

      console.log('[generateJournalEntryFromDebitNote] Asiento ND creado:', entryRef.id, 'balanceado:', isBalanced);

    } catch (err) {
      console.error('[generateJournalEntryFromDebitNote] Error:', err);
    }
  }
);
