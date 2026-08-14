import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { logger } from 'firebase-functions/v2';

/**
 * schoolScanQr
 *
 * Callable HTTPS function: valida el token QR de un alumno y devuelve
 * sus datos al cajero del bar escolar (sin exponer datos sensibles del alumno).
 *
 * El token tiene el formato:  base64url(payload_json) + '.' + hmac_sha256_hex
 * El payload JSON es:         { studentId, companyId, version }
 *
 * La función valida:
 *   1. Autenticación del llamante.
 *   2. Que el llamante pertenece a la empresa indicada.
 *   3. La firma HMAC-SHA256 del token (timing-safe compare).
 *   4. Que el companyId del payload coincide con el solicitado.
 *   5. Que el alumno existe y está activo.
 *
 * Retorna: { studentId, fullName, code, gradeId, gradeName, section, walletBalance }
 *
 * Uso desde el POS Angular:
 *   const fn = httpsCallable(functions, 'schoolScanQr');
 *   const result = await fn({ token, companyId });
 */
export const schoolScanQr = onCall(async (request) => {
  // ── Autenticación ────────────────────────────────────────────────────────────
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes estar autenticado para escanear QR.');
  }

  const data = request.data as { token?: string; companyId?: string };

  if (!data.token || !data.companyId) {
    throw new HttpsError('invalid-argument', 'Se requieren los campos token y companyId.');
  }

  // ── Autorización: el llamante debe pertenecer a la empresa ──────────────────
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  if (!callerCompanyId || callerCompanyId !== data.companyId) {
    logger.warn('[schoolScanQr] Llamante sin acceso a la empresa.', {
      callerCompanyId, requestedCompanyId: data.companyId
    });
    throw new HttpsError('permission-denied', 'No tienes acceso a esta empresa.');
  }

  // ── Validar formato del token ─────────────────────────────────────────────────
  const parts = data.token.split('.');
  if (parts.length !== 2) {
    throw new HttpsError('invalid-argument', 'Formato de token QR inválido.');
  }

  const [payloadB64, receivedSig] = parts as [string, string];

  // La firma HMAC-SHA256 debe ser exactamente 64 caracteres hexadecimales (32 bytes)
  if (!/^[0-9a-f]{64}$/i.test(receivedSig)) {
    throw new HttpsError('invalid-argument', 'Firma del token QR con formato inválido.');
  }

  // ── Verificar firma HMAC-SHA256 (timing-safe) ─────────────────────────────────
  const secret      = process.env['SCHOOL_QR_SECRET'] ?? 'school_bar_dev_secret_change_in_prod';
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  let signaturesMatch: boolean;
  try {
    signaturesMatch = crypto.timingSafeEqual(
      Buffer.from(receivedSig.toLowerCase(), 'hex'),
      Buffer.from(expectedSig, 'hex')
    );
  } catch {
    signaturesMatch = false;
  }

  if (!signaturesMatch) {
    logger.warn('[schoolScanQr] Firma QR inválida.', { companyId: data.companyId });
    throw new HttpsError('permission-denied', 'Código QR inválido o expirado.');
  }

  // ── Decodificar payload ───────────────────────────────────────────────────────
  let payload: { studentId: string; companyId: string; version: number };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new HttpsError('invalid-argument', 'El payload del QR no es JSON válido.');
  }

  if (!payload.studentId || !payload.companyId) {
    throw new HttpsError('invalid-argument', 'Payload del QR incompleto.');
  }

  // Verificar que el QR pertenece a la empresa solicitada
  if (payload.companyId !== data.companyId) {
    logger.warn('[schoolScanQr] QR de empresa distinta.', {
      payloadCompanyId: payload.companyId, requestedCompanyId: data.companyId
    });
    throw new HttpsError('permission-denied', 'El QR no pertenece a esta institución.');
  }

  // ── Leer datos del alumno ─────────────────────────────────────────────────────
  const db          = admin.firestore();
  const studentSnap = await db
    .doc(`companies/${data.companyId}/school_students/${payload.studentId}`)
    .get();

  if (!studentSnap.exists) {
    throw new HttpsError('not-found', 'Alumno no encontrado en el sistema.');
  }

  const student = studentSnap.data() as Record<string, any>;

  if (!student['state']) {
    throw new HttpsError('failed-precondition', 'El alumno está inactivo y no puede realizar compras.');
  }

  logger.info('[schoolScanQr] QR validado correctamente.', {
    companyId: data.companyId, studentId: payload.studentId
  });

  // ── Devolver solo los campos necesarios para el POS ───────────────────────────
  return {
    studentId:    payload.studentId,
    fullName:     (student['fullName']      as string)  ?? '',
    code:         (student['code']          as string)  ?? '',
    gradeId:      (student['gradeId']       as string)  ?? '',
    gradeName:    (student['gradeName']     as string)  ?? '',
    section:      (student['section']       as string)  ?? '',
    walletBalance: (student['walletBalance'] as number)  ?? 0
  };
});
