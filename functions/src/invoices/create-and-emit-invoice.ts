/**
 * create-and-emit-invoice.ts
 *
 * Puerta de entrada para sistemas externos (Flutter, Spring Boot, ERPs, etc.)
 * que necesitan emitir facturas electrónicas sin tener acceso directo a Firestore.
 *
 * Flujo:
 *   1. Valida Firebase Auth (companyId del token — nunca del body).
 *   2. Normaliza y valida el payload externo.
 *   3. Calcula los totales si el sistema externo no los envía.
 *   4. Lee la configuración de series de la empresa (establishment + emissionPoint).
 *   5. En una transacción atómica: incrementa el contador de secuencial y crea
 *      el documento de factura con status: 'issued'.
 *   6. onInvoiceEmit dispara automáticamente el pipeline completo:
 *      XML → firma XAdES-BES → SRI → PDF RIDE → email.
 *   7. Retorna { invoiceId, status: 'processing' } (modo async)
 *      o espera el resultado del SRI (modo sync).
 *
 * Idempotencia: si se envía el mismo externalId para el mismo companyId,
 * retorna el documento ya creado sin duplicar.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// ─── Tipos del payload externo ────────────────────────────────────────────────

export interface ExternalInvoiceLine {
  /** SKU o código del producto en el sistema de origen. */
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Porcentaje de descuento 0-100. Si se omite, se asume 0. */
  discountPct?: number;
  /** Porcentaje de IVA: 0, 5 o 15. */
  vatPct: number;
  /** Unidad de medida. Default: 'UNIDAD'. */
  unit?: string;
}

export interface ExternalCustomer {
  taxId: string;
  /** 'RUC' | 'CI' | 'PASAPORTE' | 'CONSUMIDOR_FINAL' | 'EXTERIOR' */
  taxIdType: string;
  name: string;
  email?: string;
  address?: string;
}

export interface ExternalPaymentMethod {
  /** Código SRI de forma de pago. Ej: '01' efectivo, '17' tarjeta de crédito. */
  code: string;
  amount?: number;
  deadline?: number;
  timeUnit?: string;
}

