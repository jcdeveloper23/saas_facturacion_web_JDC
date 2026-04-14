import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

/**
 * onPurchaseReceive
 *
 * Firestore trigger that increments inventory whenever a purchase order
 * transitions to status='received'.
 *
 * Trigger: onDocumentWritten (covers both create-with-received and update)
 * Path:    companies/{companyId}/purchases/{purchaseId}
 *
 * Activation condition:
 *   before.status !== 'received'  AND
 *   after.status  === 'received'  AND
 *   !after.stockProcessed
 *
 * Per qualifying line (trackStock=true, type!='service', noStock!=true, qty>0):
 *   1. Increments ProductStock.qty / available in the resolved warehouse
 *   2. Increments Product.stockQty / stockAvailable aggregate
 *   3. Recalculates Product.averageCost (weighted average)
 *   4. Writes a StockMovement of type 'purchase'
 *
 * Marks purchase.stockProcessed = true for idempotency.
 *
 * Warehouse resolution (cascade per line):
 *   line.warehouseCode → purchase.warehouseCode
 *
 * Average cost formula (only when unitCost > 0):
 *   newAvgCost = (currentStockQty * currentAvgCost + qty * unitCost) / newTotalQty
 *   Rounded to 4 decimal places.
 *
 * Idempotency: runTransaction re-reads the purchase document inside the
 * transaction to prevent double-processing on Firestore trigger retries.
 *
 * Errors: never re-thrown (prevents infinite Firestore retries).
 * On failure: sets purchase.stockError so the UI can surface it.
 */
