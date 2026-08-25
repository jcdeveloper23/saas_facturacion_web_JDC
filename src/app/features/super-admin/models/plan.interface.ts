import { Timestamp } from '@angular/fire/firestore';

export type BillingPeriod = 'monthly' | 'yearly' | 'one_time';

// ─── Límites de documentos SRI ────────────────────────────────────────────────

export interface PlanSriLimits {
  invoicesPerMonth: number;        // facturas de venta (isCreditNote = false)
  invoicesPerYear: number;         // -1 = no aplica límite anual
  creditNotesPerMonth: number;     // notas de crédito (Invoice con isCreditNote = true)
  debitNotesPerMonth: number;      // 0 = no puede emitir notas de débito
  retentionsPerMonth: number;      // 0 = no es agente retenedor
  purchasesPerMonth: number;       // compras/liquidaciones registradas
  remissionsPerMonth: number;      // 0 = no disponible aún
  totalSriDocsPerMonth: number;    // cap global; -1 = ignorar, usar límites individuales
}

// ─── Límites de maestros de datos ─────────────────────────────────────────────

export interface PlanMasterDataLimits {
  personasTotal: number;           // entidad unificada /personas (clientes + proveedores + empleados)
  customersTotal: number;          // colección /customers (legado/paralela)
  suppliersTotal: number;          // personas con role 'supplier'
  employeesTotal: number;          // 0 = módulo RRHH no disponible
  productsTotal: number;           // productos y servicios
  familiesTotal: number;           // categorías de productos; 0 = sin categorización
  manufacturersTotal: number;      // marcas/fabricantes; 0 = sin marcas
  warehousesTotal: number;         // mínimo 1 (bodega principal siempre)
  costCentersTotal: number;        // 0 = sin contabilidad analítica
  priceListsTotal: number;         // 0 = precio único por producto
}

// ─── Límites de usuarios y acceso ─────────────────────────────────────────────

export interface PlanUserLimits {
  activeUsersPerCompany: number;     // mínimo 1 (el admin)
  customRolesPerCompany: number;     // 0 = solo roles de sistema (seller, accountant, cashier, read_only)
  concurrentSessionsPerUser: number; // -1 = ilimitado; futuro
}

// ─── Límites multi-empresa ─────────────────────────────────────────────────────

export interface PlanMultiCompanyLimits {
  /**
   * Cuántas empresas puede administrar UNA MISMA cuenta (uid).
   * Escenario: contador que lleva N empresas desde una sola cuenta SaaS.
   *   1  = modelo actual (1 usuario = 1 empresa)
   *  >1  = modo contador/despacho contable
   *  -1  = ilimitado
   */
  companiesPerAccount: number;
}

// ─── Límites de operaciones y colaboración ────────────────────────────────────

export interface PlanOperationsLimits {
  activeProjectsTotal: number;     // proyectos activos en Team Management; 0 = módulo no disponible
  tasksPerMonth: number;           // tareas creadas por mes; 0 = módulo no disponible
  exportsPerMonth: number;         // PDFs/Excels generados manualmente; -1 = ilimitado
  scheduledReportsTotal: number;   // reportes programados activos; 0 = sin scheduler
  activeIntegrationsTotal: number; // integraciones con APIs externas; 0 = sin integraciones
  apiCallsPerMonth: number;        // llamadas a la API pública de la empresa; 0 = sin API
}

// ─── Límites de infraestructura ───────────────────────────────────────────────

export interface PlanInfraLimits {
  storageGb: number;               // GB para PDFs, XMLs, imágenes, certificados p12
  documentHistoryMonths: number;   // meses de retención; -1 = permanente
  usageHistoryMonths: number;      // meses de contadores de uso conservados
}