export interface CreateInvoicePayload {
  /** ID de la empresa en FacturaEc. Se valida contra el companyId del token JWT. */
  companyId: string;
  /**
   * ID de la factura en el sistema de origen. Se usa para idempotencia:
   * si ya existe un documento con este externalId, se retorna ese documento
   * sin crear uno nuevo.
   */
  externalId?: string;
  /**
   * Etiqueta del sistema que llama. Se guarda en el documento para trazabilidad.
   * Ej: 'flutter_app', 'buseta', 'shopify', 'zapier'.
   */
  source?: string;
  /** Fecha de emisión en formato ISO 8601 (YYYY-MM-DD). Default: hoy. */
  date?: string;
  customer: ExternalCustomer;
  lines: ExternalInvoiceLine[];
  paymentMethods?: ExternalPaymentMethod[];
  notes?: string;
  /**
   * 'async' (default): retorna { invoiceId, status: 'processing' } inmediatamente.
   * 'sync': espera hasta que el SRI responda (hasta syncTimeoutMs). Más lento pero
   *   retorna el resultado completo en una sola llamada. Riesgo de timeout con SRI lento.
   */
  mode?: 'async' | 'sync';
  /** Solo aplica en mode: 'sync'. Tiempo máximo de espera en ms. Default: 45000. */
  syncTimeoutMs?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildFullNumber(estab: string, pto: string, num: number): string {
  return `${estab.padStart(3, '0')}-${pto.padStart(3, '0')}-${String(num).padStart(9, '0')}`;
}

/**
 * Calcula los totales de las líneas normalizando al modelo interno de FacturaEc.
 * El sistema externo puede omitir los totales — esta función los deriva
 * de quantity, unitPrice, discountPct y vatPct.
 */
function calculateLineTotals(lines: ExternalInvoiceLine[]): {
  mappedLines: Array<{
    sku: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    discountPct: number;
    subtotal: number;
    vatPct: number;
    vatAmount: number;
    unit: string;
  }>;
  netAmount: number;
  vatAmount: number;
  total: number;
} {
  const mappedLines = lines.map(line => {
    const qty        = Number(line.quantity)  || 0;
    const price      = Number(line.unitPrice) || 0;
    const discPct    = Number(line.discountPct ?? 0);
    const vatPct     = Number(line.vatPct ?? 0);
    const grossLine  = round2(qty * price);
    const discount   = round2(grossLine * discPct / 100);
    const subtotal   = round2(grossLine - discount);
    const vatAmount  = round2(subtotal * vatPct / 100);

    return {
      sku:         line.sku ?? 'SIN-CODIGO',
      description: line.description,
      quantity:    qty,
      unitPrice:   price,
      discount,
      discountPct: discPct,
      subtotal,
      vatPct,
      vatAmount,
      unit: line.unit ?? 'UNIDAD',
    };
  });

  const netAmount = round2(mappedLines.reduce((s, l) => s + l.subtotal, 0));
  const vatAmount = round2(mappedLines.reduce((s, l) => s + l.vatAmount, 0));
  const total     = round2(netAmount + vatAmount);

  return { mappedLines, netAmount, vatAmount, total };
}

/**
 * Valida los campos mínimos requeridos del payload.
 * Lanza HttpsError 'invalid-argument' con detalle del primer error encontrado.
 */
function validatePayload(data: CreateInvoicePayload): void {
  if (!data.customer?.taxId)  throw new HttpsError('invalid-argument', 'customer.taxId es requerido.');
  if (!data.customer?.name)   throw new HttpsError('invalid-argument', 'customer.name es requerido.');
  if (!data.customer?.taxIdType) throw new HttpsError('invalid-argument', 'customer.taxIdType es requerido (RUC, CI, PASAPORTE, CONSUMIDOR_FINAL, EXTERIOR).');

  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    throw new HttpsError('invalid-argument', 'lines debe ser un arreglo con al menos un elemento.');
  }

  for (const [i, line] of data.lines.entries()) {
    if (!line.description) throw new HttpsError('invalid-argument', `lines[${i}].description es requerido.`);
    if (!(Number(line.quantity) > 0))   throw new HttpsError('invalid-argument', `lines[${i}].quantity debe ser mayor a 0.`);
    if (!(Number(line.unitPrice) >= 0)) throw new HttpsError('invalid-argument', `lines[${i}].unitPrice debe ser >= 0.`);
    if (![0, 5, 15].includes(Number(line.vatPct))) {
      throw new HttpsError('invalid-argument', `lines[${i}].vatPct debe ser 0, 5 o 15. Recibido: ${line.vatPct}`);
    }
  }

  if (data.paymentMethods && data.paymentMethods.length > 0) {
    for (const [i, pm] of data.paymentMethods.entries()) {
      if (!pm.code) throw new HttpsError('invalid-argument', `paymentMethods[${i}].code es requerido.`);
    }
  }
}

/**
 * Espera hasta que sriStatus cambie a un estado terminal ('authorized', 'rejected',
 * 'not_required', 'plan_limit_reached') o hasta que se cumpla el timeout.
 * Usa polling con Firestore — solo en modo sync.
 */
async function waitForSriResult(
  companyId: string,
  invoiceId: string,
  timeoutMs: number,
): Promise<Record<string, any> | null> {
  const db = admin.firestore();
  const docRef = db.doc(`companies/${companyId}/invoices/${invoiceId}`);
  const TERMINAL_STATUSES = new Set(['authorized', 'rejected', 'not_required', 'plan_limit_reached']);
  const POLL_INTERVAL_MS = 2000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const snap = await docRef.get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    if (TERMINAL_STATUSES.has(data['sriStatus'])) return data;
  }
  return null; // timeout — el pipeline sigue corriendo en background
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

