import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * setupFirstAdmin — PROVISIONAL (development bootstrap only)
 *
 * Creates the first super_admin user when the system has no admins yet.
 * Once a super_admin user exists, this function returns an error.
 *
 * Callable from frontend WITHOUT authentication (bootstrapping purpose).
 * TODO: Remove or disable this function after first admin is created.
 */
export const setupFirstAdmin = onCall(async (request) => {
  const { email, password } = request.data as { email: string; password: string };

  if (!email || !password) {
    throw new HttpsError('invalid-argument', 'Email y contraseña son requeridos.');
  }

  if (password.length < 8) {
    throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 8 caracteres.');
  }

  const db = admin.firestore();
  const auth = admin.auth();

  // ── Safety check: only allowed if no super_admin exists yet ──────────────
  const existingAdmins = await db.collection('users')
    .where('role', '==', 'super_admin')
    .limit(1)
    .get();

  if (!existingAdmins.empty) {
    throw new HttpsError(
      'already-exists',
      'Ya existe un super administrador. Esta función solo puede usarse en la configuración inicial.'
    );
  }

  // ── Create Firebase Auth user ────────────────────────────────────────────
  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await auth.createUser({ email, password });
  } catch (err: any) {
    if (err.code === 'auth/email-already-exists') {
      // User exists in Auth but not in Firestore — still set their claims
      userRecord = await auth.getUserByEmail(email);
    } else {
      throw new HttpsError('internal', `Error al crear usuario: ${err.message}`);
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
