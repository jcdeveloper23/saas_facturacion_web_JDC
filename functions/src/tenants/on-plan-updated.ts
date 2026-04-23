import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

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
    const modulesChanged   = JSON.stringify(before['includedModules']) !== JSON.stringify(after['includedModules']);

    if (!limitsChanged && !featuresChanged && !modulesChanged) {
      console.log('[onPlanUpdated] Sin cambios en limits/features/includedModules — sin propagación.', { planId });
      return;
    }

    console.log('[onPlanUpdated] Cambios detectados, propagando a empresas:', {
      planId,
      limitsChanged,
      featuresChanged,
      modulesChanged,
    });

    const db = admin.firestore();
    const newLimits:   Record<string, any> | null = after['limits']  ?? null;
    const newFeatures: Record<string, any> | null = after['features'] ?? null;
    const newModules:  string[] = Array.isArray(after['includedModules']) ? after['includedModules'] : [];

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
        // Recalculate enabledModules for this company:
        // union of new plan modules + modules from company's enabledPackages
        const companyData     = companyDoc.data() as Record<string, any>;
        const enabledPackages: string[] = Array.isArray(companyData['enabledPackages']) ? companyData['enabledPackages'] : [];
        const enabledModules: string[] = Array.from(new Set([...newModules, ...enabledPackages]));

        batch.update(companyDoc.ref, {
          planLimits:    newLimits,
          planFeatures:  newFeatures,
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
