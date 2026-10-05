import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { generatePaymentEntryInternal } from './utils/payment-entry';

// ─── Asiento de Cobro al marcar una factura como pagada ─────────────────────────
//
// Trigger: onDocumentWritten en invoices, cuando isPaid pasa de false/undefined a
// true. Independiente del asiento de emisión (generate-journal-entry-from-invoice.ts) — usa su propio back-reference
// (paymentEntryId).
//
// Asiento generado:
//   DÉBITO  [cuenta bancaria elegida]       = total de la factura
//   CRÉDITO Cuentas por Cobrar Clientes     = total de la factura
//
// La lógica vive en utils/payment-entry.ts (2026-10-05), compartida con
// regenerateJournalEntries: si aquí no se pudo (sin ejercicio abierto, sin
// cuenta bancaria), la «Puesta en marcha» lo recupera después.

export const generateJournalEntryFromInvoicePayment = onDocumentWritten(
  'companies/{companyId}/invoices/{invoiceId}',
  async (event) => {
    if (!event.data?.after.exists) return;
    const before = event.data.before.exists ? event.data.before.data() : undefined;
    const after  = event.data.after.data() as Record<string, any>;

    const justPaid = !before?.isPaid && after.isPaid === true;
    if (!justPaid || after.paymentEntryId) return;

    const { companyId, invoiceId: docId } = event.params;
    try {
      const r = await generatePaymentEntryInternal(companyId, 'invoice', docId);
      if (r.created) console.log('[generateJournalEntryFromInvoicePayment] Asiento creado:', r.entryId);
      else console.warn('[generateJournalEntryFromInvoicePayment] No se generó asiento:', r.reason, docId);
    } catch (err) {
      console.error('[generateJournalEntryFromInvoicePayment] Error:', err);
    }
  }
);
