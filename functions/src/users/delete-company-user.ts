import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

interface DeleteCompanyUserData {
  uid:       string;
  companyId: string;
}

/**
 * deleteCompanyUser
 *
 * Elimina un usuario de empresa de forma completa y atómica:
 *  1. Verifica que el caller tenga permisos (solo super_admin)
 *  2. No permite auto-eliminación
 *  3. Elimina el doc en Firestore companies/{companyId}/company-users/{uid}
 *  4. Elimina el usuario de Firebase Auth
 *
 * Orden deliberado: Firestore primero, luego Auth.
 * Si Auth falla, el doc ya fue eliminado (el usuario queda huérfano en Auth pero
 * sin acceso a la empresa). Se loguea para limpieza manual si fuera necesario.
 *
 * Solo super_admin puede eliminar usuarios — los admin solo pueden desactivar
 * (isActive: false via updateCompanyUser) para mantener trazabilidad.
 */
export const deleteCompanyUser = onCall(async (request) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated.');
  }

  const callerRole = request.auth.token['role'] as string | undefined;

  // Solo super_admin puede eliminar usuarios permanentemente
  if (callerRole !== 'super_admin') {
    throw new HttpsError(
      'permission-denied',
      'Solo super_admin puede eliminar usuarios permanentemente. ' +
      'Para desactivar un usuario usa updateCompanyUser con isActive: false.'
    );
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const { uid, companyId } = request.data as DeleteCompanyUserData;

  if (!uid || !companyId) {
    throw new HttpsError('invalid-argument', 'uid y companyId son requeridos.');
  }

  // No permitir auto-eliminación
  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'No puedes eliminar tu propia cuenta.');
  }

  const auth = admin.auth();
  const db   = admin.firestore();

  // ── Verificar que el usuario existe en Auth ───────────────────────────────
  try {
    await auth.getUser(uid);
  } catch {
    throw new HttpsError('not-found', `Usuario con uid=${uid} no encontrado en Firebase Auth.`);
  }

  // ── Eliminar doc Firestore primero ─────────────────────────────────────
  const docRef = db.doc(`companies/${companyId}/company-users/${uid}`);
  await docRef.delete();
  console.log(`[deleteCompanyUser] Firestore doc deleted: companies/${companyId}/company-users/${uid}`);

  // ── Eliminar de Firebase Auth ─────────────────────────────────────────
  try {
    await auth.deleteUser(uid);
    console.log(`[deleteCompanyUser] Firebase Auth user deleted: ${uid}`);
  } catch (authErr: any) {
    // El doc ya fue eliminado — el usuario queda sin acceso a la empresa.
    // Se loguea para posible limpieza manual del usuario huérfano en Auth.
    console.error(
      `[deleteCompanyUser] Auth delete failed for uid=${uid} (Firestore doc already deleted):`,
      authErr.message
    );
    throw new HttpsError(
      'internal',
      `El perfil fue eliminado de Firestore pero no se pudo eliminar de Auth: ${authErr.message}`
    );
  }

  return { success: true, uid };
});
