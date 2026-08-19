import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

// ─── Reversa automática de asientos contables al anular documentos ────────────
//
// Trigger: onDocumentUpdated para cada colección de documentos fiscales.
// Condición: before.isVoid === false && after.isVoid === true
// Acción:
//   1. Lee el asiento original desde accountingEntryId
//   2. Crea un asiento espejo con débitos/créditos invertidos
//   3. Marca el asiento original como 'cancelled' con referencia al asiento de reversa
//   4. Escribe reversalEntryId en el documento anulado

// ─── Shared types ─────────────────────────────────────────────────────────────

interface VoidableDoc {
  isVoid:             boolean;
  accountingEntryId?: string;
  fullNumber?:        string;
  fiscalYear?:        string;
}

interface JournalEntryLineRaw {
  id:             string;
  accountCode:    string;
  accountName:    string;
  debit:          number;
  credit:         number;
  costCenterId:   string | null;
  costCenterName: string | null;
  description?:   string;
}

interface JournalEntryRaw {
  number:      number;
  date:        admin.firestore.Timestamp;
  description: string;
  periodId:    string;
  periodYear:  number;
  type:        string;
  status:      string;
  reference?:  string;
  referenceId?: string;
  lines:       JournalEntryLineRaw[];
  totalDebit:  number;
  totalCredit: number;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

// ─── Core reversal logic ──────────────────────────────────────────────────────

async function processReversal(
  companyId:   string,
  documentId:  string,
  docPath:     string,    // full path to update the source document
  before:      VoidableDoc,
  after:       VoidableDoc,
  docLabel:    string     // e.g. 'Factura', 'Nota de Débito', 'Retención'
): Promise<void> {
  // Only trigger when document transitions to voided
  if (before.isVoid || !after.isVoid) return;

  // Nothing to reverse if there is no linked accounting entry
  if (!after.accountingEntryId) {
    console.log(`[generateReversalEntry] ${docLabel} ${documentId} anulada sin asiento contable — omitiendo.`);
    return;
  }

  const db  = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  const originalRef  = db.doc(`companies/${companyId}/journal_entries/${after.accountingEntryId}`);
  const originalSnap = await originalRef.get();

  if (!originalSnap.exists) {
    console.warn(`[generateReversalEntry] Asiento original ${after.accountingEntryId} no encontrado para ${docLabel} ${documentId}`);
    return;
  }

  const original = originalSnap.data() as JournalEntryRaw;

  // Guard: already cancelled (e.g. CF triggered twice)
  if (original.status === 'cancelled') {
    console.log(`[generateReversalEntry] Asiento ${after.accountingEntryId} ya está cancelado — omitiendo.`);
    return;
  }

  // Invert all lines
  const reversalLines: JournalEntryLineRaw[] = original.lines.map(line => ({
    id:             crypto.randomUUID(),
    accountCode:    line.accountCode,
    accountName:    line.accountName,
    debit:          line.credit,    // swap
    credit:         line.debit,     // swap
    costCenterId:   line.costCenterId,
    costCenterName: line.costCenterName,
    description:    `[REVERSA] ${line.description ?? ''}`
  }));

  const totalDebit  = round2(reversalLines.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round2(reversalLines.reduce((s, l) => s + l.credit, 0));
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

  if (!isBalanced) {
    console.error(`[generateReversalEntry] Asiento de reversa descuadrado para ${after.accountingEntryId}:`, { totalDebit, totalCredit });
  }

  // Get next journal entry number (atomic)
  const key        = `journal_${original.periodYear}`;
  const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
  let entryNumber  = 1;

  await db.runTransaction(async tx => {
    const counterSnap = await tx.get(counterRef);
    const current     = (counterSnap.data()?.[key] as number) ?? 0;
    entryNumber       = current + 1;
    tx.set(counterRef, { [key]: entryNumber }, { merge: true });
  });

  const reversalRef = db.collection(`companies/${companyId}/journal_entries`).doc();

  await reversalRef.set({
    number:          entryNumber,
    date:            now,
    description:     `[REVERSA] ${original.description ?? ''} — Anulación ${after.fullNumber ?? documentId}`,
    periodId:        original.periodId,
    periodYear:      original.periodYear,
    type:            'adjustment',
    status:          'posted',
    reference:       after.fullNumber ?? documentId,
    referenceId:     documentId,
    reversalOf:      after.accountingEntryId,
    lines:           reversalLines,
    totalDebit,
    totalCredit,
    isBalanced,
    createdBy:       'system',
    createdAt:       now,
    updatedAt:       now
  });

  // Mark original entry as cancelled, linking to the reversal
  await originalRef.update({
    status:          'cancelled',
    reversalEntryId: reversalRef.id,
    cancelledAt:     now,
    cancelledBy:     'system',
    cancelReason:    `Documento anulado: ${after.fullNumber ?? documentId}`,
    updatedAt:       now
  });

  // Write reversalEntryId back to the source document
  await db.doc(docPath).update({
    reversalEntryId: reversalRef.id,
    updatedAt:       now
  });

  console.log(`[generateReversalEntry] Reversa creada: ${reversalRef.id} para asiento ${after.accountingEntryId} (${docLabel} ${documentId})`);
}

// ─── Triggers ─────────────────────────────────────────────────────────────────

/** Facturas y notas de crédito (misma colección) */
export const generateReversalFromInvoice = onDocumentUpdated(
  'companies/{companyId}/invoices/{invoiceId}',
  async (event) => {
    const before = event.data?.before.data() as VoidableDoc | undefined;
    const after  = event.data?.after.data()  as VoidableDoc | undefined;
    if (!before || !after) return;

    const { companyId, invoiceId } = event.params;
    const isCredit = (after as any).isCreditNote ? 'Nota de Crédito' : 'Factura';

    await processReversal(
      companyId,
      invoiceId,
      `companies/${companyId}/invoices/${invoiceId}`,
      before, after,
      isCredit
    );
  }
);

/** Notas de débito */
export const generateReversalFromDebitNote = onDocumentUpdated(
  'companies/{companyId}/debitNotes/{debitNoteId}',
  async (event) => {
    const before = event.data?.before.data() as VoidableDoc | undefined;
    const after  = event.data?.after.data()  as VoidableDoc | undefined;
    if (!before || !after) return;

    const { companyId, debitNoteId } = event.params;

    await processReversal(
      companyId,
      debitNoteId,
      `companies/${companyId}/debitNotes/${debitNoteId}`,
      before, after,
      'Nota de Débito'
    );
  }
);

/** Retenciones */
export const generateReversalFromRetention = onDocumentUpdated(
  'companies/{companyId}/retentions/{retentionId}',
  async (event) => {
    const before = event.data?.before.data() as VoidableDoc | undefined;
    const after  = event.data?.after.data()  as VoidableDoc | undefined;
    if (!before || !after) return;

    const { companyId, retentionId } = event.params;

    await processReversal(
      companyId,
      retentionId,
      `companies/${companyId}/retentions/${retentionId}`,
      before, after,
      'Retención'
    );
  }
);

/** Compras */
export const generateReversalFromPurchase = onDocumentUpdated(
  'companies/{companyId}/purchases/{purchaseId}',
  async (event) => {
    const before = event.data?.before.data() as VoidableDoc | undefined;
    const after  = event.data?.after.data()  as VoidableDoc | undefined;
    if (!before || !after) return;

    const { companyId, purchaseId } = event.params;

    await processReversal(
      companyId,
      purchaseId,
      `companies/${companyId}/purchases/${purchaseId}`,
      before, after,
      'Compra'
    );
  }
);
