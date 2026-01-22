import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SecureStorageService } from '../services/secure-storage.service';

/**
 * Auth Interceptor - Adds JWT token to requests and handles auth errors
 * Uses Angular 21 functional interceptor pattern
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const secureStorage = inject(SecureStorageService);
  const token = secureStorage.getItem('accessToken');

  // Clone request with auth header if token exists
  const authReq = token
    ? req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Handle 401 Unauthorized - redirect to login
      if (error.status === 401) {
        secureStorage.removeItem('accessToken');
        secureStorage.removeItem('infoUser');
        secureStorage.removeItem('userPermissions');
        router.navigate(['/login']);
      }

      // Handle 403 Forbidden
      if (error.status === 403) {
        console.error('Access forbidden:', error.message);
      }

      return throwError(() => error);
    })
  );
};
