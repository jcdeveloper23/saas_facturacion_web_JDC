/**
 * platform-smtp.ts
 *
 * El correo de la plataforma: el último escalón de la cadena de envío
 * (empresa → canal → plataforma → variables de entorno).
 *
 * Hasta el 2026-09-30 la pantalla del super admin escribía
 * `platform/defaults/smtpConfig/data` directamente, **con la contraseña en
 * claro**. Ahora pasa por estas dos callables, como el correo de la empresa
 * (`saveCompanySmtp`) y el del canal (`portalSaveSmtp`): la contraseña va a
 * Secret Manager (`facturaec-smtp-platform`) y nunca vuelve al navegador.
 *
 * Solo `super_admin`.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  createSmtpTransporter, invalidateSmtpCache, platformSmtpHasPassword,
  savePlatformSmtpPassword, verifySmtpConfig,
} from '../utils/smtp-helper';

const DOC = 'platform/defaults/smtpConfig/data';

function assertSuperAdmin(request: { auth?: { uid: string; token: Record<string, unknown> } | null }): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  if (request.auth.token['role'] !== 'super_admin') {
    throw new HttpsError('permission-denied', 'Solo el super admin de la plataforma configura este correo.');
  }
  return request.auth.uid;
}

/** Lo que hay configurado, sin la contraseña: solo si la hay. */
export const getPlatformSmtp = onCall(async (request) => {
  assertSuperAdmin(request);
  const d = (await admin.firestore().doc(DOC).get()).data() ?? null;
  return {
    configured: !!d,
    hasPassword: await platformSmtpHasPassword(d?.['pass']),
    smtp: d
      ? {
          host: d['host'] ?? '',
          port: d['port'] ?? 587,
          secure: d['secure'] ?? false,
          user: d['user'] ?? '',
          from: d['from'] ?? '',
          isActive: d['isActive'] !== false,
        }
      : null,
  };
});

/**
 * Guarda el correo de la plataforma. La contraseña es opcional si ya había
 * una: vacía = no se cambia. Si llega, se comprueba contra el servidor de
 * correo antes de guardarla. Con `testTo` manda además un correo de prueba.
 */
export const savePlatformSmtp = onCall(async (request) => {
  const uid = assertSuperAdmin(request);
  const data = (request.data ?? {}) as Record<string, any>;

  const host = `${data['host'] ?? ''}`.trim();
  const user = `${data['user'] ?? ''}`.trim();
  const port = Number(data['port']) || 587;
  const password = `${data['password'] ?? ''}`;
  const from = `${data['from'] ?? ''}`.trim() || user;
  const isActive = data['isActive'] !== false;
  const testTo = `${data['testTo'] ?? ''}`.trim();

  if (!host) throw new HttpsError('invalid-argument', 'Falta el servidor de correo.');
  if (!user) throw new HttpsError('invalid-argument', 'Falta el usuario del correo.');
  if (port < 1 || port > 65535) throw new HttpsError('invalid-argument', 'Ese puerto no es válido.');
  // El 465 va cifrado desde el principio; el 587 empieza en claro y sube a TLS.
  const secure = typeof data['secure'] === 'boolean' ? data['secure'] : port === 465;

  const ref = admin.firestore().doc(DOC);
  const actual = (await ref.get()).data();
  if (!password && !(await platformSmtpHasPassword(actual?.['pass']))) {
    throw new HttpsError('invalid-argument', 'Falta la contraseña del correo.');
  }

  if (password) {
    try {
      await verifySmtpConfig({ host, port, secure, user, pass: password, from, isActive: true });
    } catch (err) {
      const motivo = err instanceof Error ? err.message : `${err}`;
      throw new HttpsError('failed-precondition', `El servidor de correo rechazó los datos: ${motivo}`);
    }
    await savePlatformSmtpPassword(password);
  }

  await ref.set({
    host, port, secure, user, from, isActive,
    // Si quedaba la contraseña vieja en claro, se va ahora.
    pass: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.Timestamp.now(),
    updatedBy: uid,
  }, { merge: true });

  invalidateSmtpCache();

  if (testTo) {
    try {
      const transporter = await createSmtpTransporter();
      await transporter.sendMail({
        from,
        to: testTo,
        subject: 'Prueba de correo — facturación electrónica',
        html: `<p>Este es un correo de prueba del correo de la plataforma.</p>
<p>Si te ha llegado, los comprobantes de las empresas sin correo propio ni de su
canal van a salir desde <strong>${from}</strong>.</p>`,
      });
    } catch (err) {
      const motivo = err instanceof Error ? err.message : `${err}`;
      return { ok: true, testSent: false, testError: motivo };
    }
    return { ok: true, testSent: true };
  }
  return { ok: true };
});
