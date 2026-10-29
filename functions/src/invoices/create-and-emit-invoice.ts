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
import { AdditionalInfoField, validateAdditionalInfoInput } from '../utils/additional-info';
import { buyerTaxIdProblem } from '../utils/ecuador-tax-id';
import {
  canUseEmissionPoint,
  formatEmissionPoint,
  normalizeEmissionPointKey,
} from '../utils/establishments';
import { priceInvoiceLines, normalizeDiscountPct } from '../utils/invoice-discount';
import { invoiceDueDate, normalizeTimeUnit, paymentDeadlineProblem } from '../utils/invoice-due-date';

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
  /**
   * Id de la ficha en `companies/{cid}/personas`, si el cliente ya existe allí
   * (Conecta la crea antes de emitir con «Guardar en Clientes»). Se guarda en
   * `customerId` solo si la ficha existe en la misma empresa.
   */
  id?: string;
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
  /**
   * Desde qué punto de emisión se numera, como códigos de 3 dígitos. Si no
   * llegan, se usa el punto por defecto del usuario y, si tampoco tiene, el de
   * la empresa. Se valida contra `company-users/{uid}.emissionPoints`: un
   * cajero de la sucursal no puede emitir con la numeración de la matriz.
   */
  establishment?: string;
  emissionPoint?: string;
  customer: ExternalCustomer;
  /** Igual que `customer.id`, por compatibilidad. */
  customerId?: string;
  /**
   * La factura rechazada por el SRI a la que esta reemplaza («Corregir y volver
   * a emitir» de Conecta). Se guarda solo si existe en la misma empresa.
   */
  replacesInvoiceId?: string;
  replacesInvoiceNumber?: string;
  lines: ExternalInvoiceLine[];
  paymentMethods?: ExternalPaymentMethod[];
  notes?: string;
  /**
   * Información adicional propia de esta factura (`<infoAdicional>` del XML y
   * el recuadro del RIDE), p. ej. `[{ nombre: 'Placa', valor: 'ABC-1234' }]`.
   * Se suma a los campos fijos de la empresa; entre todos, como mucho 15.
   */
  additionalInfo?: Array<{ nombre: string; valor: string }>;
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

/**
 * Busca los artículos por su código y devuelve `{ CÓDIGO: idDeFirestore }`.
 *
 * Los códigos que no existan en el catálogo simplemente no salen en el mapa:
 * una línea escrita a mano, sin artículo detrás, es legítima y no debe
 * impedir que se emita la factura. Va en tandas de diez porque es el máximo
 * que admite un `where in`.
 */
async function resolveProductIds(
  db: admin.firestore.Firestore,
  companyId: string,
  skus: string[],
): Promise<Record<string, string>> {
  const buscados = Array.from(new Set(
    skus.map(s => `${s ?? ''}`.trim().toUpperCase())
        .filter(s => s.length > 0 && s !== 'SIN-CODIGO'),
  ));
  const mapa: Record<string, string> = {};
  if (buscados.length === 0) return mapa;

  const col = db.collection(`companies/${companyId}/products`);
  for (let i = 0; i < buscados.length; i += 10) {
    const tanda = buscados.slice(i, i + 10);
    try {
      const snap = await col.where('sku', 'in', tanda).get();
      for (const doc of snap.docs) {
        const sku = `${doc.data()['sku'] ?? ''}`.trim().toUpperCase();
        if (sku && !mapa[sku]) mapa[sku] = doc.id;
      }
    } catch (err) {
      // Que no se pueda mirar el catálogo no puede impedir facturar: se
      // pierde el movimiento de stock, no la venta.
      console.error('[createAndEmitInvoice] No se pudieron resolver los códigos:', err);
    }
  }
  return mapa;
}

/**
 * Con qué establecimiento y punto de emisión se numera esta factura.
 *
 * Orden: lo que pida quien llama, su punto por defecto, y por último el de la
 * empresa. Sea cual sea, tiene que estar entre los suyos: un cajero con la
 * sucursal asignada no puede emitir con la numeración de la matriz, que es lo
 * que ya imponen las reglas de Firestore al escribir la factura.
 *
 * Sin puntos asignados —o siendo admin— puede emitir desde cualquiera, que es
 * el caso de las empresas de un solo local.
 */
