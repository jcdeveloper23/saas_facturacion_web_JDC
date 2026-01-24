import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { PermissionsService } from '../services/permissions.service';
import { PermissionString, PermissionModule } from '../interfaces/permission.interface';

/**
 * Permission Guard - Protects routes based on required permissions
 *
 * Usage in routes:
 * {
 *   path: 'devices',
 *   component: DevicesComponent,
 *   canActivate: [permissionGuard],
 *   data: { permissions: ['devices.view'] }
 * }
 *
 * For multiple permissions (AND):
 * data: { permissions: ['devices.view', 'devices.create'], permissionMode: 'all' }
 *
 * For multiple permissions (OR):
 * data: { permissions: ['devices.view', 'devices.manage'], permissionMode: 'any' }
 */
export const permissionGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const permissionsService = inject(PermissionsService);
  const router = inject(Router);

  console.log('[PermissionGuard] Checking access to:', state.url);

  // First check if authenticated
  if (!authService.isAuthenticated()) {
    console.log('[PermissionGuard] Not authenticated, redirecting to login');
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  // Get required permissions from route data
  const requiredPermissions = route.data?.['permissions'] as PermissionString[] | undefined;
  const permissionMode = (route.data?.['permissionMode'] as 'all' | 'any') || 'all';

  // If no permissions required, allow access
  if (!requiredPermissions || requiredPermissions.length === 0) {
    console.log('[PermissionGuard] No permissions required, access granted');
    return true;
  }

  // Check permissions
  const userPermissions = permissionsService.permissions();
  const hasPermission = permissionMode === 'all'
    ? permissionsService.hasAllPermissions(requiredPermissions)
    : permissionsService.hasAnyPermission(requiredPermissions);

  console.log('[PermissionGuard] Check:', {
    required: requiredPermissions,
    userHas: userPermissions.length,
    hasPermission
  });

  if (hasPermission) {
    return true;
  }

  // Redirect to unauthorized page or home
  console.warn(`[PermissionGuard] Access denied to ${state.url}. Required: ${requiredPermissions.join(', ')}. User has: ${userPermissions.join(', ') || 'none'}`);
  router.navigate(['/unauthorized']);
  return false;
};

/**
 * Module Access Guard - Protects routes based on module access
 *
 * Usage:
 * {
 *   path: 'devices',
 *   canActivate: [moduleGuard],
 *   data: { module: 'devices' }
 * }
 */
export const moduleGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const permissionsService = inject(PermissionsService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  const requiredModule = route.data?.['module'] as PermissionModule | undefined;

  if (!requiredModule) {
    return true;
  }

  if (permissionsService.canAccessModule(requiredModule)) {
    return true;
  }

  console.warn(`Access denied to module: ${requiredModule}`);
  router.navigate(['/unauthorized']);
  return false;
};

/**
 * Can Match Guard - For lazy loaded modules
 * Prevents loading the module if user doesn't have permission
 */
export const permissionMatchGuard: CanMatchFn = (route, segments) => {
  const authService = inject(AuthService);
  const permissionsService = inject(PermissionsService);

  if (!authService.isAuthenticated()) {
    return false;
  }

  const requiredPermissions = route.data?.['permissions'] as PermissionString[] | undefined;
  const permissionMode = (route.data?.['permissionMode'] as 'all' | 'any') || 'all';

  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }

  return permissionMode === 'all'
    ? permissionsService.hasAllPermissions(requiredPermissions)
    : permissionsService.hasAnyPermission(requiredPermissions);
};
