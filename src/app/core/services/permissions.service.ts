import { Injectable, inject, computed, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthService, UserRole } from './auth.service';
import { RolesService } from './roles.service';
import { PermissionsCatalogService } from './permissions-catalog.service';
import { TenantService } from './tenant.service';
import {
  Role, Permission, PermissionString,
  MODULE_METADATA,
} from '../interfaces/permission.interface';

// ─── Types ───────────────────────────────────────────────────────────────────

type CrudAction = 'read' | 'create' | 'update' | 'delete';
type ModulePermissions = Partial<Record<CrudAction, boolean>>;

// ─── Role matrix ─────────────────────────────────────────────────────────────
// Source of truth for runtime permission checks until the Firestore RBAC catalog
// is fully seeded and connected (Phase 5).

const ROLE_MATRIX: Record<UserRole, Record<string, ModulePermissions>> = {
  super_admin: {
    companies:       { read: true, create: true, update: true, delete: true },
    plans:           { read: true, create: true, update: true, delete: true },
    users:           { read: true, create: true, update: true, delete: true },
    settings:        { read: true, create: true, update: true, delete: true },
    team_management: { read: true, create: true, update: true, delete: true },
  },
  admin: {
    customers:       { read: true, create: true, update: true, delete: true },
    suppliers:       { read: true, create: true, update: true, delete: true },
    products:        { read: true, create: true, update: true, delete: true },
    invoices:        { read: true, create: true, update: true, delete: true },
    quotes:          { read: true, create: true, update: true, delete: true },
    orders:          { read: true, create: true, update: true, delete: true },
    purchases:       { read: true, create: true, update: true, delete: true },
    stock:           { read: true, create: true, update: true, delete: true },
    pos:             { read: true, create: true, update: true, delete: true },
    sri:             { read: true, create: true, update: true, delete: true },
    personas:        { read: true, create: true, update: true, delete: true },
    settings:        { read: true, create: true, update: true, delete: true },
    users:           { read: true, create: true, update: true, delete: true },
    team_management: { read: true, create: true, update: true, delete: true },
  },
  seller: {
    customers:       { read: true, create: true, update: true },
    suppliers:       { read: true, create: true, update: true },
    products:        { read: true, create: true, update: true },
    invoices:        { read: true, create: true, update: true },
    quotes:          { read: true, create: true, update: true },
    orders:          { read: true, create: true, update: true },
    purchases:       { read: true, create: true, update: true },
    stock:           { read: true, create: true, update: true },
    personas:        { read: true, create: true, update: true },
    settings:        { read: true },
    sri:             { read: true },
    team_management: { read: true, create: true, update: true },
  },
  cashier: {
    customers:       { read: true },
    products:        { read: true },
    invoices:        { read: true, create: true },
    pos:             { read: true, create: true },
    stock:           { read: true },
    settings:        { read: true },
    team_management: { read: true },
  },
  read_only: {
    customers:       { read: true },
    suppliers:       { read: true },
    products:        { read: true },
    invoices:        { read: true },
    quotes:          { read: true },
    orders:          { read: true },
    purchases:       { read: true },
    stock:           { read: true },
    pos:             { read: true },
    settings:        { read: true },
    sri:             { read: true },
    team_management: { read: true },
  },
  // DECISIÓN-01: accountant es un rol real con acceso contable y fiscal.
  // Puede crear/editar documentos fiscales (retenciones, notas de débito,
  // compras) y leer contabilidad. No puede borrar ni acceder a configuración.
  accountant: {
    purchases:       { read: true, create: true, update: true, delete: true },
    retentions:      { read: true, create: true, update: true, delete: true },
    debit_notes:     { read: true, create: true, update: true, delete: true },
    accounting:      { read: true, create: true, update: true },
    invoices:        { read: true },
    customers:       { read: true },
    suppliers:       { read: true },
    products:        { read: true },
    sri:             { read: true },
    settings:        { read: true },
  },
};

// Level by role — used to filter assignable roles.
// Lower = more privilege. super_admin(0) can assign everyone.
export const ROLE_LEVEL: Record<UserRole, number> = {
  super_admin: 0,
  admin:       1,
  accountant:  2,
  seller:      2,
  cashier:     3,
  read_only:   4,
};

// Standard action labels for static permission generation.
const STATIC_ACTIONS: { code: string; label: string }[] = [
  { code: 'view',   label: 'Ver'      },
  { code: 'create', label: 'Crear'    },
  { code: 'edit',   label: 'Editar'   },
  { code: 'delete', label: 'Eliminar' },
];

