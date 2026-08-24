import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { generateJournalEntryFromInvoiceInternal }    from './generate-journal-entry-from-invoice';
import { generateJournalEntryFromCreditNoteInternal } from './generate-journal-entry-from-credit-note';
import { generateJournalEntryFromDebitNoteInternal }  from './generate-journal-entry-from-debit-note';
import { generateJournalEntryFromRetentionInternal }  from './generate-journal-entry-from-retention';

// ─── Regeneración manual de asiento contable ───────────────────────────────────
//
// Cubre el caso en que un documento fiscal quedó emitido/autorizado pero, por
// error (bug de trigger, corte de red, etc.), nunca se le generó el asiento
// automático. Reutiliza exactamente la misma lógica de los triggers
// (`generate-journal-entry-from-*.ts`) para que el asiento manual sea
// idéntico al que se hubiera generado automáticamente.

type DocType = 'invoice' | 'credit_note' | 'debit_note' | 'retention';

const DOC_LABEL: Record<DocType, string> = {
  invoice:     'Factura',
  credit_note: 'Nota de Crédito',
  debit_note:  'Nota de Débito',
  retention:   'Retención',
};

const REASON_MESSAGES: Record<string, string> = {
  not_found:        'Documento no encontrado.',
  already_exists:   'El documento ya tiene un asiento contable generado.',
  not_ready:        'El documento no está emitido/autorizado — no se puede generar el asiento todavía.',
  unbalanced:       'El asiento generado no cuadra (débito ≠ crédito) — no se creó para evitar corromper la contabilidad. Contacte a soporte.',
  no_open_period:   'No hay un período contable abierto para el año del documento.',
  no_taxes:         'El documento no tiene impuestos que contabilizar.',
  is_credit_note:   'Este documento es una nota de crédito — use documentType "credit_note".',
  not_credit_note:  'Este documento no es una nota de crédito.',
};

export const regenerateJournalEntry = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const data = request.data as {
    documentId?:   string;
    companyId?:    string;
    documentType?: string;
  };

  const { documentId, companyId } = data;
  const docType = data.documentType as DocType | undefined;

  if (!documentId || typeof documentId !== 'string') {
    throw new HttpsError('invalid-argument', 'documentId es requerido.');
  }
  if (!companyId || typeof companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }
  if (!docType || !DOC_LABEL[docType]) {
    throw new HttpsError('invalid-argument', `documentType inválido: ${docType}`);
  }

  const callerRole      = request.auth.token['role']      as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  if (callerRole !== 'super_admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }

  const docLabel = DOC_LABEL[docType];

  const result = await (async () => {
    switch (docType) {
      case 'invoice':     return generateJournalEntryFromInvoiceInternal(companyId, documentId);
      case 'credit_note': return generateJournalEntryFromCreditNoteInternal(companyId, documentId);
      case 'debit_note':  return generateJournalEntryFromDebitNoteInternal(companyId, documentId);
      case 'retention':   return generateJournalEntryFromRetentionInternal(companyId, documentId);
    }
  })();

  if (!result || !result.created) {
    const reason = result?.reason ?? 'unknown';
    const msg = REASON_MESSAGES[reason] ?? `No se pudo generar el asiento (${reason}).`;
    if (reason === 'not_found') {
      throw new HttpsError('not-found', `${docLabel} no encontrada: ${documentId}`);
    }
    if (reason === 'already_exists') {
      throw new HttpsError('already-exists', msg);
    }
    throw new HttpsError('failed-precondition', msg);
  }

  return { entryId: result.entryId };
});
