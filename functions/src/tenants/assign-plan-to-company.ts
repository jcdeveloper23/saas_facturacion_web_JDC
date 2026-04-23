import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * assignPlanToCompany
 *
 * Callable CF — solo super_admin.
 * Asigna un plan a una empresa: lee el plan, calcula enabledModules y
 * desnormaliza planLimits + planFeatures en el documento de la empresa.
 *
 * Payload: { companyId: string; planId: string }
 * Returns: { success: true; companyId: string; planId: string }
 */
export const assignPlanToCompany = onCall(async (request) => {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'No autenticado.');
  }
  if (request.auth.token['role'] !== 'super_admin') {
    throw new HttpsError('permission-denied', 'Solo super_admin puede asignar planes.');
  }

  // ── Input validation ────────────────────────────────────────────────────────
  const data = request.data as { companyId?: string; planId?: string };

  if (!data.companyId || typeof data.companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido y debe ser string.');
  }
  if (!data.planId || typeof data.planId !== 'string') {
    throw new HttpsError('invalid-argument', 'planId es requerido y debe ser string.');
  }

  const { companyId, planId } = data;
  const db = admin.firestore();

  console.log('[assignPlanToCompany] Inicio:', { companyId, planId });

  // ── 1. Leer plan ──────────────────────────────────────────────────────────
  const planSnap = await db.doc(`plans/${planId}`).get();
  if (!planSnap.exists) {
    throw new HttpsError('not-found', `El plan '${planId}' no existe.`);
  }
  const plan = planSnap.data() as Record<string, any>;
  if (plan['isActive'] !== true) {
    throw new HttpsError('not-found', `El plan '${planId}' no está activo.`);
  }
  console.log('[assignPlanToCompany] Plan leído:', { name: plan['name'], isActive: plan['isActive'] });

  // ── 2. Leer empresa ───────────────────────────────────────────────────────
  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) {
    throw new HttpsError('not-found', `La empresa '${companyId}' no existe.`);
  }
  const company = companySnap.data() as Record<string, any>;
  const enabledPackages: string[] = Array.isArray(company['enabledPackages']) ? company['enabledPackages'] : [];
  console.log('[assignPlanToCompany] enabledPackages actuales:', enabledPackages);

  // ── 3. Calcular enabledModules ─────────────────────────────────────────────
  // Unión de includedModules del plan + módulos de enabledPackages existentes
  const planModules: string[] = Array.isArray(plan['includedModules']) ? plan['includedModules'] : [];
  const enabledModules: string[] = Array.from(new Set([...planModules, ...enabledPackages]));
  console.log('[assignPlanToCompany] enabledModules calculados:', enabledModules.length, 'módulos');

  // ── 4. Calcular subscriptionEnd ────────────────────────────────────────────
  const now = Timestamp.now();
  const billingPeriod: string = plan['billingPeriod'] ?? 'monthly';
  const daysToAdd = billingPeriod === 'yearly' ? 365 : 30;
  const subscriptionEnd = Timestamp.fromMillis(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
  console.log('[assignPlanToCompany] billingPeriod:', billingPeriod, '| subscriptionEnd:', subscriptionEnd.toDate().toISOString());

  // ── 5. Batch atómico ──────────────────────────────────────────────────────
  const batch = db.batch();
  const companyRef = db.doc(`companies/${companyId}`);

  batch.update(companyRef, {
    planId,
    planName:          plan['name'] ?? '',
    planLimits:        plan['limits'] ?? null,
    planFeatures:      plan['features'] ?? null,
    enabledModules,
    subscriptionStart: now,
    subscriptionEnd,
    status:            'active',
    updatedAt:         now,
  });

  try {
    await batch.commit();
    console.log('[assignPlanToCompany] Batch committed OK:', { companyId, planId });
  } catch (err) {
    console.error('[assignPlanToCompany] Error en batch.commit:', err);
    throw new HttpsError('internal', 'Error al asignar el plan a la empresa.');
  }

  return { success: true, companyId, planId };
});
