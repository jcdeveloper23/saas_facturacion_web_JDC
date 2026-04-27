/**
 * seed-plans.ts — Seed inicial de planes y paquetes de plugins en Firestore
 *
 * REQUISITOS:
 *   npm install -D firebase-admin ts-node typescript
 *
 * EJECUCIÓN:
 *   # Con Application Default Credentials (recomendado para desarrollo):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     npx ts-node --esm scripts/seed-plans.ts
 *
 *   # Con emulador local:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *     npx ts-node scripts/seed-plans.ts
 *
 * COMPORTAMIENTO:
 *   - Escribe con merge: no sobreescribe campos que existan y no estén en el seed.
 *   - Seguro para re-ejecutar (idempotente).
 *   - Los IDs de planes son: emprendedor | pyme | profesional | empresarial | ilimitado
 *   - Los IDs de paquetes coinciden con su code: pkg_base | pkg_sales | ...
 */

import * as admin from 'firebase-admin';

// ─── Inicialización ──────────────────────────────────────────────────────────

if (!admin.apps.length) {
  admin.initializeApp();
}

const db  = admin.firestore();
const now = admin.firestore.Timestamp.now();

// ─── Tipos (mirrors del frontend para garantizar consistencia) ────────────────

type BillingPeriod = 'monthly' | 'yearly' | 'one_time';

interface SeedPlan {
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  billingPeriod: BillingPeriod;
  trialDays: number;
  sortOrder: number;
  isActive: boolean;
  isPublic: boolean;
  badge?: string;
  badgeColor?: string;
  // Metadatos de presentación
  color: string;
  audience: string;
  highlights: string[];
  // Paquetes incluidos
  includedPackages: string[];
  // Límites
  limits: {
    sri: {
      invoicesPerMonth: number;
      invoicesPerYear: number;
      creditNotesPerMonth: number;
      debitNotesPerMonth: number;
      retentionsPerMonth: number;
      purchasesPerMonth: number;
      remissionsPerMonth: number;
      totalSriDocsPerMonth: number;
    };
    masterData: {
      personasTotal: number;
      customersTotal: number;
      suppliersTotal: number;
      employeesTotal: number;
      productsTotal: number;
      familiesTotal: number;
      manufacturersTotal: number;
      warehousesTotal: number;
      costCentersTotal: number;
      priceListsTotal: number;
    };
    users: {
      activeUsersPerCompany: number;
      customRolesPerCompany: number;
      concurrentSessionsPerUser: number;
    };
    multiCompany: {
      companiesPerAccount: number;
    };
    operations: {
      activeProjectsTotal: number;
      tasksPerMonth: number;
      exportsPerMonth: number;
      scheduledReportsTotal: number;
      activeIntegrationsTotal: number;
      apiCallsPerMonth: number;
    };
    infra: {
      storageGb: number;
      documentHistoryMonths: number;
      usageHistoryMonths: number;
    };
  };
  features: {
    electronicInvoicing: boolean;
    purchasesModule: boolean;
    accountingModule: boolean;
    stockModule: boolean;
    teamManagementModule: boolean;
    publicCatalogModule: boolean;
    publicApiModule: boolean;
    prioritySupport: boolean;
    betaAccess: boolean;
    multiCompanyMode: boolean;
  };
}

interface SeedPackage {
  code: string;
  name: string;
  description: string;
  modules: string[];
  dependencies: string[];
  price: number;
  currency: 'USD';
  billingPeriod: BillingPeriod;
  icon: string;
  color: string;
  isSystem: boolean;
  order: number;
  state: boolean;
}

// ─── Constante: todos los paquetes ───────────────────────────────────────────

const ALL_PACKAGES = [
  'pkg_base', 'pkg_sales', 'pkg_stock', 'pkg_sri',
  'pkg_accounting', 'pkg_purchases', 'pkg_sales_advanced',
  'pkg_pos', 'pkg_reports', 'pkg_marketplace', 'pkg_team_mgmt'
];

