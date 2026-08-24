import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

// ─── Asiento de Pago al marcar una compra como pagada ──────────────────────────
//
// Espejo de generate-journal-entry-from-invoice-payment.ts, para compras.
// Trigger independiente del de recepción (generate-journal-entry-from-purchase.ts,
// disparado por stockProcessed) — usa su propio back-reference (paymentEntryId).
//
// Trigger: onDocumentWritten en purchases, cuando isPaid pasa de false/undefined a true.
//
// Asiento generado:
//   DÉBITO  2.1.01.001  Cuentas por Pagar Proveedores = total de la compra
//   CRÉDITO [cuenta bancaria elegida]                  = total de la compra

interface PurchaseDoc {
  isPaid?: boolean;
  paidAt?: admin.firestore.Timestamp;
  paymentBankAccountId?: string;
  paymentEntryId?: string;
  fullNumber?: string;
  supplierName?: string;
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

// Mismo código fijo que usa generate-journal-entry-from-purchase.ts — no está
// en AccountMapping (es un estándar, no configurable por empresa).
const ACCOUNTS_PAYABLE = { code: '2.1.01.001', name: 'Cuentas por Pagar Proveedores' };

function round2(n: number): number { return Math.round(n * 100) / 100; }

export const generateJournalEntryFromPurchasePayment = onDocumentWritten(
  'companies/{companyId}/purchases/{purchaseId}',
  async (event) => {
    if (!event.data?.after.exists) return;

    const before = event.data.before.exists ? event.data.before.data() as PurchaseDoc : undefined;
    const after  = event.data.after.data() as PurchaseDoc;

    const justPaid = !before?.isPaid && after.isPaid === true;
    if (!justPaid || after.paymentEntryId) return;

    const { companyId, purchaseId } = event.params;
    console.log('[generateJournalEntryFromPurchasePayment] Compra marcada pagada:', purchaseId, 'empresa:', companyId);

    const db  = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    try {
      const total = round2(after.total ?? 0);
      if (total <= 0) {
        console.warn('[generateJournalEntryFromPurchasePayment] Compra sin total — no se crea asiento.');
        return;
      }

      if (!after.paymentBankAccountId) {
        console.warn('[generateJournalEntryFromPurchasePayment] Falta paymentBankAccountId — no se crea asiento.', purchaseId);
        return;
      }

      const bankSnap = await db.doc(`companies/${companyId}/bank_accounts/${after.paymentBankAccountId}`).get();
      if (!bankSnap.exists) {
        console.warn('[generateJournalEntryFromPurchasePayment] Cuenta bancaria no encontrada:', after.paymentBankAccountId);
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
        console.warn('[generateJournalEntryFromPurchasePayment] No hay período contable abierto para el año', periodYear);
        return;
      }
      const periodId = periodsSnap.docs[0].id;

      const ref      = after.fullNumber ?? purchaseId;
      const supplier = after.supplierName ?? 'Proveedor';

      const lines: JournalEntryLine[] = [
        {
          id:            crypto.randomUUID(),
          accountCode:   ACCOUNTS_PAYABLE.code,
          accountName:   ACCOUNTS_PAYABLE.name,
          debit:         total,
          credit:        0,
          costCenterId:  null,
          costCenterName: null,
          description:   `Pago compra ${ref} — ${supplier}`,
        },
        {
          id:            crypto.randomUUID(),
          accountCode:   bankAccount.linkedGlCode,
          accountName:   bankAccount.linkedGlName,
          debit:         0,
          credit:        total,
          costCenterId:  null,
          costCenterName: null,
          description:   `Pago compra ${ref} — ${supplier}`,
        },
      ];

      const totalDebit  = round2(lines.reduce((s, l) => s + l.debit, 0));
      const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
      const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01;

      if (!isBalanced) {
        console.error('[generateJournalEntryFromPurchasePayment] Asiento descuadrado — NO se crea:', { totalDebit, totalCredit, purchaseId });
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
        description: `Pago compra ${ref} — ${supplier}`,
        periodId,
        periodYear,
        type:        'automatic',
        status:      'posted',
        reference:   ref,
        referenceId: purchaseId,
        lines,
        totalDebit,
        totalCredit,
        isBalanced,
        createdBy:   'system',
        createdAt:   now,
        updatedAt:   now,
      });

      await db.doc(`companies/${companyId}/purchases/${purchaseId}`).update({
        paymentEntryId: entryRef.id,
        updatedAt:      now,
      });

      console.log('[generateJournalEntryFromPurchasePayment] Asiento de pago creado:', entryRef.id);
    } catch (err) {
      console.error('[generateJournalEntryFromPurchasePayment] Error:', err);
    }
  }
);
