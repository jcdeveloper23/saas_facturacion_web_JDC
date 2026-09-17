import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { assertPlanMatchesCompany, loadCompanyForCaller, readCaller } from '../utils/channels';
import { PackageDef, addonCodesOf, effectivePackages } from '../channel-portal/portal-core';

/**
 * assignPlanToCompany
 *
 * Callable CF — super_admin de plataforma, o el channel_admin del canal de la empresa.
 * Asigna un plan a una empresa: lee el plan, calcula enabledModules y
 * desnormaliza planLimits + planFeatures en el documento de la empresa.
 *
 * Payload: { companyId: string; planId: string }
 * Returns: { success: true; companyId: string; planId: string }
 */
export const assignPlanToCompany = onCall(async (request) => {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  // El acceso real se verifica contra el canal de la empresa, más abajo.
  const caller = readCaller(request);

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

  // ── 2. Leer empresa y verificar el canal ──────────────────────────────────
  // Niega si la empresa es de otro canal: es el aislamiento entre productos.
  const company = await loadCompanyForCaller(db, caller, companyId);
  assertPlanMatchesCompany(plan['channelId'], company['channelId']);

  // ── 3. Calcular paquetes y módulos ────────────────────────────────────────
  // Paquetes del plan nuevo + add-on contratados aparte; los módulos salen del
  // catálogo. Antes se leía plan.includedModules, que los planes no tienen, y
  // se mezclaban códigos de paquete con módulos.
  const pkgsSnap = await db.collection('plugin-packages').get();
  const catalog = pkgsSnap.docs.map(d => d.data() as PackageDef).filter(p => !!p.code);
  const planPackages: string[] = Array.isArray(plan['includedPackages']) ? plan['includedPackages'] : [];
  const { enabledPackages, enabledModules } = effectivePackages(planPackages, addonCodesOf(company), catalog);
  console.log('[assignPlanToCompany] paquetes:', enabledPackages.length, '| módulos:', enabledModules.length);

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
    enabledPackages,
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