/**
 * PermissionsService — runtime permission checks + delegation to RolesService.
 *
 * Responsibilities:
 *   1. Runtime checks: can(), canRead(), canCreate(), canUpdate(), canDelete()
 *   2. Roles CRUD delegation → RolesService (REST API)
 *   3. Permissions catalog delegation → PermissionsCatalogService (Firestore)
 *   4. Synchronous static fallback when catalog is not yet seeded
 *
 * Source of truth for auth: AuthService.user().role (Firebase custom claims).
 */
// Módulos de plataforma (super_admin): no están sujetos al plan del tenant.
// Todos los demás son módulos de empresa y requieren que TenantService los tenga habilitados.
const PLATFORM_MODULES = new Set<string>([
  'companies', 'plans', 'users', 'settings', 'team_management',
]);

// Mapeo snake_case (ROLE_MATRIX) → camelCase (TenantService.hasModule / enabledModules).
// Solo es necesario para los módulos donde los dos sistemas usan nombres distintos.
const SNAKE_TO_CAMEL_MODULE: Record<string, string> = {
  debit_notes:     'debitNotes',
  team_management: 'teamManagement',
  // El resto de módulos tienen el mismo código en ambos sistemas.
};

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private authService = inject(AuthService);
  private rolesSvc    = inject(RolesService);
  private catalogSvc  = inject(PermissionsCatalogService);
  private tenantSvc   = inject(TenantService);

  readonly role = computed(() => this.authService.user()?.role ?? null);

  // Cache de permisos cargados del catálogo Firestore.
  private _cachedPermissions = signal<Permission[]>([]);

  // Mapeo CRUD action → permission code
  private readonly _crudToCode: Record<string, string> = {
    read: 'view', create: 'create', update: 'edit', delete: 'delete'
  };

  /**
   * Signal reactivo con los permission strings efectivos del usuario actual.
   * Derivado del ROLE_MATRIX. Permite que HasPermissionDirective reaccione
   * a cambios de sesión usando effect().
   */
  readonly permissions = computed<PermissionString[]>(() => {
    const role = this.role();
    if (!role) return [];
    const matrix = ROLE_MATRIX[role] ?? {};
    const perms: PermissionString[] = [];
    for (const [module, actions] of Object.entries(matrix)) {
      for (const [action, allowed] of Object.entries(actions)) {
        if (allowed) {
          perms.push(`${module}.${this._crudToCode[action] ?? action}`);
        }
      }
    }
    return perms;
  });

  hasAllPermissions(required: PermissionString[]): boolean {
    const userPerms = this.permissions();
    return required.every(p => userPerms.includes(p));
  }

  hasAnyPermission(required: PermissionString[]): boolean {
    const userPerms = this.permissions();
    return required.some(p => userPerms.includes(p));
  }

  // ── Runtime checks ────────────────────────────────────────────────────────

  /**
   * DECISIÓN-03: can() verifica en dos pasos:
   *   1. La matriz de roles le concede la acción al rol actual.
   *   2. Si el módulo es de empresa (no de plataforma), TenantService confirma
   *      que el módulo está habilitado en el plan del tenant.
   *
   * Casos especiales:
   *   - super_admin: nunca tiene companyId, opera sobre módulos de plataforma;
   *     PLATFORM_MODULES se excluyen de la verificación del tenant.
   *   - Durante startup (company aún null): módulos de empresa devuelven false
   *     para evitar acceso antes de que el plan se haya cargado.
   *
   * TenantService.hasModule() usa camelCase para los módulos de empresa
   * (e.g. 'debitNotes', 'teamManagement'). El ROLE_MATRIX usa snake_case
   * (e.g. 'debit_notes', 'team_management').
   * Normalizamos con SNAKE_TO_CAMEL_MODULE para que coincidan.
   */
  can(module: string, action: CrudAction): boolean {
    const role = this.role();
    if (!role) return false;

    // Paso 1: verificar la matriz de roles.
    const allowed = ROLE_MATRIX[role]?.[module]?.[action] ?? false;
    if (!allowed) return false;

    // Paso 2: si es módulo de plataforma, no requiere verificación del tenant.
    if (PLATFORM_MODULES.has(module)) return true;

    // Paso 3: verificar que el módulo esté habilitado en el plan del tenant.
    // TenantService puede usar camelCase; normalizamos antes de consultar.
    const moduleKey = SNAKE_TO_CAMEL_MODULE[module] ?? module;
    return this.tenantSvc.hasModule(moduleKey);
  }

  canRead(module: string):   boolean { return this.can(module, 'read');   }
  canCreate(module: string): boolean { return this.can(module, 'create'); }
  canUpdate(module: string): boolean { return this.can(module, 'update'); }
  canDelete(module: string): boolean { return this.can(module, 'delete'); }

  canAccessModule(module: string): boolean { return this.canRead(module); }

  // ── Roles CRUD (delegates to RolesService) ────────────────────────────────

  getRoles(): Observable<Role[]> {
    return this.rolesSvc.getRoles();
  }

  /**
   * Roles asignables por el usuario actual, filtrados en Firestore.
   * Usa where('level', '>', currentUserLevel) — sin cargar toda la colección.
   */
  getAssignableRolesQuery(): Observable<Role[]> {
    const role = this.role() as UserRole | null;
    const level = role ? (ROLE_LEVEL[role] ?? 99) : 99;
    return this.rolesSvc.getRolesAssignableTo(level);
  }

  createRole(data: Partial<Role>): Observable<Role> {
    return this.rolesSvc.createRole(data);
  }

  updateRole(id: string | number, data: Partial<Role>): Observable<Role> {
    return this.rolesSvc.updateRole(id, data);
  }

  deleteRole(id: string | number): Observable<Role> {
    return this.rolesSvc.deleteRole(id);
  }

  /**
   * Devuelve los roles que el usuario autenticado puede asignar a otros usuarios.
   * Se pasa la lista completa de roles para evitar una segunda llamada al API.
   */
  getAssignableRoles(allRoles: Role[]): Role[] {
    const currentRole  = this.role() as UserRole | null;
    const currentLevel = currentRole ? (ROLE_LEVEL[currentRole] ?? 99) : 99;
    return this.rolesSvc.getAssignableRoles(allRoles, currentLevel);
  }

  // ── Permissions catalog ───────────────────────────────────────────────────

  /**
   * Carga el catálogo de permisos desde Firestore y lo cachea.
   * Usar en ngOnInit de componentes de administración.
   */
  getPermissionsCatalog(): Observable<Permission[]> {
    return this.catalogSvc.getPermissionsCatalog().pipe(
      tap(perms => this._cachedPermissions.set(perms)),
    );
  }

  /**
   * Snapshot sincrónico del catálogo.
   * Devuelve el caché si está cargado; si no, genera un catálogo estático
   * basado en MODULE_METADATA × acciones estándar como fallback.
   */
  getAllPermissions(): Permission[] {
    const cached = this._cachedPermissions();
    return cached.length > 0 ? cached : this._buildStaticPermissions();
  }

  /**
   * Permisos agrupados por módulo para mostrar en la UI de perfiles.
   * Usa el catálogo cargado si existe; si no, el catálogo estático.
   */
  getPermissionsGrouped(): { module: string; moduleName: string; moduleIcon: string; permissions: Permission[] }[] {
    const perms = this.getAllPermissions();
    const meta  = MODULE_METADATA;

    const grouped = new Map<string, Permission[]>();
    for (const p of perms) {
      const mod = p.module_id;
      grouped.set(mod, [...(grouped.get(mod) ?? []), p]);
    }

    return Array.from(grouped.entries())
      .map(([mod, ps]) => ({
        module:      mod,
        moduleName:  meta[mod]?.name ?? mod,
        moduleIcon:  meta[mod]?.icon ?? 'cilSettings',
        permissions: ps,
      }))
      .sort((a, b) => (meta[a.module]?.order ?? 99) - (meta[b.module]?.order ?? 99));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Genera permisos estáticos MODULE × ACCIÓN cuando el catálogo Firestore
   * aún no tiene datos. Evita que la UI quede vacía en entornos frescos.
   */
  private _buildStaticPermissions(): Permission[] {
    const perms: Permission[] = [];
    for (const [modCode, meta] of Object.entries(MODULE_METADATA)) {
      for (const action of STATIC_ACTIONS) {
        perms.push({
          id:        `${modCode}.${action.code}`,
          module_id: modCode,
          action_id: action.code,
          code:      `${modCode}.${action.code}`,
          name:      `${action.label} ${meta.name}`,
          isSystem:  true,
          state:     true,
        });
      }
    }
    return perms;
  }
}
