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
  _parentCode?: string | null;
  _isLastChild?: boolean;
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
// PLUGIN PACKAGES — Commercial bundles (/plugin-packages root collection)
// ============================================================================

/**
 * A PluginPackage groups one or more modules into a single commercial unit
 * that can be activated per company and charged independently.
 *
 * Architecture:
 *   - super_admin manages packages in /plugin-packages (root)
 *   - When a company activates a package, its modules[] are added to company.enabledModules
 *   - TenantService exposes activePackages and hasPackage() alongside the existing hasModule()
 *   - moduleGuard and _nav.ts continue to operate on modules — no changes required there
 *
 * Extensible by design: new verticals (automotive, pharmacy, accounting…) are
 * just new documents in /plugin-packages pointing to new module codes.
 */
export interface PluginPackage {
  id: string;                            // Firestore doc ID
  code: string;                          // 'pkg_sri', 'pkg_sales', 'pkg_automotive', etc.
  name: string;                          // 'Facturación Electrónica SRI'
  description: string;
  modules: string[];                     // module codes this package activates
  dependencies: string[];                // other package codes that must be active first
  price: number;                         // monthly price in USD; 0 = always included
  currency: 'USD';
  billingPeriod: 'monthly' | 'yearly' | 'one_time';
  icon: string;                          // CoreUI icon name
  color: string;                         // CoreUI color variant: 'primary', 'success', etc.
  isSystem: boolean;                     // true = cannot be deactivated (pkg_base)
  order: number;                         // display order
  state: boolean;
  createdAt?: any;
  updatedAt?: any;
}

/**
 * Data for creating/updating a plugin package
 */
export interface PluginPackageInput {
  code: string;
  name: string;
  description?: string;
  modules?: string[];
  dependencies?: string[];
  price?: number;
  currency?: 'USD';
  billingPeriod?: 'monthly' | 'yearly' | 'one_time';
  icon?: string;
  color?: string;
  isSystem?: boolean;
  order?: number;
  state?: boolean;
}

// ============================================================================
// MODULE METADATA — display info for the permissions UI
// Keeps UI labels/icons co-located with the permission model.
// Used by ProfilesComponent and PermissionsService as a fallback catalog.
// ============================================================================

export const MODULE_METADATA: Record<string, { name: string; icon: string; order: number }> = {
  dashboard:       { name: 'Dashboard',           icon: 'cilSpeedometer', order: 0  },
  customers:       { name: 'Clientes',             icon: 'cilPeople',      order: 10 },
  suppliers:       { name: 'Proveedores',          icon: 'cilTruck',       order: 11 },
  products:        { name: 'Productos',            icon: 'cilTag',         order: 20 },
  invoices:        { name: 'Facturas',             icon: 'cilDescription', order: 30 },
  quotes:          { name: 'Cotizaciones',         icon: 'cilNotes',       order: 31 },
  orders:          { name: 'Pedidos',              icon: 'cilCart',        order: 32 },
  purchases:       { name: 'Compras',              icon: 'cilBasket',      order: 40 },
  stock:           { name: 'Inventario',           icon: 'cilStorage',     order: 50 },
  pos:             { name: 'Punto de Venta',       icon: 'cilCash',        order: 60 },
  sri:             { name: 'SRI / Electrónica',    icon: 'cilShieldAlt',   order: 70 },
  retentions:      { name: 'Retenciones',           icon: 'cilFile',        order: 71 },
  debit_notes:     { name: 'Notas de Débito',      icon: 'cilNotes',       order: 72 },
  accounting:      { name: 'Contabilidad',         icon: 'cilSpreadsheet', order: 75 },
  benefits:        { name: 'Beneficios',           icon: 'cilChartPie',    order: 77 },
  team_management: { name: 'Gestión de Equipo',    icon: 'cilPeople',      order: 80 },
  personas:        { name: 'Personas',             icon: 'cilUser',        order: 85 },
  users:           { name: 'Usuarios',             icon: 'cilLockLocked',  order: 90 },
  settings:        { name: 'Configuración',        icon: 'cilSettings',    order: 99 },
  // ── pkg_school_bar ──────────────────────────────────────────────────────
  school_setup:        { name: 'Bar · Configuración',   icon: 'cilBuilding',    order: 100 },
  school_students:     { name: 'Bar · Estudiantes',     icon: 'cilPeople',      order: 101 },
  school_parents:      { name: 'Bar · Representantes',  icon: 'cilUser',        order: 102 },
  school_menus:        { name: 'Bar · Menús',           icon: 'cilRestaurant',  order: 103 },
  school_orders:       { name: 'Bar · Órdenes',         icon: 'cilCart',        order: 104 },
  school_wallet:       { name: 'Bar · Billeteras',      icon: 'cilWallet',      order: 105 },
  school_pos:          { name: 'Bar · Caja (POS)',       icon: 'cilCalculator',  order: 106 },
  school_accessories:  { name: 'Bar · Accesorios NFC',  icon: 'cilNfc',         order: 107 },
  school_delivery:     { name: 'Bar · Entrega en Aula', icon: 'cilTruck',       order: 108 },
  school_nutrition:    { name: 'Bar · Nutrición',       icon: 'cilLeaf',        order: 109 },
  school_reports_bar:  { name: 'Bar · Reportes',        icon: 'cilChartPie',    order: 110 },
};

// ============================================================================
// API RESPONSE TYPES (kept for compatibility)
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  skip: number;
}
