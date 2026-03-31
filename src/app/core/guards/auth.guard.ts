import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * authGuard — blocks unauthenticated users and redirects to /login.
 */
export const authGuard: CanActivateFn = (_, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Use observable to wait for initial state if not ready yet
  return toObservable(authService.isReady).pipe(
    filter(ready => ready === true),
    take(1),
    map(() => {
      if (authService.isAuthenticated()) return true;

      // Redirect to login with returnUrl
      router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
      return false;
    })
  );
};

/**
 * loginGuard — redirects already-authenticated users away from /login.
 */
export const loginGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return toObservable(authService.isReady).pipe(
    filter(ready => ready === true),
    take(1),
    map(() => {
      if (authService.isAuthenticated()) {
        router.navigate([authService.getDefaultRoute()]);
        return false;
      }
      return true;
    })
  );
};
