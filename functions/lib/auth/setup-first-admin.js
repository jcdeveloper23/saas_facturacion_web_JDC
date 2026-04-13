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
exports.setupFirstAdmin = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
/**
 * setupFirstAdmin — PROVISIONAL (development bootstrap only)
 *
 * Creates the first super_admin user when the system has no admins yet.
 * Once a super_admin user exists, this function returns an error.
 *
 * Callable from frontend WITHOUT authentication (bootstrapping purpose).
 * TODO: Remove or disable this function after first admin is created.
 */
exports.setupFirstAdmin = (0, https_1.onCall)(async (request) => {
    const { email, password } = request.data;
    if (!email || !password) {
        throw new https_1.HttpsError('invalid-argument', 'Email y contraseña son requeridos.');
    }
    if (password.length < 8) {
        throw new https_1.HttpsError('invalid-argument', 'La contraseña debe tener al menos 8 caracteres.');
    }
    const db = admin.firestore();
    const auth = admin.auth();
    // ── Safety check: only allowed if no super_admin exists yet ──────────────
    const existingAdmins = await db.collection('users')
        .where('role', '==', 'super_admin')
        .limit(1)
        .get();
    if (!existingAdmins.empty) {
        throw new https_1.HttpsError('already-exists', 'Ya existe un super administrador. Esta función solo puede usarse en la configuración inicial.');
    }
    // ── Create Firebase Auth user ────────────────────────────────────────────
    let userRecord;
    try {
        userRecord = await auth.createUser({ email, password });
    }
    catch (err) {
        if (err.code === 'auth/email-already-exists') {
            // User exists in Auth but not in Firestore — still set their claims
            userRecord = await auth.getUserByEmail(email);
        }
        else {
            throw new https_1.HttpsError('internal', `Error al crear usuario: ${err.message}`);
        }
    }
    // ── Set custom claims: super_admin (no companyId needed) ─────────────────
    await auth.setCustomUserClaims(userRecord.uid, {
        role: 'super_admin',
        companyId: ''
    });
    // ── Register in global users registry ────────────────────────────────────
    const now = admin.firestore.Timestamp.now();
    await db.doc(`users/${userRecord.uid}`).set({
        uid: userRecord.uid,
        email,
        displayName: email.split('@')[0],
        role: 'super_admin',
        companyId: '',
        isActive: true,
        lastLogin: now,
        createdAt: now,
        updatedAt: now
    });
    return {
        success: true,
        uid: userRecord.uid,
        message: 'Super administrador creado correctamente. Ya puedes iniciar sesión.'
    };
});
//# sourceMappingURL=setup-first-admin.js.map