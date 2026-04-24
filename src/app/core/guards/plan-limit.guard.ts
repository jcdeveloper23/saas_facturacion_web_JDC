import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlanLimitsService, LimitedResource } from '../services/plan-limits.service';

export const planLimitGuard: CanActivateFn = (route) => {
  const svc = inject(PlanLimitsService);
  const router = inject(Router);
  const resource = route.data?.['limitResource'] as LimitedResource | undefined;
  if (!resource) return true;
  if (svc.canCreate(resource)) return true;
  router.navigate(['/settings/subscription']);
  return false;
};
