"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUserCustomClaims = void 0;
const admin = require("firebase-admin");
admin.initializeApp();
// Auth
var set_custom_claims_1 = require("./auth/set-custom-claims");
Object.defineProperty(exports, "setUserCustomClaims", { enumerable: true, get: function () { return set_custom_claims_1.setUserCustomClaims; } });
//# sourceMappingURL=index.js.map