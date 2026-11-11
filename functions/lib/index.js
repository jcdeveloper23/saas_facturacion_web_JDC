"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDebitNoteEmit = exports.sendDebitNoteEmail = exports.generateDebitNotePdf = exports.generateDebitNoteXml = exports.onRetentionEmit = exports.sendRetentionEmail = exports.generateRetentionPdf = exports.generateRetentionXml = exports.onInvoiceEmit = exports.sendCreditNoteEmail = exports.generateCreditNotePdf = exports.sendInvoiceEmail = exports.portalSaveSmtp = exports.portalGetSmtp = exports.savePlatformSmtp = exports.getPlatformSmtp = exports.saveCompanySmtp = exports.generatePdf = exports.checkSriStatus = exports.sendToSri = exports.signXml = exports.generateCreditNoteXml = exports.generateInvoiceXml = exports.regenerateJournalEntries = exports.saveOpeningBalances = exports.openAccountingPeriod = exports.seedChartOfAccounts = exports.accountingSetupStatus = exports.fetchReceivedDocuments = exports.importInvoices = exports.createAndEmitInvoice = exports.uploadCertificate = exports.portalWhoAmI = exports.portalListPackages = exports.portalUpsertPlan = exports.portalListPlans = exports.portalSetAddon = exports.portalUpdateCompany = exports.portalSetCompanyStatus = exports.portalListCompanyUsers = exports.portalGetCompany = exports.portalListCompanies = exports.manageChannelAdmin = exports.checkPlanLimit = exports.onPlanUpdated = exports.assignPlanToCompany = exports.setupCompany = exports.exchangeToken = exports.setupFirstAdmin = exports.setUserCustomClaims = void 0;
exports.createPayrollRun = exports.savePayrollNovelties = exports.upsertPayrollEmployee = exports.auditLogAccountingPeriods = exports.auditLogChartOfAccounts = exports.auditLogJournalEntries = exports.generateAts = exports.generateAccountingPdf = exports.generateOpeningEntry = exports.closeAccountingPeriod = exports.backfillNotRequiredInvoices = exports.voidReceivedPurchase = exports.redoPurchaseEntry = exports.regenerateJournalEntry = exports.generateJournalEntryFromPurchasePayment = exports.generateJournalEntryFromInvoicePayment = exports.generateJournalEntryFromPurchase = exports.generateReversalFromReceivedRetention = exports.generateReversalFromPurchase = exports.generateReversalFromRetention = exports.generateReversalFromDebitNote = exports.generateReversalFromInvoice = exports.generateJournalEntryFromDebitNote = exports.generateJournalEntryFromCreditNote = exports.collectInvoicePayment = exports.voidCashVoucher = exports.registerCashVoucher = exports.voidAdvance = exports.unapplyAdvance = exports.applyAdvance = exports.registerAdvance = exports.generateJournalEntryFromReceivedRetention = exports.generateJournalEntryFromRetention = exports.generateJournalEntryFromInvoice = exports.runDepreciationForMonth = exports.runMonthlyDepreciation = exports.generateWeeklyReport = exports.detectOverdueTasksScheduled = exports.onTaskStatusChanged = exports.onTimesheetDeleted = exports.onTimesheetCreated = exports.onProductWrittenNotifyChannel = exports.onPersonaWrittenNotifyChannel = exports.onProductPublicSync = exports.onMarketplaceSettingsChange = exports.onPurchaseReceive = exports.onInvoiceStock = exports.onPosSaleComplete = exports.onPurchaseSettlementEmit = exports.issuePurchaseSettlement = void 0;
exports.serveApiDocs = exports.getAuthToken = exports.downloadDocument = exports.schoolScanQr = exports.schoolConfirmRecharge = exports.schoolProcessPurchase = exports.schoolGenerateStudentQr = exports.deleteCompanyUser = exports.updateCompanyUser = exports.createCompanyUser = exports.sendPayslipEmails = exports.getPayslipPdf = exports.reversePayrollRun = exports.approvePayrollRun = exports.recalculatePayrollRun = void 0;
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
// Auth
var set_custom_claims_1 = require("./auth/set-custom-claims");
Object.defineProperty(exports, "setUserCustomClaims", { enumerable: true, get: function () { return set_custom_claims_1.setUserCustomClaims; } });
var setup_first_admin_1 = require("./auth/setup-first-admin"); // TODO: remove after first admin created
Object.defineProperty(exports, "setupFirstAdmin", { enumerable: true, get: function () { return setup_first_admin_1.setupFirstAdmin; } });
var exchange_token_1 = require("./auth/exchange-token");
Object.defineProperty(exports, "exchangeToken", { enumerable: true, get: function () { return exchange_token_1.exchangeToken; } });
// Tenants
var setup_company_1 = require("./tenants/setup-company");
Object.defineProperty(exports, "setupCompany", { enumerable: true, get: function () { return setup_company_1.setupCompany; } });
var assign_plan_to_company_1 = require("./tenants/assign-plan-to-company");
Object.defineProperty(exports, "assignPlanToCompany", { enumerable: true, get: function () { return assign_plan_to_company_1.assignPlanToCompany; } });
var on_plan_updated_1 = require("./tenants/on-plan-updated");
Object.defineProperty(exports, "onPlanUpdated", { enumerable: true, get: function () { return on_plan_updated_1.onPlanUpdated; } });
var check_plan_limit_1 = require("./tenants/check-plan-limit");
Object.defineProperty(exports, "checkPlanLimit", { enumerable: true, get: function () { return check_plan_limit_1.checkPlanLimit; } });
var manage_channel_admin_1 = require("./tenants/manage-channel-admin");
Object.defineProperty(exports, "manageChannelAdmin", { enumerable: true, get: function () { return manage_channel_admin_1.manageChannelAdmin; } });
// Portal de canal (apps de cada canal, vía su gateway)
var portal_callables_1 = require("./channel-portal/portal-callables");
Object.defineProperty(exports, "portalListCompanies", { enumerable: true, get: function () { return portal_callables_1.portalListCompanies; } });
Object.defineProperty(exports, "portalGetCompany", { enumerable: true, get: function () { return portal_callables_1.portalGetCompany; } });
Object.defineProperty(exports, "portalListCompanyUsers", { enumerable: true, get: function () { return portal_callables_1.portalListCompanyUsers; } });
Object.defineProperty(exports, "portalSetCompanyStatus", { enumerable: true, get: function () { return portal_callables_1.portalSetCompanyStatus; } });
Object.defineProperty(exports, "portalUpdateCompany", { enumerable: true, get: function () { return portal_callables_1.portalUpdateCompany; } });
Object.defineProperty(exports, "portalSetAddon", { enumerable: true, get: function () { return portal_callables_1.portalSetAddon; } });
Object.defineProperty(exports, "portalListPlans", { enumerable: true, get: function () { return portal_callables_1.portalListPlans; } });
Object.defineProperty(exports, "portalUpsertPlan", { enumerable: true, get: function () { return portal_callables_1.portalUpsertPlan; } });
Object.defineProperty(exports, "portalListPackages", { enumerable: true, get: function () { return portal_callables_1.portalListPackages; } });
Object.defineProperty(exports, "portalWhoAmI", { enumerable: true, get: function () { return portal_callables_1.portalWhoAmI; } });
// Invoices / SRI
var upload_certificate_1 = require("./invoices/upload-certificate");
Object.defineProperty(exports, "uploadCertificate", { enumerable: true, get: function () { return upload_certificate_1.uploadCertificate; } });
var create_and_emit_invoice_1 = require("./invoices/create-and-emit-invoice");
Object.defineProperty(exports, "createAndEmitInvoice", { enumerable: true, get: function () { return create_and_emit_invoice_1.createAndEmitInvoice; } });
var import_invoices_1 = require("./invoices/import-invoices");
Object.defineProperty(exports, "importInvoices", { enumerable: true, get: function () { return import_invoices_1.importInvoices; } });
var fetch_received_documents_1 = require("./purchases/fetch-received-documents");
Object.defineProperty(exports, "fetchReceivedDocuments", { enumerable: true, get: function () { return fetch_received_documents_1.fetchReceivedDocuments; } });
var accounting_setup_1 = require("./accounting/accounting-setup");
Object.defineProperty(exports, "accountingSetupStatus", { enumerable: true, get: function () { return accounting_setup_1.accountingSetupStatus; } });
Object.defineProperty(exports, "seedChartOfAccounts", { enumerable: true, get: function () { return accounting_setup_1.seedChartOfAccounts; } });
Object.defineProperty(exports, "openAccountingPeriod", { enumerable: true, get: function () { return accounting_setup_1.openAccountingPeriod; } });
Object.defineProperty(exports, "saveOpeningBalances", { enumerable: true, get: function () { return accounting_setup_1.saveOpeningBalances; } });
Object.defineProperty(exports, "regenerateJournalEntries", { enumerable: true, get: function () { return accounting_setup_1.regenerateJournalEntries; } });
var generate_invoice_xml_1 = require("./invoices/generate-invoice-xml");
Object.defineProperty(exports, "generateInvoiceXml", { enumerable: true, get: function () { return generate_invoice_xml_1.generateInvoiceXml; } });
var generate_credit_note_xml_1 = require("./invoices/generate-credit-note-xml");
Object.defineProperty(exports, "generateCreditNoteXml", { enumerable: true, get: function () { return generate_credit_note_xml_1.generateCreditNoteXml; } });
var sign_xml_1 = require("./invoices/sign-xml");
Object.defineProperty(exports, "signXml", { enumerable: true, get: function () { return sign_xml_1.signXml; } });
var send_to_sri_1 = require("./invoices/send-to-sri");
Object.defineProperty(exports, "sendToSri", { enumerable: true, get: function () { return send_to_sri_1.sendToSri; } });
var check_sri_status_1 = require("./invoices/check-sri-status");
Object.defineProperty(exports, "checkSriStatus", { enumerable: true, get: function () { return check_sri_status_1.checkSriStatus; } });
var generate_pdf_1 = require("./invoices/generate-pdf");
Object.defineProperty(exports, "generatePdf", { enumerable: true, get: function () { return generate_pdf_1.generatePdf; } });
var company_smtp_1 = require("./settings/company-smtp");
Object.defineProperty(exports, "saveCompanySmtp", { enumerable: true, get: function () { return company_smtp_1.saveCompanySmtp; } });
var platform_smtp_1 = require("./settings/platform-smtp");
Object.defineProperty(exports, "getPlatformSmtp", { enumerable: true, get: function () { return platform_smtp_1.getPlatformSmtp; } });
Object.defineProperty(exports, "savePlatformSmtp", { enumerable: true, get: function () { return platform_smtp_1.savePlatformSmtp; } });
var portal_callables_2 = require("./channel-portal/portal-callables");
Object.defineProperty(exports, "portalGetSmtp", { enumerable: true, get: function () { return portal_callables_2.portalGetSmtp; } });
Object.defineProperty(exports, "portalSaveSmtp", { enumerable: true, get: function () { return portal_callables_2.portalSaveSmtp; } });
var send_invoice_email_1 = require("./invoices/send-invoice-email");
Object.defineProperty(exports, "sendInvoiceEmail", { enumerable: true, get: function () { return send_invoice_email_1.sendInvoiceEmail; } });
var generate_credit_note_pdf_1 = require("./invoices/generate-credit-note-pdf");
Object.defineProperty(exports, "generateCreditNotePdf", { enumerable: true, get: function () { return generate_credit_note_pdf_1.generateCreditNotePdf; } });
var send_credit_note_email_1 = require("./invoices/send-credit-note-email");
Object.defineProperty(exports, "sendCreditNoteEmail", { enumerable: true, get: function () { return send_credit_note_email_1.sendCreditNoteEmail; } });
var on_invoice_emit_1 = require("./invoices/on-invoice-emit");
Object.defineProperty(exports, "onInvoiceEmit", { enumerable: true, get: function () { return on_invoice_emit_1.onInvoiceEmit; } });
// Retentions / SRI
var generate_retention_xml_1 = require("./retentions/generate-retention-xml");
Object.defineProperty(exports, "generateRetentionXml", { enumerable: true, get: function () { return generate_retention_xml_1.generateRetentionXml; } });
var generate_retention_pdf_1 = require("./retentions/generate-retention-pdf");
Object.defineProperty(exports, "generateRetentionPdf", { enumerable: true, get: function () { return generate_retention_pdf_1.generateRetentionPdf; } });
var send_retention_email_1 = require("./retentions/send-retention-email");
Object.defineProperty(exports, "sendRetentionEmail", { enumerable: true, get: function () { return send_retention_email_1.sendRetentionEmail; } });
var on_retention_emit_1 = require("./retentions/on-retention-emit");
Object.defineProperty(exports, "onRetentionEmit", { enumerable: true, get: function () { return on_retention_emit_1.onRetentionEmit; } });
// Debit Notes / SRI
var generate_debit_note_xml_1 = require("./debit-notes/generate-debit-note-xml");
Object.defineProperty(exports, "generateDebitNoteXml", { enumerable: true, get: function () { return generate_debit_note_xml_1.generateDebitNoteXml; } });
var generate_debit_note_pdf_1 = require("./debit-notes/generate-debit-note-pdf");
Object.defineProperty(exports, "generateDebitNotePdf", { enumerable: true, get: function () { return generate_debit_note_pdf_1.generateDebitNotePdf; } });
var send_debit_note_email_1 = require("./debit-notes/send-debit-note-email");
Object.defineProperty(exports, "sendDebitNoteEmail", { enumerable: true, get: function () { return send_debit_note_email_1.sendDebitNoteEmail; } });
var on_debit_note_emit_1 = require("./debit-notes/on-debit-note-emit");
Object.defineProperty(exports, "onDebitNoteEmit", { enumerable: true, get: function () { return on_debit_note_emit_1.onDebitNoteEmit; } });
// Liquidación de compra (codDoc 03, 2026-11-05): vive en purchases.
var issue_purchase_settlement_1 = require("./purchases/settlement/issue-purchase-settlement");
Object.defineProperty(exports, "issuePurchaseSettlement", { enumerable: true, get: function () { return issue_purchase_settlement_1.issuePurchaseSettlement; } });
var on_purchase_settlement_emit_1 = require("./purchases/settlement/on-purchase-settlement-emit");
Object.defineProperty(exports, "onPurchaseSettlementEmit", { enumerable: true, get: function () { return on_purchase_settlement_emit_1.onPurchaseSettlementEmit; } });
// POS
var on_pos_sale_complete_1 = require("./pos/on-pos-sale-complete");
Object.defineProperty(exports, "onPosSaleComplete", { enumerable: true, get: function () { return on_pos_sale_complete_1.onPosSaleComplete; } });
// Stock
var on_invoice_stock_1 = require("./stock/on-invoice-stock");
Object.defineProperty(exports, "onInvoiceStock", { enumerable: true, get: function () { return on_invoice_stock_1.onInvoiceStock; } });
var on_purchase_receive_1 = require("./stock/on-purchase-receive");
Object.defineProperty(exports, "onPurchaseReceive", { enumerable: true, get: function () { return on_purchase_receive_1.onPurchaseReceive; } });
// Marketplace
var on_marketplace_settings_change_1 = require("./marketplace/on-marketplace-settings-change");
Object.defineProperty(exports, "onMarketplaceSettingsChange", { enumerable: true, get: function () { return on_marketplace_settings_change_1.onMarketplaceSettingsChange; } });
var on_product_public_sync_1 = require("./marketplace/on-product-public-sync");
Object.defineProperty(exports, "onProductPublicSync", { enumerable: true, get: function () { return on_product_public_sync_1.onProductPublicSync; } });
// Sincronización de datos maestros con el canal (FacturaEc → Conecta, 2026-10-07)
var notify_channel_1 = require("./channel-sync/notify-channel");
Object.defineProperty(exports, "onPersonaWrittenNotifyChannel", { enumerable: true, get: function () { return notify_channel_1.onPersonaWrittenNotifyChannel; } });
Object.defineProperty(exports, "onProductWrittenNotifyChannel", { enumerable: true, get: function () { return notify_channel_1.onProductWrittenNotifyChannel; } });
// Team Management
var on_timesheet_created_1 = require("./team-management/on-timesheet-created");
Object.defineProperty(exports, "onTimesheetCreated", { enumerable: true, get: function () { return on_timesheet_created_1.onTimesheetCreated; } });
var on_timesheet_deleted_1 = require("./team-management/on-timesheet-deleted");
Object.defineProperty(exports, "onTimesheetDeleted", { enumerable: true, get: function () { return on_timesheet_deleted_1.onTimesheetDeleted; } });
var on_task_status_changed_1 = require("./team-management/on-task-status-changed");
Object.defineProperty(exports, "onTaskStatusChanged", { enumerable: true, get: function () { return on_task_status_changed_1.onTaskStatusChanged; } });
var detect_overdue_tasks_scheduled_1 = require("./team-management/detect-overdue-tasks-scheduled");
Object.defineProperty(exports, "detectOverdueTasksScheduled", { enumerable: true, get: function () { return detect_overdue_tasks_scheduled_1.detectOverdueTasksScheduled; } });
var generate_weekly_report_1 = require("./team-management/generate-weekly-report");
Object.defineProperty(exports, "generateWeeklyReport", { enumerable: true, get: function () { return generate_weekly_report_1.generateWeeklyReport; } });
// Accounting
var run_monthly_depreciation_1 = require("./accounting/run-monthly-depreciation");
Object.defineProperty(exports, "runMonthlyDepreciation", { enumerable: true, get: function () { return run_monthly_depreciation_1.runMonthlyDepreciation; } });
var run_depreciation_for_month_1 = require("./accounting/run-depreciation-for-month");
Object.defineProperty(exports, "runDepreciationForMonth", { enumerable: true, get: function () { return run_depreciation_for_month_1.runDepreciationForMonth; } });
var generate_journal_entry_from_invoice_1 = require("./accounting/generate-journal-entry-from-invoice");
Object.defineProperty(exports, "generateJournalEntryFromInvoice", { enumerable: true, get: function () { return generate_journal_entry_from_invoice_1.generateJournalEntryFromInvoice; } });
var generate_journal_entry_from_retention_1 = require("./accounting/generate-journal-entry-from-retention");
Object.defineProperty(exports, "generateJournalEntryFromRetention", { enumerable: true, get: function () { return generate_journal_entry_from_retention_1.generateJournalEntryFromRetention; } });
// Retenciones que los clientes le hacen a la empresa (2026-10-08)
var generate_journal_entry_from_received_retention_1 = require("./accounting/generate-journal-entry-from-received-retention");
Object.defineProperty(exports, "generateJournalEntryFromReceivedRetention", { enumerable: true, get: function () { return generate_journal_entry_from_received_retention_1.generateJournalEntryFromReceivedRetention; } });
// Anticipos de clientes (E1, 2026-10-14): todo en callables con transacción.
var advance_callables_1 = require("./accounting/advances/advance-callables");
Object.defineProperty(exports, "registerAdvance", { enumerable: true, get: function () { return advance_callables_1.registerAdvance; } });
Object.defineProperty(exports, "applyAdvance", { enumerable: true, get: function () { return advance_callables_1.applyAdvance; } });
Object.defineProperty(exports, "unapplyAdvance", { enumerable: true, get: function () { return advance_callables_1.unapplyAdvance; } });
Object.defineProperty(exports, "voidAdvance", { enumerable: true, get: function () { return advance_callables_1.voidAdvance; } });
var cash_voucher_callables_1 = require("./accounting/cash-vouchers/cash-voucher-callables");
Object.defineProperty(exports, "registerCashVoucher", { enumerable: true, get: function () { return cash_voucher_callables_1.registerCashVoucher; } });
Object.defineProperty(exports, "voidCashVoucher", { enumerable: true, get: function () { return cash_voucher_callables_1.voidCashVoucher; } });
Object.defineProperty(exports, "collectInvoicePayment", { enumerable: true, get: function () { return cash_voucher_callables_1.collectInvoicePayment; } });
var generate_journal_entry_from_credit_note_1 = require("./accounting/generate-journal-entry-from-credit-note");
Object.defineProperty(exports, "generateJournalEntryFromCreditNote", { enumerable: true, get: function () { return generate_journal_entry_from_credit_note_1.generateJournalEntryFromCreditNote; } });
var generate_journal_entry_from_debit_note_1 = require("./accounting/generate-journal-entry-from-debit-note");
Object.defineProperty(exports, "generateJournalEntryFromDebitNote", { enumerable: true, get: function () { return generate_journal_entry_from_debit_note_1.generateJournalEntryFromDebitNote; } });
var generate_reversal_entry_1 = require("./accounting/generate-reversal-entry");
Object.defineProperty(exports, "generateReversalFromInvoice", { enumerable: true, get: function () { return generate_reversal_entry_1.generateReversalFromInvoice; } });
Object.defineProperty(exports, "generateReversalFromDebitNote", { enumerable: true, get: function () { return generate_reversal_entry_1.generateReversalFromDebitNote; } });
Object.defineProperty(exports, "generateReversalFromRetention", { enumerable: true, get: function () { return generate_reversal_entry_1.generateReversalFromRetention; } });
Object.defineProperty(exports, "generateReversalFromPurchase", { enumerable: true, get: function () { return generate_reversal_entry_1.generateReversalFromPurchase; } });
Object.defineProperty(exports, "generateReversalFromReceivedRetention", { enumerable: true, get: function () { return generate_reversal_entry_1.generateReversalFromReceivedRetention; } });
var generate_journal_entry_from_purchase_1 = require("./accounting/generate-journal-entry-from-purchase");
Object.defineProperty(exports, "generateJournalEntryFromPurchase", { enumerable: true, get: function () { return generate_journal_entry_from_purchase_1.generateJournalEntryFromPurchase; } });
var generate_journal_entry_from_invoice_payment_1 = require("./accounting/generate-journal-entry-from-invoice-payment");
Object.defineProperty(exports, "generateJournalEntryFromInvoicePayment", { enumerable: true, get: function () { return generate_journal_entry_from_invoice_payment_1.generateJournalEntryFromInvoicePayment; } });
var generate_journal_entry_from_purchase_payment_1 = require("./accounting/generate-journal-entry-from-purchase-payment");
Object.defineProperty(exports, "generateJournalEntryFromPurchasePayment", { enumerable: true, get: function () { return generate_journal_entry_from_purchase_payment_1.generateJournalEntryFromPurchasePayment; } });
var regenerate_journal_entry_1 = require("./accounting/regenerate-journal-entry");
Object.defineProperty(exports, "regenerateJournalEntry", { enumerable: true, get: function () { return regenerate_journal_entry_1.regenerateJournalEntry; } });
var redo_purchase_entry_1 = require("./accounting/redo-purchase-entry");
Object.defineProperty(exports, "redoPurchaseEntry", { enumerable: true, get: function () { return redo_purchase_entry_1.redoPurchaseEntry; } });
var void_received_purchase_1 = require("./accounting/void-received-purchase");
Object.defineProperty(exports, "voidReceivedPurchase", { enumerable: true, get: function () { return void_received_purchase_1.voidReceivedPurchase; } });
var backfill_not_required_invoices_1 = require("./accounting/backfill-not-required-invoices");
Object.defineProperty(exports, "backfillNotRequiredInvoices", { enumerable: true, get: function () { return backfill_not_required_invoices_1.backfillNotRequiredInvoices; } });
var close_accounting_period_1 = require("./accounting/close-accounting-period");
Object.defineProperty(exports, "closeAccountingPeriod", { enumerable: true, get: function () { return close_accounting_period_1.closeAccountingPeriod; } });
var generate_opening_entry_1 = require("./accounting/generate-opening-entry");
Object.defineProperty(exports, "generateOpeningEntry", { enumerable: true, get: function () { return generate_opening_entry_1.generateOpeningEntry; } });
var generate_accounting_pdf_1 = require("./accounting/generate-accounting-pdf");
Object.defineProperty(exports, "generateAccountingPdf", { enumerable: true, get: function () { return generate_accounting_pdf_1.generateAccountingPdf; } });
var generate_ats_1 = require("./accounting/ats/generate-ats");
Object.defineProperty(exports, "generateAts", { enumerable: true, get: function () { return generate_ats_1.generateAts; } });
var audit_log_trigger_1 = require("./accounting/audit-log-trigger");
Object.defineProperty(exports, "auditLogJournalEntries", { enumerable: true, get: function () { return audit_log_trigger_1.auditLogJournalEntries; } });
Object.defineProperty(exports, "auditLogChartOfAccounts", { enumerable: true, get: function () { return audit_log_trigger_1.auditLogChartOfAccounts; } });
Object.defineProperty(exports, "auditLogAccountingPeriods", { enumerable: true, get: function () { return audit_log_trigger_1.auditLogAccountingPeriods; } });
// Nómina y roles de pago (PLAN_NOMINA.md E3). Solo admin y contador (requirePayrollRole).
var payroll_employee_callables_1 = require("./payroll/payroll-employee-callables");
Object.defineProperty(exports, "upsertPayrollEmployee", { enumerable: true, get: function () { return payroll_employee_callables_1.upsertPayrollEmployee; } });
Object.defineProperty(exports, "savePayrollNovelties", { enumerable: true, get: function () { return payroll_employee_callables_1.savePayrollNovelties; } });
var payroll_run_callables_1 = require("./payroll/payroll-run-callables");
Object.defineProperty(exports, "createPayrollRun", { enumerable: true, get: function () { return payroll_run_callables_1.createPayrollRun; } });
Object.defineProperty(exports, "recalculatePayrollRun", { enumerable: true, get: function () { return payroll_run_callables_1.recalculatePayrollRun; } });
Object.defineProperty(exports, "approvePayrollRun", { enumerable: true, get: function () { return payroll_run_callables_1.approvePayrollRun; } });
Object.defineProperty(exports, "reversePayrollRun", { enumerable: true, get: function () { return payroll_run_callables_1.reversePayrollRun; } });
var payroll_pdf_1 = require("./payroll/payroll-pdf");
Object.defineProperty(exports, "getPayslipPdf", { enumerable: true, get: function () { return payroll_pdf_1.getPayslipPdf; } });
var payroll_email_1 = require("./payroll/payroll-email");
Object.defineProperty(exports, "sendPayslipEmails", { enumerable: true, get: function () { return payroll_email_1.sendPayslipEmails; } });
// Users
var create_company_user_1 = require("./users/create-company-user");
Object.defineProperty(exports, "createCompanyUser", { enumerable: true, get: function () { return create_company_user_1.createCompanyUser; } });
var update_company_user_1 = require("./users/update-company-user");
Object.defineProperty(exports, "updateCompanyUser", { enumerable: true, get: function () { return update_company_user_1.updateCompanyUser; } });
var delete_company_user_1 = require("./users/delete-company-user");
Object.defineProperty(exports, "deleteCompanyUser", { enumerable: true, get: function () { return delete_company_user_1.deleteCompanyUser; } });
// School Bar
var school_generate_student_qr_1 = require("./school-bar/school-generate-student-qr");
Object.defineProperty(exports, "schoolGenerateStudentQr", { enumerable: true, get: function () { return school_generate_student_qr_1.schoolGenerateStudentQr; } });
var school_process_purchase_1 = require("./school-bar/school-process-purchase");
Object.defineProperty(exports, "schoolProcessPurchase", { enumerable: true, get: function () { return school_process_purchase_1.schoolProcessPurchase; } });
var school_confirm_recharge_1 = require("./school-bar/school-confirm-recharge");
Object.defineProperty(exports, "schoolConfirmRecharge", { enumerable: true, get: function () { return school_confirm_recharge_1.schoolConfirmRecharge; } });
var school_scan_qr_1 = require("./school-bar/school-scan-qr");
Object.defineProperty(exports, "schoolScanQr", { enumerable: true, get: function () { return school_scan_qr_1.schoolScanQr; } });
// Utils
var download_document_1 = require("./utils/download-document");
Object.defineProperty(exports, "downloadDocument", { enumerable: true, get: function () { return download_document_1.downloadDocument; } });
var get_auth_token_1 = require("./utils/get-auth-token");
Object.defineProperty(exports, "getAuthToken", { enumerable: true, get: function () { return get_auth_token_1.getAuthToken; } });
// Docs
var serve_api_docs_1 = require("./utils/serve-api-docs");
Object.defineProperty(exports, "serveApiDocs", { enumerable: true, get: function () { return serve_api_docs_1.serveApiDocs; } });
//# sourceMappingURL=index.js.map