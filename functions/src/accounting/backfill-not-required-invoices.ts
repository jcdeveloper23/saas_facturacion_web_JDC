import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { isElectronicInvoicingEnabled } from '../utils/electronic-invoicing';
import { generateJournalEntryFromInvoiceInternal }    from './generate-journal-entry-from-invoice';
import { generateJournalEntryFromCreditNoteInternal } from './generate-journal-entry-from-credit-note';
import { generatePdfInternal }           from '../invoices/generate-pdf';
import { generateCreditNotePdfInternal } from '../invoices/generate-credit-note-pdf';

/**
 * backfillNotRequiredInvoices
 *
 * One-off migration callable for documents that were emitted BEFORE the
 * on-invoice-emit.ts fix that unified the "no electronic invoicing" sentinel.
 * Those invoices/credit notes were left permanently stuck with
 * `sriStatus: 'plan_feature_disabled'` — a string the accounting journal
 * entry generators never recognized (they only accept `'authorized'` or
 * `'not_required'`), so they never got an accounting entry and
 * `regenerateJournalEntry` refused them with "documento no está
 * emitido/autorizado".
 *
 * This does NOT touch documents whose company currently has
 * electronicInvoicing enabled again (plan upgraded since emission) — those
 * should instead be retried through the normal "reenviar a SRI" flow, not
 * silently marked as not requiring SRI.
 *
 * Safe to run multiple times: already-migrated or already-posted documents
 * are skipped.
 */

interface BackfillResult {
  scanned: number;
  migrated: number;
  journalEntriesCreated: number;
  pdfGenerated: number;
  skippedPlanReenabled: number;
  errors: Array<{ invoiceId: string; error: string }>;
}

export async function backfillNotRequiredInvoicesInternal(companyId: string): Promise<BackfillResult> {
  const db = admin.firestore();
  const result: BackfillResult = {
    scanned: 0,
    migrated: 0,
    journalEntriesCreated: 0,
    pdfGenerated: 0,
    skippedPlanReenabled: 0,
    errors: [],
  };

  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) {
    throw new Error(`Empresa no encontrada: ${companyId}`);
  }
  const sriEnabledNow = isElectronicInvoicingEnabled(companySnap.data());

  const stuckSnap = await db
    .collection(`companies/${companyId}/invoices`)
    .where('sriStatus', '==', 'plan_feature_disabled')
    .get();

  result.scanned = stuckSnap.size;

  for (const doc of stuckSnap.docs) {
    const invoiceId = doc.id;
    const data = doc.data();

    if (data['status'] !== 'issued') {
      // Nunca llegó a emitirse de verdad — no migrar estados intermedios/anómalos.
      continue;
    }

    if (sriEnabledNow) {
      // La empresa reactivó electronicInvoicing desde entonces: este documento
      // debería reintentar el envío real al SRI, no marcarse como not_required.
      result.skippedPlanReenabled++;
      continue;
    }

    try {
      await doc.ref.update({
        sriStatus: 'not_required',
        updatedAt: admin.firestore.Timestamp.now(),
      });
      result.migrated++;

      const isCreditNote = data['isCreditNote'] === true || data['documentType'] === 'creditNote';

      if (!data['pdfUrl']) {
        try {
          if (isCreditNote) {
            await generateCreditNotePdfInternal(invoiceId, companyId);
          } else {
            await generatePdfInternal(invoiceId, companyId);
          }
          result.pdfGenerated++;
        } catch (pdfErr) {
          console.warn('[backfillNotRequiredInvoices] PDF no generado (no crítico):', invoiceId, pdfErr);
        }
      }

      if (!data['accountingEntryId']) {
        const entryResult = isCreditNote
          ? await generateJournalEntryFromCreditNoteInternal(companyId, invoiceId)
          : await generateJournalEntryFromInvoiceInternal(companyId, invoiceId);
        if (entryResult.created) {
          result.journalEntriesCreated++;
        }
      }
    } catch (err) {
      result.errors.push({
        invoiceId,
        error: err instanceof Error ? err.message : 'Error desconocido',
      });
    }
  }

  return result;
}

export const backfillNotRequiredInvoices = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const { companyId } = request.data as { companyId?: string };
  if (!companyId || typeof companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }

  try {
    return await backfillNotRequiredInvoicesInternal(companyId);
  } catch (err) {
    console.error('[backfillNotRequiredInvoices] Error:', err);
    const message = err instanceof Error ? err.message : 'Error en backfill';
    throw new HttpsError('internal', message);
  }
});
