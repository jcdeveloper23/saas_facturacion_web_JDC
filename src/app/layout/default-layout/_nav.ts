import { INavData } from '@coreui/angular';

/**
 * Billing system sidebar navigation.
 *
 * Each item carries:
 *   attributes.permission — permission string that the user must have to see this item.
 *                           Format: 'module.action' (e.g. 'invoices.view').
 *                           If absent, any authenticated user can see the item.
 *   attributes.module     — Firestore module code that must be in company.enabledModules.
 *                           If absent, always visible regardless of module config.
 *
 * filterNav() checks BOTH permission AND module for every item.
 * super_admin bypasses both checks.
 *
 * Permissions are derived from the role's permissions[] array (Firestore) —
 * not from hardcoded role names. Any custom role that has the required permission
 * will see the corresponding menu item automatically.
 */
export const navItems: INavData[] = [

  // ─── Sales ───────────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Ventas'
  },
  {
    name: 'Dashboard',
    url: '/dashboard',
    iconComponent: { name: 'cil-speedometer' },
    attributes: { module: 'dashboard' }
  },
  {
    name: 'Facturas',
    url: '/invoices',
    iconComponent: { name: 'cil-description' },
    attributes: { module: 'invoices', permission: 'invoices.view' }
  },
  {
    name: 'Notas de Débito',
    url: '/debit-notes',
    iconComponent: { name: 'cil-plus' },
    attributes: { module: 'debitNotes', permission: 'debit_notes.view' }
  },
  {
    name: 'Retenciones',
    url: '/retentions',
    iconComponent: { name: 'cil-inbox' },
    attributes: { module: 'retentions', permission: 'retentions.view' }
  },
  {
    name: 'Punto de Venta',
    url: '/pos',
    iconComponent: { name: 'cil-calculator' },
    attributes: { module: 'pos', permission: 'pos.view' }
  },
  {
    name: 'Presupuestos',
    url: '/quotes',
    iconComponent: { name: 'cil-clipboard' },
    attributes: { module: 'quotes', permission: 'quotes.view' }
  },
  {
    name: 'Pedidos',
    url: '/orders',
    iconComponent: { name: 'cil-list' },
    attributes: { module: 'orders', permission: 'orders.view' }
  },
  {
    name: 'Proformas',
    url: '/proformas',
    iconComponent: { name: 'cil-note' },
    attributes: { module: 'proformas', permission: 'quotes.view' }
  },

  // ─── Catalog ─────────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Catálogo'
  },
  {
    name: 'Personas',
    url: '/personas',
    iconComponent: { name: 'cil-people' },
    attributes: { module: 'personas', permission: 'personas.view' }
  },
  {
    name: 'Artículos',
    url: '/products',
    iconComponent: { name: 'cil-tag' },
    attributes: { module: 'products', permission: 'products.view' }
  },

  // ─── Inventory ───────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Almacén'
  },
  {
    name: 'Inventario',
    url: '/stock',
    iconComponent: { name: 'cil-storage' },
    attributes: { module: 'stock', permission: 'stock.view' },
    children: [
      { name: 'Stock por Producto', url: '/stock', icon: 'nav-icon-bullet' },
      { name: 'Movimientos', url: '/stock/movements', icon: 'nav-icon-bullet' }
    ]
  },
  {
    name: 'Compras',
    url: '/purchases',
    iconComponent: { name: 'cil-basket' },
    attributes: { module: 'purchases', permission: 'purchases.view' },
    children: [
      { name: 'Órdenes de Compra', url: '/purchases', icon: 'nav-icon-bullet' },
      { name: 'Nueva Compra', url: '/purchases/new', icon: 'nav-icon-bullet' },
      { name: 'Homologación', url: '/purchases/mappings', icon: 'nav-icon-bullet' }
    ]
  },

  // ─── Benefits ─────────────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Analisis'
  },
  {
    name: 'Beneficios',
    url: '/benefits',
    iconComponent: { name: 'cil-chart-pie' },
    attributes: { module: 'benefits', permission: 'invoices.view' },
    children: [
      { name: 'Dashboard', url: '/benefits/dashboard', icon: 'nav-icon-bullet' },
      { name: 'Socios', url: '/benefits/config', icon: 'nav-icon-bullet' },
      { name: 'Liquidaciones', url: '/benefits/history', icon: 'nav-icon-bullet' }
    ]
  },

  // ─── Contabilidad ─────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Contabilidad'
  },
  {
    name: 'Plan de Cuentas',
    url: '/accounting/chart-of-accounts',
    iconComponent: { name: 'cil-list' },
    attributes: { module: 'accounting', permission: 'accounting.view' }
  },
  {
    name: 'Asientos Contables',
    url: '/accounting/journal-entries',
    iconComponent: { name: 'cil-description' },
    attributes: { module: 'accounting', permission: 'accounting.view' }
  },
  {
    name: 'Reportes Contables',
    url: '/accounting',
    iconComponent: { name: 'cil-chart-line' },
    attributes: { module: 'accounting', permission: 'accounting.view' },
    children: [
      { name: 'Libro Diario', url: '/accounting/libro-diario', icon: 'nav-icon-bullet' },
      { name: 'Libro Mayor', url: '/accounting/libro-mayor', icon: 'nav-icon-bullet' },
      { name: 'Balance de Comprobación', url: '/accounting/balance-comprobacion', icon: 'nav-icon-bullet' },
      { name: 'Estado de Resultados', url: '/accounting/estado-resultados', icon: 'nav-icon-bullet' },
      { name: 'Balance General', url: '/accounting/balance-general', icon: 'nav-icon-bullet' },
      { name: 'Flujo de Efectivo', url: '/accounting/flujo-efectivo', icon: 'nav-icon-bullet' },
      { name: 'Antigüedad de Cartera', url: '/accounting/aging', icon: 'nav-icon-bullet' }
    ]
  },
  {
    name: 'Declaraciones SRI',
    url: '/accounting',
    iconComponent: { name: 'cil-file' },
    attributes: { module: 'accounting', permission: 'accounting.view' },
    children: [
      { name: 'Formulario 104 (IVA)', url: '/accounting/formulario-104', icon: 'nav-icon-bullet' },
      { name: 'Formulario 103 (Retenciones)', url: '/accounting/formulario-103', icon: 'nav-icon-bullet' },
      { name: 'Formulario 101 (IR)', url: '/accounting/formulario-101', icon: 'nav-icon-bullet' },
      { name: 'ATS', url: '/accounting/ats', icon: 'nav-icon-bullet' }
    ]
  },
  {
    name: 'Conciliación Bancaria',
    url: '/accounting',
    iconComponent: { name: 'cil-bank' },
    attributes: { module: 'accounting', permission: 'accounting.view' },
    children: [
      { name: 'Cuentas Bancarias', url: '/accounting/bank-accounts', icon: 'nav-icon-bullet' },
      { name: 'Conciliar', url: '/accounting/bank-reconciliation', icon: 'nav-icon-bullet' },
      { name: 'Anticipos', url: '/accounting/advances', icon: 'nav-icon-bullet' },
      { name: 'Caja Chica', url: '/accounting/petty-cash', icon: 'nav-icon-bullet' }
    ]
  },
  {
    name: 'Presupuesto',
    url: '/accounting',
    iconComponent: { name: 'cil-money' },
    attributes: { module: 'accounting', permission: 'accounting.view' },
    children: [
      { name: 'Definir Presupuesto', url: '/accounting/budget', icon: 'nav-icon-bullet' },
      { name: 'Presupuesto vs Real', url: '/accounting/presupuesto-vs-real', icon: 'nav-icon-bullet' }
    ]
  },
  {
    name: 'Centros de Costo',
    url: '/accounting/cost-centers',
    iconComponent: { name: 'cil-sitemap' },
    attributes: { module: 'accounting', permission: 'accounting.view' }
  },
  {
    name: 'Ejercicios Contables',
    url: '/accounting/periods',
    iconComponent: { name: 'cil-calendar' },
    attributes: { module: 'accounting', permission: 'accounting.view' }
  },
  {
    name: 'Saldos Iniciales',
    url: '/accounting/saldos-iniciales',
    iconComponent: { name: 'cil-spreadsheet' },
    attributes: { module: 'accounting', permission: 'accounting.view' }
  },
  {
    name: 'Configuración Contable',
    url: '/accounting/settings',
    iconComponent: { name: 'cil-settings' },
    // settings.create: solo admin tiene create en settings (accountant solo tiene read)
    attributes: { module: 'accounting', permission: 'settings.create' }
  },
  {
    name: 'Log de Auditoría',
    url: '/accounting/audit-log',
    iconComponent: { name: 'cil-history' },
    attributes: { module: 'accounting', permission: 'settings.create' }
  },

  // ─── Reports ─────────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Informes'
  },
  {
    name: 'Reporte de Ventas',
    url: '/reports/invoices',
    iconComponent: { name: 'cil-chart-line' },
    attributes: { module: 'report_invoices', permission: 'invoices.view' }
  },
  {
    name: 'Reporte de Compras',
    url: '/reports/purchases',
    iconComponent: { name: 'cil-basket' },
    attributes: { module: 'report_purchases', permission: 'purchases.view' }
  },
  {
    name: 'Reporte de Productos',
    url: '/reports/products',
    iconComponent: { name: 'cil-bar-chart' },
    attributes: { module: 'report_products', permission: 'products.view' }
  },

  // ─── Team Management ─────────────────────────────────────────────────────
  {
    title: true,
    name: 'Equipo'
  },
  {
    name: 'Team Dashboard',
    url: '/team-management/dashboard',
    iconComponent: { name: 'cil-speedometer' },
    attributes: { module: 'teamManagement', permission: 'team_management.view' }
  },
  {
    name: 'Kanban',
    url: '/team-management/kanban',
    iconComponent: { name: 'cil-columns' },
    attributes: { module: 'teamManagement', permission: 'team_management.view' }
  },
  {
    name: 'Proyectos',
    url: '/team-management/projects',
    iconComponent: { name: 'cil-folder' },
    attributes: { module: 'teamManagement', permission: 'team_management.view' }
  },
  {
    name: 'Tareas',
    url: '/team-management/tasks',
    iconComponent: { name: 'cil-task' },
    attributes: { module: 'teamManagement', permission: 'team_management.view' }
  },
  {
    name: 'Solicitudes',
    url: '/team-management/requests',
    iconComponent: { name: 'cil-inbox' },
    attributes: { module: 'teamManagement', permission: 'team_management.view' }
  },
  {
    name: 'Tiempos',
    url: '/team-management/timesheets',
    iconComponent: { name: 'cil-clock' },
    attributes: { module: 'teamManagement', permission: 'team_management.view' }
  },
  {
    name: 'Equipo',
    url: '/team-management/members',
    iconComponent: { name: 'cil-people' },
    attributes: { module: 'teamManagement', permission: 'team_management.view' }
  },
  {
    name: 'Reportes',
    url: '/team-management/reports',
    iconComponent: { name: 'cil-chart-line' },
    attributes: { module: 'teamManagement', permission: 'team_management.view' }
  },
  {
    name: 'Catálogos',
    url: '/team-management/catalogs',
    iconComponent: { name: 'cil-tag' },
    // team_management.create: solo admin/seller pueden crear — excluye read_only y cashier
    attributes: { module: 'teamManagement', permission: 'team_management.create' }
  },

  // ─── Bar Escolar ──────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Bar Escolar',
    attributes: { module: 'school_setup' }
  },
  {
    name: 'Menú del Día',
    url: '/school-bar/menus',
    iconComponent: { name: 'cil-restaurant' },
    attributes: { module: 'school_menus', permission: 'settings.create' }
  },
  {
    name: 'Órdenes',
    url: '/school-bar/orders',
    iconComponent: { name: 'cil-list' },
    attributes: { module: 'school_orders', permission: 'pos.view' }
  },
  {
    name: 'POS Bar',
    url: '/school-bar/pos',
    iconComponent: { name: 'cil-calculator' },
    attributes: { module: 'school_pos', permission: 'pos.view' }
  },
  {
    name: 'Wallet & Recargas',
    url: '/school-bar/wallet',
    iconComponent: { name: 'cil-wallet' },
    attributes: { module: 'school_wallet', permission: 'settings.create' }
  },
  {
    name: 'Accesorios NFC',
    url: '/school-bar/accessories',
    iconComponent: { name: 'cil-credit-card' },
    attributes: { module: 'school_accessories', permission: 'settings.create' }
  },
  {
    name: 'Configuración Bar',
    url: '/school-bar/setup',
    iconComponent: { name: 'cil-settings' },
    attributes: { module: 'school_setup', permission: 'settings.create' }
  },

  // ─── Marketplace ─────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Marketplace',
    attributes: { module: 'marketplace' }
  },
  {
    name: 'Pedidos del Catálogo',
    url: '/marketplace-orders',
    iconComponent: { name: 'cil-basket' },
    attributes: { module: 'marketplace', permission: 'invoices.view' }
  },

  // ─── Administration ──────────────────────────────────────────────────────
  {
    title: true,
    name: 'Administración'
  },
  {
    name: 'Configuración',
    url: '/settings',
    iconComponent: { name: 'cil-settings' },
    attributes: { module: 'settings', permission: 'settings.view' },
    children: [
      { name: 'Mi Empresa', url: '/settings/company', icon: 'nav-icon-bullet' },
      { name: 'Establecimientos', url: '/settings/establishments', icon: 'nav-icon-bullet' },
      { name: 'Almacenes', url: '/settings/warehouses', icon: 'nav-icon-bullet' },
      { name: 'Familias', url: '/settings/families', icon: 'nav-icon-bullet' },
      { name: 'Series de Documentos', url: '/settings/document-series', icon: 'nav-icon-bullet' },
      { name: 'Métodos de Pago', url: '/settings/payment-terms', icon: 'nav-icon-bullet' },
      { name: 'Tasas de Impuestos', url: '/settings/tax-rates', icon: 'nav-icon-bullet' },
      { name: 'Divisas', url: '/settings/currencies', icon: 'nav-icon-bullet' },
      { name: 'Países', url: '/settings/countries', icon: 'nav-icon-bullet' },
      { name: 'Formularios', url: '/settings/form-config', icon: 'nav-icon-bullet' },
      { name: 'Mis Plugins', url: '/settings/plugins', icon: 'nav-icon-bullet' },
      { name: 'Catálogo Público', url: '/settings/marketplace', icon: 'nav-icon-bullet', attributes: { module: 'marketplace' } }
    ]
  },
  {
    name: 'Usuarios',
    url: '/users',
    iconComponent: { name: 'cil-user-follow' },
    attributes: { module: 'users', permission: 'users.view' }
  },
  {
    name: 'Perfiles y Roles',
    url: '/profiles',
    iconComponent: { name: 'cil-lock-locked' },
    attributes: { module: 'users', permission: 'users.view' }
  },
  {
    name: 'API Docs',
    url: '/api-docs',
    iconComponent: { name: 'cil-code' },
    attributes: { permission: 'users.view' }
  },
  {
    name: 'Datos de Prueba',
    url: '/test-data',
    iconComponent: { name: 'cil-beaker' },
    attributes: { permission: 'users.view' }
  },
];