async function resolveCallerEmissionPoint(params: {
  db: admin.firestore.Firestore;
  companyId: string;
  uid: string;
  role?: string;
  requested: { establishment?: string; emissionPoint?: string };
  companySri: { establishment?: unknown; emissionPoint?: unknown };
}): Promise<{ establishment: string; emissionPoint: string }> {
  const { db, companyId, uid, role, requested, companySri } = params;

  const perfil = await db.doc(`companies/${companyId}/company-users/${uid}`).get();
  const allowed: string[] = [
    ...((perfil.data()?.['emissionPoints'] as string[] | undefined) ?? []),
  ];
  const porDefecto = `${perfil.data()?.['defaultEmissionPoint'] ?? ''}`;

  const pedido = formatEmissionPoint(requested.establishment, requested.emissionPoint);
  const elegido =
    pedido ??
    normalizeEmissionPointKey(porDefecto) ??
    (allowed.length ? allowed[0] : null) ??
    formatEmissionPoint(companySri.establishment, companySri.emissionPoint);

  if (!elegido) {
    throw new HttpsError(
      'failed-precondition',
      'No hay un punto de emisión con el que numerar. Revisa la configuración SRI de la empresa.',
    );
  }

  const [establishment, emissionPoint] = elegido.split('-');
  if (!canUseEmissionPoint(allowed, role, establishment, emissionPoint)) {
    throw new HttpsError(
      'permission-denied',
      `No puedes emitir desde el punto ${elegido}. Pide que te lo asignen.`,
    );
  }
  return { establishment, emissionPoint };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildFullNumber(estab: string, pto: string, num: number): string {
  return `${estab.padStart(3, '0')}-${pto.padStart(3, '0')}-${String(num).padStart(9, '0')}`;
}

/**
 * Calcula los totales de las líneas normalizando al modelo interno de FacturaEc.
 * El sistema externo puede omitir los totales — esta función los deriva
 * de quantity, unitPrice, discountPct y vatPct (utils/invoice-discount.ts).
 */
export function calculateLineTotals(lines: ExternalInvoiceLine[]) {
  const priced = priceInvoiceLines(lines);
  const mappedLines = priced.lines.map((p, i) => ({
    sku:         lines[i].sku ?? 'SIN-CODIGO',
    description: lines[i].description,
    quantity:    p.quantity,
    unitPrice:   p.unitPrice,
    discount:    p.discount,
    discountPct: p.discountPct,
    subtotal:    p.subtotal,
    vatPct:      p.vatPct,
    vatAmount:   p.vatAmount,
    unit:        lines[i].unit ?? 'UNIDAD',
  }));
  return {
    mappedLines,
    grossAmount:    priced.grossAmount,
    discountAmount: priced.discountAmount,
    netAmount:      priced.netAmount,
    vatAmount:      priced.vatAmount,
    total:          priced.total,
    vatSummary:     priced.vatSummary,
  };
}

/**
 * Valida los campos mínimos requeridos del payload.
 * Lanza HttpsError 'invalid-argument' con detalle del primer error encontrado.
 */
function validatePayload(data: CreateInvoicePayload): void {
  if (!data.customer?.taxId)  throw new HttpsError('invalid-argument', 'customer.taxId es requerido.');
  if (!data.customer?.name)   throw new HttpsError('invalid-argument', 'customer.name es requerido.');
  if (!data.customer?.taxIdType) throw new HttpsError('invalid-argument', 'customer.taxIdType es requerido (RUC, CI, PASAPORTE, CONSUMIDOR_FINAL, EXTERIOR).');

  // Una identificación mal formada la rechaza el SRI (identificador 69) y la
  // clave queda quemada: hay que frenarla antes de numerar (2026-10-13).
  data.customer.taxId = String(data.customer.taxId).trim();
  const idProblem = buyerTaxIdProblem(data.customer.taxId, data.customer.taxIdType);
  if (idProblem) throw new HttpsError('invalid-argument', idProblem);

  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    throw new HttpsError('invalid-argument', 'lines debe ser un arreglo con al menos un elemento.');
  }

  for (const [i, line] of data.lines.entries()) {
    if (!line.description) throw new HttpsError('invalid-argument', `lines[${i}].description es requerido.`);
    if (!(Number(line.quantity) > 0))   throw new HttpsError('invalid-argument', `lines[${i}].quantity debe ser mayor a 0.`);
    if (!(Number(line.unitPrice) >= 0)) throw new HttpsError('invalid-argument', `lines[${i}].unitPrice debe ser >= 0.`);
    if (normalizeDiscountPct(line.discountPct) === null) {
      throw new HttpsError('invalid-argument', `lines[${i}].discountPct debe estar entre 0 y 100. Recibido: ${line.discountPct}`);
    }
    if (![0, 5, 15].includes(Number(line.vatPct))) {
      throw new HttpsError('invalid-argument', `lines[${i}].vatPct debe ser 0, 5 o 15. Recibido: ${line.vatPct}`);
    }
  }

  if (data.paymentMethods && data.paymentMethods.length > 0) {
    for (const [i, pm] of data.paymentMethods.entries()) {
      if (!pm.code) throw new HttpsError('invalid-argument', `paymentMethods[${i}].code es requerido.`);
      const plazo = paymentDeadlineProblem(pm.deadline, pm.timeUnit);
      if (plazo) throw new HttpsError('invalid-argument', `paymentMethods[${i}]: ${plazo}`);
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

    // La información adicional se valida contra el tope del SRI contando los
    // campos fijos de la empresa: pasarse lo rechazaría el SRI por estructura.
    let additionalInfo: AdditionalInfoField[] = [];
    try {
      const sriCfg = (await db.doc(`companies/${companyId}/configuration/sri`).get()).data();
      const fijos = Array.isArray(sriCfg?.['additionalInfoFields']) ? sriCfg!['additionalInfoFields'].length : 0;
      additionalInfo = validateAdditionalInfoInput(data.additionalInfo, fijos);
    } catch (e) {
      throw new HttpsError('invalid-argument', e instanceof Error ? e.message : String(e));
    }

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

    // Enlaces opcionales: la ficha del cliente y la factura rechazada que esta
    // reemplaza. Solo se guardan si existen en la misma empresa; si no, la
    // factura se emite igual, sin el enlace.
    const pedidoCliente = `${data.customer?.id ?? data.customerId ?? ''}`.trim();
    let customerId: string | null = null;
    if (pedidoCliente && !pedidoCliente.includes('/')) {
      const persona = await db.doc(`companies/${companyId}/personas/${pedidoCliente}`).get();
      if (persona.exists) customerId = pedidoCliente;
      else console.warn('[createAndEmitInvoice] customerId sin ficha en personas, se ignora');
    }
    const pedidoReemplazo = `${data.replacesInvoiceId ?? ''}`.trim();
    let replacesInvoiceId: string | null = null;
    if (pedidoReemplazo && !pedidoReemplazo.includes('/')) {
      const anterior = await db.doc(`companies/${companyId}/invoices/${pedidoReemplazo}`).get();
      if (anterior.exists) replacesInvoiceId = pedidoReemplazo;
    }

    if (!sri?.establishment || !sri?.emissionPoint) {
      throw new HttpsError(
        'failed-precondition',
        'La empresa no tiene configuración SRI completa (establishment / emissionPoint).',
      );
    }

    // ── 4b. Punto de emisión: el que pidan, el suyo por defecto, o el de la
    // empresa. Siempre validado contra los que tiene asignados.
    const { establishment, emissionPoint } = await resolveCallerEmissionPoint({
      db,
      companyId,
      uid: request.auth.uid,
      role: callerRole,
      requested: { establishment: data.establishment, emissionPoint: data.emissionPoint },
      companySri: { establishment: sri.establishment, emissionPoint: sri.emissionPoint },
    });

    // ── 5. Calcular totales desde las líneas ─────────────────────────────────
    const { mappedLines, grossAmount, discountAmount, netAmount, vatAmount, total, vatSummary } =
      calculateLineTotals(data.lines);

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
          deadline: Number(pm.deadline ?? 0),
          timeUnit: normalizeTimeUnit(pm.timeUnit),
        }))
      : [{ code: '01', amount: total, deadline: 0, timeUnit: 'dias' }];

    // ── 7 bis. Los códigos, convertidos en artículos ─────────────────────────
    // Sin `productId` en la línea, `onInvoiceStock` la salta y la venta no
    // mueve el inventario: quien factura desde fuera manda el código del
    // artículo, no su identificador de Firestore, así que se resuelve aquí.
    const productIdBySku = await resolveProductIds(
      db, companyId, mappedLines.map(l => l.sku));

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
        // El plazo más largo de las formas de pago (2026-10-29); sin plazo, de contado.
        dueDate: admin.firestore.Timestamp.fromDate(invoiceDueDate(invoiceDate, paymentMethods)),

        // ── Cliente ─────────────────────────────────────────────────────────
        customerId,          // ficha de personas, si existe en la empresa
        ...(replacesInvoiceId ? {
          replacesInvoiceId,
          replacesInvoiceNumber: `${data.replacesInvoiceNumber ?? ''}`.trim() || null,
        } : {}),
        customerName:        data.customer.name,
        customerTaxId:       data.customer.taxId,
        customerTaxIdType:   data.customer.taxIdType,
        customerEmail:       data.customer.email  ?? null,
        customerAddress:     data.customer.address ?? null,

        // ── Líneas ──────────────────────────────────────────────────────────
        lines: mappedLines.map(l => ({
          productId:   productIdBySku[l.sku.toUpperCase()] ?? null,
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
        // Descuento por línea (2026-10-13): grossAmount = Σ brutos,
        // discountAmount = Σ descuentos de línea, netAmount = gross − descuento;
        // vatSummary por tarifa sobre el neto (asiento, ATS y RIDE lo leen).
        grossAmount,
        discountAmount,
        netAmount,
        vatSummary,
        vatAmount,
        total,

        // ── Pagos ────────────────────────────────────────────────────────────
        paymentMethods,

        // ── Notas ────────────────────────────────────────────────────────────
        notes: data.notes ?? null,
        additionalInfo,

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
