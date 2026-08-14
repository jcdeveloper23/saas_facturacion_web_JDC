import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * schoolProcessPurchase
 *
 * Firestore trigger: se dispara al crear una nueva orden en school_orders.
 * Es el único punto que descuenta el wallet del alumno — nunca el frontend.
 *
 * Flujo:
 *   1. Verifica que la orden esté pendiente y sin walletTransactionId (idempotencia).
 *   2. Dentro de una transacción atómica:
 *      a. Re-lee la orden y el alumno.
 *      b. Verifica que el saldo sea suficiente.
 *      c. Crea SchoolTransaction (append-only) con type='purchase'.
 *      d. Descuenta walletBalance en school_students.
 *      e. Actualiza la orden: status='confirmed', walletTransactionId, amountCharged.
 *   3. Si el saldo es insuficiente: cancela la orden con razón 'Saldo insuficiente'.
 *
 * Idempotencia: guarda doble — antes de abrir la transacción y dentro de ella.
 * Errores: no re-lanza — escribe error en el documento para visibilidad en el UI.
 */
export const schoolProcessPurchase = onDocumentCreated(
  'companies/{companyId}/school_orders/{orderId}',
  async (event) => {
    const { companyId, orderId } = event.params;
    const order = event.data?.data() as Record<string, any> | undefined;

    if (!order) {
      logger.warn('[schoolProcessPurchase] Sin datos en el evento.', { companyId, orderId });
      return;
    }

    // ── Guard 1: solo órdenes pendientes ────────────────────────────────────
    if (order['status'] !== 'pending') {
      logger.info('[schoolProcessPurchase] Orden no está pendiente — omitiendo.', {
        companyId, orderId, status: order['status']
      });
      return;
    }

    // ── Guard 2: idempotencia — ya procesada ────────────────────────────────
    if (order['walletTransactionId']) {
      logger.info('[schoolProcessPurchase] Ya tiene walletTransactionId — omitiendo.', {
        companyId, orderId
      });
      return;
    }

    const studentId: string = order['studentId'] ?? '';
    const total: number     = order['total']     ?? 0;

    if (!studentId) {
      logger.error('[schoolProcessPurchase] Orden sin studentId — cancelando.', { companyId, orderId });
      await markOrderCancelled(companyId, orderId, 'studentId no especificado en la orden');
      return;
    }

    logger.info('[schoolProcessPurchase] Procesando compra.', { companyId, orderId, studentId, total });

    const db         = admin.firestore();
    const studentRef = db.doc(`companies/${companyId}/school_students/${studentId}`);
    const orderRef   = db.doc(`companies/${companyId}/school_orders/${orderId}`);
    const txColRef   = db.collection(`companies/${companyId}/school_transactions`);

    try {
      await db.runTransaction(async tx => {
        // Re-leer ambos documentos para consistencia y segunda barrera de idempotencia
        const [orderSnap, studentSnap] = await Promise.all([
          tx.get(orderRef),
          tx.get(studentRef)
        ]);

        if (!orderSnap.exists) {
          logger.warn('[schoolProcessPurchase] Orden no encontrada en transacción.', { companyId, orderId });
          return;
        }
        if (!studentSnap.exists) {
          logger.warn('[schoolProcessPurchase] Alumno no encontrado en transacción.', { companyId, studentId });
          tx.update(orderRef, {
            status:       'cancelled',
            cancelReason: 'Alumno no encontrado',
            updatedAt:    admin.firestore.Timestamp.now()
          });
          return;
        }

        const orderData   = orderSnap.data()   as Record<string, any>;
        const studentData = studentSnap.data() as Record<string, any>;

        // Segunda barrera de idempotencia dentro de la transacción
        if (orderData['walletTransactionId']) {
          logger.info('[schoolProcessPurchase] Ya procesado dentro de transacción.', { orderId });
          return;
        }

        const balanceBefore: number = studentData['walletBalance'] ?? 0;
        const orderTotal: number    = orderData['total']           ?? total;

        // ── Verificar saldo suficiente ─────────────────────────────────────
        if (balanceBefore < orderTotal) {
          logger.warn('[schoolProcessPurchase] Saldo insuficiente — cancelando orden.', {
            companyId, orderId, studentId, balanceBefore, orderTotal
          });
          tx.update(orderRef, {
            status:       'cancelled',
            cancelReason: `Saldo insuficiente: disponible $${balanceBefore.toFixed(2)}, requerido $${orderTotal.toFixed(2)}`,
            statusHistory: FieldValue.arrayUnion({
              status:    'cancelled',
              changedAt: admin.firestore.Timestamp.now(),
              changedBy: 'system',
              note:      'Saldo insuficiente en monedero escolar'
            }),
            updatedAt: admin.firestore.Timestamp.now()
          });
          return;
        }

        const balanceAfter = round2(balanceBefore - orderTotal);
        const now          = admin.firestore.Timestamp.now();
        const txRef        = txColRef.doc();

        // ── Crear transacción de wallet (append-only) ──────────────────────
        tx.set(txRef, {
          companyId,
          studentId,
          studentName:   studentData['fullName']  ?? orderData['studentName'] ?? '',
          type:          'purchase',
          amount:        -orderTotal,
          balanceBefore,
          balanceAfter,
          description:   buildDescription(orderData),
          referenceId:   orderId,
          referenceType: 'order',
          createdAt:     now
        });

        // ── Descontar wallet del alumno ────────────────────────────────────
        tx.update(studentRef, {
          walletBalance:     balanceAfter,
          totalSpentMonth:   FieldValue.increment(orderTotal),
          totalSpentWeek:    FieldValue.increment(orderTotal),
          totalTransactions: FieldValue.increment(1),
          updatedAt:         now
        });

        // ── Confirmar la orden ─────────────────────────────────────────────
        tx.update(orderRef, {
          status:             'confirmed',
          walletTransactionId: txRef.id,
          amountCharged:      orderTotal,
          statusHistory:      FieldValue.arrayUnion({
            status:    'confirmed',
            changedAt: now,
            changedBy: 'system'
          }),
          updatedAt: now
        });
      });

      logger.info('[schoolProcessPurchase] Compra procesada exitosamente.', { companyId, orderId, studentId });

    } catch (err) {
      logger.error('[schoolProcessPurchase] Error en transacción:', { companyId, orderId, err });

      // No re-lanzar — evita retries infinitos de Firestore
      try {
        await markOrderCancelled(
          companyId, orderId,
          err instanceof Error ? err.message : 'Error interno al procesar el pago'
        );
      } catch (updateErr) {
        logger.error('[schoolProcessPurchase] Error cancelando orden con error:', { updateErr });
      }
    }
  }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markOrderCancelled(companyId: string, orderId: string, reason: string): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  await admin.firestore()
    .doc(`companies/${companyId}/school_orders/${orderId}`)
    .update({
      status:       'cancelled',
      cancelReason: reason,
      statusHistory: FieldValue.arrayUnion({
        status:    'cancelled',
        changedAt: now,
        changedBy: 'system',
        note:      reason
      }),
      updatedAt: now
    });
}

function buildDescription(order: Record<string, any>): string {
  const items = (order['items'] ?? []) as Record<string, any>[];
  if (items.length === 0) return 'Compra en bar escolar';
  if (items.length === 1) return items[0]['name'] as string ?? 'Compra en bar escolar';
  return `${items[0]['name']} y ${items.length - 1} más`;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