// ─── PLANES ──────────────────────────────────────────────────────────────────

const plans: Record<string, SeedPlan> = {

  // ── 1. EMPRENDEDOR ────────────────────────────────────────────────────────
  emprendedor: {
    name:         'Emprendedor',
    description:  'Ideal para personas naturales, RIMPE y negocios unipersonales que inician su actividad con facturación electrónica SRI.',
    priceMonthly: 15,
    priceYearly:  12,
    billingPeriod: 'monthly',
    trialDays:    14,
    sortOrder:    1,
    isActive:     true,
    isPublic:     true,
    color:        'success',
    audience:     'Personas naturales, RIMPE, autónomos',
    highlights:   ['50 facturas/mes', '1 usuario', '100 personas', '200 productos', 'Catálogo público'],
    includedPackages: ['pkg_base', 'pkg_sales', 'pkg_sri', 'pkg_marketplace'],
    limits: {
      sri: {
        invoicesPerMonth:    50,
        invoicesPerYear:     600,
        creditNotesPerMonth: 10,
        debitNotesPerMonth:  0,    // no emite notas de débito
        retentionsPerMonth:  0,    // no es agente retenedor
        purchasesPerMonth:   0,
        remissionsPerMonth:  0,
        totalSriDocsPerMonth: -1   // sin cap global — se usan límites individuales
      },
      masterData: {
        personasTotal:       100,
        customersTotal:      100,
        suppliersTotal:      50,
        employeesTotal:      0,    // RRHH no disponible
        productsTotal:       200,
        familiesTotal:       10,
        manufacturersTotal:  10,
        warehousesTotal:     1,
        costCentersTotal:    0,    // sin contabilidad analítica
        priceListsTotal:     1
      },
      users: {
        activeUsersPerCompany:    1,
        customRolesPerCompany:    0,   // solo roles de sistema
        concurrentSessionsPerUser: -1  // ilimitado (futuro)
      },
      multiCompany: {
        companiesPerAccount: 1   // modelo 1 usuario = 1 empresa
      },
      operations: {
        activeProjectsTotal:    0,   // Team Management no disponible
        tasksPerMonth:          0,
        exportsPerMonth:        20,
        scheduledReportsTotal:  0,
        activeIntegrationsTotal: 0,
        apiCallsPerMonth:       0
      },
      infra: {
        storageGb:             1,
        documentHistoryMonths: 12,
        usageHistoryMonths:    3
      }
    },
    features: {
      electronicInvoicing: true,
      purchasesModule:     false,
      accountingModule:    false,
      stockModule:         false,
      teamManagementModule: false,
      publicCatalogModule: true,
      publicApiModule:     false,
      prioritySupport:     false,
      betaAccess:          false,
      multiCompanyMode:    false
    }
  },

  // ── 2. PYME ───────────────────────────────────────────────────────────────
  pyme: {
    name:         'PYME',
    description:  'Para pequeñas empresas con agente retenedor, control de inventario y módulo de compras.',
    priceMonthly: 39,
    priceYearly:  32,
    billingPeriod: 'monthly',
    trialDays:    14,
    sortOrder:    2,
    isActive:     true,
    isPublic:     true,
    color:        'primary',
    audience:     'Pequeñas empresas con retenciones e inventario',
    highlights:   ['300 facturas/mes', '5 usuarios', '1.000 personas', '2.000 productos', 'Stock + Retenciones + Compras'],
    includedPackages: ['pkg_base', 'pkg_sales', 'pkg_stock', 'pkg_sri', 'pkg_purchases', 'pkg_marketplace'],
    limits: {
      sri: {
        invoicesPerMonth:    300,
        invoicesPerYear:     3600,
        creditNotesPerMonth: 50,
        debitNotesPerMonth:  30,
        retentionsPerMonth:  100,
        purchasesPerMonth:   100,
        remissionsPerMonth:  0,
        totalSriDocsPerMonth: -1
      },
      masterData: {
        personasTotal:       1000,
        customersTotal:      1000,
        suppliersTotal:      500,
        employeesTotal:      0,
        productsTotal:       2000,
        familiesTotal:       50,
        manufacturersTotal:  30,
        warehousesTotal:     3,
        costCentersTotal:    0,
        priceListsTotal:     3
      },
      users: {
        activeUsersPerCompany:    5,
        customRolesPerCompany:    0,
        concurrentSessionsPerUser: -1
      },
      multiCompany: {
        companiesPerAccount: 1
      },
      operations: {
        activeProjectsTotal:    0,
        tasksPerMonth:          0,
        exportsPerMonth:        100,
        scheduledReportsTotal:  0,
        activeIntegrationsTotal: 0,
        apiCallsPerMonth:       0
      },
      infra: {
        storageGb:             5,
        documentHistoryMonths: 24,
        usageHistoryMonths:    6
      }
    },
    features: {
      electronicInvoicing: true,
      purchasesModule:     true,
      accountingModule:    false,
      stockModule:         true,
      teamManagementModule: false,
      publicCatalogModule: true,
      publicApiModule:     false,
      prioritySupport:     false,
      betaAccess:          false,
      multiCompanyMode:    false
    }
  },

  // ── 3. PROFESIONAL ───────────────────────────────────────────────────────
  profesional: {
    name:         'Profesional',
    description:  'Medianas empresas, contadores independientes que gestionan hasta 5 empresas simultáneamente.',
    priceMonthly: 79,
    priceYearly:  65,
    billingPeriod: 'monthly',
    trialDays:    14,
    sortOrder:    3,
    isActive:     true,
    isPublic:     true,
    badge:        'Más popular',
    badgeColor:   'warning',
    color:        'warning',
    audience:     'Medianas empresas y contadores independientes',
    highlights:   ['1.000 facturas/mes', '15 usuarios', 'Personas y productos ilimitados', 'Hasta 5 empresas', 'Contabilidad + Team Management'],
    includedPackages: [
      'pkg_base', 'pkg_sales', 'pkg_stock', 'pkg_sri',
      'pkg_accounting', 'pkg_purchases', 'pkg_sales_advanced',
      'pkg_reports', 'pkg_marketplace', 'pkg_team_mgmt'
    ],
    limits: {
      sri: {
        invoicesPerMonth:    1000,
        invoicesPerYear:     12000,
        creditNotesPerMonth: 150,
        debitNotesPerMonth:  100,
        retentionsPerMonth:  300,
        purchasesPerMonth:   300,
        remissionsPerMonth:  0,
        totalSriDocsPerMonth: -1
      },
      masterData: {
        personasTotal:       -1,   // ilimitado
        customersTotal:      -1,
        suppliersTotal:      -1,
        employeesTotal:      0,
        productsTotal:       -1,
        familiesTotal:       -1,
        manufacturersTotal:  -1,
        warehousesTotal:     10,
        costCentersTotal:    20,
        priceListsTotal:     10
      },
      users: {
        activeUsersPerCompany:    15,
        customRolesPerCompany:    3,
        concurrentSessionsPerUser: -1
      },
      multiCompany: {
        companiesPerAccount: 5
      },
      operations: {
        activeProjectsTotal:    20,
        tasksPerMonth:          500,
        exportsPerMonth:        -1,
        scheduledReportsTotal:  5,
        activeIntegrationsTotal: 2,
        apiCallsPerMonth:       0
      },
      infra: {
        storageGb:             20,
        documentHistoryMonths: 36,
        usageHistoryMonths:    12
      }
    },
    features: {
      electronicInvoicing: true,
      purchasesModule:     true,
      accountingModule:    true,
      stockModule:         true,
      teamManagementModule: true,
      publicCatalogModule: true,
      publicApiModule:     false,
      prioritySupport:     false,
      betaAccess:          false,
      multiCompanyMode:    true
    }
  },

  // ── 4. EMPRESARIAL ────────────────────────────────────────────────────────
  empresarial: {
    name:         'Empresarial',
    description:  'Empresas medianas-grandes, grupos empresariales y despachos contables con múltiples empresas.',
    priceMonthly: 149,
    priceYearly:  120,
    billingPeriod: 'monthly',
    trialDays:    0,
    sortOrder:    4,
    isActive:     true,
    isPublic:     true,
    color:        'danger',
    audience:     'Medianas-grandes empresas y despachos contables',
    highlights:   ['5.000 facturas/mes', '50 usuarios', 'Todos los maestros ilimitados', 'Hasta 25 empresas', 'Soporte prioritario'],
    includedPackages: ALL_PACKAGES,
    limits: {
      sri: {
        invoicesPerMonth:    5000,
        invoicesPerYear:     60000,
        creditNotesPerMonth: 500,
        debitNotesPerMonth:  300,
        retentionsPerMonth:  1000,
        purchasesPerMonth:   1000,
        remissionsPerMonth:  0,
        totalSriDocsPerMonth: -1
      },
      masterData: {
        personasTotal:       -1,
        customersTotal:      -1,
        suppliersTotal:      -1,
        employeesTotal:      -1,
        productsTotal:       -1,
        familiesTotal:       -1,
        manufacturersTotal:  -1,
        warehousesTotal:     -1,
        costCentersTotal:    -1,
        priceListsTotal:     -1
      },
      users: {
        activeUsersPerCompany:    50,
        customRolesPerCompany:    10,
        concurrentSessionsPerUser: -1
      },
      multiCompany: {
        companiesPerAccount: 25
      },
      operations: {
        activeProjectsTotal:    -1,
        tasksPerMonth:          -1,
        exportsPerMonth:        -1,
        scheduledReportsTotal:  20,
        activeIntegrationsTotal: 10,
        apiCallsPerMonth:       10000
      },
      infra: {
        storageGb:             100,
        documentHistoryMonths: -1,   // retención permanente
        usageHistoryMonths:    24
      }
    },
    features: {
      electronicInvoicing: true,
      purchasesModule:     true,
      accountingModule:    true,
      stockModule:         true,
      teamManagementModule: true,
      publicCatalogModule: true,
      publicApiModule:     true,
      prioritySupport:     true,
      betaAccess:          false,
      multiCompanyMode:    true
    }
  },

  // ── 5. ILIMITADO ─────────────────────────────────────────────────────────
  ilimitado: {
    name:         'Ilimitado',
    description:  'Para grandes despachos contables y bureaux de servicios SRI con volúmenes muy altos.',
    priceMonthly: 299,
    priceYearly:  240,
    billingPeriod: 'monthly',
    trialDays:    0,
    sortOrder:    5,
    isActive:     true,
    isPublic:     true,
    color:        'dark',
    audience:     'Grandes despachos y bureaux de servicios',
    highlights:   ['Sin límites en todo', 'Usuarios ilimitados', 'Empresas ilimitadas', 'Soporte prioritario + Beta access', 'Retención documental permanente'],
    includedPackages: ALL_PACKAGES,
    limits: {
      sri: {
        invoicesPerMonth:    -1,
        invoicesPerYear:     -1,
        creditNotesPerMonth: -1,
        debitNotesPerMonth:  -1,
        retentionsPerMonth:  -1,
        purchasesPerMonth:   -1,
        remissionsPerMonth:  -1,
        totalSriDocsPerMonth: -1
      },
      masterData: {
        personasTotal:       -1,
        customersTotal:      -1,
        suppliersTotal:      -1,
        employeesTotal:      -1,
        productsTotal:       -1,
        familiesTotal:       -1,
        manufacturersTotal:  -1,
        warehousesTotal:     -1,
        costCentersTotal:    -1,
        priceListsTotal:     -1
      },
      users: {
        activeUsersPerCompany:    -1,
        customRolesPerCompany:    -1,
        concurrentSessionsPerUser: -1
      },
      multiCompany: {
        companiesPerAccount: -1
      },
      operations: {
        activeProjectsTotal:    -1,
        tasksPerMonth:          -1,
        exportsPerMonth:        -1,
        scheduledReportsTotal:  -1,
        activeIntegrationsTotal: -1,
        apiCallsPerMonth:       -1
      },
      infra: {
        storageGb:             -1,
        documentHistoryMonths: -1,
        usageHistoryMonths:    -1
      }
    },
    features: {
      electronicInvoicing: true,
      purchasesModule:     true,
      accountingModule:    true,
      stockModule:         true,
      teamManagementModule: true,
      publicCatalogModule: true,
      publicApiModule:     true,
      prioritySupport:     true,
      betaAccess:          true,
      multiCompanyMode:    true
    }
  }
};

