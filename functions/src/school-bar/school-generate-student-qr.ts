import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

/**
 * schoolGenerateStudentQr
 *
 * Firestore trigger: se dispara al crear un nuevo documento en school_students.
 * Genera un token HMAC-SHA256 firmado, construye la imagen QR, la sube a
 * Firebase Storage y escribe `qrCode` + `qrCodeUrl` en el documento del alumno.
 *
 * Token format: base64url(JSON payload) + '.' + hmacHex
 * Payload:      { studentId, companyId, version: 1 }
 *
 * Idempotencia: si qrCode ya está presente, no hace nada.
 * Errores: escribe qrError en el documento — no re-lanza (evita retries infinitos).
 */
export const schoolGenerateStudentQr = onDocumentCreated(
  'companies/{companyId}/school_students/{studentId}',
  async (event) => {
    const { companyId, studentId } = event.params;
    const student = event.data?.data() as Record<string, any> | undefined;

    if (!student) {
      logger.warn('[schoolGenerateStudentQr] Sin datos en el evento.', { companyId, studentId });
      return;
    }

    // ── Guard: idempotencia ──────────────────────────────────────────────────
    if (student['qrCode']) {
      logger.info('[schoolGenerateStudentQr] QR ya generado — omitiendo.', { companyId, studentId });
      return;
    }

    const secret = process.env['SCHOOL_QR_SECRET'] ?? 'school_bar_dev_secret_change_in_prod';

    logger.info('[schoolGenerateStudentQr] Generando QR para alumno.', { companyId, studentId });

    try {
      // ── Step 1: Construir y firmar el payload ────────────────────────────────
      const payloadJson = JSON.stringify({ studentId, companyId, version: 1 });
      const payloadB64  = Buffer.from(payloadJson).toString('base64url');
      const sig         = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
      const qrCode      = `${payloadB64}.${sig}`;

      // ── Step 2: Generar imagen PNG del QR ───────────────────────────────────
      const qrBuffer = await (QRCode as any).toBuffer(qrCode, {
        width:                400,
        errorCorrectionLevel: 'H',
        margin:               2,
        color: {
          dark:  '#000000',
          light: '#ffffff'
        }
      }) as Buffer;

      // ── Step 3: Subir a Firebase Storage ────────────────────────────────────
      const bucket   = admin.storage().bucket();
      const filePath = `school-bar/${companyId}/students/${studentId}/qr.png`;
      const file     = bucket.file(filePath);

      await file.save(qrBuffer, { contentType: 'image/png' });
      await file.makePublic();

      const qrCodeUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      // ── Step 4: Actualizar documento del alumno ──────────────────────────────
      await admin.firestore()
        .doc(`companies/${companyId}/school_students/${studentId}`)
        .update({
          qrCode,
          qrCodeUrl,
          updatedAt: admin.firestore.Timestamp.now()
        });

      logger.info('[schoolGenerateStudentQr] QR generado exitosamente.', {
        companyId, studentId, qrCodeUrl
      });

    } catch (err) {
      logger.error('[schoolGenerateStudentQr] Error generando QR:', { companyId, studentId, err });

      // Marcar el error en el documento — no re-lanzar
      try {
        await admin.firestore()
          .doc(`companies/${companyId}/school_students/${studentId}`)
          .update({
            qrError:   err instanceof Error ? err.message : 'Error desconocido generando QR',
            updatedAt: admin.firestore.Timestamp.now()
          });
      } catch (updateErr) {
        logger.error('[schoolGenerateStudentQr] Error marcando qrError:', { updateErr });
      }
    }
  }
);
