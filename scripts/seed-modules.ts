/**
 * seed-modules.ts — Seed del catálogo de módulos en Firestore /modules
 *
 * Siembra todos los módulos reales del sistema (auditados contra app.routes.ts
 * y cada features/**.routes.ts). El doc ID es igual al code del módulo para
 * trazabilidad y lookup O(1).
 *
 * EJECUCIÓN:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     npx ts-node --esm scripts/seed-modules.ts
 *
 *   # Con emulador:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *     npx ts-node scripts/seed-modules.ts
 *
 * COMPORTAMIENTO:
 *   - Usa setDoc con merge:true → idempotente, re-ejecutable.
 *   - No borra módulos existentes fuera del catálogo.
 *   - Los módulos no implementados (quotes, orders, proformas) se siembran con
 *     showInMenu:false para que no aparezcan en el sidebar hasta estar listos.
 *
 * ESTRUCTURA Firestore /modules/{code}:
 *   code        — slug único, coincide con el doc ID y con permission strings
 *   name        — nombre visible en el sidebar
 *   description — descripción breve
 *   url         — ruta Angular (null para títulos de sección)
 *   icon        — ícono CoreUI (formato 'cil-speedometer')
 *   isTitle     — true = separador de sección en el sidebar
 *   parent_id   — code del módulo padre (null = raíz)
 *   showInMenu  — false = oculto hasta implementar
 *   dependencies— codes de módulos que deben estar activos primero
 *   order       — orden de aparición en el sidebar (global)
 *   state       — true = habilitado en el catálogo de la plataforma
 */

import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db  = admin.firestore();
const now = admin.firestore.Timestamp.now();

// ─── Tipo ─────────────────────────────────────────────────────────────────────

interface SeedModule {
  code:         string;
  name:         string;
  description:  string;
  url:          string | null;
  icon:         string;
  isTitle:      boolean;
  parent_id:    string | null;
  showInMenu:   boolean;
  dependencies: string[];
  order:        number;
  state:        boolean;
}

// ─── Catálogo de módulos ──────────────────────────────────────────────────────

