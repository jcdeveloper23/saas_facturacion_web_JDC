import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

type UserRole = 'admin' | 'seller' | 'cashier' | 'read_only' | 'accountant';

// super_admin: nunca asignable desde aquí (es rol de sistema, se setea manualmente)
// admin: solo super_admin puede asignarlo (es el rol del primer usuario de empresa, creado
//        automáticamente por setupCompany; los admin de empresa NO pueden crear otros admin)
const ROLES_SUPER_ADMIN_ONLY: UserRole[] = ['admin'];
const ASSIGNABLE_ROLES: UserRole[] = ['admin', 'seller', 'cashier', 'read_only', 'accountant'];

interface CreateCompanyUserData {
  email:        string;
  password:     string;
  displayName:  string;
  platformRole: UserRole;
  companyId:    string;
  personaId?:   string;
}

interface CreateCompanyUserResult {
  uid:          string;
  email:        string;
  displayName:  string;
  platformRole: UserRole;
}

/**
 * createCompanyUser
 *
 * Crea un usuario de Firebase Auth + escribe su perfil en Firestore.
 * Solo puede ser invocada por admin o super_admin.
 *
 * Proceso:
 *  1. Valida permisos del caller
 *  2. Crea el usuario en Firebase Auth (Admin SDK)
 *  3. Asigna custom claims { companyId, role: platformRole }
 *  4. Escribe companies/{companyId}/company-users/{uid} en Firestore
 *
 * El frontend no puede crear usuarios de Firebase Auth sin loguear al nuevo
 * usuario en el proceso — por eso esta Cloud Function es necesaria.
 */
export const createCompanyUser = onCall(async (request): Promise<CreateCompanyUserResult> => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated.');
  }

  const callerRole      = request.auth.token['role'] as string | undefined;
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;

  if (callerRole !== 'admin' && callerRole !== 'super_admin') {
    throw new HttpsError('permission-denied', 'Solo admin o super_admin pueden crear usuarios.');
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const { email, password, displayName, platformRole, companyId, personaId } =
    request.data as CreateCompanyUserData;

  if (!email || !password || !displayName || !platformRole || !companyId) {
    throw new HttpsError(
      'invalid-argument',
      'email, password, displayName, platformRole y companyId son requeridos.'
    );
  }

  if (!ASSIGNABLE_ROLES.includes(platformRole)) {
    throw new HttpsError(
      'invalid-argument',
      `Rol inválido: ${platformRole}. Debe ser uno de: ${ASSIGNABLE_ROLES.join(', ')}`
    );
  }

  // El rol 'admin' es exclusivo del primer usuario de empresa (creado por setupCompany).
  // Un admin de empresa NO puede crear otro admin — solo super_admin puede hacerlo.
  if (ROLES_SUPER_ADMIN_ONLY.includes(platformRole) && callerRole !== 'super_admin') {
    throw new HttpsError(
      'permission-denied',
      `Solo super_admin puede asignar el rol '${platformRole}'.`
    );
  }

  // Admin solo puede crear usuarios en su propia empresa
  if (callerRole === 'admin' && callerCompanyId !== companyId) {
    throw new HttpsError(
      'permission-denied',
      'Admin solo puede crear usuarios para su propia empresa.'
    );
  }

  const auth = admin.auth();
  const db   = admin.firestore();
  const now  = Timestamp.now();

  // ── Crear usuario en Firebase Auth ────────────────────────────────────────
  let uid: string;
  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });
    uid = userRecord.uid;
    console.log(`[createCompanyUser] Firebase Auth user created: ${uid} (${email})`);
  } catch (err: any) {
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Ya existe un usuario con ese correo electrónico.');
    }
    if (err.code === 'auth/weak-password') {
      throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
    }
    if (err.code === 'auth/invalid-email') {
      throw new HttpsError('invalid-argument', 'El correo electrónico no es válido.');
    }
    console.error('[createCompanyUser] Auth error:', err);
    throw new HttpsError('internal', `Error al crear el usuario: ${err.message}`);
  }

  // ── Escribir en Firestore PRIMERO (rollback si claims falla) ─────────────
  // Orden deliberado: Firestore es la fuente de verdad de la app.
  // Si claims falla después, eliminamos el doc para mantener consistencia.
  const docData: Record<string, unknown> = {
    uid,
    email,
    displayName,
    platformRole,
    isActive:  true,
    createdAt: now,
    updatedAt: now,
    createdBy: request.auth.uid,
  };
  if (personaId) docData['personaId'] = personaId;

  const docRef = db.doc(`companies/${companyId}/company-users/${uid}`);
  await docRef.set(docData);
  console.log(`[createCompanyUser] Firestore doc written: companies/${companyId}/company-users/${uid}`);

  // ── Asignar custom claims ─────────────────────────────────────────────────
  // Si falla, borrar el doc recién creado para evitar usuario sin claims.
  try {
    await auth.setCustomUserClaims(uid, { companyId, role: platformRole });
    console.log(`[createCompanyUser] Claims set: companyId=${companyId}, role=${platformRole}`);
  } catch (claimsErr: any) {
    console.error('[createCompanyUser] Claims failed — rolling back Firestore doc:', claimsErr);
    try {
      await docRef.delete();
      console.log('[createCompanyUser] Rollback: Firestore doc deleted.');
    } catch (rollbackErr) {
      console.error('[createCompanyUser] Rollback failed — doc may be orphaned:', rollbackErr);
    }
    throw new HttpsError('internal', `Error al asignar permisos al usuario: ${claimsErr.message}`);
  }

  return { uid, email, displayName, platformRole };
});
