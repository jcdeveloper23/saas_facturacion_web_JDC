import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlanLimitsService } from '../services/plan-limits.service';
import { PlanFeatureFlags } from '../../features/super-admin/models/plan.interface';

/**
 * Bloquea el acceso a una ruta si el feature flag del plan está desactivado.
 *
 * Uso en rutas:
 *   canActivate: [featureFlagGuard],
 *   data: { featureFlag: 'stockModule' }
 *
 * El flag se lee síncronamente desde PlanLimitsService (signal),
 * que ya tiene el snapshot del company document via onSnapshot.
 * Si planFeatures aún no cargó (null) se permite el paso para
 * evitar bloqueos en la carga inicial — el onSnapshot lo resolverá.
 *
 * Se aplica siempre DESPUÉS de authGuard y moduleGuard.
 */
export const featureFlagGuard: CanActivateFn = (route) => {
  const svc    = inject(PlanLimitsService);
  const router = inject(Router);
  const flag   = route.data?.['featureFlag'] as keyof PlanFeatureFlags | undefined;

  if (!flag) return true;

  // Si el company doc aún no cargó, dejar pasar (evita bloqueo en arranque)
  const company = svc.companyDoc();
  if (!company?.planFeatures) return true;

  if (svc.isFeatureEnabled(flag)) return true;

  router.navigate(['/dashboard'], { queryParams: { featureBlocked: flag } });
  return false;
};
