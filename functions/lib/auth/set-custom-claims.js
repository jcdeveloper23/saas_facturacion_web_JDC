"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUserCustomClaims = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const VALID_ROLES = ['admin', 'seller', 'cashier', 'read_only', 'super_admin'];
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
    if (!VALID_ROLES.includes(role)) {
        throw new https_1.HttpsError('invalid-argument', `Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    }
    // Only super_admin can assign super_admin role or manage other companies
    if (role === 'super_admin' && callerRole !== 'super_admin') {
        throw new https_1.HttpsError('permission-denied', 'Only super_admin can assign the super_admin role.');
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