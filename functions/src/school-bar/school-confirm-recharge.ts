import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

/**
 * schoolConfirmRecharge
 *
 * Firestore trigger: se dispara cuando se actualiza school_recharges.
 * Acredita el monedero del alumno cuando el administrador confirma una recarga
 * de transferencia o efectivo (o cuando el gateway confirma una tarjeta).
 *
 * Flujo (paymentStatus cambia a 'confirmed'):
 *   1. Verifica que el cambio es pending → confirmed (idempotencia).
 *   2. Dentro de una transacción atómica:
 *      a. Re-lee la recarga y el alumno.
 *      b. Crea SchoolTransaction (append-only) con type='recharge'.
 *      c. Incrementa walletBalance en school_students.
 *      d. Actualiza la recarga con walletTransactionId, balanceBefore, balanceAfter.
 *
 * Idempotencia: guarda doble — before/after check y walletTransactionId dentro de tx.
 * Errores: no re-lanza — escribe rechargeError en el documento.
 */
export const schoolConfirmRecharge = onDocumentUpdated(
  'companies/{companyId}/school_recharges/{rechargeId}',
  async (event) => {
    const { companyId, rechargeId } = event.params;

    if (!event.data?.after.exists) return;

    const before = event.data.before.data() as Record<string, any>;
    const after  = event.data.after.data()  as Record<string, any>;

    // ── Guard: solo cuando paymentStatus cambia a 'confirmed' ───────────────
    if (before['paymentStatus'] === 'confirmed') {
      return;  // ya estaba confirmada — no procesar de nuevo
    }
    if (after['paymentStatus'] !== 'confirmed') {
      return;  // no es una confirmación
    }

    // ── Guard: idempotencia — ya acreditada ──────────────────────────────────
    if (after['walletTransactionId']) {
      logger.info('[schoolConfirmRecharge] Ya tiene walletTransactionId — omitiendo.', {
        companyId, rechargeId
      });
      return;
    }

    const studentId: string = after['studentId'] ?? '';
    const amount: number    = after['amount']    ?? 0;

    if (!studentId || amount <= 0) {
      logger.error('[schoolConfirmRecharge] Datos inválidos — studentId o monto vacíos.', {
        companyId, rechargeId, studentId, amount
      });
      return;
    }

    logger.info('[schoolConfirmRecharge] Acreditando recarga al wallet.', {
      companyId, rechargeId, studentId, amount
    });

    const db          = admin.firestore();
    const studentRef  = db.doc(`companies/${companyId}/school_students/${studentId}`);
    const rechargeRef = db.doc(`companies/${companyId}/school_recharges/${rechargeId}`);
    const txColRef    = db.collection(`companies/${companyId}/school_transactions`);

    try {
      await db.runTransaction(async tx => {
        const [studentSnap, rechargeSnap] = await Promise.all([
          tx.get(studentRef),
          tx.get(rechargeRef)
        ]);

        if (!studentSnap.exists) {
          logger.warn('[schoolConfirmRecharge] Alumno no encontrado en transacción.', {
            companyId, studentId, rechargeId
          });
          return;
        }
        if (!rechargeSnap.exists) {
          logger.warn('[schoolConfirmRecharge] Recarga no encontrada en transacción.', {
            companyId, rechargeId
          });
          return;
        }

        const rechargeData = rechargeSnap.data() as Record<string, any>;

        // Segunda barrera de idempotencia dentro de la transacción
        if (rechargeData['walletTransactionId']) {
          logger.info('[schoolConfirmRecharge] Ya acreditado dentro de transacción.', { rechargeId });
          return;
        }

        const studentData   = studentSnap.data() as Record<string, any>;
        const balanceBefore: number = studentData['walletBalance'] ?? 0;
        const balanceAfter  = round2(balanceBefore + amount);
        const now           = admin.firestore.Timestamp.now();
        const txRef         = txColRef.doc();

        // ── Crear transacción de wallet (append-only) ──────────────────────
        tx.set(txRef, {
          companyId,
          studentId,
          studentName:   studentData['fullName']      ?? after['studentName'] ?? '',
          type:          'recharge',
          amount,
          balanceBefore,
          balanceAfter,
          description:   `Recarga: ${after['methodLabel'] ?? after['method'] ?? 'método no especificado'}`,
          referenceId:   rechargeId,
          referenceType: 'recharge',
          createdAt:     now
        });

        // ── Acreditar wallet del alumno ────────────────────────────────────
        tx.update(studentRef, {
          walletBalance: balanceAfter,
          updatedAt:     now
        });

        // ── Actualizar la recarga con referencia a la transacción ──────────
        tx.update(rechargeRef, {
          walletTransactionId: txRef.id,
          balanceBefore,
          balanceAfter,
          updatedAt: now
        });
      });

      logger.info('[schoolConfirmRecharge] Recarga acreditada exitosamente.', {
        companyId, rechargeId, studentId, amount
      });

    } catch (err) {
      logger.error('[schoolConfirmRecharge] Error en transacción:', { companyId, rechargeId, err });

      // No re-lanzar — evita retries infinitos de Firestore
      try {
        await rechargeRef.update({
          rechargeError: err instanceof Error ? err.message : 'Error interno al acreditar recarga',
          updatedAt:     admin.firestore.Timestamp.now()
        });
      } catch (updateErr) {
        logger.error('[schoolConfirmRecharge] Error marcando rechargeError:', { updateErr });
      }
    }
  }
);

function round2(n: number): number { return Math.round(n * 100) / 100; }
