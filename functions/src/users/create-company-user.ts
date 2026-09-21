import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { CHANNEL_ADMIN_ROLE, loadCompanyForCaller, readCaller } from '../utils/channels';
import { ALLOWED_ORIGINS } from '../auth/exchange-token';

// Roles del sistema que no se asignan desde esta función.
// channel_admin está acá para que un canal no pueda fabricarse otro admin de canal.
const PROTECTED_ROLES = ['super_admin', CHANNEL_ADMIN_ROLE];

// Roles que solo asigna quien administra la plataforma o el canal
// (ej: admin es el dueño de empresa, y lo crea el aprovisionamiento).
const ROLES_SUPER_ADMIN_ONLY = ['admin'];

/**
 * Valida que un código de rol sea sintácticamente correcto.
 * Formato: solo letras minúsculas, dígitos y guiones bajos. 1–50 caracteres.
 * Esto no reemplaza la validación de negocio (que el rol exista en Firestore),
 * pero previene inputs malformados sin necesidad de mantener un whitelist en código.
 */
function isValidRoleCode(role: unknown): role is string {
  return typeof role === 'string' && /^[a-z][a-z0-9_]{0,49}$/.test(role);
}

/**
 * Identidad de un sistema satélite (Conecta, Mi Buseta) que entrará como este
 * usuario sin contraseña propia, canjeando su token en exchangeToken.
 */
interface ExternalIdentity {
  origin: string;
  uid:    string;
}

interface CreateCompanyUserData {
  email:             string;
  password?:         string;
  displayName:       string;
  platformRole:      string;
  companyId:         string;
  personaId?:        string;
  externalIdentity?: ExternalIdentity;
}

interface CreateCompanyUserResult {
  uid:            string;
  email:          string;
  displayName:    string;
  platformRole:   string;
  linked?:        boolean;
  alreadyLinked?: boolean;
}

/** Id del documento en identity-links; el mismo formato que busca exchangeToken. */
export function identityLinkId(origin: string, uid: string): string {
  return `${origin}:${uid}`;
}

