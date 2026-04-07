import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { TenantService } from '../services/tenant.service';

/**
 * moduleGuard — blocks access to routes when the company does not have
 * the required module (plugin) active.
 *
 * Equivalent to FacturaScripts index.php routing:
 *   foreach ($GLOBALS['plugins'] as $plugin) { ... }
 *   → if plugin not enabled, controller is not found
 *
 * Usage in routes:
 *   canActivate: [authGuard, moduleGuard]
 *   data: { module: 'pos' }
 *
 * Usage with canMatch (lazy-loaded feature modules):
 *   canMatch: [moduleGuard]
 *   data: { module: 'electronic_invoicing' }
 */
export const moduleGuard: CanActivateFn = (route) => {
  const tenantService = inject(TenantService);
  const router        = inject(Router);

  const moduleCode = route.data?.['module'] as string | undefined;

  // No module restriction declared → allow
  if (!moduleCode) return true;

  // super_admin bypasses module restrictions (manages all companies)
  // TenantService has no companyId for super_admin — treat as allowed
  if (!tenantService.companyId) return true;

  if (tenantService.hasModule(moduleCode)) return true;

  // Module not active → redirect to dashboard
  router.navigate(['/dashboard']);
  return false;
};

/**
 * moduleMatchGuard — canMatch version for lazy-loaded routes.
 * Prevents even loading the feature module bundle if not active.
 */
export const moduleMatchGuard: CanMatchFn = (route) => {
  const tenantService = inject(TenantService);

  const moduleCode = route.data?.['module'] as string | undefined;

  if (!moduleCode)              return true;
  if (!tenantService.companyId) return true;

  return tenantService.hasModule(moduleCode);
};
