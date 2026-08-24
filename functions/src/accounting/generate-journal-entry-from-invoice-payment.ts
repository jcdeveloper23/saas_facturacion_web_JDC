import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { getAccountMapping } from './utils/get-account-mapping';

// ─── Asiento de Cobro al marcar una factura como pagada ────────────────────────
//
// Este es el paso que faltaba para que la conciliación bancaria tenga algo
// real contra qué emparejar: hasta ahora, ningún asiento automático tocaba
// nunca una cuenta de Banco — todos movían solo Cuentas por Cobrar/Pagar al
// emitir el documento. Este trigger es independiente del de emisión
// (generate-journal-entry-from-invoice.ts) — usa un back-reference propio
// (paymentEntryId) para no pisar accountingEntryId (el asiento de emisión).
//
// Trigger: onDocumentWritten en invoices, cuando isPaid pasa de false/undefined a true.
//
// Asiento generado:
//   DÉBITO  [cuenta bancaria elegida]      = total de la factura
//   CRÉDITO 1.1.02.001  Cuentas por Cobrar Clientes = total de la factura

interface InvoiceDoc {
  isPaid?: boolean;
  paidAt?: admin.firestore.Timestamp;
  paymentBankAccountId?: string;
  paymentEntryId?: string;
  fullNumber?: string;
  customerName?: string;
  total?: number;
}

interface BankAccountDoc {
  linkedGlCode: string;
  linkedGlName: string;
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

function round2(n: number): number { return Math.round(n * 100) / 100; }

export const generateJournalEntryFromInvoicePayment = onDocumentWritten(
  'companies/{companyId}/invoices/{invoiceId}',
  async (event) => {
    if (!event.data?.after.exists) return;

    const before = event.data.before.exists ? event.data.before.data() as InvoiceDoc : undefined;
    const after  = event.data.after.data() as InvoiceDoc;

    const justPaid = !before?.isPaid && after.isPaid === true;
    if (!justPaid || after.paymentEntryId) return;

    const { companyId, invoiceId } = event.params;
    console.log('[generateJournalEntryFromInvoicePayment] Factura marcada pagada:', invoiceId, 'empresa:', companyId);

    const db  = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    try {
      const total = round2(after.total ?? 0);
      if (total <= 0) {
        console.warn('[generateJournalEntryFromInvoicePayment] Factura sin total — no se crea asiento.');
        return;
      }

      if (!after.paymentBankAccountId) {
        console.warn('[generateJournalEntryFromInvoicePayment] Falta paymentBankAccountId — no se crea asiento.', invoiceId);
        return;
      }

      const bankSnap = await db.doc(`companies/${companyId}/bank_accounts/${after.paymentBankAccountId}`).get();
      if (!bankSnap.exists) {
        console.warn('[generateJournalEntryFromInvoicePayment] Cuenta bancaria no encontrada:', after.paymentBankAccountId);
        return;
      }
      const bankAccount = bankSnap.data() as BankAccountDoc;

      const paidDate = after.paidAt ?? now;
      const periodYear = paidDate.toDate().getFullYear();

      const periodsSnap = await db
        .collection(`companies/${companyId}/accounting_periods`)
        .where('year', '==', periodYear)
        .where('status', '==', 'open')
        .limit(1)
        .get();

      if (periodsSnap.empty) {
        console.warn('[generateJournalEntryFromInvoicePayment] No hay período contable abierto para el año', periodYear);
        return;
      }
      const periodId = periodsSnap.docs[0].id;

      const mapping = await getAccountMapping(companyId);
      const ref      = after.fullNumber ?? invoiceId;
      const customer = after.customerName ?? 'Cliente';

      const lines: JournalEntryLine[] = [
        {
          id:            crypto.randomUUID(),
          accountCode:   bankAccount.linkedGlCode,
          accountName:   bankAccount.linkedGlName,
          debit:         total,
          credit:        0,
          costCenterId:  null,
          costCenterName: null,
          description:   `Cobro factura ${ref} — ${customer}`,
        },
        {
          id:            crypto.randomUUID(),
          accountCode:   mapping.accountsReceivable.code,
          accountName:   mapping.accountsReceivable.name,
          debit:         0,
          credit:        total,
          costCenterId:  null,
          costCenterName: null,
          description:   `Cobro factura ${ref} — ${customer}`,
        },
      ];

      const totalDebit  = round2(lines.reduce((s, l) => s + l.debit, 0));
      const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
      const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

      if (!isBalanced) {
        console.error('[generateJournalEntryFromInvoicePayment] Asiento descuadrado — NO se crea:', { totalDebit, totalCredit, invoiceId });
        return;
      }

      const key        = `journal_${periodYear}`;
      const counterRef = db.doc(`companies/${companyId}/counters/journal_entries`);
      let entryNumber  = 1;

      await db.runTransaction(async tx => {
        const snap    = await tx.get(counterRef);
        const current = (snap.data()?.[key] as number) ?? 0;
        entryNumber   = current + 1;
        tx.set(counterRef, { [key]: entryNumber }, { merge: true });
      });

      const entryRef = db.collection(`companies/${companyId}/journal_entries`).doc();
      await entryRef.set({
        number:      entryNumber,
        date:        paidDate,
        description: `Cobro factura ${ref} — ${customer}`,
        periodId,
        periodYear,
        type:        'automatic',
        status:      'posted',
        reference:   ref,
        referenceId: invoiceId,
        lines,
        totalDebit,
        totalCredit,
        isBalanced,
        createdBy:   'system',
        createdAt:   now,
        updatedAt:   now,
      });

      await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
        paymentEntryId: entryRef.id,
        updatedAt:      now,
      });

      console.log('[generateJournalEntryFromInvoicePayment] Asiento de cobro creado:', entryRef.id);
    } catch (err) {
      console.error('[generateJournalEntryFromInvoicePayment] Error:', err);
    }
  }
);
