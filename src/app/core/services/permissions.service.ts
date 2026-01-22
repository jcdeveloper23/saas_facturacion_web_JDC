import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap, of, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Permission,
  PermissionInput,
  PermissionString,
  PermissionModule,
  PermissionAction,
  PermissionGroup,
  Role,
  RoleWithPermissions,
  PermissionCheckResult,
  BulkPermissionCheck,
  PERMISSIONS_CATALOG,
  SYSTEM_ROLES,
  MODULE_METADATA
} from '../interfaces/permission.interface';

/**
 * Permissions Service
 * Core service for RBAC permission management
 */
@Injectable({
  providedIn: 'root'
})
export class PermissionsService {
  private http = inject(HttpClient);
  private readonly apiUrl = environment.apiGpsUrl;

  // Current user's permissions (loaded after login)
  private userPermissions = signal<PermissionString[]>([]);
  private userRole = signal<Role | null>(null);
  private isSuperAdmin = signal<boolean>(false);

  // Computed values
  readonly permissions = computed(() => this.userPermissions());
  readonly role = computed(() => this.userRole());
  readonly isAdmin = computed(() => this.isSuperAdmin());

  // ============================================================================
  // PERMISSION LOADING
  // ============================================================================

  /**
   * Load user permissions after login
   * Called by AuthService after successful authentication
   */
  loadUserPermissions(userId: number): Observable<PermissionString[]> {
    return this.http.get<{ role: Role; permissions: PermissionString[] }>(
      `${this.apiUrl}/users/${userId}/permissions`
    ).pipe(
      tap(response => {
        this.userRole.set(response.role);
        this.userPermissions.set(response.permissions);
        this.isSuperAdmin.set(response.role?.code === 'super_admin');
      }),
      map(response => response.permissions),
      catchError(error => {
        console.error('Error loading permissions:', error);
        // Fallback to empty permissions
        this.userPermissions.set([]);
        this.userRole.set(null);
        return of([]);
      })
    );
  }

  /**
   * Set permissions directly (useful for local/mock data)
   */
  setPermissions(permissions: PermissionString[], role?: Role): void {
    this.userPermissions.set(permissions);
    if (role) {
      this.userRole.set(role);
      this.isSuperAdmin.set(role.code === 'super_admin');
    }
  }

  /**
   * Clear permissions (on logout)
   */
  clearPermissions(): void {
    this.userPermissions.set([]);
    this.userRole.set(null);
    this.isSuperAdmin.set(false);
  }

  // ============================================================================
  // PERMISSION CHECKS
  // ============================================================================

  /**
   * Check if user has a specific permission
   */
  hasPermission(permission: PermissionString): boolean {
    // Super admins have all permissions
    if (this.isSuperAdmin()) return true;

    const userPerms = this.userPermissions();

    // Check for exact permission
    if (userPerms.includes(permission)) return true;

    // Check for 'manage' permission (includes all actions for that module)
    const [module] = permission.split('.') as [PermissionModule, PermissionAction];
    const managePermission = `${module}.manage` as PermissionString;
    if (userPerms.includes(managePermission)) return true;

    return false;
  }

  /**
   * Check if user has all specified permissions
   */
  hasAllPermissions(permissions: PermissionString[]): boolean {
    return permissions.every(p => this.hasPermission(p));
  }

  /**
   * Check if user has any of the specified permissions
   */
  hasAnyPermission(permissions: PermissionString[]): boolean {
    return permissions.some(p => this.hasPermission(p));
  }

  /**
   * Bulk permission check with mode
   */
  checkPermissions(check: BulkPermissionCheck): PermissionCheckResult {
    const hasRequired = check.mode === 'all'
      ? this.hasAllPermissions(check.permissions)
      : this.hasAnyPermission(check.permissions);

    if (hasRequired) {
      return { allowed: true };
    }

    const missing = check.permissions.filter(p => !this.hasPermission(p));
    return {
      allowed: false,
      reason: `Missing permissions: ${missing.join(', ')}`,
      missingPermissions: missing
    };
  }

  /**
   * Check if user can access a module (any permission in module)
   */
  canAccessModule(module: PermissionModule): boolean {
    if (this.isSuperAdmin()) return true;

    const userPerms = this.userPermissions();
    return userPerms.some(p => p.startsWith(`${module}.`));
  }

  /**
   * Get all modules user can access
   */
  getAccessibleModules(): PermissionModule[] {
    if (this.isSuperAdmin()) {
      return Object.keys(MODULE_METADATA) as PermissionModule[];
    }

    const userPerms = this.userPermissions();
    const modules = new Set<PermissionModule>();

    userPerms.forEach(p => {
      const [module] = p.split('.') as [PermissionModule, PermissionAction];
      modules.add(module);
    });

    return Array.from(modules);
  }

  // ============================================================================
  // PERMISSION CATALOG
  // ============================================================================

  /**
   * Get all available permissions
   * @deprecated Use getPermissionsCatalog() instead - loads from DB
   */
  getAllPermissions(): Permission[] {
    return PERMISSIONS_CATALOG;
  }

