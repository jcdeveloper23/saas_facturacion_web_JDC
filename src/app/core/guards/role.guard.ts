import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService, UserRole } from '../services/auth.service';

/**
 * roleGuard — restricts access to routes based on UserRole.
 * Usage: canActivate: [authGuard, roleGuard], data: { roles: ['admin', 'seller'] }
 */
export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const allowedRoles = (route.data?.['roles'] as UserRole[]) ?? [];

  return toObservable(authService.isReady).pipe(
    filter(ready => ready === true),
    take(1),
    map(() => {
      if (allowedRoles.length === 0 || authService.hasRole(...allowedRoles)) return true;

      // Unauthenticated users are handled by authGuard, or they default back to /dashboard
      router.navigate(['/dashboard']);
      return false;
    })
  );
};
