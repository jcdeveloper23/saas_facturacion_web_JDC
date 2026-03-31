import { INavData } from '@coreui/angular';

/**
 * Billing system sidebar navigation.
 * Items are uncommented progressively as each feature module is built.
 * role: used by filterNavByRole() to show/hide items per user role.
 */
export const navItems: INavData[] = [

  // ─── Sales ───────────────────────────────────────────────────────────────
  {
    title: true,
    name: 'Sales'
  },
  {
    name: 'Dashboard',
    url: '/dashboard',
    iconComponent: { name: 'cil-speedometer' }
  },
  // {
  //   name: 'Invoices',
  //   url: '/invoices',
  //   iconComponent: { name: 'cil-description' },
  //   attributes: { roles: ['admin', 'seller', 'cashier'] }
  // },
  // {
  //   name: 'Point of Sale',
  //   url: '/pos',
  //   iconComponent: { name: 'cil-calculator' },
  //   attributes: { roles: ['admin', 'cashier'] }
  // },
  // {
  //   name: 'Quotes',
  //   url: '/quotes',
  //   iconComponent: { name: 'cil-file' },
  //   attributes: { roles: ['admin', 'seller'] }
  // },
  // {
  //   name: 'Orders',
  //   url: '/orders',
  //   iconComponent: { name: 'cil-cart' },
  //   attributes: { roles: ['admin', 'seller'] }
  // },

  // ─── Catalog ─────────────────────────────────────────────────────────────
  // {
  //   title: true,
  //   name: 'Catalog'
  // },
  // {
  //   name: 'Products',
  //   url: '/products',
  //   iconComponent: { name: 'cil-tag' },
  //   attributes: { roles: ['admin', 'seller'] }
  // },
  // {
  //   name: 'Customers',
  //   url: '/customers',
  //   iconComponent: { name: 'cil-people' },
  //   attributes: { roles: ['admin', 'seller'] }
  // },
  // {
  //   name: 'Suppliers',
  //   url: '/suppliers',
  //   iconComponent: { name: 'cil-truck' },
  //   attributes: { roles: ['admin', 'seller'] }
  // },

  // ─── Inventory ───────────────────────────────────────────────────────────
  // {
  //   title: true,
  //   name: 'Inventory'
  // },
  // {
  //   name: 'Stock',
  //   url: '/stock',
  //   iconComponent: { name: 'cil-layers' },
  //   attributes: { roles: ['admin', 'seller'] }
  // },

  // ─── Administration ──────────────────────────────────────────────────────
  {
    title: true,
    name: 'Administration'
  },
  // {
  //   name: 'Electronic Invoicing',
  //   url: '/electronic-invoicing',
  //   iconComponent: { name: 'cil-cloud-upload' },
  //   attributes: { roles: ['admin'] }
  // },
  {
    name: 'Settings',
    url: '/settings',
    iconComponent: { name: 'cil-settings' },
    attributes: { roles: ['admin'] },
    children: [
      {
        name: 'Mi Empresa',
        url: '/settings/company',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Almacenes',
        url: '/settings/warehouses',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Series de Documentos',
        url: '/settings/document-series',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Métodos de Pago',
        url: '/settings/payment-terms',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Tasas de Impuestos',
        url: '/settings/tax-rates',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Divisas',
        url: '/settings/currencies',
        icon: 'nav-icon-bullet'
      },
      {
        name: 'Países',
        url: '/settings/countries',
        icon: 'nav-icon-bullet'
      }
    ]
  },

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
      { name: 'Cards', url: '/base/cards', icon: 'nav-icon-bullet' },
      { name: 'Tables', url: '/base/tables', icon: 'nav-icon-bullet' },
      { name: 'Forms', url: '/forms/validation', icon: 'nav-icon-bullet' }
    ]
  },
  {
    name: 'Charts',
    url: '/charts',
    iconComponent: { name: 'cil-chart-pie' }
  }
];

/**
 * Filters nav items based on the user's role.
 * Items without `attributes.roles` are visible to all authenticated users.
 */
export function filterNavByRole(
  items: INavData[],
  userRole: string | null
): INavData[] {
  return items.filter(item => {
    const allowedRoles = item.attributes?.['roles'] as string[] | undefined;
    if (allowedRoles && userRole && !allowedRoles.includes(userRole)) return false;

    if (item.children) {
      item.children = filterNavByRole(item.children, userRole);
      if (item.children.length === 0) return false;
    }
    return true;
  });
}