// ─── PAQUETES DE PLUGINS ──────────────────────────────────────────────────────

const packages: SeedPackage[] = [
  {
    code: 'pkg_base',
    name: 'Base del Sistema',
    description: 'Siempre activo. Incluye dashboard, configuración de empresa y gestión de usuarios. No se puede desactivar.',
    modules: ['dashboard', 'settings', 'users'],
    dependencies: [],
    price: 0,
    currency: 'USD',
    billingPeriod: 'monthly',
    icon: 'cil-home',
    color: 'secondary',
    isSystem: true,
    order: 1,
    state: true
  },
  {
    code: 'pkg_sales',
    name: 'Facturación Base',
    description: 'El corazón del sistema. Permite gestionar clientes/proveedores, productos y emitir facturas. Requerido por casi todos los demás paquetes.',
    modules: ['personas', 'products', 'invoices'],
    dependencies: ['pkg_base'],
    price: 29,
    currency: 'USD',
    billingPeriod: 'monthly',
    icon: 'cil-description',
    color: 'primary',
    isSystem: false,
    order: 2,
    state: true
  },
  {
    code: 'pkg_sri',
    name: 'Facturación Electrónica SRI',
    description: 'Emisión de comprobantes electrónicos al SRI: facturas, notas de débito y retenciones en la fuente. Incluye firma electrónica y envío al webservice SRI.',
    modules: ['sri', 'debitNotes', 'retentions'],
    dependencies: ['pkg_sales'],
    price: 24,
    currency: 'USD',
    billingPeriod: 'monthly',
    icon: 'cil-badge',
    color: 'info',
    isSystem: false,
    order: 3,
    state: true
  },
  {
    code: 'pkg_stock',
    name: 'Inventario y Stock',
    description: 'Control de inventario, movimientos de stock, kardex y valorización de existencias por bodega.',
    modules: ['stock'],
    dependencies: ['pkg_sales'],
    price: 19,
    currency: 'USD',
    billingPeriod: 'monthly',
    icon: 'cil-storage',
    color: 'warning',
    isSystem: false,
    order: 4,
    state: true
  },
  {
    code: 'pkg_purchases',
    name: 'Módulo Compras',
    description: 'Registro y gestión de órdenes de compra, liquidaciones de compra y control de proveedores.',
    modules: ['purchases'],
    dependencies: ['pkg_sales'],
    price: 19,
    currency: 'USD',
    billingPeriod: 'monthly',
    icon: 'cil-cart',
    color: 'primary',
    isSystem: false,
    order: 5,
    state: true
  },
  {
    code: 'pkg_accounting',
    name: 'Módulo Contabilidad',
    description: 'Contabilidad general, plan de cuentas, asientos contables, centros de costo y reportes contables. Requiere pkg_sri para integración con documentos electrónicos.',
    modules: ['accounting'],
    dependencies: ['pkg_sri'],
    price: 29,
    currency: 'USD',
    billingPeriod: 'monthly',
    icon: 'cil-calculator',
    color: 'success',
    isSystem: false,
    order: 6,
    state: true
  },
  {
    code: 'pkg_sales_advanced',
    name: 'Ventas Avanzadas',
    description: 'Cotizaciones, órdenes de venta y proformas con flujo completo desde solicitud hasta factura.',
    modules: ['quotes', 'orders', 'proformas'],
    dependencies: ['pkg_sales'],
    price: 19,
    currency: 'USD',
    billingPeriod: 'monthly',
    icon: 'cil-layers',
    color: 'primary',
    isSystem: false,
    order: 7,
    state: true
  },
  {
    code: 'pkg_pos',
    name: 'Punto de Venta',
    description: 'Interfaz de caja rápida para ventas presenciales con gestión de sesiones, turno de caja y cierre de caja.',
    modules: ['pos'],
    dependencies: ['pkg_sales'],
    price: 15,
    currency: 'USD',
    billingPeriod: 'monthly',
    icon: 'cil-screen-desktop',
    color: 'success',
    isSystem: false,
    order: 8,
    state: true
  },
  {
    code: 'pkg_reports',
    name: 'Reportes Avanzados',
    description: 'Reportes ejecutivos de ventas, productos e inventario con exportación a Excel y PDF. Incluye reportes de rentabilidad y análisis de tendencias.',
    modules: ['report_invoices', 'report_products', 'report_orders'],
    dependencies: ['pkg_sales'],
    price: 9,
    currency: 'USD',
    billingPeriod: 'monthly',
    icon: 'cil-chart-pie',
    color: 'info',
    isSystem: false,
    order: 9,
    state: true
  },
  {
    code: 'pkg_marketplace',
    name: 'Catálogo Público',
    description: 'Catálogo web público con URL propia (slug), integración WhatsApp, gestión de precios visibles y familias de productos filtrables.',
    modules: ['marketplace'],
    dependencies: ['pkg_sales'],
    price: 15,
    currency: 'USD',
    billingPeriod: 'monthly',
    icon: 'cil-globe-alt',
    color: 'success',
    isSystem: false,
    order: 10,
    state: true
  },
  {
    code: 'pkg_team_mgmt',
    name: 'Gestión de Equipos',
    description: 'Gestión de proyectos, tareas, sprints, KPIs de productividad y seguimiento del rendimiento del equipo. Diseñado para equipos que atienden múltiples clientes.',
    modules: ['teamManagement'],
    dependencies: ['pkg_base'],
    price: 49,
    currency: 'USD',
    billingPeriod: 'monthly',
    icon: 'cil-people',
    color: 'warning',
    isSystem: false,
    order: 11,
    state: true
  }
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function seedPlans(): Promise<void> {
  console.log('\n📋  Seeding plans…');
  const batch = db.batch();

  for (const [planId, planData] of Object.entries(plans)) {
    const ref = db.collection('plans').doc(planId);
    batch.set(ref, {
      ...planData,
      createdAt: now,
      updatedAt: now
    }, { merge: true });
    console.log(`  ✓ plans/${planId} — ${planData.name} ($${planData.priceMonthly}/mes)`);
  }

  await batch.commit();
  console.log(`  → ${Object.keys(plans).length} planes escritos.\n`);
}

async function seedPackages(): Promise<void> {
  console.log('📦  Seeding plugin-packages…');
  const batch = db.batch();

  for (const pkg of packages) {
    const ref = db.collection('plugin-packages').doc(pkg.code);
    batch.set(ref, {
      ...pkg,
      createdAt: now,
      updatedAt: now
    }, { merge: true });
    console.log(`  ✓ plugin-packages/${pkg.code} — ${pkg.name} ($${pkg.price}/mes)`);
  }

  await batch.commit();
  console.log(`  → ${packages.length} paquetes escritos.\n`);
}

async function main(): Promise<void> {
  console.log('🚀  SaasFacturacion — Seed inicial de Planes y Paquetes');
  console.log('   Proyecto:', admin.app().options.projectId ?? '(default)');
  console.log('   Timestamp:', now.toDate().toISOString());
  console.log('─'.repeat(60));

  await seedPlans();
  await seedPackages();

  console.log('─'.repeat(60));
  console.log('✅  Seed completado.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('❌  Error durante el seed:', err);
  process.exit(1);
});
