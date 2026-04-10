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
    attributes: { module: 'debitNotes', roles: ['admin', 'seller'] }
  },
  {
    name: 'Retenciones',
    url: '/retentions',
    iconComponent: { name: 'cil-inbox' },
    attributes: { module: 'retentions', roles: ['admin', 'accountant'] }
  },
  // {
  //   name: 'Punto de Venta',
  //   url: '/pos',
  //   iconComponent: { name: 'cil-calculator' },
  //   attributes: { module: 'pos', roles: ['admin', 'cashier'] }
  // },
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
    attributes: { module: 'personas', roles: ['admin', 'seller'] },
    children: [
      { name: 'Todos',        url: '/personas',                  icon: 'nav-icon-bullet' },
      { name: 'Clientes',     url: '/personas?role=customer',    icon: 'nav-icon-bullet' },
      { name: 'Proveedores',  url: '/personas?role=supplier',    icon: 'nav-icon-bullet' },
      { name: 'Empleados',    url: '/personas?role=employee',    icon: 'nav-icon-bullet', attributes: { roles: ['admin'] } },
      { name: 'Contactos',    url: '/personas?role=contact',     icon: 'nav-icon-bullet' }
    ]
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
  // {
  //   title: true,
  //   name: 'Almacén'
  // },
  // {
  //   name: 'Inventario',
  //   url: '/stock',
  //   iconComponent: { name: 'cil-storage' },
  //   attributes: { module: 'stock', roles: ['admin', 'seller'] }
  // },

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

  // ─── Administration ──────────────────────────────────────────────────────
  {
    title: true,
    name: 'Administración'
  },
  {
    name: 'Configuración',
    url: '/settings',
    iconComponent: { name: 'cil-settings' },
    attributes: { module: 'settings', roles: ['admin'] },
    children: [
      { name: 'Mi Empresa',          url: '/settings/company',        icon: 'nav-icon-bullet' },
      { name: 'Almacenes',           url: '/settings/warehouses',     icon: 'nav-icon-bullet' },
      { name: 'Series de Documentos',url: '/settings/document-series',icon: 'nav-icon-bullet' },
      { name: 'Métodos de Pago',     url: '/settings/payment-terms',  icon: 'nav-icon-bullet' },
      { name: 'Tasas de Impuestos',  url: '/settings/tax-rates',      icon: 'nav-icon-bullet' },
      { name: 'Divisas',             url: '/settings/currencies',     icon: 'nav-icon-bullet' },
      { name: 'Países',              url: '/settings/countries',      icon: 'nav-icon-bullet' },
      { name: 'Formularios',         url: '/settings/form-config',    icon: 'nav-icon-bullet' }
    ]
  },
  // {
  //   name: 'Usuarios',
  //   url: '/users',
  //   iconComponent: { name: 'cil-user-follow' },
  //   attributes: { module: 'users', roles: ['admin'] }
  // },

  // ─── CoreUI reference (remove after development) ─────────────────────────
  {
    title: true,
    name: 'UI Components'
  },
  {
    name: 'Components',
    url: '/base',
    iconComponent: { name: 'cil-puzzle' },
    children: [
      { name: 'Cards',  url: '/base/cards',       icon: 'nav-icon-bullet' },
      { name: 'Tables', url: '/base/tables',      icon: 'nav-icon-bullet' },
      { name: 'Forms',  url: '/forms/validation', icon: 'nav-icon-bullet' }
    ]
  },
  {
    name: 'Charts',
    url: '/charts',
    iconComponent: { name: 'cil-chart-pie' }
  }
];

/**
 * Filters nav items by user role AND active company modules.
 *
 * Rules:
 *   - item.attributes.roles   → user role must be in the list
 *   - item.attributes.module  → module code must be in activeModules
 *     (skipped when activeModules is empty — graceful bypass for unconfigured companies)
 *   - Title separators are removed when all items in their section are filtered out
 *
 * Equivalent to FacturaScripts: $GLOBALS['plugins'] check before rendering menu items.
 */
export function filterNav(
  items: INavData[],
  userRole: string | null,
  activeModules: string[]
): INavData[] {
  const useModuleFilter = activeModules.length > 0;

  const filtered: INavData[] = [];

  for (const item of items) {
    // ── Role check ──────────────────────────────────────────────────────────
    const allowedRoles = item.attributes?.['roles'] as string[] | undefined;
    if (allowedRoles && userRole && !allowedRoles.includes(userRole)) continue;

    // ── Module check ────────────────────────────────────────────────────────
    const moduleCode = item.attributes?.['module'] as string | undefined;
    if (useModuleFilter && moduleCode && !activeModules.includes(moduleCode)) continue;

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
