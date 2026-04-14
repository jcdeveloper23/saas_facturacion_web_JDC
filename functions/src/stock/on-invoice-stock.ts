import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

/**
 * onInvoiceStock
 *
 * Firestore trigger that moves inventory whenever an invoice changes state.
 * Runs independently of onInvoiceEmit — stock logic is decoupled from the SRI
 * pipeline and applies to all invoicing modes: basic, advanced and electronic.
 *
 * Handles two events:
 *
 *   EVENT 1 — Emission (any status → 'issued', stockProcessed not set)
 *     For each line with trackStock=true and noStock=false:
 *       · Decrements ProductStock.qty / available
 *       · Decrements Product.stockQty / stockAvailable (aggregate)
 *       · Writes a StockMovement of type 'sale'
 *     Marks invoice.stockProcessed = true (idempotency guard).
 *
 *   EVENT 2 — Void (any status → 'void', stockProcessed=true, stockRestored not set)
 *     Exact reversal of event 1 using type 'return_sale'.
 *     Marks invoice.stockRestored = true (idempotency guard).
 *
 * Warehouse resolution (cascade):
 *   line.warehouseCode → invoice.warehouseCode → config.defaultWarehouseCode
 *
 * Idempotency: both events use runTransaction with an inner re-read of the
 * invoice document to prevent double-processing on Firestore trigger retries.
 *
 * Errors: never re-thrown (would cause infinite Firestore retries).
 * On failure: sets invoice.stockError so the UI can surface it.
 */
