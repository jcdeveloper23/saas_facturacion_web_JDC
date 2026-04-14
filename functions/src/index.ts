import * as admin from 'firebase-admin';

admin.initializeApp();

// Auth
export { setUserCustomClaims } from './auth/set-custom-claims';
export { setupFirstAdmin } from './auth/setup-first-admin'; // TODO: remove after first admin created

// Tenants
export { setupCompany } from './tenants/setup-company';

// Invoices / SRI
export { uploadCertificate }    from './invoices/upload-certificate';
export { generateInvoiceXml }   from './invoices/generate-invoice-xml';
export { generateCreditNoteXml } from './invoices/generate-credit-note-xml';
export { signXml }              from './invoices/sign-xml';
export { sendToSri }            from './invoices/send-to-sri';
export { checkSriStatus }       from './invoices/check-sri-status';
export { generatePdf }              from './invoices/generate-pdf';
export { sendInvoiceEmail }         from './invoices/send-invoice-email';
export { generateCreditNotePdf }    from './invoices/generate-credit-note-pdf';
export { sendCreditNoteEmail }      from './invoices/send-credit-note-email';
export { onInvoiceEmit }            from './invoices/on-invoice-emit';

// Retentions / SRI
export { generateRetentionXml } from './retentions/generate-retention-xml';
export { generateRetentionPdf } from './retentions/generate-retention-pdf';
export { sendRetentionEmail }   from './retentions/send-retention-email';
export { onRetentionEmit }      from './retentions/on-retention-emit';

// Debit Notes / SRI
export { generateDebitNoteXml }  from './debit-notes/generate-debit-note-xml';
export { generateDebitNotePdf }  from './debit-notes/generate-debit-note-pdf';
export { sendDebitNoteEmail }    from './debit-notes/send-debit-note-email';
export { onDebitNoteEmit }       from './debit-notes/on-debit-note-emit';

// Stock
export { onInvoiceStock } from './stock/on-invoice-stock';

// Marketplace
export { onMarketplaceSettingsChange } from './marketplace/on-marketplace-settings-change';
export { onProductPublicSync }         from './marketplace/on-product-public-sync';

// Utils
export { downloadDocument } from './utils/download-document';
