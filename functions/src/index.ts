import * as admin from 'firebase-admin';

admin.initializeApp();

// Auth
export { setUserCustomClaims } from './auth/set-custom-claims';
export { setupFirstAdmin } from './auth/setup-first-admin'; // TODO: remove after first admin created

// Tenants
export { setupCompany }          from './tenants/setup-company';
export { assignPlanToCompany }   from './tenants/assign-plan-to-company';
export { onPlanUpdated }         from './tenants/on-plan-updated';
export { checkPlanLimit }        from './tenants/check-plan-limit';

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

// POS
export { onPosSaleComplete } from './pos/on-pos-sale-complete';

// Stock
export { onInvoiceStock }    from './stock/on-invoice-stock';
export { onPurchaseReceive } from './stock/on-purchase-receive';

// Marketplace
export { onMarketplaceSettingsChange } from './marketplace/on-marketplace-settings-change';
export { onProductPublicSync }         from './marketplace/on-product-public-sync';

// Team Management
export { onTimesheetCreated }          from './team-management/on-timesheet-created';
export { onTimesheetDeleted }          from './team-management/on-timesheet-deleted';
export { onTaskStatusChanged }         from './team-management/on-task-status-changed';
export { detectOverdueTasksScheduled } from './team-management/detect-overdue-tasks-scheduled';
export { generateWeeklyReport }        from './team-management/generate-weekly-report';

// Accounting
export { generateJournalEntryFromInvoice }   from './accounting/generate-journal-entry-from-invoice';
export { generateJournalEntryFromRetention } from './accounting/generate-journal-entry-from-retention';
export { closeAccountingPeriod }             from './accounting/close-accounting-period';

// Users
export { createCompanyUser } from './users/create-company-user';
export { updateCompanyUser } from './users/update-company-user';
export { deleteCompanyUser } from './users/delete-company-user';

// Utils
export { downloadDocument } from './utils/download-document';
