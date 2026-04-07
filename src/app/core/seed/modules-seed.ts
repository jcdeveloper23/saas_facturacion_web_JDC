/**
 * modules-seed.ts
 *
 * Seed data para el catálogo de módulos en Firestore /modules.
 * Derivado del fs_pages.json exportado desde FacturaScripts (sistema PHP legado).
 *
 * CÓMO USAR:
 *   Este seed define los módulos "principales" del ERP (los que aparecen en el menú).
 *   Los módulos de detalle (show_on_menu=0) son vistas internas, no plugins independientes.
 *
 * EJECUTAR (desde Firebase Console → Functions → Shell, o script admin):
 *   import { seedModules } from './modules-seed';
 *   await seedModules(adminFirestore);
 */

export interface ModuleSeed {
  code: string;
  name: string;
  description: string;
  dependencies: string[];
  url: string | null;
  icon: string;
  isTitle: boolean;
  parent_id: string | null;
  showInMenu: boolean;
  order: number;
  state: boolean;
  // FacturaScripts origin for traceability
  fs_folder: string;     // folder en fs_pages: 'ventas', 'compras', 'admin', etc.
  fs_name: string;       // name original en fs_pages
}

/**
 * Módulos principales derivados de fs_pages (show_on_menu=1 en el sistema PHP).
 * Mapeados al esquema Angular/Firebase con los equivalentes modernos.
 *
 * Grupos (folders en FacturaScripts → módulos en Angular):
 *   admin       → settings, users
 *   ventas      → personas, products, invoices, quotes, orders, stock
 *   compras     → suppliers, purchase-invoices, purchase-orders
 *   TPV         → pos
 *   informes    → dashboard, reports
 *   contabilidad → accounting (fase futura)
 */