// ─── Feature flags ────────────────────────────────────────────────────────────
//
// Módulos de negocio: controlan si la empresa puede usar una funcionalidad aunque
// tenga el paquete activo. Permiten bundles con el mismo set de paquetes pero
// comportamiento diferenciado por plan (ej. borrador vs. emisión real SRI).
//
// Doble condición para acceder a un módulo:
//   (1) features.[flag] === true         ← verificado por featureFlagGuard
//   (2) módulo está en enabledModules    ← verificado por moduleGuard existente
//
// Nivel de servicio: no están ligados a paquetes, son atributos del plan.

export interface PlanFeatureFlags {
  // ── Módulos de negocio ─────────────────────────────────────────────────────
  electronicInvoicing: boolean;    // false = solo modo borrador, no envía al SRI
  purchasesModule: boolean;        // false = módulo compras oculto aunque tenga pkg_purchases
  accountingModule: boolean;       // false = contabilidad oculta aunque tenga pkg_accounting
  stockModule: boolean;            // false = inventario oculto aunque tenga pkg_stock
  teamManagementModule: boolean;   // false = team mgmt oculto aunque tenga pkg_team_mgmt
  publicCatalogModule: boolean;    // false = catálogo público deshabilitado
  publicApiModule: boolean;        // false = API pública deshabilitada

  // ── Personalización y Marca Blanca ────────────────────────────────────────
  whiteLabelModule: boolean;       // false = solo logo básico; true = paleta, estilos, PDF branding

  // ── Nivel de servicio ──────────────────────────────────────────────────────
  prioritySupport: boolean;        // acceso a soporte prioritario (SLA reducido)
  betaAccess: boolean;             // acceso a features en beta antes del lanzamiento
  multiCompanyMode: boolean;       // habilita UI de cambio de empresa (requiere companiesPerAccount > 1)
}

// ─── Interface principal ──────────────────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;                    // 'Emprendedor', 'PYME', 'Profesional', 'Empresarial', 'Ilimitado'
  description: string;             // texto corto para cards de pricing
  priceMonthly: number;            // precio USD por mes (facturación mensual)
  priceYearly: number;             // precio USD por mes cuando se paga anual
  billingPeriod: BillingPeriod;    // periodo por defecto en pricing
  trialDays: number;               // 0 = sin trial
  sortOrder: number;               // orden de display: 1, 2, 3, 4, 5
  isActive: boolean;
  isPublic: boolean;               // false = plan interno/privado
  badge?: string;                  // 'Más popular', 'Recomendado'

  limits: {
    sri: PlanSriLimits;
    masterData: PlanMasterDataLimits;
    users: PlanUserLimits;
    multiCompany: PlanMultiCompanyLimits;
    operations: PlanOperationsLimits;
    infra: PlanInfraLimits;
  };

  features: PlanFeatureFlags;

  /**
   * Códigos de PAQUETES (PluginPackage.code) incluidos en este plan.
   * Ejemplos: ['pkg_base', 'pkg_sales', 'pkg_sri', 'pkg_marketplace']
   *
   * Al asignar el plan a una empresa, la CF assignPlanToCompany:
   *   1. Lee cada paquete de /plugin-packages
   *   2. Resuelve la unión de todos sus modules[]
   *   3. Escribe enabledPackages y enabledModules en la empresa
   *
   * ⚠️  Son códigos de PAQUETES, no de módulos. Los módulos siempre se
   *     derivan de los paquetes — nunca se listan módulos directamente aquí.
   */
  includedPackages: string[];

  // ─── Metadatos de presentación (UI / Guía Comercial) ─────────────────────────
  // Opcionales: se usan para renderizar la Guía Comercial y la página de pricing.
  // Se populan en el seed y se pueden editar desde el formulario de planes.
  color?: string;        // CoreUI color: 'success' | 'primary' | 'warning' | 'danger' | 'dark'
  badgeColor?: string;   // Color del badge de destacado: 'warning' | 'info' | etc.
  audience?: string;     // Perfil del cliente objetivo: 'Personas naturales, RIMPE…'
  highlights?: string[]; // Puntos clave de venta: ['50 facturas/mes', '1 usuario', …]

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PlanFormData = Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>;