/**
 * Convierte snake_case a camelCase para normalizar códigos de módulo.
 * Firestore guarda 'team_management'; activeModules puede tener 'teamManagement'.
 * filterNav acepta ambos formatos gracias a esta normalización.
 */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Filters nav items by user permissions AND active company modules.
 *
 * Rules:
 *   - item.attributes.permission  → user must have this permission string in their permissions[]
 *                                   (derived from their role document in Firestore).
 *                                   Items without permission are visible to all authenticated users.
 *   - item.attributes.module      → module code must be in activeModules;
 *                                   acepta snake_case y camelCase (normaliza antes de comparar).
 *                                   items without a module code are always visible
 *   - super_admin bypasses BOTH checks
 *   - Title separators are removed when all items in their section are filtered out
 */
export function filterNav(
  items: INavData[],
  userPermissions: string[],
  activeModules: string[],
  isSuperAdmin: boolean = false
): INavData[] {
  const filtered: INavData[] = [];

  for (const item of items) {
    // ── Permission check ────────────────────────────────────────────────────
    const reqPermission = item.attributes?.['permission'] as string | undefined;
    if (reqPermission && !isSuperAdmin && !userPermissions.includes(reqPermission)) continue;

    // ── Module check ────────────────────────────────────────────────────────
    // super_admin bypasses module/tenant check — no tiene companyId y tiene
    // acceso irrestricto a todos los módulos.
    //
    // Normalización:
    //   • snake_case ↔ camelCase: 'team_management' === 'teamManagement'
    //   • Prefix-match: 'accounting_journal' está cubierto por 'accounting'
    //     cuando el módulo padre es el que activa el sub-módulo en el plan.
    const moduleCode = item.attributes?.['module'] as string | undefined;
    if (!isSuperAdmin && moduleCode) {
      const camelCode = snakeToCamel(moduleCode);
      const isActive = activeModules.some(am => {
        // Coincidencia exacta (snake o camel)
        if (am === moduleCode || am === camelCode) return true;
        // Sub-módulo: 'accounting_journal' está cubierto si 'accounting' está activo
        return moduleCode.startsWith(am + '_') || camelCode.startsWith(snakeToCamel(am) + '_');
      });
      if (!isActive) continue;
    }

    // ── Children (parent with sub-items) ───────────────────────────────────
    if (item.children?.length) {
      const filteredChildren = filterNav(item.children, userPermissions, activeModules, isSuperAdmin);
      if (filteredChildren.length === 0) continue;
      filtered.push({ ...item, children: filteredChildren });
      continue;
    }

    filtered.push(item);
  }

  return removeOrphanTitles(filtered);
}

/**
 * Removes title separator items that have no visible items following them
 * before the next title (or end of list).
 */
function removeOrphanTitles(items: INavData[]): INavData[] {
  const result: INavData[] = [];

  for (let i = 0; i < items.length; i++) {
    if (!items[i].title) {
      result.push(items[i]);
      continue;
    }

    // Find the range until the next title
    const nextTitleIdx = items.findIndex((item, idx) => idx > i && !!item.title);
    const end = nextTitleIdx === -1 ? items.length : nextTitleIdx;
    const hasVisibleChild = items.slice(i + 1, end).some(item => !item.title);

    if (hasVisibleChild) result.push(items[i]);
  }

  return result;
}

/** @deprecated Use filterNav() instead */
export function filterNavByRole(items: INavData[], userRole: string | null): INavData[] {
  return filterNav(items, [], []);
}
