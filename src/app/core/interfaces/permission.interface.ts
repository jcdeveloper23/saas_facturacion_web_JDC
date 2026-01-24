/**
 * Permission System Interfaces
 * RBAC (Role-Based Access Control) for SaaS Multi-Tenant
 * Now with dynamic modules and actions from DB
 */

// ============================================================================
// MODULES (Dynamic from DB)
// ============================================================================

/**
 * Module entity from database
 * Supports navigation menu structure
 */
export interface Module {
  id: number;
  code: string;
  name: string;
  description?: string;
  // Navigation properties
  url?: string;           // Route URL, e.g., '/users', '/devices'
  icon: string;           // CoreUI icon name
  // Menu structure - Backend returns 0/1 as numbers
  isTitle: boolean | number;       // True/1 for section headers
  parent_id?: number | null; // Parent module ID for nested menus
  children?: Module[];    // Child modules (populated by backend)
  // Badge (optional)
  badgeText?: string;     // e.g., 'LIVE', 'NEW'
  badgeColor?: string;    // e.g., 'success', 'danger'
  // Visibility - Backend returns 0/1 as numbers
  showInMenu: boolean | number;    // Whether to show in navigation menu
  // Order and state - Backend returns 0/1 as numbers
  order: number;
  state: boolean | number;
  createdAt?: string;
  updatedAt?: string;
  // UI hierarchy display (added by flattenModules)
  _level?: number;        // 0 = root, 1 = child, 2 = grandchild, etc.
  _parentName?: string | null;  // Parent module name for display
}

/**
 * Data for creating/updating a module
 */
export interface ModuleInput {
  code: string;
  name: string;
  description?: string;
  url?: string;
  icon?: string;
  isTitle?: boolean;
  parent_id?: number | null;
  badgeText?: string;
  badgeColor?: string;
  showInMenu?: boolean;
  order?: number;
  state?: boolean;
}

// ============================================================================
// ACTIONS (Dynamic from DB)
// ============================================================================

/**
 * Action entity from database
 */
export interface Action {
  id: number;
  code: string;
  name: string;
  description?: string;
  state: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Data for creating/updating an action
 */
export interface ActionInput {
  code: string;
  name: string;
  description?: string;
  state?: boolean;
}

// ============================================================================
// PERMISSIONS
// ============================================================================

/**
 * Permission string format: "module.action"
 * Examples: "devices.view", "users.create", "alerts.manage"
 */
export type PermissionString = string;

/**
 * Permission definition with relations
 */
export interface Permission {
  id?: number;
  module_id: number;
  action_id: number;
  code: string;
  name: string;
  description?: string;
  isSystem: boolean;
  state: boolean;
  // Relations from backend
  module?: Module;
  action?: Action;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Data for creating/updating a permission
 */
export interface PermissionInput {
  module_id: number;
  action_id: number;
  name: string;
  description?: string;
  isSystem?: boolean;
  state?: boolean;
}

/**
 * Grouped permissions by module for UI display
 */
export interface PermissionGroup {
  module: Module | string;
  moduleName: string;
  moduleIcon?: string;
  permissions: Permission[];
}

// ============================================================================
// ROLES / PROFILES
// ============================================================================

/**
 * Role type
 */
export type RoleType = 'system' | 'custom';

/**
 * System role codes (predefined, cannot be deleted)
 */
export type SystemRoleCode =
  | 'super_admin'
  | 'org_admin'
  | 'org_manager'
  | 'operator'
  | 'viewer'
  | 'driver';

/**
 * Role/Profile definition
 */
export interface Role {
  id?: number;
  code: string;
  name: string;
  description?: string;
  type: RoleType;
  permissions: PermissionString[];
  organizationId?: number | null;
  level: number;
  color?: string;
  icon?: string;
  isDefault?: boolean;
  state: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Role with full permission objects (for editing)
 */
export interface RoleWithPermissions extends Omit<Role, 'permissions'> {
  permissions: Permission[];
}

// ============================================================================
// USER-ROLE ASSIGNMENT
// ============================================================================

export interface UserRole {
  userId: number;
  roleId: number;
  organizationId: number;
  assignedAt: string;
  assignedBy?: number;
}

export interface UserWithPermissions {
  id: number;
  userEmail: string;
  userFullName?: string;
  organizationId: number;
  organizationName?: string;
  role: Role;
  effectivePermissions: PermissionString[];
}

// ============================================================================
// PERMISSION CHECKS
// ============================================================================

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  missingPermissions?: PermissionString[];
}

export interface BulkPermissionCheck {
  permissions: PermissionString[];
  mode: 'all' | 'any';
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  skip: number;
}

// ============================================================================
// LEGACY SUPPORT - Keep for backward compatibility during migration
// ============================================================================

/** @deprecated Use Module interface instead */
export type PermissionModule = string;

/** @deprecated Use Action interface instead */
export type PermissionAction = string;

/** @deprecated Modules are now loaded from DB */
export const MODULE_METADATA: Record<string, { name: string; icon: string; order: number }> = {
  dashboard: { name: 'Dashboard', icon: 'cil-speedometer', order: 1 },
  monitor: { name: 'Monitor GPS', icon: 'cil-location-pin', order: 2 },
  devices: { name: 'Dispositivos', icon: 'cil-mobile', order: 3 },
  geofences: { name: 'Geocercas', icon: 'cil-map', order: 4 },
  alerts: { name: 'Alertas', icon: 'cil-bell', order: 5 },
  routes: { name: 'Rutas', icon: 'cil-compass', order: 6 },
  reports: { name: 'Reportes', icon: 'cil-chart-pie', order: 7 },
  users: { name: 'Usuarios', icon: 'cil-people', order: 8 },
  profiles: { name: 'Perfiles', icon: 'cil-badge', order: 9 },
  permissions: { name: 'Permisos', icon: 'cil-lock-locked', order: 10 },
  organizations: { name: 'Organizaciones', icon: 'cil-building', order: 11 },
  settings: { name: 'Configuración', icon: 'cil-settings', order: 12 },
  billing: { name: 'Facturación', icon: 'cil-credit-card', order: 13 }
};

/** @deprecated Permissions are now loaded from DB */
export const PERMISSIONS_CATALOG: Permission[] = [];

/** @deprecated Roles are now loaded from DB */
export const SYSTEM_ROLES: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>[] = [];
