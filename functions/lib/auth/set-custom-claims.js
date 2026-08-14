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
exports.setUserCustomClaims = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
// Solo super_admin puede asignar este rol.
const SUPER_ADMIN_ONLY_ROLES = ['super_admin'];
/**
 * Valida que un código de rol sea sintácticamente correcto.
 * No usa whitelist para no bloquear roles creados dinámicamente desde la UI.
 */
function isValidRoleCode(role) {
    return typeof role === 'string' && /^[a-z][a-z0-9_]{0,49}$/.test(role);
}
/**
 * setUserCustomClaims
 *
 * Called by an admin to assign companyId + role to a Firebase Auth user.
 * These claims are then available in the JWT token as:
 *   request.auth.token.companyId
 *   request.auth.token.role
 *
 * Usage from Angular:
 *   const fn = httpsCallable(functions, 'setUserCustomClaims');
 *   await fn({ targetUid, companyId, role });
 */
exports.setUserCustomClaims = (0, https_1.onCall)(async (request) => {
    // Must be authenticated
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated to call this function.');
    }
    const callerRole = request.auth.token['role'];
    const callerCompanyId = request.auth.token['companyId'];
    const { targetUid, companyId, role } = request.data;
    // Validate inputs
    if (!targetUid || !companyId || !role) {
        throw new https_1.HttpsError('invalid-argument', 'targetUid, companyId and role are required.');
    }
    if (!isValidRoleCode(role)) {
        throw new https_1.HttpsError('invalid-argument', `Código de rol inválido: "${role}". Solo se permiten letras minúsculas, dígitos y guiones bajos (máx. 50 caracteres).`);
    }
    // Only super_admin can assign protected roles (super_admin itself)
    if (SUPER_ADMIN_ONLY_ROLES.includes(role) && callerRole !== 'super_admin') {
        throw new https_1.HttpsError('permission-denied', `Solo super_admin puede asignar el rol '${role}'.`);
    }
    // Admin can only manage users within their own company
    if (callerRole === 'admin' && callerCompanyId !== companyId) {
        throw new https_1.HttpsError('permission-denied', 'Admin can only manage users within their own company.');
    }
    // Only admin or super_admin can call this
    if (callerRole !== 'admin' && callerRole !== 'super_admin') {
        throw new https_1.HttpsError('permission-denied', 'Insufficient permissions.');
    }
    // Set custom claims on the target user
    await admin.auth().setCustomUserClaims(targetUid, { companyId, role });
    // Also update the user profile in Firestore
    const db = admin.firestore();
    await db.doc(`companies/${companyId}/users/${targetUid}`).set({ role, companyId, updatedAt: admin.firestore.Timestamp.now() }, { merge: true });
    // Also upsert the global user registry
    await db.doc(`users/${targetUid}`).set({ companyId, role, updatedAt: admin.firestore.Timestamp.now() }, { merge: true });
    return { success: true, uid: targetUid, companyId, role };
});
//# sourceMappingURL=set-custom-claims.js.map