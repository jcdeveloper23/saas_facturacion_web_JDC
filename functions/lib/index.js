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
exports.downloadDocument = exports.deleteCompanyUser = exports.updateCompanyUser = exports.createCompanyUser = exports.closeAccountingPeriod = exports.generateJournalEntryFromRetention = exports.generateJournalEntryFromInvoice = exports.generateWeeklyReport = exports.detectOverdueTasksScheduled = exports.onTaskStatusChanged = exports.onTimesheetDeleted = exports.onTimesheetCreated = exports.onProductPublicSync = exports.onMarketplaceSettingsChange = exports.onPurchaseReceive = exports.onInvoiceStock = exports.onPosSaleComplete = exports.onDebitNoteEmit = exports.sendDebitNoteEmail = exports.generateDebitNotePdf = exports.generateDebitNoteXml = exports.onRetentionEmit = exports.sendRetentionEmail = exports.generateRetentionPdf = exports.generateRetentionXml = exports.onInvoiceEmit = exports.sendCreditNoteEmail = exports.generateCreditNotePdf = exports.sendInvoiceEmail = exports.generatePdf = exports.checkSriStatus = exports.sendToSri = exports.signXml = exports.generateCreditNoteXml = exports.generateInvoiceXml = exports.uploadCertificate = exports.checkPlanLimit = exports.onPlanUpdated = exports.assignPlanToCompany = exports.setupCompany = exports.setupFirstAdmin = exports.setUserCustomClaims = void 0;
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
// Auth
var set_custom_claims_1 = require("./auth/set-custom-claims");
Object.defineProperty(exports, "setUserCustomClaims", { enumerable: true, get: function () { return set_custom_claims_1.setUserCustomClaims; } });
var setup_first_admin_1 = require("./auth/setup-first-admin"); // TODO: remove after first admin created
Object.defineProperty(exports, "setupFirstAdmin", { enumerable: true, get: function () { return setup_first_admin_1.setupFirstAdmin; } });
// Tenants
var setup_company_1 = require("./tenants/setup-company");
Object.defineProperty(exports, "setupCompany", { enumerable: true, get: function () { return setup_company_1.setupCompany; } });
var assign_plan_to_company_1 = require("./tenants/assign-plan-to-company");
Object.defineProperty(exports, "assignPlanToCompany", { enumerable: true, get: function () { return assign_plan_to_company_1.assignPlanToCompany; } });
var on_plan_updated_1 = require("./tenants/on-plan-updated");
Object.defineProperty(exports, "onPlanUpdated", { enumerable: true, get: function () { return on_plan_updated_1.onPlanUpdated; } });
var check_plan_limit_1 = require("./tenants/check-plan-limit");
Object.defineProperty(exports, "checkPlanLimit", { enumerable: true, get: function () { return check_plan_limit_1.checkPlanLimit; } });
// Invoices / SRI
var upload_certificate_1 = require("./invoices/upload-certificate");
Object.defineProperty(exports, "uploadCertificate", { enumerable: true, get: function () { return upload_certificate_1.uploadCertificate; } });
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
var generate_journal_entry_from_invoice_1 = require("./accounting/generate-journal-entry-from-invoice");
Object.defineProperty(exports, "generateJournalEntryFromInvoice", { enumerable: true, get: function () { return generate_journal_entry_from_invoice_1.generateJournalEntryFromInvoice; } });
var generate_journal_entry_from_retention_1 = require("./accounting/generate-journal-entry-from-retention");
Object.defineProperty(exports, "generateJournalEntryFromRetention", { enumerable: true, get: function () { return generate_journal_entry_from_retention_1.generateJournalEntryFromRetention; } });
var close_accounting_period_1 = require("./accounting/close-accounting-period");
Object.defineProperty(exports, "closeAccountingPeriod", { enumerable: true, get: function () { return close_accounting_period_1.closeAccountingPeriod; } });
// Users
var create_company_user_1 = require("./users/create-company-user");
Object.defineProperty(exports, "createCompanyUser", { enumerable: true, get: function () { return create_company_user_1.createCompanyUser; } });
var update_company_user_1 = require("./users/update-company-user");
Object.defineProperty(exports, "updateCompanyUser", { enumerable: true, get: function () { return update_company_user_1.updateCompanyUser; } });
var delete_company_user_1 = require("./users/delete-company-user");
Object.defineProperty(exports, "deleteCompanyUser", { enumerable: true, get: function () { return delete_company_user_1.deleteCompanyUser; } });
// Utils
var download_document_1 = require("./utils/download-document");
Object.defineProperty(exports, "downloadDocument", { enumerable: true, get: function () { return download_document_1.downloadDocument; } });
//# sourceMappingURL=index.js.map