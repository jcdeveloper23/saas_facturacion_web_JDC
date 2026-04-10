"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadCertificate = exports.setupCompany = exports.setupFirstAdmin = exports.setUserCustomClaims = void 0;
const admin = require("firebase-admin");
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
//# sourceMappingURL=index.js.map