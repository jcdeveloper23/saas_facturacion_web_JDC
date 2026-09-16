import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  CHANNEL_ADMIN_ROLE,
  SUPER_ADMIN_ROLE,
  isSuperAdmin,
  isValidChannelId,
  readCaller,
} from '../utils/channels';

/**
 * manageChannelAdmin
 *
 * Callable CF — solo el super admin de plataforma.
 * Nombra o retira al administrador de un canal (Conectate, Mi Buseta).
 *
 * Los claims no se pueden escribir desde el navegador, por eso la pantalla de
 * canales pasa por acá. Además del claim, deja registro en
 * channels/{channelId}.admins.{uid} para que la pantalla muestre quién es admin.
 *
 * Si al nombrar admin el correo no tiene usuario, lo crea sin contraseña y
 * devuelve `created: true`; la pantalla se encarga de enviarle el correo para
 * definirla.
 *
 * Payload: { channelId: string; email: string; action: 'grant' | 'revoke' }
 * Returns: { success: true; uid: string; channelId: string; action; created: boolean }
 *
 * Ver docs/PLAN_CANALES_MULTIMARCA.md.
 */
export const manageChannelAdmin = onCall(async (request) => {
  const caller = readCaller(request);
  if (!isSuperAdmin(caller)) {
    throw new HttpsError('permission-denied', 'Solo el super admin de plataforma administra canales.');
  }

  const { channelId, email, action } = (request.data ?? {}) as {
    channelId?: unknown; email?: unknown; action?: unknown;
  };

  if (!isValidChannelId(channelId)) {
    throw new HttpsError('invalid-argument', 'channelId inválido.');
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'El correo es requerido.');
  }
  if (action !== 'grant' && action !== 'revoke') {
    throw new HttpsError('invalid-argument', "action debe ser 'grant' o 'revoke'.");
  }

  const db = admin.firestore();
  const channelRef = db.doc(`channels/${channelId}`);
  const channelSnap = await channelRef.get();
  if (!channelSnap.exists) {
    throw new HttpsError('not-found', `El canal '${channelId}' no existe.`);
  }

  // Si el usuario no existe y se lo está nombrando admin, se crea SIN contraseña:
  // la pantalla le envía después el correo de Firebase para que la defina él.
  // Nadie maneja contraseñas temporales.
  let user: admin.auth.UserRecord;
  let created = false;
  try {
    user = await admin.auth().getUserByEmail(email.trim());
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') {
      console.error('[manageChannelAdmin] Error buscando usuario', err);
      throw new HttpsError('internal', 'No se pudo consultar el usuario.');
    }
    if (action === 'revoke') {
      throw new HttpsError('not-found', `No hay ningún usuario con el correo ${email}.`);
    }
    try {
      user = await admin.auth().createUser({ email: email.trim(), emailVerified: false });
      created = true;
    } catch (createErr: any) {
      console.error('[manageChannelAdmin] Error creando usuario', createErr);
      throw new HttpsError(
        createErr?.code === 'auth/invalid-email' ? 'invalid-argument' : 'internal',
        createErr?.code === 'auth/invalid-email' ? 'El correo no es válido.' : 'No se pudo crear el usuario.'
      );
    }
  }

  const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;

  if (action === 'grant') {
    // Nunca degradar al dueño de la plataforma por un clic equivocado.
    if (claims['role'] === SUPER_ADMIN_ROLE) {
      throw new HttpsError('failed-precondition', 'Ese usuario es super admin de plataforma; no se lo convierte en admin de canal.');
    }
    if (claims['role'] === CHANNEL_ADMIN_ROLE && claims['channelId'] && claims['channelId'] !== channelId) {
      throw new HttpsError('failed-precondition', `Ese usuario ya administra el canal '${claims['channelId']}'. Retíralo de allí primero.`);
    }
    // Un admin de canal no pertenece a una empresa: se retira companyId para
    // no mezclar dos identidades en el mismo token.
    delete claims['companyId'];
    claims['role'] = CHANNEL_ADMIN_ROLE;
    claims['channelId'] = channelId;
    await admin.auth().setCustomUserClaims(user.uid, claims);
    await channelRef.update({
      [`admins.${user.uid}`]: { email: user.email ?? email, grantedAt: Timestamp.now(), grantedBy: caller.uid },
      updatedAt: Timestamp.now(),
    });
  } else {
    // Solo se retira si realmente es admin de ESTE canal.
    if (claims['role'] === CHANNEL_ADMIN_ROLE && claims['channelId'] === channelId) {
      delete claims['role'];
      delete claims['channelId'];
      await admin.auth().setCustomUserClaims(user.uid, claims);
    }
    await channelRef.update({
      [`admins.${user.uid}`]: FieldValue.delete(),
      updatedAt: Timestamp.now(),
    });
  }

  console.log('[manageChannelAdmin]', { action, channelId, uid: user.uid, created, by: caller.uid });
  return { success: true, uid: user.uid, channelId, action, created };
});
