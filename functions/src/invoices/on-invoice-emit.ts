import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

import { generateInvoiceXmlInternal }    from './generate-invoice-xml';
import { generateCreditNoteXmlInternal } from './generate-credit-note-xml';
import { signXmlInternal }               from './sign-xml';
import { sendToSriInternal }             from './send-to-sri';
import { generatePdfInternal }           from './generate-pdf';
import { generateCreditNotePdfInternal } from './generate-credit-note-pdf';
import { sendInvoiceEmailInternal }      from './send-invoice-email';
import { sendCreditNoteEmailInternal }   from './send-credit-note-email';
import { isElectronicInvoicingEnabled, SRI_NOT_REQUIRED } from '../utils/electronic-invoicing';

/**
 * onInvoiceEmit
 *
 * Firestore trigger that fires whenever an invoice document is updated.
 * Orchestrates the full SRI electronic invoicing pipeline when:
 *   - invoice.status changes from any value → 'issued'
 *   - invoice.sriStatus is not yet set (prevents double-processing)
 *
 * Pipeline order:
 *   1. generateInvoiceXmlInternal  → builds and uploads the XML, sets sriStatus: 'xml_generated'
 *   2. signXmlInternal             → applies XAdES-BES signature, sets sriStatus: 'signed'
 *   3. sendToSriInternal           → sends to SRI SOAP WS, sets sriStatus: 'authorized' | 'rejected'
 *   4. generatePdfInternal         → builds RIDE PDF, sets pdfUrl
 *
 * On any error: sets sriStatus: 'rejected' with the error message so the UI
 * can surface it. Errors are NOT re-thrown (would cause infinite Firestore retries).
 */