/** Valida la identidad externa. Devuelve el motivo si no sirve, o null. */
export function validateExternalIdentity(ext: unknown): string | null {
  if (!ext || typeof ext !== 'object') return 'externalIdentity debe ser un objeto.';
  const { origin, uid } = ext as Record<string, unknown>;
  if (typeof origin !== 'string' || !ALLOWED_ORIGINS[origin]) {
    return `Origen '${String(origin)}' no autorizado.`;
  }
  // Los uid de Firebase Auth son de 1 a 128 caracteres, sin '/'.
  if (typeof uid !== 'string' || uid.length === 0 || uid.length > 128 || uid.includes('/')) {
    return 'externalIdentity.uid no es un uid válido.';
  }
  return null;
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

  if (callerRole !== 'admin' && callerRole !== 'super_admin' && callerRole !== CHANNEL_ADMIN_ROLE) {
    throw new HttpsError('permission-denied', 'Solo admin, super_admin o channel_admin pueden crear usuarios.');
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const { email, password, displayName, platformRole, companyId, personaId, externalIdentity } =
    request.data as CreateCompanyUserData;

  // Con identidad externa no hay contraseña: esa persona entra canjeando el
  // token de su sistema, nunca con correo y clave de este proyecto.
  const federated = externalIdentity !== undefined && externalIdentity !== null;

  if (!email || !displayName || !platformRole || !companyId || (!federated && !password)) {
    throw new HttpsError(
      'invalid-argument',
      federated
        ? 'email, displayName, platformRole y companyId son requeridos.'
        : 'email, password, displayName, platformRole y companyId son requeridos.'
    );
  }

  if (federated) {
    const problem = validateExternalIdentity(externalIdentity);
    if (problem) throw new HttpsError('invalid-argument', problem);
    // Vincular una identidad externa es darle a otro sistema la llave de este
    // usuario: lo decide la plataforma o el canal, nunca un admin de empresa.
    if (callerRole !== 'super_admin' && callerRole !== CHANNEL_ADMIN_ROLE) {
      throw new HttpsError('permission-denied', 'Solo super_admin o channel_admin vinculan identidades externas.');
    }
  }

  if (!isValidRoleCode(platformRole)) {
    throw new HttpsError(
      'invalid-argument',
      `Código de rol inválido: "${platformRole}". Solo se permiten letras minúsculas, dígitos y guiones bajos (máx. 50 caracteres).`
    );
  }

  // Nadie puede asignarse ni asignar el rol super_admin desde esta función.
  if (PROTECTED_ROLES.includes(platformRole)) {
    throw new HttpsError('permission-denied', `El rol '${platformRole}' no puede asignarse desde aquí.`);
  }

  // El rol 'admin' es exclusivo del primer usuario de empresa (creado por setupCompany).
  // Un admin de empresa NO puede crear otro admin — solo super_admin puede hacerlo.
  if (
    ROLES_SUPER_ADMIN_ONLY.includes(platformRole) &&
    callerRole !== 'super_admin' &&
    callerRole !== CHANNEL_ADMIN_ROLE
  ) {
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

  // Un channel_admin solo crea usuarios en empresas de su canal.
  // loadCompanyForCaller también verifica que el canal esté activo.
  if (callerRole === CHANNEL_ADMIN_ROLE) {
    await loadCompanyForCaller(admin.firestore(), readCaller(request), companyId);
  }

  const auth = admin.auth();
  const db   = admin.firestore();
  const now  = Timestamp.now();

  // ── Reintento de una vinculación ya hecha ────────────────────────────────
  // Si el vínculo ya existe para esta empresa, no se crea nada más.
  const linkRef = federated
    ? db.doc(`identity-links/${identityLinkId(externalIdentity!.origin, externalIdentity!.uid)}`)
    : null;
  if (linkRef) {
    const existing = await linkRef.get();
    if (existing.exists) {
      const link = existing.data()!;
      if (link['companyId'] !== companyId) {
        throw new HttpsError('already-exists', 'Esa identidad ya está vinculada a otra empresa.');
      }
      return { uid: link['saasUid'], email, displayName, platformRole, linked: true, alreadyLinked: true };
    }
  }

  // ── Crear usuario en Firebase Auth ────────────────────────────────────────
  let uid: string;
  let reused = false;
  try {
    const userRecord = await auth.createUser({
      email,
      ...(password ? { password } : {}),
      displayName,
      emailVerified: false,
    });
    uid = userRecord.uid;
    console.log(`[createCompanyUser] Firebase Auth user created: ${uid} (${email})`);
  } catch (err: any) {
    if (err.code === 'auth/email-already-exists') {
      // Un reintento que se cortó después de crear el usuario y antes del
      // vínculo. Se reutiliza SOLO si ese usuario ya pertenece a esta empresa:
      // enlazar por correo una cuenta ajena le daría a quien controle ese correo
      // en el otro sistema una cuenta que no es suya.
      const prior = federated ? await auth.getUserByEmail(email).catch(() => null) : null;
      const belongs = prior
        ? (await db.doc(`companies/${companyId}/company-users/${prior.uid}`).get()).exists
        : false;
      if (!prior || !belongs) {
        throw new HttpsError('already-exists', 'Ya existe un usuario con ese correo electrónico.');
      }
      uid = prior.uid;
      reused = true;
      console.log(`[createCompanyUser] Reusing user ${uid} for federated link`);
    } else {
      if (err.code === 'auth/weak-password') {
        throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
      }
      if (err.code === 'auth/invalid-email') {
        throw new HttpsError('invalid-argument', 'El correo electrónico no es válido.');
      }
      console.error('[createCompanyUser] Auth error:', err);
      throw new HttpsError('internal', `Error al crear el usuario: ${err.message}`);
    }
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
  // Si se reutiliza, el perfil ya existe: se completa sin pisar su historia.
  await docRef.set(docData, { merge: reused });
  console.log(`[createCompanyUser] Firestore doc written: companies/${companyId}/company-users/${uid}`);

  // ── Asignar custom claims ─────────────────────────────────────────────────
  // Si falla, borrar el doc recién creado para evitar usuario sin claims.
  try {
    await auth.setCustomUserClaims(uid, { companyId, role: platformRole });
    console.log(`[createCompanyUser] Claims set: companyId=${companyId}, role=${platformRole}`);
  } catch (claimsErr: any) {
    console.error('[createCompanyUser] Claims failed — rolling back Firestore doc:', claimsErr);
    // Un perfil reutilizado ya existía antes de esta llamada: no es nuestro
    // para borrarlo.
    if (reused) {
      throw new HttpsError('internal', `Error al asignar permisos al usuario: ${claimsErr.message}`);
    }
    try {
      await docRef.delete();
      console.log('[createCompanyUser] Rollback: Firestore doc deleted.');
    } catch (rollbackErr) {
      console.error('[createCompanyUser] Rollback failed — doc may be orphaned:', rollbackErr);
    }
    throw new HttpsError('internal', `Error al asignar permisos al usuario: ${claimsErr.message}`);
  }

  // ── Vínculo con la identidad externa ──────────────────────────────────────
  // Al final, cuando el usuario ya tiene claims: un vínculo que apunta a un
  // usuario a medio crear dejaría entrar a alguien sin permisos coherentes.
  if (linkRef) {
    await linkRef.set({
      saasUid:   uid,
      role:      platformRole,
      companyId,
      origin:    externalIdentity!.origin,
      originUid: externalIdentity!.uid,
      enabled:   true,
      createdAt: now,
      createdBy: request.auth.uid,
    });
    console.log(`[createCompanyUser] Identity linked: ${linkRef.id} → ${uid}`);
  }

  return { uid, email, displayName, platformRole, linked: !!linkRef };
});
