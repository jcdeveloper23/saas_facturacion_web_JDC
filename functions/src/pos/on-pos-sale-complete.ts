import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * onPosSaleComplete
 *
 * Firestore trigger that fires whenever a new POS sale is created.
 * If sale.generateInvoice === true and the sale has no invoiceId yet,
 * creates a matching Invoice document with status: 'issued'.
 *
 * The 'issued' status triggers onInvoiceEmit which runs the full
 * SRI electronic invoicing pipeline (XML → sign → SRI → PDF → email).
 *
 * Idempotency: if sale.invoiceId is already set, the function exits early.
 * This prevents duplicate invoices if the trigger fires more than once.
 */
export const onPosSaleComplete = onDocumentCreated(
  'companies/{companyId}/pos-sales/{saleId}',
  async (event) => {
    const { companyId, saleId } = event.params;
    const sale = event.data?.data() as Record<string, any> | undefined;

    if (!sale) {
      logger.warn('[onPosSaleComplete] Sin datos — saliendo.', { companyId, saleId });
      return;
    }

    // ── Guard 1: solo si se pidió generar factura ────────────────────────────
    if (sale['generateInvoice'] !== true) {
      logger.info('[onPosSaleComplete] generateInvoice=false — omitiendo.', { companyId, saleId });
      return;
    }

    // ── Guard 2: idempotencia — ya tiene factura vinculada ───────────────────
    if (sale['invoiceId']) {
      logger.info('[onPosSaleComplete] Ya tiene invoiceId — omitiendo.', { companyId, saleId, invoiceId: sale['invoiceId'] });
      return;
    }

    logger.info('[onPosSaleComplete] Generando factura desde venta POS.', { companyId, saleId });

    const db = admin.firestore();

    try {
      // ── Step 1: Verificar plan de la empresa ─────────────────────────────────
      const companySnap = await db.doc(`companies/${companyId}`).get();
      if (!companySnap.exists) {
        logger.warn('[onPosSaleComplete] Empresa no encontrada — saliendo.', { companyId });
        return;
      }

      const company      = companySnap.data() as Record<string, any>;
      const planFeatures = company['planFeatures'] as Record<string, any> | null | undefined;
      const planLimits   = company['planLimits']   as Record<string, any> | null | undefined;

      // Feature flag: si electronicInvoicing está explícitamente en false, no generar
      if (planFeatures && planFeatures['electronicInvoicing'] === false) {
        logger.info('[onPosSaleComplete] Feature electronicInvoicing deshabilitada en el plan — omitiendo.', { companyId, saleId });
        await db.doc(`companies/${companyId}/pos-sales/${saleId}`).update({
          invoiceError: 'Facturación electrónica no disponible en el plan actual',
          updatedAt:    FieldValue.serverTimestamp(),
        });
        return;
      }

      // Límite mensual de facturas SRI
      const invoicesPerMonth = planLimits?.['sri']?.['invoicesPerMonth'] as number | undefined;
      if (invoicesPerMonth !== undefined && invoicesPerMonth > 0) {
        const now    = new Date();
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const usageSnap    = await db.doc(`companies/${companyId}/usage/${period}`).get();
        const currentCount = (usageSnap.data()?.['invoicesEmitted'] as number) ?? 0;

        if (currentCount >= invoicesPerMonth) {
          logger.warn('[onPosSaleComplete] Límite mensual de facturas alcanzado — omitiendo.', {
            companyId, saleId, currentCount, invoicesPerMonth,
          });
          await db.doc(`companies/${companyId}/pos-sales/${saleId}`).update({
            invoiceError: `Límite del plan alcanzado: ${currentCount}/${invoicesPerMonth} facturas este mes`,
            updatedAt:    FieldValue.serverTimestamp(),
          });
          return;
        }
      }

      // ── Step 3: Leer la serie documental por seriesCode + tipo invoice ───────
      const seriesCode: string = sale['seriesCode'] ?? '';
      let establishment = '001';
      let emissionPoint = '001';
      let resolvedSeriesCode = seriesCode;

      if (seriesCode) {
        const seriesSnap = await db
          .collection(`companies/${companyId}/document-series`)
          .where('code', '==', seriesCode)
          .where('documentType', '==', 'invoice')
          .where('isActive', '==', true)
          .limit(1)
          .get();

        if (!seriesSnap.empty) {
          const s = seriesSnap.docs[0].data();
          establishment = s['establishment'] ?? '001';
          emissionPoint = s['emissionPoint'] ?? '001';
        } else {
          logger.warn('[onPosSaleComplete] Serie no encontrada — usando 001-001.', { companyId, seriesCode });
        }
      }

      // ── Step 4: Leer terminal para obtener warehouseCode ──────────────────
      const terminalId: string = sale['terminalId'] ?? '';
      let warehouseCode = 'PRINCIPAL';

      if (terminalId) {
        const terminalSnap = await db.doc(`companies/${companyId}/pos-terminals/${terminalId}`).get();
        if (terminalSnap.exists) {
          warehouseCode = terminalSnap.data()!['warehouseCode'] ?? 'PRINCIPAL';
        }
      }

      // ── Step 5: Leer cliente para datos adicionales (opcional) ────────────
      const customerId: string = sale['customerId'] ?? '';
      let customerCode  = '9999999999'; // consumidor final por defecto
      let customerEmail: string | null = null;
      let customerAddress: string | null = null;

      if (customerId) {
        const customerSnap = await db.doc(`companies/${companyId}/personas/${customerId}`).get();
        if (customerSnap.exists) {
          const c = customerSnap.data()!;
          customerCode    = c['code']    ?? c['taxId']   ?? customerCode;
          customerEmail   = c['email']   ?? null;
          customerAddress = c['address'] ?? null;
        }
      }

      // ── Step 6: Mapear líneas POS → líneas de factura ─────────────────────
      const posLines: Record<string, any>[] = Array.isArray(sale['lines']) ? sale['lines'] : [];

      const invoiceLines = posLines.map((l, idx) => {
        const vatPct: number = l['vatPct'] ?? 0;
        // Derivar código SRI de IVA si no viene del POS
        const sriTaxCode: string = l['vatCode'] ?? vatPctToSriCode(vatPct);

        return {
          id:          String(idx + 1),
          productId:   l['productId']   ?? null,
          productSku:  l['productSku']  ?? null,
          description: l['productName'] ?? l['productShortName'] ?? '',
          quantity:    l['quantity']    ?? 1,
          unitPrice:   l['unitPrice']   ?? l['salePrice'] ?? 0,
          discountPct: l['discountPct'] ?? 0,
          subtotal:    l['subtotal']    ?? 0,
          vatPct,
          vatAmount:   l['vatAmount']   ?? 0,
          total:       l['lineTotal']   ?? l['subtotal'] ?? 0,
          sriTaxCode,
          unit:        'UNIDAD',
        };
      });

      // ── Step 7: Mapear métodos de pago POS → SriPaymentMethod[] ──────────
      const posPayments: Record<string, any>[] = Array.isArray(sale['payments']) ? sale['payments'] : [];

      const paymentMethods = posPayments.map(p => ({
        code:   p['sriCode'] ?? '01',
        name:   p['methodLabel'] ?? p['method'] ?? '',
        amount: p['amount'] ?? 0,
      }));

      // ── Step 8: Calcular resumen IVA ──────────────────────────────────────
      const vatMap = new Map<number, { taxableBase: number; vatAmount: number }>();
      for (const l of invoiceLines) {
        const existing = vatMap.get(l.vatPct) ?? { taxableBase: 0, vatAmount: 0 };
        existing.taxableBase = round2(existing.taxableBase + l.subtotal);
        existing.vatAmount   = round2(existing.vatAmount   + l.vatAmount);
        vatMap.set(l.vatPct, existing);
      }
      const vatSummary = [...vatMap.entries()].map(([vatPct, v]) => ({ vatPct, ...v }))
        .sort((a, b) => a.vatPct - b.vatPct);

      // ── Step 7: Datos de fecha y año fiscal ───────────────────────────────
      const saleTs = sale['createdAt'] as admin.firestore.Timestamp ?? admin.firestore.Timestamp.now();
      const saleDate = saleTs.toDate();
      const fiscalYear = String(saleDate.getFullYear());

      // Fecha de vencimiento: misma que la venta (pago inmediato en POS)
      const dueDate = saleTs;

      // ── Step 8: Construir el documento de factura ─────────────────────────
      const grossAmount   = round2(sale['subtotal']       ?? 0);
      const discountPct   = sale['globalDiscountPct']     ?? 0;
      const discountAmount= round2(sale['discountAmount'] ?? 0);
      const netAmount     = round2(grossAmount - discountAmount);
      const vatAmount     = round2(sale['vatAmount']      ?? 0);
      const total         = round2(sale['total']          ?? 0);

      // ── Step 9: Asignar número correlativo atómico + crear factura ─────────
      const counterRef  = db.doc(`companies/${companyId}/counters/invoices`);
      const invoicesCol = db.collection(`companies/${companyId}/invoices`);
      const saleRef     = db.doc(`companies/${companyId}/pos-sales/${saleId}`);

      const counterKey = `${establishment}_${emissionPoint}_${fiscalYear}`;

      let invoiceId   = '';
      let invoiceNum  = 0;
      let fullNumber  = '';

      await db.runTransaction(async tx => {
        // Leer contador actual
        const counterSnap = await tx.get(counterRef);
        const current = (counterSnap.data()?.[counterKey] as number) ?? 0;
        invoiceNum = current + 1;
        fullNumber = buildFullNumber(establishment, emissionPoint, invoiceNum);

        // Crear referencia de factura nueva
        const invoiceRef = invoicesCol.doc();
        invoiceId = invoiceRef.id;

        const now = admin.firestore.Timestamp.now();

        const invoiceDoc: Record<string, any> = {
          // Numeración
          seriesCode:          resolvedSeriesCode,
          seriesEstablishment: establishment,
          seriesEmissionPoint: emissionPoint,
          number:              invoiceNum,
          fullNumber,
          fiscalYear,
          // Fechas
          date:    saleTs,
          dueDate,
          // Cliente
          customerId,
          customerCode,
          customerName:       sale['customerName']    ?? '',
          customerTaxId:      sale['customerTaxId']   ?? '',
          customerTaxIdType:  sale['customerTaxIdType'] ?? 'CI',
          ...(customerEmail   ? { customerEmail }   : {}),
          ...(customerAddress ? { customerAddress } : {}),
          // Comercial
          warehouseCode,
          paymentTermCode: 'CON',   // contado (pago inmediato en POS)
          currency:        'USD',
          exchangeRate:    1.0,
          paymentMethods,
          // Líneas
          lines: invoiceLines,
          // Totales
          grossAmount,
          globalDiscountPct: discountPct,
          discountAmount,
          netAmount,
          vatSummary,
          vatAmount,
          total,
          // Estado — 'issued' dispara onInvoiceEmit → pipeline SRI
          status:       'issued',
          isPaid:       true,
          paidAt:       now,
          isVoid:       false,
          isCreditNote: false,
          // Referencia al POS
          posSourceId: saleId,
          // Auditoría
          createdBy: sale['userId'] ?? 'pos',
          createdAt: now,
          updatedAt: now,
        };

        // Escribir factura y contador en la misma transacción
        tx.set(invoiceRef, invoiceDoc);
        tx.set(counterRef, { [counterKey]: invoiceNum }, { merge: true });
        // Vincular venta → factura
        tx.update(saleRef, {
          invoiceId,
          invoiceNumber: fullNumber,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      logger.info('[onPosSaleComplete] Factura creada exitosamente.', {
        companyId, saleId, invoiceId, fullNumber,
      });

    } catch (err) {
      logger.error('[onPosSaleComplete] Error generando factura desde POS:', { companyId, saleId, err });

      // Marcar la venta con el error para que el usuario pueda re-intentar
      try {
        await db.doc(`companies/${companyId}/pos-sales/${saleId}`).update({
          invoiceError: err instanceof Error ? err.message : 'Error desconocido al generar factura',
          updatedAt:    FieldValue.serverTimestamp(),
        });
      } catch (updateErr) {
        logger.error('[onPosSaleComplete] Error actualizando sale con error:', updateErr);
      }
      // No re-throw — evita retries infinitos de Firestore
    }
  }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFullNumber(estab: string, pto: string, num: number): string {
  return `${estab.padStart(3, '0')}-${pto.padStart(3, '0')}-${String(num).padStart(9, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Derivar código SRI de IVA desde el porcentaje si no viene explícito del POS */
function vatPctToSriCode(vatPct: number): string {
  switch (vatPct) {
    case 0:  return '2';  // IVA 0%
    case 5:  return '5';  // IVA 5%
    case 8:  return '8';  // IVA 8%
    case 15: return '3';  // IVA 15%
    default: return '2';
  }
}