export const onInvoiceEmit = onDocumentWritten(
  'companies/{companyId}/invoices/{invoiceId}',
  async (event) => {
    // after must exist (not a delete)
    if (!event.data?.after.exists) return;

    const before = event.data.before.exists
      ? event.data.before.data() as Record<string, any>
      : null;
    const after  = event.data.after.data() as Record<string, any>;

    // Trigger when status becomes 'issued' — handles both create-as-issued and draft→issued update
    const prevStatus            = before?.['status'] ?? null;
    const statusChangedToIssued = prevStatus !== 'issued' && after['status'] === 'issued';
    const sriNotYetStarted      = !after['sriStatus'];

    if (!statusChangedToIssued || !sriNotYetStarted) {
      // Not a new issuance — nothing to do
      return;
    }

    const { companyId, invoiceId } = event.params;
    const db = admin.firestore();

    console.log('[onInvoiceEmit] Nueva emisión detectada:', { companyId, invoiceId });

    // Mark as pending immediately so concurrent triggers don't re-process
    try {
      await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
        sriStatus: 'pending',
        updatedAt: admin.firestore.Timestamp.now(),
      });
    } catch (err) {
      // If we can't even set pending, bail out — Firestore will retry the trigger
      console.error('[onInvoiceEmit] No se pudo marcar como pending:', err);
      return;
    }

    const isCreditNote = (after['isCreditNote'] === true) || (after['documentType'] === 'creditNote');
    const docLabel     = isCreditNote ? 'Nota de Crédito' : 'Factura';

    // ── Contador de uso (no bloqueante) ─────────────────────────────────────
    const usageNow    = new Date();
    const period      = `${usageNow.getFullYear()}-${String(usageNow.getMonth() + 1).padStart(2, '0')}`;
    const usageRef    = db.doc(`companies/${companyId}/usage/${period}`);

    try {
      await db.runTransaction(async tx => {
        const snap = await tx.get(usageRef);
        const cur  = snap.exists ? snap.data()! : {};
        tx.set(usageRef, {
          ...(isCreditNote
            ? { creditNotesEmitted: ((cur['creditNotesEmitted'] as number) ?? 0) + 1 }
            : { invoicesEmitted:    ((cur['invoicesEmitted']    as number) ?? 0) + 1 }),
          totalSriDocsEmitted: ((cur['totalSriDocsEmitted'] as number) ?? 0) + 1,
          updatedAt: admin.firestore.Timestamp.now(),
          ...(snap.exists ? {} : {
            period,
            year:      usageNow.getFullYear(),
            month:     usageNow.getMonth() + 1,
            createdAt: admin.firestore.Timestamp.now(),
          }),
        }, { merge: true });
      });
    } catch (e) {
      console.error('[onInvoiceEmit] Error incrementando contador de uso:', e);
    }

    // ── Enforcement de plan ─────────────────────────────────────────────────
    // Leer empresa para verificar planFeatures y planLimits
    const companySnap  = await db.doc(`companies/${companyId}`).get();
    const company      = companySnap.data();
    const planLimits   = company?.['planLimits'] as Record<string, any> | null | undefined;

    const sriEnabled = isElectronicInvoicingEnabled(company);

    if (!sriEnabled) {
      // Plan sin facturación electrónica (empresa fuera de Ecuador, o
      // ecuatoriana que solo factura físicamente). El documento NO debe
      // tocar el webservice del SRI, pero sí debe quedar 'issued' con su
      // PDF (comprobante físico) y con sriStatus: 'not_required' — el
      // sentinel que generate-journal-entry-from-*.ts ya reconoce como
      // "listo para generar el asiento contable". Antes se usaba el string
      // 'plan_feature_disabled', que esos generadores no reconocían, y el
      // documento nunca se contabilizaba.
      console.log('[onInvoiceEmit] electronicInvoicing deshabilitado en el plan — modo sin SRI:', { companyId, invoiceId });
      await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
        sriStatus: SRI_NOT_REQUIRED,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      try {
        if (isCreditNote) {
          await generateCreditNotePdfInternal(invoiceId, companyId);
        } else {
          await generatePdfInternal(invoiceId, companyId);
        }
        console.log('[onInvoiceEmit] PDF (modo sin SRI) generado OK.');
      } catch (pdfErr) {
        console.error('[onInvoiceEmit] Error generando PDF en modo sin SRI (no crítico):', pdfErr);
        await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
          pdfError: pdfErr instanceof Error ? pdfErr.message : 'Error generando PDF',
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      // No se envía email aquí: sendInvoiceEmailInternal/sendCreditNoteEmailInternal
      // exigen sriStatus === 'authorized' (documento realmente autorizado por el
      // SRI) y fallarían para 'not_required'.
      console.log('[onInvoiceEmit] Pipeline completado (sin SRI):', { companyId, invoiceId, sriStatus: SRI_NOT_REQUIRED });
      return;
    }

    // Límite mensual de facturas SRI — solo aplica cuando el documento
    // realmente se va a enviar al SRI (si el plan no incluye electronicInvoicing
    // ya se retornó arriba, antes de llegar a este chequeo).
    const invoicesPerMonth = (planLimits?.['sri']?.['invoicesPerMonth'] as number | undefined);
    if (!isCreditNote && invoicesPerMonth !== undefined && invoicesPerMonth > 0) {
      const usageSnap    = await db.doc(`companies/${companyId}/usage/${period}`).get();
      const currentCount = (usageSnap.data()?.['invoicesEmitted'] as number) ?? 0;
      const monthLimit   = invoicesPerMonth;
      if (currentCount >= monthLimit) {
        console.warn('[onInvoiceEmit] Límite de facturas mensual alcanzado:', { companyId, currentCount, monthLimit });
        await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
          sriStatus: 'plan_limit_reached',
          sriError:  `Límite del plan: ${currentCount}/${monthLimit} facturas este mes`,
          updatedAt: admin.firestore.Timestamp.now(),
        });
        return;
      }
    }

    try {
      if (isCreditNote) {
        // ════════════════════════════════════════════════════════════════════
        // PIPELINE NOTA DE CRÉDITO (codDoc=04)
        // ════════════════════════════════════════════════════════════════════

        // ── Step 1: Generate credit note XML ─────────────────────────────
        console.log(`[onInvoiceEmit] [NC] Paso 1/4 — Generando XML <notaCredito>...`);
        await generateCreditNoteXmlInternal(invoiceId, companyId);
        console.log('[onInvoiceEmit] [NC] XML generado OK.');

        // ── Step 2: Sign XML — xmlFilename = cn-{id}.xml ─────────────────
        console.log('[onInvoiceEmit] [NC] Paso 2/4 — Firmando XML...');
        await signXmlInternal(invoiceId, companyId, `cn-${invoiceId}.xml`);
        console.log('[onInvoiceEmit] [NC] XML firmado OK.');

        // ── Step 3: Send to SRI as creditNote ────────────────────────────
        console.log('[onInvoiceEmit] [NC] Paso 3/4 — Enviando al SRI...');
        const sriResult = await sendToSriInternal(invoiceId, companyId, 'creditNote');
        console.log('[onInvoiceEmit] [NC] SRI resultado:', sriResult.sriStatus);

        // ── Step 4: Generate credit note PDF ─────────────────────────────
        console.log('[onInvoiceEmit] [NC] Paso 4/4 — Generando PDF RIDE...');
        try {
          await generateCreditNotePdfInternal(invoiceId, companyId);
          console.log('[onInvoiceEmit] [NC] PDF generado OK.');
        } catch (pdfErr) {
          console.error('[onInvoiceEmit] [NC] Error generando PDF (no crítico):', pdfErr);
          await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
            pdfError: pdfErr instanceof Error ? pdfErr.message : 'Error generando PDF de NC',
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }

        // ── Step 5: Send email (only if authorized) ───────────────────────
        if (sriResult.sriStatus === 'authorized') {
          try {
            const emailResult = await sendCreditNoteEmailInternal(invoiceId, companyId);
            if (emailResult.sent) {
              console.log('[onInvoiceEmit] [NC] Email enviado a:', emailResult.to);
            } else {
              console.log('[onInvoiceEmit] [NC] Email omitido (sin email de cliente).');
            }
          } catch (emailErr) {
            console.error('[onInvoiceEmit] [NC] Error enviando email (no crítico):', emailErr);
          }
        }

        console.log('[onInvoiceEmit] [NC] Pipeline completado:', { companyId, invoiceId, sriStatus: sriResult.sriStatus });

      } else {
        // ════════════════════════════════════════════════════════════════════
        // PIPELINE FACTURA (codDoc=01)
        // ════════════════════════════════════════════════════════════════════

        // ── Step 1: Generate XML ────────────────────────────────────────
        console.log('[onInvoiceEmit] Paso 1/4 — Generando XML...');
        await generateInvoiceXmlInternal(invoiceId, companyId);
        console.log('[onInvoiceEmit] XML generado OK.');

        // ── Step 2: Sign XML ────────────────────────────────────────────
        console.log('[onInvoiceEmit] Paso 2/4 — Firmando XML...');
        await signXmlInternal(invoiceId, companyId);
        console.log('[onInvoiceEmit] XML firmado OK.');

        // ── Step 3: Send to SRI ─────────────────────────────────────────
        console.log('[onInvoiceEmit] Paso 3/4 — Enviando al SRI...');
        const sriResult = await sendToSriInternal(invoiceId, companyId);
        console.log('[onInvoiceEmit] SRI resultado:', sriResult.sriStatus);

        // ── Step 4: Generate PDF (always, even if SRI rejected) ─────────
        console.log('[onInvoiceEmit] Paso 4/4 — Generando PDF...');
        try {
          await generatePdfInternal(invoiceId, companyId);
          console.log('[onInvoiceEmit] PDF generado OK.');
        } catch (pdfErr) {
          console.error('[onInvoiceEmit] Error generando PDF (no crítico):', pdfErr);
          await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
            pdfError: pdfErr instanceof Error ? pdfErr.message : 'Error generando PDF',
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }

        // ── Step 5: Send email (only if authorized) ─────────────────────
        if (sriResult.sriStatus === 'authorized') {
          try {
            const emailResult = await sendInvoiceEmailInternal(invoiceId, companyId);
            if (emailResult.sent) {
              console.log('[onInvoiceEmit] Email enviado a:', emailResult.to);
            } else {
              console.log('[onInvoiceEmit] Email omitido (sin email de cliente).');
            }
          } catch (emailErr) {
            console.error('[onInvoiceEmit] Error enviando email (no crítico):', emailErr);
          }
        }

        console.log('[onInvoiceEmit] Pipeline completado:', { companyId, invoiceId, sriStatus: sriResult.sriStatus });
      }

    } catch (err) {
      // Pipeline error — update invoice with error info but do NOT re-throw
      // (re-throwing would cause Firestore to retry indefinitely)
      const errorMessage = err instanceof Error ? err.message : 'Error inesperado en emisión';
      console.error(`[onInvoiceEmit] Error en pipeline ${docLabel}:`, { companyId, invoiceId, err });

      try {
        await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
          sriStatus: 'rejected',
          sriError: errorMessage,
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } catch (updateErr) {
        console.error('[onInvoiceEmit] Error actualizando sriStatus tras fallo:', updateErr);
      }
    }
  }
);