export const onPurchaseReceive = onDocumentWritten(
  'companies/{companyId}/purchases/{purchaseId}',
  async (event) => {
    // Deletion event → ignore
    if (!event.data?.after.exists) return;

    // before may be undefined when the doc is created directly with status='received'
    const before = event.data.before.exists
      ? event.data.before.data() as Record<string, any>
      : undefined;
    const after = event.data.after.data() as Record<string, any>;

    const { companyId, purchaseId } = event.params;

    // ── Activation condition ──────────────────────────────────────────────────
    const isReceiving =
      before?.['status'] !== 'received' &&
      after['status']    === 'received' &&
      !after['stockProcessed'];

    if (!isReceiving) return;

    const lines = (after['lines'] ?? []) as Record<string, any>[];

    if (lines.length === 0) {
      logger.info('[onPurchaseReceive] Compra sin líneas — saliendo.', { companyId, purchaseId });
      return;
    }

    const db              = admin.firestore();
    const purchaseWarehouse = after['warehouseCode'] as string | undefined;
    const userId: string  = after['updatedBy'] ?? after['createdBy'] ?? 'system';

    logger.info('[onPurchaseReceive] Evento RECEPCIÓN detectado.', { companyId, purchaseId });

    // ── Main transaction ───────────────────────────────────────────────────────
    try {
      await db.runTransaction(async tx => {
        // Re-read purchase inside transaction for idempotency
        const purchaseRef  = db.doc(`companies/${companyId}/purchases/${purchaseId}`);
        const purchaseSnap = await tx.get(purchaseRef);

        if (!purchaseSnap.exists) {
          logger.warn('[onPurchaseReceive] Compra no encontrada en transacción — saliendo.', { purchaseId });
          return;
        }

        const purchaseData = purchaseSnap.data() as Record<string, any>;

        // Idempotency guard — checked inside transaction to prevent races
        if (purchaseData['stockProcessed'] === true) {
          logger.info('[onPurchaseReceive] stockProcessed=true, ya procesado — saliendo.', { purchaseId });
          return;
        }

        const now = admin.firestore.Timestamp.now();

        let movementsWritten = 0;

        // ── Process each purchase line ─────────────────────────────────────────
        for (const line of lines) {
          const productId = line['productId'] as string | undefined;
          if (!productId) continue;

          const qty = Number(line['qty'] ?? 0);
          if (qty <= 0) continue;

          // Read product inside transaction for consistent data
          const productRef  = db.doc(`companies/${companyId}/products/${productId}`);
          const productSnap = await tx.get(productRef);

          if (!productSnap.exists) {
            logger.warn('[onPurchaseReceive] Producto no encontrado — omitiendo línea.', { productId });
            continue;
          }

          const product = productSnap.data() as Record<string, any>;

          // Skip products without stock control
          if (product['trackStock'] !== true || product['type'] === 'service' || product['noStock'] === true) {
            continue;
          }

          // Resolve warehouse for this line (cascade)
          const warehouseCode =
            (line['warehouseCode'] as string | undefined) ||
            purchaseWarehouse;

          if (!warehouseCode) {
            logger.warn('[onPurchaseReceive] Almacén no resuelto — omitiendo línea.', { productId, purchaseId });
            continue;
          }

          // Read current warehouse stock inside transaction
          const stockRef  = db.doc(`companies/${companyId}/products/${productId}/stocks/${warehouseCode}`);
          const stockSnap = await tx.get(stockRef);
          const stockData = stockSnap.data() as Record<string, any> | undefined;

          const currentStockQty = Number(stockData?.['qty']       ?? 0);
          const warehouseName   = (stockData?.['warehouseName'] as string | undefined) ?? '';

          // ── Calculate new average cost ───────────────────────────────────────
          const unitCost       = Number(line['unitCost'] ?? 0);
          const currentAvgCost = Number(product['averageCost'] ?? 0);
          const newTotalQty    = currentStockQty + qty;

          let newAvgCost: number;
          if (unitCost > 0 && newTotalQty > 0) {
            newAvgCost = (currentStockQty * currentAvgCost + qty * unitCost) / newTotalQty;
            // Round to 4 decimal places
            newAvgCost = Math.round(newAvgCost * 10000) / 10000;
          } else {
            newAvgCost = currentAvgCost;
          }

          // ── Write warehouse stock ────────────────────────────────────────────
          if (stockSnap.exists) {
            tx.update(stockRef, {
              qty:            admin.firestore.FieldValue.increment(qty),
              available:      admin.firestore.FieldValue.increment(qty),
              lastUpdatedAt:  now,
              lastUpdatedQty: currentStockQty
            });
          } else {
            // Warehouse stock doc doesn't exist yet — create it
            tx.set(stockRef, {
              warehouseCode,
              warehouseName,
              qty:            qty,
              available:      qty,
              reserved:       0,
              pendingReceive: 0,
              stockMin:       0,
              stockMax:       0,
              lastUpdatedAt:  now,
              lastUpdatedQty: 0
            });
          }

          // ── Update product aggregate ─────────────────────────────────────────
          tx.update(productRef, {
            stockQty:       admin.firestore.FieldValue.increment(qty),
            stockAvailable: admin.firestore.FieldValue.increment(qty),
            averageCost:    newAvgCost,
            updatedAt:      now
          });

          // ── Write StockMovement (immutable audit log) ────────────────────────
          const movRef = db.collection(`companies/${companyId}/stock-movements`).doc();
          tx.set(movRef, {
            type:          'purchase',
            productId,
            productSku:    line['productSku']  ?? product['sku']  ?? '',
            productName:   line['productName'] ?? product['name'] ?? '',
            warehouseCode,
            warehouseName,
            qtyBefore:     currentStockQty,
            qtyAfter:      currentStockQty + qty,
            qtyDelta:      qty,
            unitCost:      line['unitCost'] ?? 0,
            sourceDocId:   purchaseId,
            sourceDocType: 'purchase',
            userId,
            createdAt:     now
          });

          movementsWritten++;
        }

        // ── Mark purchase as stock-processed ────────────────────────────────────
        tx.update(purchaseRef, {
          stockProcessed:   true,
          stockProcessedAt: now,
          updatedAt:        now
        });

        logger.info('[onPurchaseReceive] RECEPCIÓN completada.', {
          companyId, purchaseId, movementsWritten
        });
      });

    } catch (err) {
      // Never re-throw — Firestore would retry indefinitely on unhandled errors
      logger.error('[onPurchaseReceive] Error en transacción de stock.', { companyId, purchaseId, err });

      try {
        await db.doc(`companies/${companyId}/purchases/${purchaseId}`).update({
          stockError: err instanceof Error ? err.message : 'Error inesperado actualizando stock',
          updatedAt:  admin.firestore.Timestamp.now()
        });
      } catch (updateErr) {
        logger.error('[onPurchaseReceive] Error marcando stockError:', { updateErr });
      }
    }
  }
);
