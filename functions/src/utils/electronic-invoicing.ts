import * as admin from 'firebase-admin';

/**
 * electronic-invoicing.ts
 *
 * Single source of truth for "does this company's plan actually send
 * documents to a government electronic-invoicing webservice (SRI)?".
 *
 * Context: SaasFacturacion sells to companies outside Ecuador (no SRI at
 * all) and to Ecuadorian companies that only want physical/manual
 * invoicing (accountingModule = true, electronicInvoicing = false). Those
 * companies must still be able to issue documents, print/emails a PDF
 * comprobante, and get an accounting journal entry — they just never touch
 * the SRI SOAP webservice.
 *
 * Every emit trigger (invoices/credit notes, debit notes, retentions, POS)
 * MUST resolve this the same way and MUST use the same sentinel
 * (`SRI_NOT_REQUIRED`) when the plan disables electronic invoicing. Before
 * this module existed, `on-invoice-emit.ts` used the ad-hoc string
 * `'plan_feature_disabled'` while `generate-journal-entry-from-*.ts` only
 * recognized `'not_required'` — the mismatch meant the accounting entry was
 * silently never generated. Reuse the helpers here instead of re-deriving
 * the check so this can't drift apart again when a new pipeline or country
 * is added.
 */

/**
 * Sentinel written to `sriStatus` when a document is issued for a company
 * whose plan has `electronicInvoicing: false`. Recognized by the
 * `SRI_DONE()` check in every `generate-journal-entry-from-*.ts` file (and
 * by `regenerateJournalEntry`) as "no SRI needed, but ready to post".
 *
 * Also recognized by the frontend: `SRI_STATUS_LABELS`/`SRI_STATUS_COLORS`
 * in `src/app/features/invoices/models/invoice.interface.ts` already map
 * this value to a neutral "—" badge, and `invoices-list.component.html`
 * hides the SRI badge entirely when `sriStatus === 'not_required'`.
 */
export const SRI_NOT_REQUIRED = 'not_required';

/**
 * Resolves whether a company should run the SRI pipeline (build XML, sign
 * with .p12, call the SOAP webservice) for the documents it issues.
 *
 * Default is enabled — only disabled when the plan explicitly sets
 * `planFeatures.electronicInvoicing === false`. This mirrors the historical
 * behavior of every trigger (a company without `planFeatures` at all, or
 * without the flag set, keeps sending to SRI as before).
 */
export function isElectronicInvoicingEnabled(
  company: Record<string, any> | null | undefined
): boolean {
  const planFeatures = company?.['planFeatures'] as Record<string, any> | null | undefined;
  return !(planFeatures && planFeatures['electronicInvoicing'] === false);
}

/**
 * Convenience for triggers that don't already have the company document
 * loaded. Prefer `isElectronicInvoicingEnabled(company)` directly when the
 * company doc was already read for another reason (avoids a duplicate get).
 */
export async function companyHasElectronicInvoicing(
  db: admin.firestore.Firestore,
  companyId: string
): Promise<boolean> {
  const snap = await db.doc(`companies/${companyId}`).get();
  return isElectronicInvoicingEnabled(snap.data());
}

/**
 * A document is ready to be posted to accounting once its SRI journey is
 * either finished (`'authorized'`) or was never applicable in the first
 * place (`SRI_NOT_REQUIRED`). Shared by every
 * `generate-journal-entry-from-*.ts` (invoice, credit note, debit note) and
 * by `regenerateJournalEntry` so the criterion can't drift apart between
 * them again — previously each file defined its own identical inline copy
 * of this function.
 */
export const SRI_DONE = (sriStatus?: string): boolean =>
  sriStatus === 'authorized' || sriStatus === SRI_NOT_REQUIRED;
