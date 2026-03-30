import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { from, switchMap, catchError, throwError } from 'rxjs';

/**
 * authInterceptor — attaches Firebase ID token to outbound HTTP requests.
 * Only applies to Cloud Functions calls (urls containing cloudFunctionsUrl).
 * Firebase SDK handles Firestore auth automatically — no interceptor needed for that.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);

  // Only inject token for Cloud Functions / REST API calls
  const currentUser = auth.currentUser;
  if (!currentUser) return next(req);

  return from(currentUser.getIdToken()).pipe(
    switchMap(token => {
      const authReq = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      });
      return next(authReq);
    }),
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        auth.signOut().then(() => router.navigate(['/login']));
      }
      return throwError(() => error);
    })
  );
};
