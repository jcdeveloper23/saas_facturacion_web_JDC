import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { PackageDef, addonCodesOf, effectivePackages } from '../channel-portal/portal-core';

/**
 * onPlanUpdated
 *
 * Firestore trigger — fires when a /plans/{planId} document is updated.
 *
 * Propagates changes to limits, features, and includedModules to all
 * companies currently on this plan. Companies are updated in batches
 * of 400 to stay within Firestore's 500-op batch limit.
 *
 * Early exit: if none of limits, features, or includedModules changed,
 * the function returns immediately without touching any company document.
 */
export const onPlanUpdated = onDocumentUpdated(
  'plans/{planId}',
  async (event) => {
    const before = event.data?.before.data() as Record<string, any> | undefined;
    const after  = event.data?.after.data()  as Record<string, any> | undefined;

    if (!before || !after) {
      console.warn('[onPlanUpdated] Evento sin datos before/after — ignorado.');
      return;
    }

    const { planId } = event.params;

    // ── Early exit: only propagate if relevant fields changed ────────────────
    const limitsChanged    = JSON.stringify(before['limits'])         !== JSON.stringify(after['limits']);
    const featuresChanged  = JSON.stringify(before['features'])       !== JSON.stringify(after['features']);
    // Los planes guardan paquetes (includedPackages), no módulos. Antes se
    // miraba includedModules, que no existe, y editar los paquetes de un plan
    // no llegaba a sus empresas.
    const packagesChanged  = JSON.stringify(before['includedPackages']) !== JSON.stringify(after['includedPackages']);

    if (!limitsChanged && !featuresChanged && !packagesChanged) {
      console.log('[onPlanUpdated] Sin cambios en limits/features/includedPackages — sin propagación.', { planId });
      return;
    }

    console.log('[onPlanUpdated] Cambios detectados, propagando a empresas:', {
      planId,
      limitsChanged,
      featuresChanged,
      packagesChanged,
    });

    const db = admin.firestore();
    const newLimits:   Record<string, any> | null = after['limits']  ?? null;
    const newFeatures: Record<string, any> | null = after['features'] ?? null;
    const planPackages: string[] = Array.isArray(after['includedPackages']) ? after['includedPackages'] : [];
    const catalog = (await db.collection('plugin-packages').get()).docs
      .map(d => d.data() as PackageDef)
      .filter(p => !!p.code);

    // ── Query companies on this plan ─────────────────────────────────────────
    const companiesSnap = await db.collection('companies')
      .where('planId', '==', planId)
      .get();

    if (companiesSnap.empty) {
      console.log('[onPlanUpdated] No hay empresas en este plan — nada que propagar.', { planId });
      return;
    }

    console.log('[onPlanUpdated] Empresas a actualizar:', companiesSnap.size, { planId });

    // ── Propagate in batches of 400 ──────────────────────────────────────────
    const CHUNK = 400;
    const docs = companiesSnap.docs;
    const now  = admin.firestore.Timestamp.now();
    let updatedCount = 0;

    for (let i = 0; i < docs.length; i += CHUNK) {
      const chunk = docs.slice(i, i + CHUNK);
      const batch = db.batch();

      for (const companyDoc of chunk) {
        // Paquetes del plan + add-on de la empresa; módulos desde el catálogo.
        const companyData = companyDoc.data() as Record<string, any>;
        const { enabledPackages, enabledModules } =
          effectivePackages(planPackages, addonCodesOf(companyData), catalog);

        batch.update(companyDoc.ref, {
          planLimits:    newLimits,
          planFeatures:  newFeatures,
          enabledPackages,
          enabledModules,
          updatedAt:     now,
        });
      }

      await batch.commit();
      updatedCount += chunk.length;
      console.log(`[onPlanUpdated] Batch committed — chunk ${Math.floor(i / CHUNK) + 1}, ${chunk.length} empresas actualizadas`);
    }

    console.log('[onPlanUpdated] Propagación completada:', { planId, totalEmpresasActualizadas: updatedCount });
  }
);