export const MODULES_SEED: ModuleSeed[] = [

  // ─── SEPARADORES DE SECCIÓN ───────────────────────────────────────────────

  {
    code: 'title_ventas',   name: 'Ventas',         description: 'Sección de ventas',
    dependencies: [], url: null, icon: 'cil-cart', isTitle: true, parent_id: null,
    showInMenu: true, order: 10, state: true, fs_folder: 'ventas', fs_name: 'title_ventas'
  },
  {
    code: 'title_compras',  name: 'Compras',        description: 'Sección de compras',
    dependencies: [], url: null, icon: 'cil-basket', isTitle: true, parent_id: null,
    showInMenu: true, order: 30, state: true, fs_folder: 'compras', fs_name: 'title_compras'
  },
  {
    code: 'title_almacen',  name: 'Almacén',        description: 'Sección de inventario',
    dependencies: [], url: null, icon: 'cil-storage', isTitle: true, parent_id: null,
    showInMenu: true, order: 50, state: true, fs_folder: 'ventas', fs_name: 'title_almacen'
  },
  {
    code: 'title_informes', name: 'Informes',       description: 'Sección de reportes',
    dependencies: [], url: null, icon: 'cil-chart-pie', isTitle: true, parent_id: null,
    showInMenu: true, order: 70, state: true, fs_folder: 'informes', fs_name: 'title_informes'
  },
  {
    code: 'title_config',   name: 'Configuración',  description: 'Ajustes del sistema',
    dependencies: [], url: null, icon: 'cil-settings', isTitle: true, parent_id: null,
    showInMenu: true, order: 90, state: true, fs_folder: 'admin', fs_name: 'title_config'
  },

  // ─── DASHBOARD ────────────────────────────────────────────────────────────

  {
    code: 'dashboard',
    name: 'Dashboard',
    description: 'Panel de control con KPIs y estadísticas de ventas',
    dependencies: [],
    url: '/dashboard',
    icon: 'cil-speedometer',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 1, state: true,
    fs_folder: 'informes', fs_name: 'dashboard'
  },

  // ─── VENTAS ───────────────────────────────────────────────────────────────

  {
    code: 'personas',
    name: 'Personas',
    description: 'Gestión centralizada de clientes, proveedores, empleados y contactos',
    dependencies: [],
    url: '/personas',
    icon: 'cil-people',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 11, state: true,
    fs_folder: 'ventas', fs_name: 'ventas_clientes'
  },
  {
    code: 'products',
    name: 'Artículos',
    description: 'Catálogo de productos y servicios con precios, stock y familias',
    dependencies: [],
    url: '/products',
    icon: 'cil-tag',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 12, state: true,
    fs_folder: 'ventas', fs_name: 'ventas_articulos'
  },
  {
    code: 'invoices',
    name: 'Facturas',
    description: 'Facturas de venta con descuentos, impuestos y líneas de detalle',
    dependencies: ['personas', 'products'],
    url: '/invoices',
    icon: 'cil-description',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 13, state: true,
    fs_folder: 'ventas', fs_name: 'ventas_facturas'
  },
  {
    code: 'quotes',
    name: 'Presupuestos',
    description: 'Presupuestos convertibles a pedido o factura',
    dependencies: ['personas', 'products'],
    url: '/quotes',
    icon: 'cil-clipboard',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 14, state: true,
    fs_folder: 'ventas', fs_name: 'ventas_presupuestos'
  },
  {
    code: 'orders',
    name: 'Pedidos',
    description: 'Pedidos de cliente con estado y conversión a factura',
    dependencies: ['personas', 'products'],
    url: '/orders',
    icon: 'cil-list',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 15, state: true,
    fs_folder: 'ventas', fs_name: 'ventas_pedidos'
  },
  {
    code: 'proformas',
    name: 'Proformas',
    description: 'Notas de entrega / albaranes de cliente',
    dependencies: ['personas', 'products'],
    url: '/proformas',
    icon: 'cil-note',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 16, state: true,
    fs_folder: 'ventas', fs_name: 'ventas_albaranes'
  },

  // ─── COMPRAS ──────────────────────────────────────────────────────────────

  {
    code: 'suppliers',
    name: 'Proveedores',
    description: 'Gestión de proveedores y acreedores (integrado en módulo Personas)',
    dependencies: ['personas'],
    url: '/personas?role=supplier',
    icon: 'cil-truck',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 31, state: true,
    fs_folder: 'compras', fs_name: 'compras_proveedores'
  },
  {
    code: 'purchase_invoices',
    name: 'Facturas de Compra',
    description: 'Facturas recibidas de proveedores',
    dependencies: ['suppliers', 'products'],
    url: '/purchase-invoices',
    icon: 'cil-inbox',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 32, state: true,
    fs_folder: 'compras', fs_name: 'compras_facturas'
  },
  {
    code: 'purchase_orders',
    name: 'Pedidos de Compra',
    description: 'Órdenes de compra a proveedores',
    dependencies: ['suppliers', 'products'],
    url: '/purchase-orders',
    icon: 'cil-cart',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 33, state: true,
    fs_folder: 'compras', fs_name: 'compras_pedidos'
  },
  {
    code: 'purchase_proformas',
    name: 'Proformas de Compra',
    description: 'Notas de entrega / albaranes de proveedor',
    dependencies: ['suppliers', 'products'],
    url: '/purchase-proformas',
    icon: 'cil-note',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 34, state: true,
    fs_folder: 'compras', fs_name: 'compras_albaranes'
  },

  // ─── ALMACÉN / STOCK ──────────────────────────────────────────────────────

  {
    code: 'stock',
    name: 'Inventario',
    description: 'Control de stock por almacén, ajustes y transferencias',
    dependencies: ['products'],
    url: '/stock',
    icon: 'cil-storage',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 51, state: true,
    fs_folder: 'ventas', fs_name: 'ventas_articulos'
  },

  // ─── TPV / POS ────────────────────────────────────────────────────────────

  {
    code: 'pos',
    name: 'Punto de Venta',
    description: 'Terminal punto de venta con apertura/cierre de caja y cobro',
    dependencies: ['invoices', 'stock'],
    url: '/pos',
    icon: 'cil-calculator',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 20, state: true,
    fs_folder: 'TPV', fs_name: 'tpv_recambios'
  },

  // ─── SRI / FACTURACIÓN ELECTRÓNICA ───────────────────────────────────────

  {
    code: 'sri',
    name: 'Fact. Electrónica',
    description: 'Emisión y autorización de comprobantes electrónicos ante el SRI (Ecuador)',
    dependencies: ['invoices'],
    url: '/electronic-invoicing',
    icon: 'cil-file',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 17, state: true,
    fs_folder: 'ventas', fs_name: 'sri_documentos'
  },

  // ─── INFORMES ─────────────────────────────────────────────────────────────

  {
    code: 'report_invoices',
    name: 'Informe Facturas',
    description: 'Reporte de ventas por periodo, cliente y producto',
    dependencies: ['invoices'],
    url: '/reports/invoices',
    icon: 'cil-chart-line',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 71, state: true,
    fs_folder: 'informes', fs_name: 'informe_facturas'
  },
  {
    code: 'report_products',
    name: 'Informe Artículos',
    description: 'Rotación de inventario, ranking de ventas',
    dependencies: ['products'],
    url: '/reports/products',
    icon: 'cil-bar-chart',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 72, state: true,
    fs_folder: 'informes', fs_name: 'informe_articulos'
  },
  {
    code: 'report_orders',
    name: 'Informe Pedidos',
    description: 'Estado y seguimiento de pedidos',
    dependencies: ['orders'],
    url: '/reports/orders',
    icon: 'cil-chart',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 73, state: true,
    fs_folder: 'informes', fs_name: 'informe_pedidos'
  },

  // ─── CONFIGURACIÓN ────────────────────────────────────────────────────────

  {
    code: 'settings',
    name: 'Mi Empresa',
    description: 'Configuración de la empresa: datos fiscales, almacenes, series, impuestos',
    dependencies: [],
    url: '/settings',
    icon: 'cil-settings',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 91, state: true,
    fs_folder: 'admin', fs_name: 'admin_empresa'
  },
  {
    code: 'users',
    name: 'Usuarios',
    description: 'Gestión de usuarios del sistema con roles y permisos',
    dependencies: [],
    url: '/users',
    icon: 'cil-user-follow',
    isTitle: false, parent_id: null,
    showInMenu: true, order: 92, state: true,
    fs_folder: 'admin', fs_name: 'admin_users'
  },
];

/**
 * Seed de acciones básicas para el catálogo de permisos
 */
export const ACTIONS_SEED = [
  { code: 'view',     name: 'Ver',        description: 'Visualizar listados y detalles',            state: true },
  { code: 'create',   name: 'Crear',      description: 'Crear nuevos registros',                    state: true },
  { code: 'edit',     name: 'Editar',     description: 'Modificar registros existentes',             state: true },
  { code: 'delete',   name: 'Eliminar',   description: 'Eliminar o desactivar registros',            state: true },
  { code: 'export',   name: 'Exportar',   description: 'Exportar datos a Excel/PDF',                 state: true },
  { code: 'approve',  name: 'Aprobar',    description: 'Aprobar documentos o ajustes críticos',      state: true },
  { code: 'print',    name: 'Imprimir',   description: 'Generar e imprimir documentos',              state: true },
];
