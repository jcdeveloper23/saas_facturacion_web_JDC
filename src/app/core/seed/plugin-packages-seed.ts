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
 *   pkg_base (always active, price: 0)
 *     ├── pkg_team_mgmt              ($49/mes add-on)
 *     └── pkg_sales                  ($29/mes add-on)
 *           ├── pkg_stock            ($19/mes add-on) ← inventario separado
 *           ├── pkg_sales_advanced   ($19/mes add-on) (quotes, orders, proformas)
 *           ├── pkg_pos              ($15/mes add-on) (punto de venta táctil)
 *           ├── pkg_sri              ($24/mes add-on)
 *           │     └── pkg_accounting ($29/mes add-on)
 *           ├── pkg_purchases        ($19/mes add-on)
 *           ├── pkg_reports          ($9/mes add-on)
 *           ├── pkg_marketplace      ($15/mes add-on)
 *           └── pkg_benefits         ($19/mes add-on) (dashboard socios, liquidaciones)
 *
 * NOTA: pkg_stock está separado de pkg_sales para permitir planes con
 * facturación sin inventario (ej. Plan Emprendedor: features.stockModule = false).
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
    description:   'Personas (clientes, proveedores, empleados), catálogo de artículos y facturas de venta.',
    modules:       ['personas', 'products', 'invoices'],
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

  // ─── INVENTARIO Y STOCK ───────────────────────────────────────────────────
  // Separado de pkg_sales para permitir planes con facturación sin inventario.
  // Ejemplo: Plan Emprendedor incluye pkg_sales pero features.stockModule = false.
  {
    code:          'pkg_stock',
    name:          'Inventario y Stock',
    description:   'Control de inventario, movimientos de stock, kardex y valorización de existencias.',
    modules:       ['stock'],
    dependencies:  ['pkg_sales'],
    price:         19,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-storage',
    color:         'warning',
    isSystem:      false,
    order:         3,
    state:         true
  },

  // ─── FACTURACIÓN AVANZADA ─────────────────────────────────────────────────
  {
    code:          'pkg_sales_advanced',
    name:          'Facturación Avanzada',
    description:   'Presupuestos, pedidos de cliente y proformas/albaranes.',
    modules:       ['quotes', 'orders', 'proformas'],
    dependencies:  ['pkg_sales'],
    price:         19,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-clipboard',
    color:         'info',
    isSystem:      false,
    order:         3,
    state:         true
  },

  // ─── PUNTO DE VENTA (POS) ─────────────────────────────────────────────────
  {
    code:          'pkg_pos',
    name:          'Punto de Venta (POS)',
    description:   'Caja registradora táctil con gestión de terminales, apertura/cierre de caja, ventas multi-método de pago (efectivo, tarjeta, transferencia), impresora térmica ESC/POS y lector de código de barras.',
    modules:       ['pos'],
    dependencies:  ['pkg_sales'],
    price:         15,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-calculator',
    color:         'success',
    isSystem:      false,
    order:         4,
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
    description:   'Órdenes de compra a proveedores con recepción de mercancía, control de costos y actualización automática de inventario.',
    modules:       ['purchases'],
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

  // ─── GESTIÓN DE EQUIPO ────────────────────────────────────────────────────
  {
    code:          'pkg_team_mgmt',
    name:          'Gestión de Equipo',
    description:   'Proyectos, tareas Kanban, control de tiempos y solicitudes de clientes. Ideal para equipos de desarrollo y soporte.',
    modules:       ['teamManagement'],
    dependencies:  ['pkg_base'],
    price:         49,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-people',
    color:         'primary',
    isSystem:      false,
    order:         5,
    state:         true
  },

  // ─── CONTABILIDAD ─────────────────────────────────────────────────────────
  {
    code:          'pkg_accounting',
    name:          'Módulo Contabilidad',
    description:   'Contabilidad completa: plan de cuentas Ecuador (NIIF), asientos manuales y automáticos, libro diario, libro mayor, balance de comprobación, centros de costo y ejercicios contables.',
    modules:       ['accounting'],
    dependencies:  ['pkg_sri'],
    price:         29,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-calculator',
    color:         'dark',
    isSystem:      false,
    order:         8,
    state:         true
  },

  // ─── BENEFICIOS ───────────────────────────────────────────────────────────
  {
    code:          'pkg_benefits',
    name:          'Módulo de Beneficios',
    description:   'Dashboard de beneficios por socio, gestión de socios y liquidaciones. Ideal para empresas con programas de fidelización o distribución de utilidades.',
    modules:       ['benefits'],
    dependencies:  ['pkg_sales'],
    price:         19,
    currency:      'USD',
    billingPeriod: 'monthly',
    icon:          'cil-chart-pie',
    color:         'success',
    isSystem:      false,
    order:         9,
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
