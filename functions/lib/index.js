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
exports.downloadDocument = exports.onProductPublicSync = exports.onMarketplaceSettingsChange = exports.onInvoiceStock = exports.onDebitNoteEmit = exports.sendDebitNoteEmail = exports.generateDebitNotePdf = exports.generateDebitNoteXml = exports.onRetentionEmit = exports.sendRetentionEmail = exports.generateRetentionPdf = exports.generateRetentionXml = exports.onInvoiceEmit = exports.sendCreditNoteEmail = exports.generateCreditNotePdf = exports.sendInvoiceEmail = exports.generatePdf = exports.checkSriStatus = exports.sendToSri = exports.signXml = exports.generateCreditNoteXml = exports.generateInvoiceXml = exports.uploadCertificate = exports.setupCompany = exports.setupFirstAdmin = exports.setUserCustomClaims = void 0;
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
// Stock
var on_invoice_stock_1 = require("./stock/on-invoice-stock");
Object.defineProperty(exports, "onInvoiceStock", { enumerable: true, get: function () { return on_invoice_stock_1.onInvoiceStock; } });
// Marketplace
var on_marketplace_settings_change_1 = require("./marketplace/on-marketplace-settings-change");
Object.defineProperty(exports, "onMarketplaceSettingsChange", { enumerable: true, get: function () { return on_marketplace_settings_change_1.onMarketplaceSettingsChange; } });
var on_product_public_sync_1 = require("./marketplace/on-product-public-sync");
Object.defineProperty(exports, "onProductPublicSync", { enumerable: true, get: function () { return on_product_public_sync_1.onProductPublicSync; } });
// Utils
var download_document_1 = require("./utils/download-document");
Object.defineProperty(exports, "downloadDocument", { enumerable: true, get: function () { return download_document_1.downloadDocument; } });
//# sourceMappingURL=index.js.map