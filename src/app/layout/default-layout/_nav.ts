import { INavData } from '@coreui/angular';

/**
 * Billing system sidebar navigation.
 *
 * Each item carries:
 *   attributes.roles   — which user roles can see it (undefined = all)
 *   attributes.module  — Firestore module code that must be in company.enabledModules
 *                        (undefined = always visible regardless of module config)
 *
 * Items are uncommented progressively as each feature route is implemented.
 * The module filter will hide them automatically if not enabled for the company.
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
    attributes: { module: 'invoices', roles: ['admin', 'seller', 'cashier'] }
  },
  {
    name: 'Notas de Débito',
    url: '/debit-notes',
    iconComponent: { name: 'cil-plus' },
    attributes: { module: 'debitNotes', roles: ['admin', 'accountant', 'seller'] }
  },
  {
    name: 'Retenciones',
    url: '/retentions',
    iconComponent: { name: 'cil-inbox' },
    attributes: { module: 'retentions', roles: ['admin', 'accountant'] }
  },
  {
    name: 'Punto de Venta',
    url: '/pos',
    iconComponent: { name: 'cil-calculator' },
    attributes: { module: 'pos', roles: ['admin', 'cashier', 'seller'] }
  },
  // {
  //   name: 'Presupuestos',
  //   url: '/quotes',
  //   iconComponent: { name: 'cil-clipboard' },
  //   attributes: { module: 'quotes', roles: ['admin', 'seller'] }
  // },
  // {
  //   name: 'Pedidos',
  //   url: '/orders',
  //   iconComponent: { name: 'cil-list' },
  //   attributes: { module: 'orders', roles: ['admin', 'seller'] }
  // },
  // {
  //   name: 'Proformas',
  //   url: '/proformas',
  //   iconComponent: { name: 'cil-note' },
  //   attributes: { module: 'proformas', roles: ['admin', 'seller'] }
  // },
  // {
  //   name: 'Fact. Electrónica',
  //   url: '/electronic-invoicing',
  //   iconComponent: { name: 'cil-cloud-upload' },
  //   attributes: { module: 'sri', roles: ['admin'] }
  // },

  // ─── Catalog ─────────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Catálogo'
  },
  {
    name: 'Personas',
    url: '/personas',
    iconComponent: { name: 'cil-people' },
    attributes: { module: 'personas', roles: ['admin', 'seller'] }
  },
  {
    name: 'Artículos',
    url: '/products',
    iconComponent: { name: 'cil-tag' },
    attributes: { module: 'products', roles: ['admin', 'seller'] }
  },

  // ─── Purchases ───────────────────────────────────────────────────────────
  // {
  //   title: true,
  //   name: 'Compras'
  // },
  // {
  //   name: 'Facturas de Compra',
  //   url: '/purchase-invoices',
  //   iconComponent: { name: 'cil-inbox' },
  //   attributes: { module: 'purchase_invoices', roles: ['admin'] }
  // },
  // {
  //   name: 'Pedidos de Compra',
  //   url: '/purchase-orders',
  //   iconComponent: { name: 'cil-cart' },
  //   attributes: { module: 'purchase_orders', roles: ['admin'] }
  // },

  // ─── Inventory ───────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Almacén'
  },
  {
    name: 'Inventario',
    url: '/stock/__group',
    iconComponent: { name: 'cil-storage' },
    attributes: { module: 'stock', roles: ['admin', 'seller'] },
    children: [
      { name: 'Stock por Producto',  url: '/stock',            icon: 'nav-icon-bullet' },
      { name: 'Movimientos',         url: '/stock/movements',  icon: 'nav-icon-bullet' }
    ]
  },
  {
    name: 'Compras',
    url: '/purchases/__group',
    iconComponent: { name: 'cil-basket' },
    attributes: { module: 'purchases', roles: ['admin', 'accountant', 'seller'] },
    children: [
      { name: 'Órdenes de Compra', url: '/purchases',          icon: 'nav-icon-bullet' },
      { name: 'Nueva Compra',      url: '/purchases/new',      icon: 'nav-icon-bullet' },
      { name: 'Homologación',      url: '/purchases/mappings', icon: 'nav-icon-bullet' }
    ]
  },

  // ─── Benefits ─────────────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Analisis'
  },
  {
    name: 'Beneficios',
    url: '/benefits/__group',
    iconComponent: { name: 'cil-chart-pie' },
    attributes: { module: 'benefits', roles: ['admin'] },
    children: [
      { name: 'Dashboard',     url: '/benefits/dashboard', icon: 'nav-icon-bullet' },
      { name: 'Socios',        url: '/benefits/config',    icon: 'nav-icon-bullet' },
      { name: 'Liquidaciones', url: '/benefits/history',   icon: 'nav-icon-bullet' }
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
    attributes: { module: 'accounting', roles: ['admin', 'accountant'] }
  },
  {
    name: 'Asientos Contables',
    url: '/accounting/journal-entries',
    iconComponent: { name: 'cil-description' },
    attributes: { module: 'accounting', roles: ['admin', 'accountant'] }
  },
  {
    name: 'Reportes Contables',
    url: '/accounting/__group',
    iconComponent: { name: 'cil-chart-line' },
    attributes: { module: 'accounting', roles: ['admin', 'accountant'] },
    children: [
      { name: 'Libro Diario',              url: '/accounting/libro-diario',            icon: 'nav-icon-bullet' },
      { name: 'Libro Mayor',               url: '/accounting/libro-mayor',             icon: 'nav-icon-bullet' },
      { name: 'Balance de Comprobación',   url: '/accounting/balance-comprobacion',    icon: 'nav-icon-bullet' }
    ]
  },
  {
    name: 'Centros de Costo',
    url: '/accounting/cost-centers',
    iconComponent: { name: 'cil-sitemap' },
    attributes: { module: 'accounting', roles: ['admin', 'accountant'] }
  },
  {
    name: 'Ejercicios Contables',
    url: '/accounting/periods',
    iconComponent: { name: 'cil-calendar' },
    attributes: { module: 'accounting', roles: ['admin', 'accountant'] }
  },

  // ─── Reports ─────────────────────────────────────────────────────────────
  // {
  //   title: true,
  //   name: 'Informes'
  // },
  // {
  //   name: 'Informe Facturas',
  //   url: '/reports/invoices',
  //   iconComponent: { name: 'cil-chart-line' },
  //   attributes: { module: 'report_invoices', roles: ['admin'] }
  // },
  // {
  //   name: 'Informe Artículos',
  //   url: '/reports/products',
  //   iconComponent: { name: 'cil-bar-chart' },
  //   attributes: { module: 'report_products', roles: ['admin'] }
  // },
  // {
  //   name: 'Informe Pedidos',
  //   url: '/reports/orders',
  //   iconComponent: { name: 'cil-chart' },
  //   attributes: { module: 'report_orders', roles: ['admin'] }
  // },

  // ─── Team Management ─────────────────────────────────────────────────────
  {
    title: true,
    name: 'Equipo'
  },
  {
    name: 'Team Dashboard',
    url: '/team-management/dashboard',
    iconComponent: { name: 'cil-speedometer' },
    attributes: { module: 'teamManagement', roles: ['admin', 'seller'] }
  },
  {
    name: 'Kanban',
    url: '/team-management/kanban',
    iconComponent: { name: 'cil-columns' },
    attributes: { module: 'teamManagement', roles: ['admin', 'seller'] }
  },
  {
    name: 'Proyectos',
    url: '/team-management/projects',
    iconComponent: { name: 'cil-folder' },
    attributes: { module: 'teamManagement', roles: ['admin', 'seller'] }
  },
  {
    name: 'Tareas',
    url: '/team-management/tasks',
    iconComponent: { name: 'cil-task' },
    attributes: { module: 'teamManagement', roles: ['admin', 'seller'] }
  },
  {
    name: 'Solicitudes',
    url: '/team-management/requests',
    iconComponent: { name: 'cil-inbox' },
    attributes: { module: 'teamManagement', roles: ['admin', 'seller'] }
  },
  {
    name: 'Tiempos',
    url: '/team-management/timesheets',
    iconComponent: { name: 'cil-clock' },
    attributes: { module: 'teamManagement', roles: ['admin', 'seller'] }
  },
  {
    name: 'Equipo',
    url: '/team-management/members',
    iconComponent: { name: 'cil-people' },
    attributes: { module: 'teamManagement', roles: ['admin', 'seller'] }
  },
  {
    name: 'Reportes',
    url: '/team-management/reports',
    iconComponent: { name: 'cil-chart-line' },
    attributes: { module: 'teamManagement', roles: ['admin', 'seller'] }
  },
  {
    name: 'Catálogos',
    url: '/team-management/catalogs',
    iconComponent: { name: 'cil-tag' },
    attributes: { module: 'teamManagement', roles: ['admin'] }
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
    attributes: { module: 'marketplace', roles: ['admin', 'seller'] }
  },

  // ─── Administration ──────────────────────────────────────────────────────
  {
    title: true,
    name: 'Administración'
  },
  {
    name: 'Configuración',
    url: '/settings/__group',
    iconComponent: { name: 'cil-settings' },
    attributes: { module: 'settings', roles: ['admin'] },
    children: [
      { name: 'Mi Empresa',          url: '/settings/company',        icon: 'nav-icon-bullet' },
      { name: 'Almacenes',           url: '/settings/warehouses',     icon: 'nav-icon-bullet' },
      { name: 'Familias',            url: '/settings/families',       icon: 'nav-icon-bullet' },
      { name: 'Series de Documentos',url: '/settings/document-series',icon: 'nav-icon-bullet' },
      { name: 'Métodos de Pago',     url: '/settings/payment-terms',  icon: 'nav-icon-bullet' },
      { name: 'Tasas de Impuestos',  url: '/settings/tax-rates',      icon: 'nav-icon-bullet' },
      { name: 'Divisas',             url: '/settings/currencies',     icon: 'nav-icon-bullet' },
      { name: 'Países',              url: '/settings/countries',      icon: 'nav-icon-bullet' },
      { name: 'Formularios',         url: '/settings/form-config',    icon: 'nav-icon-bullet' },
      { name: 'Mis Plugins',         url: '/settings/plugins',        icon: 'nav-icon-bullet' },
      { name: 'Catálogo Público',    url: '/settings/marketplace',    icon: 'nav-icon-bullet', attributes: { module: 'marketplace' } }
    ]
  },
  {
    name: 'Usuarios',
    url: '/users',
    iconComponent: { name: 'cil-user-follow' },
    attributes: { module: 'users', roles: ['admin', 'super_admin'] }
  },
  {
    name: 'Perfiles y Roles',
    url: '/profiles',
    iconComponent: { name: 'cil-lock-locked' },
    attributes: { module: 'users', roles: ['admin', 'super_admin'] }
  },

  // ─── CoreUI reference (remove after development) ─────────────────────────
  // {
  //   title: true,
  //   name: 'UI Components'
  // },
  // {
  //   name: 'Components',
  //   url: '/base',
  //   iconComponent: { name: 'cil-puzzle' },
  //   children: [
  //     { name: 'Cards',  url: '/base/cards',       icon: 'nav-icon-bullet' },
  //     { name: 'Tables', url: '/base/tables',      icon: 'nav-icon-bullet' },
  //     { name: 'Forms',  url: '/forms/validation', icon: 'nav-icon-bullet' }
  //   ]
  // },
  // {
  //   name: 'Charts',
  //   url: '/charts',
  //   iconComponent: { name: 'cil-chart-pie' }
  // }
];

/**
 * Filters nav items by user role AND active company modules.
 *
 * Rules:
 *   - item.attributes.roles   → user role must be in the list
 *   - item.attributes.module  → module code must be in activeModules;
 *                               items without a module code are always visible
 *   - Title separators are removed when all items in their section are filtered out
 *
 * Equivalent to FacturaScripts: $GLOBALS['plugins'] check before rendering menu items.
 */
export function filterNav(
  items: INavData[],
  userRole: string | null,
  activeModules: string[]
): INavData[] {
  const filtered: INavData[] = [];
  // super_admin no pertenece a ninguna empresa — opera a nivel de plataforma.
  // Salta el chequeo de módulos del tenant para que siempre vea todos los ítems
  // para los que tiene rol asignado.
  const isSuperAdmin = userRole === 'super_admin';

  for (const item of items) {
    // ── Role check ──────────────────────────────────────────────────────────
    const allowedRoles = item.attributes?.['roles'] as string[] | undefined;
    if (allowedRoles && userRole && !allowedRoles.includes(userRole)) continue;

    // ── Module check ────────────────────────────────────────────────────────
    // super_admin bypasses module/tenant check — no tiene companyId y tiene
    // acceso irrestricto a todos los módulos.
    const moduleCode = item.attributes?.['module'] as string | undefined;
    if (!isSuperAdmin && moduleCode && !activeModules.includes(moduleCode)) continue;

    // ── Children (parent with sub-items) ───────────────────────────────────
    if (item.children?.length) {
      const filteredChildren = filterNav(item.children, userRole, activeModules);
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
  return filterNav(items, userRole, []);
}
