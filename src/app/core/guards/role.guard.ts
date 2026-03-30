import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, UserRole } from '../services/auth.service';

/**
 * roleGuard — restricts access to routes based on UserRole.
 * Usage: canActivate: [authGuard, roleGuard], data: { roles: ['admin', 'seller'] }
 */
export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const allowedRoles = (route.data?.['roles'] as UserRole[]) ?? [];

  if (allowedRoles.length === 0 || authService.hasRole(...allowedRoles)) return true;

  router.navigate(['/dashboard']);
  return false;
};
