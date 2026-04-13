/**
 * plugin-packages-seed.ts
 *
 * Seed data for /plugin-packages (root-level Firestore collection).
 *
 * Each package groups one or more modules into a single commercial unit
 * that can be activated per company and charged independently.
 *
 * EXTENSIBILITY:
 *   Adding a new vertical (accounting, automotive, pharmacy, HR…) means
 *   adding a new entry here + implementing the Angular routes/modules it activates.
 *   No changes needed in guards, nav filter, or TenantService.
 *
 * DEPENDENCY TREE:
 *   pkg_base (always active)
 *     └── pkg_sales
 *           ├── pkg_sales_advanced
 *           ├── pkg_sri
 *           ├── pkg_purchases
 *           └── pkg_reports
 */

export interface PackageSeed {
  code: string;
  name: string;
  description: string;
  modules: string[];
  dependencies: string[];
  price: number;
  currency: 'USD';
  billingPeriod: 'monthly' | 'yearly' | 'one_time';
  icon: string;
  color: string;
  isSystem: boolean;
  order: number;
  state: boolean;
}

export const PLUGIN_PACKAGES_SEED: PackageSeed[] = [

  // ─── BASE (always active, price 0) ────────────────────────────────────────
  {
    code:          'pkg_base',
    name:          'Base',
    description:   'Dashboard, configuración de empresa, divisas, usuarios y roles. Incluido en todos los planes.',
    modules:       ['dashboard', 'settings', 'div', 'users'],
    dependencies:  [],
    price:         0,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-home',
    color:         'secondary',
    isSystem:      true,
    order:         1,
    state:         true
  },

  // ─── FACTURACIÓN BASE ─────────────────────────────────────────────────────
  {
    code:          'pkg_sales',
    name:          'Facturación Base',
    description:   'Personas (clientes, proveedores, empleados), catálogo de artículos, facturas de venta e inventario básico.',
    modules:       ['personas', 'products', 'invoices', 'stock'],
    dependencies:  ['pkg_base'],
    price:         29,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-description',
    color:         'primary',
    isSystem:      false,
    order:         2,
    state:         true
  },

  // ─── FACTURACIÓN AVANZADA ─────────────────────────────────────────────────
  {
    code:          'pkg_sales_advanced',
    name:          'Facturación Avanzada',
    description:   'Presupuestos, pedidos de cliente, proformas/albaranes y punto de venta (POS) con apertura/cierre de caja.',
    modules:       ['quotes', 'orders', 'proformas', 'pos'],
    dependencies:  ['pkg_sales'],
    price:         19,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-calculator',
    color:         'info',
    isSystem:      false,
    order:         3,
    state:         true
  },

  // ─── FACTURACIÓN ELECTRÓNICA SRI ──────────────────────────────────────────
  {
    code:          'pkg_sri',
    name:          'Facturación Electrónica SRI',
    description:   'Emisión y autorización de comprobantes electrónicos ante el SRI Ecuador: facturas, notas de débito y retenciones. Incluye RIDE PDF y envío por email.',
    modules:       ['sri', 'debitNotes', 'retentions'],
    dependencies:  ['pkg_sales'],
    price:         24,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-file',
    color:         'success',
    isSystem:      false,
    order:         4,
    state:         true
  },

  // ─── MÓDULO COMPRAS ───────────────────────────────────────────────────────
  {
    code:          'pkg_purchases',
    name:          'Módulo Compras',
    description:   'Facturas de compra recibidas de proveedores, pedidos de compra y proformas de compra con seguimiento de recepción.',
    // 'suppliers' must be included: purchase_invoices/orders/proformas all declare
    // dependencies: ['suppliers', 'products'] in modules-seed. Without it,
    // those modules would fail the dependency check even with pkg_purchases active.
    modules:       ['suppliers', 'purchase_invoices', 'purchase_orders', 'purchase_proformas'],
    dependencies:  ['pkg_sales'],
    price:         19,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-basket',
    color:         'warning',
    isSystem:      false,
    order:         5,
    state:         true
  },

  // ─── REPORTES E INFORMES ──────────────────────────────────────────────────
  {
    code:          'pkg_reports',
    name:          'Reportes e Informes',
    description:   'Informes de ventas por período/cliente/producto, rotación de inventario y seguimiento de pedidos. Exportación a Excel y PDF.',
    modules:       ['report_invoices', 'report_products', 'report_orders'],
    dependencies:  ['pkg_sales'],
    price:         9,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-chart-pie',
    color:         'danger',
    isSystem:      false,
    order:         6,
    state:         true
  },

  // ─── CATÁLOGO PÚBLICO (MARKETPLACE) ──────────────────────────────────────
  {
    code:          'pkg_marketplace',
    name:          'Catálogo Público',
    description:   'Catálogo público de productos accesible sin login desde facturasec.com/{slug}. Configurable por la empresa con filtros, familias y apariencia personalizada.',
    modules:       ['marketplace'],
    dependencies:  ['pkg_sales'],
    price:         15,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-cart',
    color:         'info',
    isSystem:      false,
    order:         7,
    state:         true
  }

];
