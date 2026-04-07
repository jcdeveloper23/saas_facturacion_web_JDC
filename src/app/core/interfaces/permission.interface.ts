/**
 * Permission System Interfaces
 * RBAC (Role-Based Access Control) for SaaS Multi-Tenant
 *
 * Plugin architecture: modules, actions and permissions are stored in Firestore
 * root collections (/modules, /actions, /permissions) — managed by super_admin.
 * Each company activates modules via company.enabledModules (see TenantService).
 */

// ============================================================================
// MODULES — Platform plugin catalog (/modules root collection)
// ============================================================================

/**
 * Module entity stored in Firestore /modules/{id}
 * Equivalent to FacturaScripts fs_pages table.
 * Supports navigation menu structure and plugin dependency resolution.
 */
export interface Module {
  id: string;                       // Firestore doc ID (same as code for traceability)
  code: string;                     // Unique slug: 'customers', 'invoices', 'pos'
  name: string;                     // Display name: 'Clientes', 'Facturas'
  description?: string;
  // Plugin dependency — codes of modules that must be active first
  dependencies: string[];           // e.g. ['products', 'customers'] for invoices
  // Navigation properties
  url?: string;                     // Route: '/customers', '/invoices'
  icon: string;                     // CoreUI icon: 'cil-people'
  // Menu structure
  isTitle: boolean;                 // True = section separator (no URL)
  parent_id?: string | null;        // Parent module ID for nested menus
  children?: Module[];              // Populated at runtime by flattenModules
  // Badge (optional)
  badgeText?: string;               // 'NEW', 'LIVE'
  badgeColor?: string;              // CoreUI color: 'success', 'danger'
  // Visibility & state
  showInMenu: boolean;              // Show in sidebar navigation
  order: number;                    // Sort order within section
  state: boolean;                   // Enabled in the platform catalog
  createdAt?: any;
  updatedAt?: any;
  // UI hierarchy display (added by flattenModules — not persisted)
  _level?: number;                  // 0 = root, 1 = child
  _parentName?: string | null;
}

/**
 * Data for creating/updating a module
 */
export interface ModuleInput {
  code: string;
  name: string;
  description?: string;
  dependencies?: string[];
  url?: string;
  icon?: string;
  isTitle?: boolean;
  parent_id?: string | null;
  badgeText?: string;
  badgeColor?: string;
  showInMenu?: boolean;
  order?: number;
  state?: boolean;
}

// ============================================================================
// ACTIONS — Verb catalog (/actions root collection)
// ============================================================================

/**
 * Action entity stored in Firestore /actions/{id}
 * Examples: view, create, edit, delete, export, approve
 */
export interface Action {
  id: string;                       // Firestore doc ID
  code: string;                     // 'view', 'create', 'edit', 'delete', 'export'
  name: string;                     // 'Ver', 'Crear', 'Editar', 'Eliminar', 'Exportar'
  description?: string;
  state: boolean;
  createdAt?: any;
  updatedAt?: any;
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
// PERMISSIONS — Module × Action combinations (/permissions root collection)
// ============================================================================

/**
 * Permission string format: "module.action"
 * Examples: "customers.view", "invoices.create", "users.delete"
 */
export type PermissionString = string;

/**
 * Permission entity stored in Firestore /permissions/{id}
 * Represents a module × action combination that can be assigned to roles.
 */
export interface Permission {
  id?: string;                      // Firestore doc ID
  module_id: string;                // Module Firestore ID (same as module.code)
  action_id: string;                // Action Firestore ID (same as action.code)
  code: string;                     // 'customers.view', generated as module.code + '.' + action.code
  name: string;                     // 'Ver Clientes'
  description?: string;
  isSystem: boolean;                // System permissions cannot be deleted
  state: boolean;
  // Relations populated at runtime (not persisted in Firestore)
  module?: Module;
  action?: Action;
  createdAt?: any;
  updatedAt?: any;
}

/**
 * Data for creating/updating a permission
 */
export interface PermissionInput {
  module_id: string;
  action_id: string;
  name: string;
  description?: string;
  isSystem?: boolean;
  state?: boolean;
}

/**
 * Grouped permissions by module for UI display
 */
export interface PermissionGroup {
  module: Module;
  moduleName: string;
  moduleIcon?: string;
  permissions: Permission[];
}

// ============================================================================
// ROLES / PROFILES
// ============================================================================

export type RoleType = 'system' | 'custom';

export type SystemRoleCode =
  | 'super_admin'
  | 'admin'
  | 'seller'
  | 'cashier'
  | 'read_only';

export interface Role {
  id?: string;
  code: string;
  name: string;
  description?: string;
  type: RoleType;
  permissions: PermissionString[];
  level: number;
  color?: string;
  icon?: string;
  isDefault?: boolean;
  state: boolean;
  createdAt?: any;
  updatedAt?: any;
}

// ============================================================================
// API RESPONSE TYPES (kept for compatibility)
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  skip: number;
}
