import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import {
  saveCompanySmtpPassword,
  verifySmtpConfig,
  invalidateSmtpCache,
  createSmtpTransporter,
  getSmtpFrom,
  SmtpConfig,
} from '../utils/smtp-helper';

/**
 * El correo con el que cada empresa manda sus comprobantes.
 *
 * Hasta ahora el correo era uno solo para toda la plataforma: las facturas de
 * todos los clientes salían del mismo buzón y el comprador veía el dominio de
 * la plataforma, no el de quien le vendió — lo que además hace que el correo
 * acabe en spam más a menudo. Ahora cada empresa pone el suyo.
 *
 * La contraseña **no se guarda en Firestore**: va a Secret Manager, igual que
 * la del certificado de firma. En `configuration/smtp` quedan el servidor, el
 * puerto y las direcciones, que por sí solos no abren nada. Por eso ese
 * documento no lo escribe el navegador: solo esta función.
 */

interface SmtpPayload {
  companyId: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  from?: string;
  isActive?: boolean;
  /** Dirección a la que mandar el correo de prueba. */
  testTo?: string;
}

function assertAdminDeLaEmpresa(request: { auth?: { token: Record<string, unknown> } | null },
                                companyId: string): void {
  const token = request.auth?.token;
  if (!token) throw new HttpsError('unauthenticated', 'Debe estar autenticado.');

  const role = token['role'] as string | undefined;
  const suCompany = token['companyId'] as string | undefined;

  if (role === 'super_admin') return;
  if (suCompany !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }
  // El correo saliente es de toda la empresa, y su contraseña abre un buzón:
  // no es cosa de quien está en la caja.
  if (role !== 'admin') {
    throw new HttpsError('permission-denied',
      'Solo el administrador de la empresa configura el correo de envío.');
  }
}

/** Lo que llega del formulario, ya limpio. */
function normalizar(data: SmtpPayload): Omit<SmtpConfig, 'pass'> {
  const host = `${data.host ?? ''}`.trim();
  const user = `${data.user ?? ''}`.trim();
  const port = Number(data.port) || 587;

  if (!host) throw new HttpsError('invalid-argument', 'Falta el servidor de correo.');
  if (!user) throw new HttpsError('invalid-argument', 'Falta el usuario del correo.');
  if (port < 1 || port > 65535) {
    throw new HttpsError('invalid-argument', 'Ese puerto no es válido.');
  }

  return {
    host,
    port,
    // El 465 va cifrado desde el principio; el 587 empieza en claro y sube a
    // TLS. Marcarlo al revés es el error más común y da un fallo que no se
    // entiende, así que se corrige aquí.
    secure: data.secure ?? port === 465,
    user,
    from: `${data.from ?? ''}`.trim() || user,
    isActive: data.isActive !== false,
  };
}

/**
 * Guarda el correo de la empresa y, si se pide, manda una prueba.
 *
 * Comprueba las credenciales **antes** de guardarlas: no tiene sentido dejar
 * configurado algo que no va a poder enviar, y el fallo se descubriría con la
 * primera factura de verdad.
 */
export const saveCompanySmtp = onCall(async (request) => {
  const data = request.data as SmtpPayload;
  const companyId = `${data?.companyId ?? ''}`.trim();
  if (!companyId) {
    throw new HttpsError('invalid-argument', 'companyId es requerido.');
  }
  assertAdminDeLaEmpresa(request, companyId);

  const cfg = normalizar(data);
  const password = `${data.password ?? ''}`;

  const db = admin.firestore();
  const ref = db.doc(`companies/${companyId}/configuration/smtp`);

  // Sin contraseña nueva se conserva la que ya estaba: el formulario no la
  // muestra, y volver a guardar el resto no debe borrarla.
  const yaExiste = (await ref.get()).exists;
  if (!password && !yaExiste) {
    throw new HttpsError('invalid-argument', 'Falta la contraseña del correo.');
  }

  if (password) {
    try {
      await verifySmtpConfig({ ...cfg, pass: password });
    } catch (err) {
      const motivo = err instanceof Error ? err.message : `${err}`;
      throw new HttpsError('failed-precondition',
        `El servidor de correo rechazó los datos: ${motivo}`);
    }
    await saveCompanySmtpPassword(companyId, password);
  }

  await ref.set({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.user,
    from: cfg.from,
    isActive: cfg.isActive,
    updatedAt: admin.firestore.Timestamp.now(),
    updatedBy: request.auth?.uid ?? '',
  }, { merge: true });

  invalidateSmtpCache(companyId);

  // ── Correo de prueba ──────────────────────────────────────────────────────
  const testTo = `${data.testTo ?? ''}`.trim();
  if (testTo) {
    try {
      const transporter = await createSmtpTransporter(companyId);
      const from = await getSmtpFrom(companyId);
      await transporter.sendMail({
        from,
        to: testTo,
        subject: 'Prueba de correo — facturación electrónica',
        html: `
<p>Este es un correo de prueba.</p>
<p>Si te ha llegado, tus facturas y notas de crédito van a salir desde
<strong>${cfg.from}</strong> con el RIDE y el XML adjuntos.</p>`,
      });
      return { saved: true, tested: true, to: testTo };
    } catch (err) {
      const motivo = err instanceof Error ? err.message : `${err}`;
      // Se guardó, pero la prueba falló: hay que decir las dos cosas.
      throw new HttpsError('failed-precondition',
        `Se guardó la configuración, pero el correo de prueba no salió: ${motivo}`);
    }
  }

  return { saved: true, tested: false };
});
