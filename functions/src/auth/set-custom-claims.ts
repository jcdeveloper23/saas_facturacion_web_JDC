import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { CHANNEL_ADMIN_ROLE, loadCompanyForCaller, readCaller } from '../utils/channels';

// Roles que solo puede asignar el super admin de plataforma.
// channel_admin está acá para que el admin de un canal no pueda fabricarse otro.
const SUPER_ADMIN_ONLY_ROLES = ['super_admin', CHANNEL_ADMIN_ROLE];

/**
 * Valida que un código de rol sea sintácticamente correcto.
 * No usa whitelist para no bloquear roles creados dinámicamente desde la UI.
 */
function isValidRoleCode(role: unknown): role is string {
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
export const setUserCustomClaims = onCall(async (request) => {
  // Must be authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated to call this function.');
  }

  const callerRole = request.auth.token['role'] as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;

  const { targetUid, companyId, role } = request.data as {
    targetUid: string;
    companyId: string;
    role: string;
  };

  // Validate inputs
  if (!targetUid || !companyId || !role) {
    throw new HttpsError('invalid-argument', 'targetUid, companyId and role are required.');
  }

  if (!isValidRoleCode(role)) {
    throw new HttpsError(
      'invalid-argument',
      `Código de rol inválido: "${role}". Solo se permiten letras minúsculas, dígitos y guiones bajos (máx. 50 caracteres).`
    );
  }

  // Only super_admin can assign protected roles (super_admin itself)
  if (SUPER_ADMIN_ONLY_ROLES.includes(role) && callerRole !== 'super_admin') {
    throw new HttpsError('permission-denied', `Solo super_admin puede asignar el rol '${role}'.`);
  }

  // Admin can only manage users within their own company
  if (callerRole === 'admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'Admin can only manage users within their own company.');
  }

  // Un channel_admin solo administra usuarios de empresas de su propio canal.
  // loadCompanyForCaller también verifica que el canal esté activo.
  if (callerRole === CHANNEL_ADMIN_ROLE) {
    await loadCompanyForCaller(admin.firestore(), readCaller(request), companyId);
  } else if (callerRole !== 'admin' && callerRole !== 'super_admin') {
    throw new HttpsError('permission-denied', 'Insufficient permissions.');
  }

  // Set custom claims on the target user
  await admin.auth().setCustomUserClaims(targetUid, { companyId, role });

  // Also update the user profile in Firestore
  const db = admin.firestore();
  await db.doc(`companies/${companyId}/users/${targetUid}`).set(
    { role, companyId, updatedAt: admin.firestore.Timestamp.now() },
    { merge: true }
  );

  // Also upsert the global user registry
  await db.doc(`users/${targetUid}`).set(
    { companyId, role, updatedAt: admin.firestore.Timestamp.now() },
    { merge: true }
  );

  return { success: true, uid: targetUid, companyId, role };
});
