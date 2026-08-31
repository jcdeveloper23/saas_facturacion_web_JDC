import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { PermissionsService } from '../services/permissions.service';
import { PermissionString } from '../interfaces/permission.interface';

/**
 * permissionGuard — protege rutas basándose en los permisos del usuario.
 *
 * Espera a que permissionsReady sea true antes de evaluar, lo que evita
 * falsos 403 para roles custom cuya carga de permisos es asíncrona (Firestore).
 *
 * Uso:
 *   canActivate: [permissionGuard],
 *   data: { permissions: ['invoices.view'] }
 *
 * Múltiples permisos (AND por defecto):
 *   data: { permissions: ['invoices.view', 'invoices.create'], permissionMode: 'all' }
 *
 * Múltiples permisos (OR):
 *   data: { permissions: ['invoices.view', 'purchases.view'], permissionMode: 'any' }
 */
export const permissionGuard: CanActivateFn = (route, state) => {
  const authService        = inject(AuthService);
  const permissionsService = inject(PermissionsService);
  const router             = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  const requiredPermissions = route.data?.['permissions'] as PermissionString[] | undefined;
  const permissionMode      = (route.data?.['permissionMode'] as 'all' | 'any') ?? 'all';

  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }

  // Esperar a que los permisos estén listos.
  // Para roles de sistema es inmediato (síncrono).
  // Para roles custom espera el getDoc() de Firestore sin producir falsos 403.
  return toObservable(permissionsService.permissionsReady).pipe(
    filter(ready => ready === true),
    take(1),
    map(() => {
      const hasPermission = permissionMode === 'all'
        ? permissionsService.hasAllPermissions(requiredPermissions)
        : permissionsService.hasAnyPermission(requiredPermissions);

      if (hasPermission) return true;

      console.warn(
        `[PermissionGuard] Acceso denegado a ${state.url}.`,
        `Requerido: ${requiredPermissions.join(', ')}.`,
        `Usuario tiene: ${permissionsService.permissions().join(', ') || 'ninguno'}`
      );
      router.navigate(['/unauthorized']);
      return false;
    })
  );
};

/**
 * moduleGuard — protege rutas basándose en los módulos del plan del tenant.
 * Verifica que el módulo esté habilitado en company.enabledModules.
 * Complementa a permissionGuard: uno verifica el plan de la empresa,
 * el otro los permisos del usuario.
 */
export const moduleGuard: CanActivateFn = (route, state) => {
  const authService        = inject(AuthService);
  const permissionsService = inject(PermissionsService);
  const router             = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  const requiredModule = route.data?.['module'] as string | undefined;

  if (!requiredModule) return true;

  if (permissionsService.canAccessModule(requiredModule)) return true;

  console.warn(`[ModuleGuard] Módulo no habilitado: ${requiredModule}`);
  router.navigate(['/unauthorized']);
  return false;
};

/**
 * permissionMatchGuard — canMatch para módulos lazy-loaded.
 * Impide cargar el bundle si el usuario no tiene el permiso.
 * No necesita esperar permissionsReady porque canMatch se evalúa
 * en cada intento de navegación, no solo en la inicial.
 */
export const permissionMatchGuard: CanMatchFn = (route) => {
  const authService        = inject(AuthService);
  const permissionsService = inject(PermissionsService);

  if (!authService.isAuthenticated()) return false;

  const requiredPermissions = route.data?.['permissions'] as PermissionString[] | undefined;
  const permissionMode      = (route.data?.['permissionMode'] as 'all' | 'any') ?? 'all';

  if (!requiredPermissions || requiredPermissions.length === 0) return true;

  return permissionMode === 'all'
    ? permissionsService.hasAllPermissions(requiredPermissions)
    : permissionsService.hasAnyPermission(requiredPermissions);
};