export const createAndEmitInvoice = onCall(
  { timeoutSeconds: 120 }, // permite sync mode con SRI lento
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
    }

    const data = request.data as CreateInvoicePayload;

    // ── 1. Autenticación multi-tenant ────────────────────────────────────────
    // companyId SIEMPRE del token — nunca del body. El body no es confiable.
    const callerCompanyId = request.auth.token['companyId'] as string | undefined;
    const callerRole      = request.auth.token['role']      as string | undefined;

    if (!data.companyId) {
      throw new HttpsError('invalid-argument', 'companyId es requerido.');
    }

    const isAuthorized =
      callerRole === 'super_admin' ||
      (callerCompanyId && callerCompanyId === data.companyId);

    if (!isAuthorized) {
      throw new HttpsError('permission-denied', 'No tiene permisos para operar en esta empresa.');
    }

    const companyId = data.companyId;

    // ── 2. Validar payload ───────────────────────────────────────────────────
    validatePayload(data);

    const db  = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    // ── 3. Idempotencia por externalId ───────────────────────────────────────
    if (data.externalId) {
      const existing = await db
        .collection(`companies/${companyId}/invoices`)
        .where('externalId', '==', data.externalId)
        .limit(1)
        .get();

      if (!existing.empty) {
        const doc     = existing.docs[0];
        const docData = doc.data();
        console.log('[createAndEmitInvoice] Documento existente para externalId:', data.externalId);
        return {
          invoiceId:  doc.id,
          fullNumber: docData['fullNumber'] ?? null,
          status:     docData['sriStatus'] ?? 'processing',
          isDuplicate: true,
        };
      }
    }

    // ── 4. Leer configuración de la empresa (establishment, emissionPoint) ───
    const companySnap = await db.doc(`companies/${companyId}`).get();
    if (!companySnap.exists) {
      throw new HttpsError('not-found', `Empresa no encontrada: ${companyId}`);
    }
    const company = companySnap.data()!;
    const sri = company['sri'] as Record<string, any> | undefined;

    if (!sri?.establishment || !sri?.emissionPoint) {
      throw new HttpsError(
        'failed-precondition',
        'La empresa no tiene configuración SRI completa (establishment / emissionPoint).',
      );
    }

    const establishment = String(sri.establishment);
    const emissionPoint = String(sri.emissionPoint);

    // ── 5. Calcular totales desde las líneas ─────────────────────────────────
    const { mappedLines, netAmount, vatAmount, total } = calculateLineTotals(data.lines);

    // ── 6. Resolver fecha de emisión ─────────────────────────────────────────
    let invoiceDate: Date;
    if (data.date) {
      invoiceDate = new Date(`${data.date}T12:00:00-05:00`); // zona Ecuador
      if (isNaN(invoiceDate.getTime())) {
        throw new HttpsError('invalid-argument', `date inválida: ${data.date}. Use formato YYYY-MM-DD.`);
      }
    } else {
      invoiceDate = new Date();
    }
    const fiscalYear   = String(invoiceDate.getFullYear());
    const invoiceTs    = admin.firestore.Timestamp.fromDate(invoiceDate);

    // ── 7. Resolver métodos de pago ──────────────────────────────────────────
    const paymentMethods = data.paymentMethods?.length
      ? data.paymentMethods.map(pm => ({
          code:     pm.code,
          amount:   round2(pm.amount ?? total),
          deadline: pm.deadline ?? 0,
          timeUnit: pm.timeUnit ?? 'dias',
        }))
      : [{ code: '01', amount: total, deadline: 0, timeUnit: 'dias' }];

    // ── 8. Transacción atómica: contador + creación del documento ────────────
    const counterRef  = db.doc(`companies/${companyId}/counters/invoices`);
    const invoicesCol = db.collection(`companies/${companyId}/invoices`);
    const counterKey  = `${establishment}_${emissionPoint}_${fiscalYear}`;

    let invoiceId  = '';
    let fullNumber = '';

    await db.runTransaction(async tx => {
      const counterSnap = await tx.get(counterRef);
      const current  = (counterSnap.data()?.[counterKey] as number) ?? 0;
      const invoiceNum = current + 1;
      fullNumber = buildFullNumber(establishment, emissionPoint, invoiceNum);

      const invoiceRef = invoicesCol.doc();
      invoiceId = invoiceRef.id;

      const invoiceDoc: Record<string, any> = {
        // ── Numeración ──────────────────────────────────────────────────────
        seriesEstablishment: establishment,
        seriesEmissionPoint: emissionPoint,
        number:              invoiceNum,
        fullNumber,
        fiscalYear,

        // ── Fechas ──────────────────────────────────────────────────────────
        date:    invoiceTs,
        dueDate: invoiceTs,

        // ── Cliente ─────────────────────────────────────────────────────────
        customerId:          null, // no hay registro en la colección customers
        customerName:        data.customer.name,
        customerTaxId:       data.customer.taxId,
        customerTaxIdType:   data.customer.taxIdType,
        customerEmail:       data.customer.email  ?? null,
        customerAddress:     data.customer.address ?? null,

        // ── Líneas ──────────────────────────────────────────────────────────
        lines: mappedLines.map(l => ({
          productId:   null,
          sku:         l.sku,
          productSku:  l.sku,
          description: l.description,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          discount:    l.discount,
          discountPct: l.discountPct,
          subtotal:    l.subtotal,
          vatPct:      l.vatPct,
          vatAmount:   l.vatAmount,
          unit:        l.unit,
        })),

        // ── Totales ─────────────────────────────────────────────────────────
        grossAmount:    netAmount, // sin descuento global (el descuento va por línea)
        discountAmount: 0,
        netAmount,
        vatAmount,
        total,

        // ── Pagos ────────────────────────────────────────────────────────────
        paymentMethods,

        // ── Notas ────────────────────────────────────────────────────────────
        notes: data.notes ?? null,

        // ── Estado — 'issued' dispara onInvoiceEmit ─────────────────────────
        status:    'issued',
        sriStatus: null,

        // ── Trazabilidad de origen ───────────────────────────────────────────
        source:     data.source ?? 'external_api',
        externalId: data.externalId ?? null,

        // ── Metadata ─────────────────────────────────────────────────────────
        createdAt:  now,
        updatedAt:  now,
        createdBy:  request.auth!.uid,
      };

      // Incrementar contador
      tx.set(counterRef, { [counterKey]: invoiceNum }, { merge: true });

      // Crear factura
      tx.set(invoiceRef, invoiceDoc);
    });

    console.log('[createAndEmitInvoice] Factura creada:', { companyId, invoiceId, fullNumber, source: data.source });

    // ── 9. Modo sync: esperar resultado del SRI ──────────────────────────────
    if (data.mode === 'sync') {
      const timeoutMs = Math.min(data.syncTimeoutMs ?? 45_000, 90_000);
      const result    = await waitForSriResult(companyId, invoiceId, timeoutMs);

      if (result) {
        return {
          invoiceId,
          fullNumber,
          status:              result['sriStatus'],
          accessKey:           result['accessKey']           ?? null,
          authorizationNumber: result['authorizationNumber'] ?? null,
          authorizedAt:        result['authorizedAt']        ?? null,
          xmlUrl:              result['xmlUrl']              ?? null,
          signedXmlUrl:        result['signedXmlUrl']        ?? null,
          pdfUrl:              result['pdfUrl']              ?? null,
          sriError:            result['sriError']            ?? null,
        };
      }

      // Timeout — el pipeline sigue corriendo, informar al cliente
      return {
        invoiceId,
        fullNumber,
        status:  'processing',
        message: 'El SRI tardó más de lo esperado. Use checkSriStatus para consultar el resultado.',
      };
    }

    // ── 10. Modo async (default): retornar invoiceId inmediatamente ──────────
    return {
      invoiceId,
      fullNumber,
      status:  'processing',
      message: 'Factura creada. Use checkSriStatus({ invoiceId, companyId }) para consultar el resultado.',
    };
  },
);