  /**
   * Get permissions grouped by module
   * @deprecated Use getPermissionsCatalog() and group in component instead
   */
  getPermissionsGrouped(): PermissionGroup[] {
    const grouped = new Map<string, Permission[]>();

    PERMISSIONS_CATALOG.forEach(p => {
      // Extract module code from permission code (e.g., "users.view" -> "users")
      const moduleCode = p.code.split('.')[0];
      const existing = grouped.get(moduleCode) || [];
      existing.push(p);
      grouped.set(moduleCode, existing);
    });

    return Array.from(grouped.entries())
      .map(([moduleCode, permissions]) => ({
        module: moduleCode,
        moduleName: MODULE_METADATA[moduleCode]?.name || moduleCode,
        moduleIcon: MODULE_METADATA[moduleCode]?.icon,
        permissions
      }))
      .sort((a, b) => {
        const moduleA = a.module as string;
        const moduleB = b.module as string;
        return (MODULE_METADATA[moduleA]?.order || 99) - (MODULE_METADATA[moduleB]?.order || 99);
      });
  }

  /**
   * Get permissions for a specific module
   * @deprecated Use getPermissionsCatalog() and filter in component instead
   */
  getModulePermissions(module: PermissionModule): Permission[] {
    return PERMISSIONS_CATALOG.filter(p => p.code.startsWith(`${module}.`));
  }

  /**
   * Fetch all available permissions from the backend
   * This provides the real DB IDs needed for role creation
   */
  getPermissionsCatalog(): Observable<Permission[]> {
    return this.http.get<{ data: Permission[] } | Permission[]>(`${this.apiUrl}/permissions`).pipe(
      map(response => {
        if (Array.isArray(response)) {
          return response;
        }
        return response.data || [];
      }),
      catchError(() => {
        console.warn('Failed to load permissions from API, using static catalog');
        return of(PERMISSIONS_CATALOG);
      })
    );
  }

  /**
   * Create a new permission
   */
  createPermission(permission: PermissionInput): Observable<Permission> {
    return this.http.post<Permission>(`${this.apiUrl}/permissions`, permission);
  }

  /**
   * Update a permission
   */
  updatePermission(id: number, permission: Partial<Permission>): Observable<Permission> {
    return this.http.patch<Permission>(`${this.apiUrl}/permissions/${id}`, permission);
  }

  /**
   * Delete a permission
   */
  deletePermission(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/permissions/${id}`);
  }

  // ============================================================================
  // ROLES MANAGEMENT
  // ============================================================================

  /**
   * Get system roles
   */
  getSystemRoles(): Role[] {
    return SYSTEM_ROLES as Role[];
  }

  /**
   * Get all roles (system + custom for organization)
   */
  getRoles(organizationId?: number): Observable<Role[]> {
    const params: Record<string, string> = {};
    if (organizationId) {
      params['organizationId'] = organizationId.toString();
    }
    return this.http.get<Role[] | { data: Role[] }>(`${this.apiUrl}/roles`, { params }).pipe(
      map(response => {
        if (Array.isArray(response)) {
          return response;
        }
        return response.data || [];
      }),
      catchError(() => {
        // Fallback to system roles if API fails
        return of(SYSTEM_ROLES as Role[]);
      })
    );
  }

  /**
   * Get role by ID
   */
  getRole(roleId: number): Observable<Role> {
    return this.http.get<Role>(`${this.apiUrl}/roles/${roleId}`);
  }

  /**
   * Create a custom role
   */
  createRole(role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>): Observable<Role> {
    return this.http.post<Role>(`${this.apiUrl}/roles`, {
      ...role,
      type: 'custom'
    });
  }

  /**
   * Update a role
   */
  updateRole(roleId: number, data: Partial<Role>): Observable<Role> {
    return this.http.patch<Role>(`${this.apiUrl}/roles/${roleId}`, data);
  }

  /**
   * Delete a custom role
   */
  deleteRole(roleId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/roles/${roleId}`);
  }

  /**
   * Assign role to user
   */
  assignRoleToUser(userId: number, roleId: number): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/users/${userId}/role`, { roleId });
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Check if current user can manage another user based on role hierarchy
   */
  canManageUserWithRole(targetRoleLevel: number): boolean {
    const currentRole = this.userRole();
    if (!currentRole) return false;
    if (this.isSuperAdmin()) return true;

    // Can only manage users with higher level number (less privileged)
    return currentRole.level < targetRoleLevel;
  }

  /**
   * Get available roles that current user can assign
   * (can only assign roles with higher level number)
   */
  getAssignableRoles(allRoles: Role[]): Role[] {
    const currentRole = this.userRole();
    if (!currentRole) return [];

    if (this.isSuperAdmin()) {
      return allRoles.filter(r => r.code !== 'super_admin'); // Can't create other super admins
    }

    return allRoles.filter(r => r.level > currentRole.level);
  }

  /**
   * Get permission description
   */
  getPermissionDescription(code: PermissionString): string {
    const perm = PERMISSIONS_CATALOG.find(p => p.code === code);
    return perm?.description || perm?.name || code;
  }
}
