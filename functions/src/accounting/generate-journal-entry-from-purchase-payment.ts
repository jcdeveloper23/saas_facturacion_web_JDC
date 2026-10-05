import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { generatePaymentEntryInternal } from './utils/payment-entry';

// ─── Asiento de Pago al marcar una compra como pagada ─────────────────────────
//
// Trigger: onDocumentWritten en purchases, cuando isPaid pasa de false/undefined a
// true. Independiente del asiento de recepción (generate-journal-entry-from-purchase.ts) — usa su propio back-reference
// (paymentEntryId).
//
// Asiento generado:
//   DÉBITO  2.1.01.001 Cuentas por Pagar     = total de la compra
//   CRÉDITO [cuenta bancaria elegida]       = total de la compra
//
// La lógica vive en utils/payment-entry.ts (2026-10-05), compartida con
// regenerateJournalEntries: si aquí no se pudo (sin ejercicio abierto, sin
// cuenta bancaria), la «Puesta en marcha» lo recupera después.

export const generateJournalEntryFromPurchasePayment = onDocumentWritten(
  'companies/{companyId}/purchases/{purchaseId}',
  async (event) => {
    if (!event.data?.after.exists) return;
    const before = event.data.before.exists ? event.data.before.data() : undefined;
    const after  = event.data.after.data() as Record<string, any>;

    const justPaid = !before?.isPaid && after.isPaid === true;
    if (!justPaid || after.paymentEntryId) return;

    const { companyId, purchaseId: docId } = event.params;
    try {
      const r = await generatePaymentEntryInternal(companyId, 'purchase', docId);
      if (r.created) console.log('[generateJournalEntryFromPurchasePayment] Asiento creado:', r.entryId);
      else console.warn('[generateJournalEntryFromPurchasePayment] No se generó asiento:', r.reason, docId);
    } catch (err) {
      console.error('[generateJournalEntryFromPurchasePayment] Error:', err);
    }
  }
);
