import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * authGuard — blocks unauthenticated users and redirects to /login.
 */
export const authGuard: CanActivateFn = (_, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) return true;

  router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
  return false;
};

/**
 * loginGuard — redirects already-authenticated users away from /login.
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