const modules: SeedModule[] = [

  // ═══════════════════════════════════════════════════════
  //  VENTAS
  // ═══════════════════════════════════════════════════════
  {
    code: 'ventas', name: 'Ventas', description: 'Módulos de ventas y facturación',
    url: null, icon: '', isTitle: true, parent_id: null, showInMenu: true,
    dependencies: [], order: 0, state: true,
  },
  {
    code: 'dashboard', name: 'Dashboard',
    description: 'Panel de control principal con KPIs, métricas de ventas y accesos rápidos.',
    url: '/dashboard', icon: 'cil-speedometer', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: [], order: 1, state: true,
  },
  {
    code: 'invoices', name: 'Facturas',
    description: 'Emisión y gestión de facturas de venta. Integrado con firma electrónica SRI.',
    url: '/invoices', icon: 'cil-description', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['personas', 'products'], order: 2, state: true,
  },
  {
    code: 'debit_notes', name: 'Notas de Débito',
    description: 'Emisión de notas de débito electrónicas al SRI.',
    url: '/debit-notes', icon: 'cil-plus', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['invoices'], order: 3, state: true,
  },
  {
    code: 'retentions', name: 'Retenciones',
    description: 'Comprobantes de retención en la fuente (agentes retenedores).',
    url: '/retentions', icon: 'cil-inbox', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['invoices', 'purchases'], order: 4, state: true,
  },
  {
    code: 'pos', name: 'Punto de Venta',
    description: 'Interfaz de caja rápida para ventas presenciales con gestión de sesiones y cierre de caja.',
    url: '/pos', icon: 'cil-calculator', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['invoices', 'products'], order: 5, state: true,
  },
  {
    code: 'marketplace', name: 'Pedidos del Catálogo',
    description: 'Gestión de pedidos recibidos desde el catálogo público.',
    url: '/marketplace-orders', icon: 'cil-basket', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['invoices'], order: 6, state: true,
  },

  // ── No implementados — showInMenu:false ────────────────────────────────────
  {
    code: 'quotes', name: 'Presupuestos',
    description: 'Generación de cotizaciones y presupuestos. Pendiente de implementación.',
    url: '/quotes', icon: 'cil-clipboard', isTitle: false, parent_id: null, showInMenu: false,
    dependencies: ['personas', 'products'], order: 7, state: false,
  },
  {
    code: 'orders', name: 'Pedidos',
    description: 'Órdenes de venta. Pendiente de implementación.',
    url: '/orders', icon: 'cil-list', isTitle: false, parent_id: null, showInMenu: false,
    dependencies: ['personas', 'products'], order: 8, state: false,
  },
  {
    code: 'proformas', name: 'Proformas',
    description: 'Documentos proforma previos a la factura. Pendiente de implementación.',
    url: '/proformas', icon: 'cil-note', isTitle: false, parent_id: null, showInMenu: false,
    dependencies: ['personas', 'products'], order: 9, state: false,
  },

  // ═══════════════════════════════════════════════════════
  //  CATÁLOGO
  // ═══════════════════════════════════════════════════════
  {
    code: 'catalogo', name: 'Catálogo', description: 'Catálogo de personas y artículos',
    url: null, icon: '', isTitle: true, parent_id: null, showInMenu: true,
    dependencies: [], order: 10, state: true,
  },
  {
    code: 'personas', name: 'Personas',
    description: 'Directorio unificado de clientes, proveedores y empleados (RUC, cédula, pasaporte).',
    url: '/personas', icon: 'cil-people', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: [], order: 11, state: true,
  },
  {
    code: 'products', name: 'Artículos',
    description: 'Catálogo de productos y servicios con precios, impuestos y control de stock.',
    url: '/products', icon: 'cil-tag', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['personas'], order: 12, state: true,
  },

  // ═══════════════════════════════════════════════════════
  //  ALMACÉN
  // ═══════════════════════════════════════════════════════
  {
    code: 'almacen', name: 'Almacén', description: 'Inventario y gestión de compras',
    url: null, icon: '', isTitle: true, parent_id: null, showInMenu: true,
    dependencies: [], order: 20, state: true,
  },
  // stock — padre con hijos: overview y movements
  {
    code: 'stock', name: 'Inventario',
    description: 'Control de inventario por bodega, kardex y valorización de existencias.',
    url: '/stock', icon: 'cil-storage', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['products'], order: 21, state: true,
  },
  {
    code: 'stock_overview', name: 'Stock por Producto',
    description: 'Vista de stock actual por producto y bodega.',
    url: '/stock', icon: '', isTitle: false, parent_id: 'stock', showInMenu: true,
    dependencies: ['stock'], order: 211, state: true,
  },
  {
    code: 'stock_movements', name: 'Movimientos',
    description: 'Historial de movimientos de entrada y salida de inventario.',
    url: '/stock/movements', icon: '', isTitle: false, parent_id: 'stock', showInMenu: true,
    dependencies: ['stock'], order: 212, state: true,
  },
  // purchases — padre con hijos
  {
    code: 'purchases', name: 'Compras',
    description: 'Registro y gestión de órdenes de compra con homologación desde XML del SRI.',
    url: '/purchases', icon: 'cil-basket', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['personas', 'products'], order: 22, state: true,
  },
  {
    code: 'purchases_list', name: 'Órdenes de Compra',
    description: 'Listado de órdenes de compra.',
    url: '/purchases', icon: '', isTitle: false, parent_id: 'purchases', showInMenu: true,
    dependencies: ['purchases'], order: 221, state: true,
  },
  {
    code: 'purchases_new', name: 'Nueva Compra',
    description: 'Crear nueva orden de compra manualmente.',
    url: '/purchases/new', icon: '', isTitle: false, parent_id: 'purchases', showInMenu: true,
    dependencies: ['purchases'], order: 222, state: true,
  },
  {
    code: 'purchases_mappings', name: 'Homologación',
    description: 'Mapeo de productos del proveedor al catálogo interno.',
    url: '/purchases/mappings', icon: '', isTitle: false, parent_id: 'purchases', showInMenu: true,
    dependencies: ['purchases'], order: 223, state: true,
  },

  // ═══════════════════════════════════════════════════════
  //  ANÁLISIS
  // ═══════════════════════════════════════════════════════
  {
    code: 'analisis', name: 'Análisis', description: 'Métricas y beneficios',
    url: null, icon: '', isTitle: true, parent_id: null, showInMenu: true,
    dependencies: [], order: 30, state: true,
  },
  {
    code: 'benefits', name: 'Beneficios',
    description: 'Dashboard de beneficios para socios: liquidaciones y historial de distribución.',
    url: '/benefits', icon: 'cil-chart-pie', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['invoices'], order: 31, state: true,
  },

  // ═══════════════════════════════════════════════════════
  //  CONTABILIDAD
  // ═══════════════════════════════════════════════════════
  {
    code: 'contabilidad', name: 'Contabilidad', description: 'Módulos contables y declaraciones SRI',
    url: null, icon: '', isTitle: true, parent_id: null, showInMenu: true,
    dependencies: [], order: 40, state: true,
  },
  {
    code: 'accounting', name: 'Plan de Cuentas',
    description: 'Plan de cuentas contable bajo NIC/NIIF. Árbol de cuentas editable.',
    url: '/accounting/chart-of-accounts', icon: 'cil-list', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['invoices', 'purchases'], order: 41, state: true,
  },
  {
    code: 'accounting_journal', name: 'Asientos Contables',
    description: 'Registro de asientos contables manuales y automáticos.',
    url: '/accounting/journal-entries', icon: 'cil-description', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['accounting'], order: 42, state: true,
  },
  // Reportes contables — padre con hijos
  {
    code: 'accounting_reports', name: 'Reportes Contables',
    description: 'Libro Diario, Mayor, Balance de Comprobación, Estado de Resultados y más.',
    url: '/accounting/libro-diario', icon: 'cil-chart-line', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['accounting'], order: 43, state: true,
  },
  {
    code: 'accounting_libro_diario', name: 'Libro Diario',
    url: '/accounting/libro-diario', icon: '', isTitle: false, parent_id: 'accounting_reports', showInMenu: true,
    description: 'Reporte del libro diario contable.', dependencies: ['accounting_reports'], order: 431, state: true,
  },
  {
    code: 'accounting_libro_mayor', name: 'Libro Mayor',
    url: '/accounting/libro-mayor', icon: '', isTitle: false, parent_id: 'accounting_reports', showInMenu: true,
    description: 'Reporte del libro mayor por cuenta.', dependencies: ['accounting_reports'], order: 432, state: true,
  },
  {
    code: 'accounting_balance_comp', name: 'Balance de Comprobación',
    url: '/accounting/balance-comprobacion', icon: '', isTitle: false, parent_id: 'accounting_reports', showInMenu: true,
    description: 'Balance de comprobación de sumas y saldos.', dependencies: ['accounting_reports'], order: 433, state: true,
  },
  {
    code: 'accounting_estado_resultados', name: 'Estado de Resultados',
    url: '/accounting/estado-resultados', icon: '', isTitle: false, parent_id: 'accounting_reports', showInMenu: true,
    description: 'Estado de pérdidas y ganancias del período.', dependencies: ['accounting_reports'], order: 434, state: true,
  },
  {
    code: 'accounting_balance_general', name: 'Balance General',
    url: '/accounting/balance-general', icon: '', isTitle: false, parent_id: 'accounting_reports', showInMenu: true,
    description: 'Balance general de activos, pasivos y patrimonio.', dependencies: ['accounting_reports'], order: 435, state: true,
  },
  {
    code: 'accounting_flujo_efectivo', name: 'Flujo de Efectivo',
    url: '/accounting/flujo-efectivo', icon: '', isTitle: false, parent_id: 'accounting_reports', showInMenu: true,
    description: 'Estado de flujo de efectivo del período.', dependencies: ['accounting_reports'], order: 436, state: true,
  },
  {
    code: 'accounting_aging', name: 'Antigüedad de Cartera',
    url: '/accounting/aging', icon: '', isTitle: false, parent_id: 'accounting_reports', showInMenu: true,
    description: 'Análisis de antigüedad de cuentas por cobrar y pagar.', dependencies: ['accounting_reports'], order: 437, state: true,
  },
  // Declaraciones SRI — padre con hijos
  {
    code: 'accounting_sri', name: 'Declaraciones SRI',
    description: 'Formularios de declaración al SRI: IVA, Retenciones, Impuesto a la Renta y ATS.',
    url: '/accounting/formulario-104', icon: 'cil-file', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['accounting'], order: 44, state: true,
  },
  {
    code: 'accounting_f104', name: 'Formulario 104 (IVA)',
    url: '/accounting/formulario-104', icon: '', isTitle: false, parent_id: 'accounting_sri', showInMenu: true,
    description: 'Declaración mensual/semestral del IVA.', dependencies: ['accounting_sri'], order: 441, state: true,
  },
  {
    code: 'accounting_f103', name: 'Formulario 103 (Retenciones)',
    url: '/accounting/formulario-103', icon: '', isTitle: false, parent_id: 'accounting_sri', showInMenu: true,
    description: 'Declaración de retenciones en la fuente.', dependencies: ['accounting_sri'], order: 442, state: true,
  },
  {
    code: 'accounting_f101', name: 'Formulario 101 (IR)',
    url: '/accounting/formulario-101', icon: '', isTitle: false, parent_id: 'accounting_sri', showInMenu: true,
    description: 'Declaración anual del Impuesto a la Renta.', dependencies: ['accounting_sri'], order: 443, state: true,
  },
  {
    code: 'accounting_ats', name: 'ATS',
    url: '/accounting/ats', icon: '', isTitle: false, parent_id: 'accounting_sri', showInMenu: true,
    description: 'Anexo Transaccional Simplificado.', dependencies: ['accounting_sri'], order: 444, state: true,
  },
  // Conciliación bancaria — padre con hijos
  {
    code: 'accounting_banking', name: 'Conciliación Bancaria',
    description: 'Conciliación de extractos bancarios, anticipos y caja chica.',
    url: '/accounting/bank-accounts', icon: 'cil-bank', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['accounting'], order: 45, state: true,
  },
  {
    code: 'accounting_bank_accounts', name: 'Cuentas Bancarias',
    url: '/accounting/bank-accounts', icon: '', isTitle: false, parent_id: 'accounting_banking', showInMenu: true,
    description: 'Gestión de cuentas bancarias de la empresa.', dependencies: ['accounting_banking'], order: 451, state: true,
  },
  {
    code: 'accounting_bank_reconciliation', name: 'Conciliar',
    url: '/accounting/bank-reconciliation', icon: '', isTitle: false, parent_id: 'accounting_banking', showInMenu: true,
    description: 'Herramienta de conciliación bancaria automática.', dependencies: ['accounting_banking'], order: 452, state: true,
  },
  {
    code: 'accounting_advances', name: 'Anticipos',
    url: '/accounting/advances', icon: '', isTitle: false, parent_id: 'accounting_banking', showInMenu: true,
    description: 'Gestión de anticipos de clientes y proveedores.', dependencies: ['accounting_banking'], order: 453, state: true,
  },
  {
    code: 'accounting_petty_cash', name: 'Caja Chica',
    url: '/accounting/petty-cash', icon: '', isTitle: false, parent_id: 'accounting_banking', showInMenu: true,
    description: 'Control de fondo de caja chica.', dependencies: ['accounting_banking'], order: 454, state: true,
  },
  // Presupuesto — padre con hijos
  {
    code: 'accounting_budget', name: 'Presupuesto',
    description: 'Definición y seguimiento de presupuesto vs ejecución real.',
    url: '/accounting/budget', icon: 'cil-money', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['accounting'], order: 46, state: true,
  },
  {
    code: 'accounting_budget_define', name: 'Definir Presupuesto',
    url: '/accounting/budget', icon: '', isTitle: false, parent_id: 'accounting_budget', showInMenu: true,
    description: 'Carga del presupuesto anual por cuenta y centro de costo.', dependencies: ['accounting_budget'], order: 461, state: true,
  },
  {
    code: 'accounting_budget_vs_real', name: 'Presupuesto vs Real',
    url: '/accounting/presupuesto-vs-real', icon: '', isTitle: false, parent_id: 'accounting_budget', showInMenu: true,
    description: 'Comparación de presupuesto planificado vs ejecución real.', dependencies: ['accounting_budget'], order: 462, state: true,
  },
  // Extras contables (sin hijos)
  {
    code: 'accounting_cost_centers', name: 'Centros de Costo',
    description: 'Gestión de centros de costo para contabilidad analítica.',
    url: '/accounting/cost-centers', icon: 'cil-sitemap', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['accounting'], order: 47, state: true,
  },
  {
    code: 'accounting_periods', name: 'Ejercicios Contables',
    description: 'Apertura y cierre de períodos contables.',
    url: '/accounting/periods', icon: 'cil-calendar', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['accounting'], order: 48, state: true,
  },
  {
    code: 'accounting_initial_balances', name: 'Saldos Iniciales',
    description: 'Carga de saldos iniciales para migración contable.',
    url: '/accounting/saldos-iniciales', icon: 'cil-spreadsheet', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['accounting'], order: 49, state: true,
  },
  {
    code: 'accounting_settings', name: 'Configuración Contable',
    description: 'Parámetros del módulo contable: cuentas por defecto, integración SRI.',
    url: '/accounting/settings', icon: 'cil-settings', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['accounting'], order: 50, state: true,
  },
  {
    code: 'accounting_audit_log', name: 'Log de Auditoría',
    description: 'Registro de auditoría de cambios en documentos contables.',
    url: '/accounting/audit-log', icon: 'cil-history', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['accounting'], order: 51, state: true,
  },

  // ═══════════════════════════════════════════════════════
  //  INFORMES
  // ═══════════════════════════════════════════════════════
  {
    code: 'informes', name: 'Informes', description: 'Reportes ejecutivos de ventas, compras y productos',
    url: null, icon: '', isTitle: true, parent_id: null, showInMenu: true,
    dependencies: [], order: 60, state: true,
  },
  {
    code: 'report_invoices', name: 'Reporte de Ventas',
    description: 'Reporte ejecutivo de ventas con filtros por período, cliente y producto.',
    url: '/reports/invoices', icon: 'cil-chart-line', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['invoices'], order: 61, state: true,
  },
  {
    code: 'report_purchases', name: 'Reporte de Compras',
    description: 'Reporte de compras por proveedor, período y categoría.',
    url: '/reports/purchases', icon: 'cil-basket', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['purchases'], order: 62, state: true,
  },
  {
    code: 'report_products', name: 'Reporte de Productos',
    description: 'Reporte de ventas y rentabilidad por producto y familia.',
    url: '/reports/products', icon: 'cil-bar-chart', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['products'], order: 63, state: true,
  },

  // ═══════════════════════════════════════════════════════
  //  EQUIPO
  // ═══════════════════════════════════════════════════════
  {
    code: 'equipo', name: 'Equipo', description: 'Gestión de proyectos, tareas y productividad del equipo',
    url: null, icon: '', isTitle: true, parent_id: null, showInMenu: true,
    dependencies: [], order: 70, state: true,
  },
  {
    code: 'team_management', name: 'Team Dashboard',
    description: 'Panel de control del equipo: velocidad, KPIs y carga de trabajo.',
    url: '/team-management/dashboard', icon: 'cil-speedometer', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: [], order: 71, state: true,
  },
  {
    code: 'team_kanban', name: 'Kanban',
    url: '/team-management/kanban', icon: 'cil-columns', isTitle: false, parent_id: 'team_management', showInMenu: true,
    description: 'Tablero Kanban de tareas del equipo.', dependencies: ['team_management'], order: 711, state: true,
  },
  {
    code: 'team_projects', name: 'Proyectos',
    url: '/team-management/projects', icon: 'cil-folder', isTitle: false, parent_id: 'team_management', showInMenu: true,
    description: 'Gestión de proyectos por cliente.', dependencies: ['team_management'], order: 712, state: true,
  },
  {
    code: 'team_tasks', name: 'Tareas',
    url: '/team-management/tasks', icon: 'cil-task', isTitle: false, parent_id: 'team_management', showInMenu: true,
    description: 'Lista y gestión de tareas.', dependencies: ['team_management'], order: 713, state: true,
  },
  {
    code: 'team_requests', name: 'Solicitudes',
    url: '/team-management/requests', icon: 'cil-inbox', isTitle: false, parent_id: 'team_management', showInMenu: true,
    description: 'Solicitudes de trabajo de clientes.', dependencies: ['team_management'], order: 714, state: true,
  },
  {
    code: 'team_timesheets', name: 'Tiempos',
    url: '/team-management/timesheets', icon: 'cil-clock', isTitle: false, parent_id: 'team_management', showInMenu: true,
    description: 'Control de horas trabajadas por tarea y proyecto.', dependencies: ['team_management'], order: 715, state: true,
  },
  {
    code: 'team_members', name: 'Equipo',
    url: '/team-management/members', icon: 'cil-people', isTitle: false, parent_id: 'team_management', showInMenu: true,
    description: 'Gestión de miembros del equipo.', dependencies: ['team_management'], order: 716, state: true,
  },
  {
    code: 'team_reports', name: 'Reportes de Equipo',
    url: '/team-management/reports', icon: 'cil-chart-line', isTitle: false, parent_id: 'team_management', showInMenu: true,
    description: 'Reportes de rendimiento y productividad.', dependencies: ['team_management'], order: 717, state: true,
  },
  {
    code: 'team_catalogs', name: 'Catálogos',
    url: '/team-management/catalogs', icon: 'cil-tag', isTitle: false, parent_id: 'team_management', showInMenu: true,
    description: 'Configuración de tipos de tarea, prioridades y estados.', dependencies: ['team_management'], order: 718, state: true,
  },

  // ═══════════════════════════════════════════════════════
  //  BAR ESCOLAR
  // ═══════════════════════════════════════════════════════
  {
    code: 'bar_escolar', name: 'Bar Escolar', description: 'Sistema de gestión del bar escolar con wallet y NFC',
    url: null, icon: '', isTitle: true, parent_id: null, showInMenu: true,
    dependencies: [], order: 80, state: true,
  },
  {
    code: 'school_setup', name: 'Configuración Bar',
    description: 'Configuración del bar escolar: turnos, categorías y parámetros generales.',
    url: '/school-bar/setup', icon: 'cil-settings', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: [], order: 81, state: true,
  },
  {
    code: 'school_menus', name: 'Menú del Día',
    description: 'Editor del menú diario del bar escolar.',
    url: '/school-bar/menus', icon: 'cil-restaurant', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['school_setup'], order: 82, state: true,
  },
  {
    code: 'school_orders', name: 'Órdenes',
    description: 'Tablero de preparación de órdenes en el bar.',
    url: '/school-bar/orders', icon: 'cil-list', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['school_setup'], order: 83, state: true,
  },
  {
    code: 'school_pos', name: 'POS Bar',
    description: 'Punto de venta del bar escolar con cobro por wallet y efectivo.',
    url: '/school-bar/pos', icon: 'cil-calculator', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['school_setup'], order: 84, state: true,
  },
  {
    code: 'school_wallet', name: 'Wallet & Recargas',
    description: 'Gestión de billeteras digitales y recargas de representantes.',
    url: '/school-bar/wallet', icon: 'cil-wallet', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['school_setup'], order: 85, state: true,
  },
  {
    code: 'school_accessories', name: 'Accesorios NFC',
    description: 'Gestión de tarjetas y pulseras NFC para pagos.',
    url: '/school-bar/accessories', icon: 'cil-credit-card', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['school_setup'], order: 86, state: true,
  },

  // ═══════════════════════════════════════════════════════
  //  ADMINISTRACIÓN
  // ═══════════════════════════════════════════════════════
  {
    code: 'administracion', name: 'Administración', description: 'Configuración, usuarios y roles del sistema',
    url: null, icon: '', isTitle: true, parent_id: null, showInMenu: true,
    dependencies: [], order: 90, state: true,
  },
  // settings — padre con hijos
  {
    code: 'settings', name: 'Configuración',
    description: 'Configuración de la empresa: series de documentos, impuestos, almacenes y parámetros generales.',
    url: '/settings/company', icon: 'cil-settings', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: [], order: 91, state: true,
  },
  {
    code: 'settings_company', name: 'Mi Empresa',
    url: '/settings/company', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Datos fiscales y branding de la empresa.', dependencies: ['settings'], order: 911, state: true,
  },
  {
    code: 'settings_warehouses', name: 'Almacenes',
    url: '/settings/warehouses', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Gestión de bodegas y almacenes.', dependencies: ['settings'], order: 912, state: true,
  },
  {
    code: 'settings_families', name: 'Familias',
    url: '/settings/families', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Familias de productos para agrupación y catálogo.', dependencies: ['settings'], order: 913, state: true,
  },
  {
    code: 'settings_series', name: 'Series de Documentos',
    url: '/settings/document-series', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Configuración de secuencias de numeración por tipo de documento.', dependencies: ['settings'], order: 914, state: true,
  },
  {
    code: 'settings_payment_terms', name: 'Métodos de Pago',
    url: '/settings/payment-terms', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Métodos y plazos de pago disponibles.', dependencies: ['settings'], order: 915, state: true,
  },
  {
    code: 'settings_tax_rates', name: 'Tasas de Impuestos',
    url: '/settings/tax-rates', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Configuración de tarifas IVA e ICE.', dependencies: ['settings'], order: 916, state: true,
  },
  {
    code: 'settings_currencies', name: 'Divisas',
    url: '/settings/currencies', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Divisas y tipos de cambio.', dependencies: ['settings'], order: 917, state: true,
  },
  {
    code: 'settings_countries', name: 'Países',
    url: '/settings/countries', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Catálogo de países para personas y direcciones.', dependencies: ['settings'], order: 918, state: true,
  },
  {
    code: 'settings_form_config', name: 'Formularios',
    url: '/settings/form-config', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Opciones de personalización de formularios.', dependencies: ['settings'], order: 919, state: true,
  },
  {
    code: 'settings_plugins', name: 'Mis Plugins',
    url: '/settings/plugins', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Módulos y paquetes activados en la empresa.', dependencies: ['settings'], order: 920, state: true,
  },
  {
    code: 'settings_marketplace', name: 'Catálogo Público',
    url: '/settings/marketplace', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Configuración del catálogo público (slug, WhatsApp, visibilidad).', dependencies: ['settings', 'marketplace'], order: 921, state: true,
  },
  {
    code: 'settings_subscription', name: 'Mi Suscripción',
    url: '/settings/subscription', icon: '', isTitle: false, parent_id: 'settings', showInMenu: true,
    description: 'Estado del plan y suscripción actual.', dependencies: ['settings'], order: 922, state: true,
  },
  // users y profiles
  {
    code: 'users', name: 'Usuarios',
    description: 'Gestión de usuarios de la empresa: creación, roles y estado.',
    url: '/users', icon: 'cil-user-follow', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['settings'], order: 92, state: true,
  },
  {
    code: 'profiles', name: 'Perfiles y Roles',
    description: 'Gestión de roles personalizados y asignación de permisos granulares.',
    url: '/profiles', icon: 'cil-lock-locked', isTitle: false, parent_id: null, showInMenu: true,
    dependencies: ['users'], order: 93, state: true,
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function seedModules(): Promise<void> {
  console.log('\n🧩  Seeding /modules…');

  // Firestore admite máximo 500 operaciones por batch; dividimos si hace falta.
  const BATCH_SIZE = 400;
  let batch        = db.batch();
  let opCount      = 0;
  let totalWritten = 0;

  for (const mod of modules) {
    const ref = db.collection('modules').doc(mod.code);
    batch.set(ref, {
      ...mod,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    const isTitle = mod.isTitle ? ' [TITLE]' : '';
    const hidden  = !mod.showInMenu ? ' [hidden]' : '';
    const parent  = mod.parent_id ? ` → ${mod.parent_id}` : '';
    console.log(`  ✓ modules/${mod.code.padEnd(36)} ${mod.name}${isTitle}${hidden}${parent}`);

    opCount++;
    totalWritten++;

    if (opCount >= BATCH_SIZE) {
      await batch.commit();
      batch    = db.batch();
      opCount  = 0;
      console.log(`  → Batch de ${BATCH_SIZE} enviado.`);
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  console.log(`  → ${totalWritten} módulos escritos.\n`);
}

async function main(): Promise<void> {
  console.log('🚀  SaasFacturacion — Seed de Módulos del Sistema');
  console.log('   Proyecto :', admin.app().options.projectId ?? '(default)');
  console.log('   Timestamp:', now.toDate().toISOString());
  console.log('   Total    :', modules.length, 'módulos');
  console.log('─'.repeat(60));

  await seedModules();

  console.log('─'.repeat(60));
  console.log('✅  Seed completado.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('❌  Error durante el seed:', err);
  process.exit(1);
});
