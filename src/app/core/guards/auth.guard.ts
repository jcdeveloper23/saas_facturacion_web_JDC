import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Auth Guard - Protects routes requiring authentication
 * Uses Angular 21 functional guard pattern
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // Store intended destination for redirect after login
  router.navigate(['/login'], {
    queryParams: { returnUrl: state.url }
  });
  return false;
};

/**
 * Admin Guard - Protects routes requiring admin role
 */
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  if (authService.isSuperAdmin() || authService.isOrgAdmin()) {
    return true;
  }

  router.navigate(['/monitor']);
  return false;
};

/**
 * Login Guard - Redirects authenticated users away from login page
 */
export const loginGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    router.navigate([authService.getDefaultRoute()]);
    return false;
  }

  return true;
};
