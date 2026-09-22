import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { normalizeEstablishmentList } from '../utils/establishments';
import { Timestamp } from 'firebase-admin/firestore';

// Roles que no pueden asignarse desde esta función.
const PROTECTED_ROLES = ['super_admin'];

/**
 * Valida que un código de rol sea sintácticamente correcto.
 * Formato: solo letras minúsculas, dígitos y guiones bajos. 1–50 caracteres.
 */
function isValidRoleCode(role: unknown): role is string {
  return typeof role === 'string' && /^[a-z][a-z0-9_]{0,49}$/.test(role);
}

interface UpdateCompanyUserData {
  uid:           string;
  companyId:     string;
  displayName?:  string;
  platformRole?: string;
  isActive?:     boolean;
  /** Establecimientos a los que tiene acceso. Vacío = todos. */
  establishments?: string[];
  personaId?:    string;
}

/**
 * updateCompanyUser
 *
 * Actualiza el perfil de un usuario de la empresa:
 *  - displayName en Firebase Auth
 *  - platformRole → actualiza custom claims si cambia
 *  - isActive → habilita/deshabilita la cuenta en Firebase Auth
 *  - Actualiza companies/{companyId}/company-users/{uid} en Firestore
 *
 * Solo puede ser invocada por admin o super_admin.
 * Admin solo puede modificar usuarios de su propia empresa.
 */
export const updateCompanyUser = onCall(async (request) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated.');
  }

  const callerRole      = request.auth.token['role'] as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;

  if (callerRole !== 'admin' && callerRole !== 'super_admin') {
    throw new HttpsError('permission-denied', 'Solo admin o super_admin pueden modificar usuarios.');
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const { uid, companyId, displayName, platformRole, isActive, personaId, establishments } =
    request.data as UpdateCompanyUserData;

  let normalizedEstablishments: string[] | undefined;
  if (establishments !== undefined) {
    try {
      normalizedEstablishments = normalizeEstablishmentList(establishments);
    } catch (err: any) {
      throw new HttpsError('invalid-argument', err.message);
    }
  }

  if (!uid || !companyId) {
    throw new HttpsError('invalid-argument', 'uid y companyId son requeridos.');
  }

  if (callerRole === 'admin' && callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'Admin solo puede modificar usuarios de su propia empresa.');
  }

  if (platformRole !== undefined) {
    if (!isValidRoleCode(platformRole)) {
      throw new HttpsError(
        'invalid-argument',
        `Código de rol inválido: "${platformRole}". Solo se permiten letras minúsculas, dígitos y guiones bajos (máx. 50 caracteres).`
      );
    }
    if (PROTECTED_ROLES.includes(platformRole)) {
      throw new HttpsError('permission-denied', `El rol '${platformRole}' no puede asignarse desde aquí.`);
    }
  }

  const auth = admin.auth();
  const db   = admin.firestore();
  const now  = Timestamp.now();

  // ── Verificar que el usuario existe ───────────────────────────────────────
  let existingUser: admin.auth.UserRecord;
  try {
    existingUser = await auth.getUser(uid);
  } catch {
    throw new HttpsError('not-found', `Usuario con uid=${uid} no encontrado en Firebase Auth.`);
  }

  // ── Actualizar Firebase Auth ──────────────────────────────────────────────
  const authUpdates: admin.auth.UpdateRequest = {};
  if (displayName !== undefined) authUpdates.displayName = displayName;
  if (isActive === false)        authUpdates.disabled = true;
  if (isActive === true)         authUpdates.disabled = false;

  if (Object.keys(authUpdates).length > 0) {
    await auth.updateUser(uid, authUpdates);
    console.log(`[updateCompanyUser] Auth updated for ${uid}:`, authUpdates);
  }

  // ── Actualizar Firestore PRIMERO (rollback si claims falla) ──────────────
  // Mismo patrón que createCompanyUser: Firestore es la fuente de verdad.
  // Si setCustomUserClaims falla, revertimos el doc a los valores anteriores.
  const docRef = db.doc(`companies/${companyId}/company-users/${uid}`);

  // Capturar estado previo de Firestore antes de modificar (para rollback).
  let previousFirestoreData: Record<string, unknown> | null = null;
  if (platformRole !== undefined) {
    const snap = await docRef.get();
    if (snap.exists) {
      previousFirestoreData = snap.data() as Record<string, unknown>;
    }
  }

  const firestoreUpdates: Record<string, unknown> = {
    updatedAt: now,
    updatedBy: request.auth.uid,
  };
  if (displayName  !== undefined) firestoreUpdates.displayName  = displayName;
  if (platformRole !== undefined) firestoreUpdates.platformRole = platformRole;
  if (isActive     !== undefined) firestoreUpdates.isActive     = isActive;
  if (personaId    !== undefined) firestoreUpdates.personaId    = personaId;
  if (normalizedEstablishments !== undefined) firestoreUpdates.establishments = normalizedEstablishments;

  await docRef.update(firestoreUpdates);
  console.log(`[updateCompanyUser] Firestore updated for ${uid}`);

  // ── Actualizar custom claims si cambia el rol ─────────────────────────────
  // Si falla, revertir el campo platformRole en Firestore.
  if (platformRole !== undefined) {
    const existingClaims = existingUser.customClaims ?? {};
    const newClaims = { ...existingClaims, role: platformRole };
    try {
      await auth.setCustomUserClaims(uid, newClaims);
      console.log(`[updateCompanyUser] Claims updated: role=${platformRole}`);
    } catch (claimsErr: any) {
      console.error('[updateCompanyUser] Claims failed — rolling back Firestore platformRole:', claimsErr);
      if (previousFirestoreData !== null) {
        try {
          await docRef.update({
            platformRole: previousFirestoreData['platformRole'],
            updatedAt:    previousFirestoreData['updatedAt'],
            updatedBy:    previousFirestoreData['updatedBy'],
          });
          console.log('[updateCompanyUser] Rollback: Firestore platformRole reverted.');
        } catch (rollbackErr) {
          console.error('[updateCompanyUser] Rollback failed — Firestore may be out of sync:', rollbackErr);
        }
      }
      throw new HttpsError('internal', `Error al actualizar permisos del usuario: ${claimsErr.message}`);
    }
  }

  return { success: true, uid };
});