export const onInvoiceStock = onDocumentWritten(
  'companies/{companyId}/invoices/{invoiceId}',
  async (event) => {
    // after.exists = false means deletion → ignore
    if (!event.data?.after.exists) return;

    // before may not exist when the document is created directly with status='issued'
    const before = event.data.before.exists
      ? event.data.before.data() as Record<string, any>
      : undefined;
    const after  = event.data.after.data() as Record<string, any>;

    const { companyId, invoiceId } = event.params;

    // ── Determine which event this is ─────────────────────────────────────────
    // before is undefined when the doc is created directly with status='issued'
    // (no draft step). In that case before?.['status'] is undefined → !== 'issued' → ✓
    const isNewIssuance =
      before?.['status'] !== 'issued' &&
      after['status']    === 'issued' &&
      !after['stockProcessed'];

    const isVoiding =
      before?.['status'] !== 'void' &&
      after['status']    === 'void'  &&
      after['stockProcessed'] === true &&
      !after['stockRestored'];

    if (!isNewIssuance && !isVoiding) return;

    const lines = (after['lines'] ?? []) as Record<string, any>[];

    if (lines.length === 0) {
      logger.info('[onInvoiceStock] Factura sin líneas — saliendo.', { companyId, invoiceId });
      return;
    }

    const db             = admin.firestore();
    const invoiceWarehouse = after['warehouseCode'] as string | undefined;
    const eventLabel     = isNewIssuance ? 'EMISIÓN' : 'ANULACIÓN';

    logger.info(`[onInvoiceStock] Evento ${eventLabel} detectado.`, { companyId, invoiceId });

    // ── Resolve default warehouse from company config (outside transaction) ────
    let defaultWarehouseCode: string | undefined;
    try {
      const configSnap = await db.doc(`companies/${companyId}/configuration/general`).get();
      defaultWarehouseCode = configSnap.data()?.['stock']?.['defaultWarehouseCode'] as string | undefined;
    } catch {
      // Config doc may not exist — cascade will fall through to undefined
    }

    // ── Main transaction ───────────────────────────────────────────────────────
    try {
      await db.runTransaction(async tx => {
        // Re-read invoice inside transaction for idempotency
        const invoiceRef  = db.doc(`companies/${companyId}/invoices/${invoiceId}`);
        const invoiceSnap = await tx.get(invoiceRef);

        if (!invoiceSnap.exists) {
          logger.warn('[onInvoiceStock] Invoice no encontrada en transacción — saliendo.', { invoiceId });
          return;
        }

        const invoiceData = invoiceSnap.data() as Record<string, any>;

        // Idempotency guards — checked inside transaction to prevent races
        if (isNewIssuance && invoiceData['stockProcessed'] === true) {
          logger.info('[onInvoiceStock] stockProcessed=true, ya procesado — saliendo.', { invoiceId });
          return;
        }
        if (isVoiding && invoiceData['stockRestored'] === true) {
          logger.info('[onInvoiceStock] stockRestored=true, ya restaurado — saliendo.', { invoiceId });
          return;
        }

        const now            = admin.firestore.Timestamp.now();
        const userId: string = isVoiding
          ? (after['updatedBy'] ?? after['createdBy'] ?? 'system')
          : (after['createdBy'] ?? 'system');

        let movementsWritten = 0;

        // ── Process each invoice line ────────────────────────────────────────
        for (const line of lines) {
          const productId = line['productId'] as string | undefined;
          if (!productId) continue;

          // Read product inside transaction for consistent data
          const productRef  = db.doc(`companies/${companyId}/products/${productId}`);
          const productSnap = await tx.get(productRef);

          if (!productSnap.exists) {
            logger.warn('[onInvoiceStock] Producto no encontrado — omitiendo línea.', { productId });
            continue;
          }

          const product = productSnap.data() as Record<string, any>;

          // Skip products without stock control
          if (!product['trackStock'] || product['noStock'] === true || product['type'] === 'service') {
            continue;
          }

          // Resolve warehouse for this line (cascade)
          const warehouseCode =
            (line['warehouseCode'] as string | undefined) ||
            invoiceWarehouse ||
            defaultWarehouseCode;

          if (!warehouseCode) {
            logger.warn('[onInvoiceStock] Almacén no resuelto — omitiendo línea.', { productId, invoiceId });
            continue;
          }

          const qty = Number(line['quantity'] ?? 0);
          if (qty <= 0) continue;

          // Read current warehouse stock inside transaction
          const stockRef  = db.doc(`companies/${companyId}/products/${productId}/stocks/${warehouseCode}`);
          const stockSnap = await tx.get(stockRef);
          const stockData = stockSnap.data() as Record<string, any> | undefined;

          const currentQty       = Number(stockData?.['qty']       ?? 0);
          const currentAvailable = Number(stockData?.['available'] ?? 0);
          const warehouseName    = (stockData?.['warehouseName'] as string | undefined) ?? '';

          const delta     = isNewIssuance ? -qty : qty;   // negative = sale, positive = return
          const newQty    = currentQty       + delta;
          const newAvail  = currentAvailable + delta;

          // ── Write warehouse stock ──────────────────────────────────────────
          if (stockSnap.exists) {
            tx.update(stockRef, {
              qty:            newQty,
              available:      newAvail,
              lastUpdatedAt:  now,
              lastUpdatedQty: currentQty
            });
          } else {
            // Warehouse stock doc doesn't exist yet — create it
            tx.set(stockRef, {
              warehouseCode,
              warehouseName,
              qty:            delta,
              available:      delta,
              reserved:       0,
              pendingReceive: 0,
              stockMin:       0,
              stockMax:       0,
              lastUpdatedAt:  now,
              lastUpdatedQty: 0
            });
          }

          // ── Update product aggregate ───────────────────────────────────────
          tx.update(productRef, {
            stockQty:       admin.firestore.FieldValue.increment(delta),
            stockAvailable: admin.firestore.FieldValue.increment(delta),
            updatedAt:      now
          });

          // ── Write StockMovement (immutable audit log) ──────────────────────
          const movRef = db.collection(`companies/${companyId}/stock-movements`).doc();
          tx.set(movRef, {
            type:          isNewIssuance ? 'sale' : 'return_sale',
            productId,
            productSku:    product['sku']  ?? '',
            productName:   product['name'] ?? '',
            warehouseCode,
            warehouseName,
            qtyBefore:     currentQty,
            qtyAfter:      newQty,
            qtyDelta:      delta,
            sourceDocId:   invoiceId,
            sourceDocType: 'invoice',
            userId,
            createdAt:     now
          });

          movementsWritten++;
        }

        // ── Mark invoice as processed ──────────────────────────────────────────
        if (isNewIssuance) {
          tx.update(invoiceRef, {
            stockProcessed:   true,
            stockProcessedAt: now,
            updatedAt:        now
          });
        } else {
          tx.update(invoiceRef, {
            stockRestored:   true,
            stockRestoredAt: now,
            updatedAt:       now
          });
        }

        logger.info(`[onInvoiceStock] ${eventLabel} completada.`, {
          companyId, invoiceId, movementsWritten
        });
      });

    } catch (err) {
      // Never re-throw — Firestore would retry indefinitely on unhandled errors
      logger.error('[onInvoiceStock] Error en transacción de stock.', { companyId, invoiceId, err });

      try {
        await db.doc(`companies/${companyId}/invoices/${invoiceId}`).update({
          stockError: err instanceof Error ? err.message : 'Error inesperado actualizando stock',
          updatedAt:  admin.firestore.Timestamp.now()
        });
      } catch (updateErr) {
        logger.error('[onInvoiceStock] Error marcando stockError:', { updateErr });
      }
    }
  }
);
