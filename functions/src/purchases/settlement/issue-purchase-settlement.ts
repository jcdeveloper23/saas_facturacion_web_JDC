// ─── issuePurchaseSettlement: emitir una liquidación de compra (codDoc 03) ───
//
// 2026-11-05. El cliente NO crea la liquidación: la crea esta callable, que
// valida, numera y guarda la compra en una transacción, con `status: 'sent'`.
// Eso dispara `onPurchaseSettlementEmit` (XML, firma, SRI). Al autorizarse, el
// trigger la pasa a `received` y siguen los de siempre: `onPurchaseReceive`
// (sin productId no mueve stock, D-LC5) y el asiento de la compra.
//
// Rechaza ANTES de numerar: un número gastado en algo que el SRI no recibe deja
// un hueco en la serie.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { resolveCallerEmissionPoint } from '../../invoices/create-and-emit-invoice';
import { validateAdditionalInfoInput } from '../../utils/additional-info';
import {
  SettlementPayload,
  canIssueSettlement,
  computeSettlement,
  settlementCounterKey,
  settlementFullNumber,
  settlementPayloadProblem,
  settlementSupplierIdType,
} from './settlement-logic';

const PURCHASE_SERIE = 'C';

function newLineId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 0x7fffffff).toString(36)}`;
}

/** Fecha de emisión: la pedida (mediodía de Ecuador) o ahora. */
function resolveIssueDate(raw: string | undefined): Date {
  if (!raw) return new Date();
  const d = new Date(`${raw}T12:00:00-05:00`);
  if (isNaN(d.getTime())) throw new HttpsError('invalid-argument', `Fecha inválida: ${raw}. Usa AAAA-MM-DD.`);
  return d;
}

/** El año en Ecuador (UTC−5), no el del servidor. */
function ecuadorYear(d: Date): number {
  return new Date(d.getTime() - 5 * 3600 * 1000).getUTCFullYear();
}

export const issuePurchaseSettlement = onCall({ timeoutSeconds: 60 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  const data = request.data as SettlementPayload;

  // ── 1. Quién llama: la empresa y el rol salen del token, nunca del body ────
  const callerCompanyId = request.auth.token['companyId'] as string | undefined;
  const callerRole = request.auth.token['role'] as string | undefined;
  if (!data?.companyId) throw new HttpsError('invalid-argument', 'companyId es requerido.');
  if (callerRole !== 'super_admin' && callerCompanyId !== data.companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para operar en esta empresa.');
  }
  if (!canIssueSettlement(callerRole)) {
    throw new HttpsError('permission-denied', 'Tu rol no puede emitir liquidaciones de compra.');
  }
  const companyId = data.companyId;
  const uid = request.auth.uid;

  // ── 2. El pedido ───────────────────────────────────────────────────────────
  const problem = settlementPayloadProblem(data);
  if (problem) throw new HttpsError('invalid-argument', problem);

  const db = admin.firestore();
  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) throw new HttpsError('not-found', 'Empresa no encontrada.');
  const sri = (companySnap.data() as Record<string, any>)['sri'] ?? {};
  if (!sri.ruc) throw new HttpsError('failed-precondition', 'La empresa no tiene RUC en su configuración SRI.');

  let additionalInfo;
  try {
    const sriCfg = (await db.doc(`companies/${companyId}/configuration/sri`).get()).data();
    const fijos = Array.isArray(sriCfg?.['additionalInfoFields']) ? sriCfg!['additionalInfoFields'].length : 0;
    additionalInfo = validateAdditionalInfoInput(data.additionalInfo, fijos);
  } catch (e) {
    throw new HttpsError('invalid-argument', e instanceof Error ? e.message : String(e));
  }

  // Mismo punto de emisión que una factura: el pedido, el suyo por defecto o el
  // de la empresa, y tiene que estar entre los asignados.
  const { establishment, emissionPoint } = await resolveCallerEmissionPoint({
    db, companyId, uid, role: callerRole,
    requested: { establishment: data.establishment, emissionPoint: data.emissionPoint },
    companySri: { establishment: sri.establishment, emissionPoint: sri.emissionPoint },
  });

  const issueDate = resolveIssueDate(data.date);
  const year = ecuadorYear(issueDate);
  const dateTs = admin.firestore.Timestamp.fromDate(issueDate);
  const { lines, totals } = computeSettlement(data.lines, newLineId);
  const s = data.supplier;
  const supplierTaxIdType = settlementSupplierIdType(s.taxIdType)!;
  const termDays = Math.max(0, Math.round(Number(data.paymentTermDays ?? 0)));
  const dueDate = new Date(issueDate.getTime() + termDays * 86400000);

  // ── 3. Numerar y guardar, juntos ───────────────────────────────────────────
  const settlementCounter = db.doc(`companies/${companyId}/counters/purchaseSettlements`);
  const purchaseCounter = db.doc(`companies/${companyId}/counters/purchases`);
  const settlementKey = settlementCounterKey(establishment, emissionPoint, year);
  const purchaseKey = `${PURCHASE_SERIE}_${year}`;
  const ref = db.collection(`companies/${companyId}/purchases`).doc();
  const now = admin.firestore.Timestamp.now();
  let fullNumber = '';
  let purchaseFullNumber = '';

  await db.runTransaction(async (tx) => {
    const [sc, pc] = await Promise.all([tx.get(settlementCounter), tx.get(purchaseCounter)]);
    const sequential = ((sc.data()?.[settlementKey] as number) ?? 0) + 1;
    const purchaseNumber = ((pc.data()?.[purchaseKey] as number) ?? 0) + 1;
    fullNumber = settlementFullNumber(establishment, emissionPoint, sequential);
    purchaseFullNumber = `${PURCHASE_SERIE}-${year}-${String(purchaseNumber).padStart(6, '0')}`;

    tx.set(settlementCounter, { [settlementKey]: sequential }, { merge: true });
    tx.set(purchaseCounter, { [purchaseKey]: purchaseNumber }, { merge: true });
    tx.set(ref, {
      // ── Numeración interna de la compra (como la web y Conecta) ──────────
      number: purchaseNumber,
      serie: PURCHASE_SERIE,
      year,
      fullNumber: purchaseFullNumber,

      // ── La liquidación: la emitimos nosotros ─────────────────────────────
      issuedByCompany: true,
      sriDocumentType: '03',
      seriesEstablishment: establishment,
      seriesEmissionPoint: emissionPoint,
      settlement: { establishment, emissionPoint, sequential, fullNumber },
      // Nuestro número y fecha donde la compra guarda los del proveedor: la
      // retención (numDocSustento) y el ATS los leen de aquí. La clave de
      // acceso (`supplierAccessKey`) la pone el generador del XML.
      supplierInvoiceNumber: fullNumber,
      supplierInvoiceDate: dateTs,

      // ── Proveedor ────────────────────────────────────────────────────────
      ...(s.id ? { supplierId: s.id } : {}),
      supplierName: String(s.name).trim(),
      supplierRuc: String(s.taxId).trim(),
      supplierTaxIdType,
      supplierAddress: String(s.address).trim(),
      ...(String(s.email ?? '').trim() ? { supplierEmail: String(s.email).trim() } : {}),
      irRetentionPct: 0,
      vatRetentionPct: 0,

      // ── Fechas, sustento, pago ───────────────────────────────────────────
      date: dateTs,
      dueDate: admin.firestore.Timestamp.fromDate(dueDate),
      sriSustentoCode: data.sriSustentoCode,
      paymentMethodCode: data.paymentMethodCode,
      ...(termDays ? { paymentTermDays: termDays } : {}),

      // ── Líneas y totales (la retención se registra aparte, D-LC3) ────────
      lines,
      subtotal: totals.subtotal,
      totalDiscount: totals.totalDiscount,
      totalTax: totals.totalTax,
      totalIrRetention: 0,
      totalVatRetention: 0,
      total: totals.total,
      ...(data.costCenterId ? { costCenterId: data.costCenterId, costCenterName: data.costCenterName ?? '' } : {}),
      ...(String(data.notes ?? '').trim() ? { notes: String(data.notes).trim() } : {}),
      additionalInfo,

      // ── Estado: 'sent' + sin sriStatus dispara onPurchaseSettlementEmit ──
      status: 'sent',
      source: 'settlement',
      createdBy: uid,
      updatedBy: uid,
      createdAt: now,
      updatedAt: now,
    });
  });

  console.log('[issuePurchaseSettlement] Creada:', { companyId, purchaseId: ref.id, fullNumber });
  return { purchaseId: ref.id, fullNumber, purchaseFullNumber };
});
