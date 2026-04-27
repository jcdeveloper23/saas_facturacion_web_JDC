import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Firestore, arrayUnion, doc, getDoc, getDocs, updateDoc, setDoc, writeBatch, collection, query, where, Timestamp, orderBy } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FirestoreService } from '../../../core/services/firestore.service';
import { Plan, PlanFormData } from '../models/plan.interface';
import { Company, CompanyFormData } from '../models/company.interface';
import { PluginPackage } from '../../../core/interfaces/permission.interface';

@Injectable({ providedIn: 'root' })
export class SuperAdminService {
  private fs        = inject(FirestoreService);
  private firestore = inject(Firestore);
  private functions = inject(Functions);

  // ─── Plans ───────────────────────────────────────────────────────────────

  /** IDs canónicos de los planes por defecto. */
  private static readonly CANONICAL_PLAN_IDS = new Set([
    'emprendedor', 'pyme', 'profesional', 'empresarial', 'ilimitado'
  ]);

  /**
   * Retorna los planes deduplicados por nombre.
   * Prefiere el doc cuyo ID está en CANONICAL_PLAN_IDS sobre los auto-generados.
   */
  getPlans(): Observable<Plan[]> {
    return this.fs.getRootCollection<Plan>('plans').pipe(
      map(plans => {
        const seen = new Map<string, Plan>();
        for (const p of plans) {
          const key = p.name?.toLowerCase() ?? p.id;
          const existing = seen.get(key);
          const isCanonical = SuperAdminService.CANONICAL_PLAN_IDS.has(p.id);
          if (!existing || isCanonical) seen.set(key, p);
        }
        return Array.from(seen.values()).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
      })
    );
  }

  /**
   * Retorna los paquetes deduplicados por code.
   * Prefiere el doc cuyo ID coincide con su propio campo code (e.g. pkg_sri).
   */
  getPluginPackages(): Observable<PluginPackage[]> {
    return this.fs.getRootCollection<PluginPackage>('plugin-packages').pipe(
      map(pkgs => {
        const seen = new Map<string, PluginPackage>();
        for (const pkg of pkgs) {
          if (!pkg.code) continue;
          const existing = seen.get(pkg.code);
          const isCanonical = pkg.id === pkg.code;
          if (!existing || isCanonical) seen.set(pkg.code, pkg);
        }
        return Array.from(seen.values()).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      })
    );
  }

  getPlan(id: string): Observable<Plan | undefined> {
    return this.fs.getRootDocument<Plan>('plans', id);
  }

  async createPlan(data: PlanFormData): Promise<string> {
    return this.fs.addRootDocument<PlanFormData>('plans', data);
  }

  async updatePlan(id: string, data: Partial<PlanFormData>): Promise<void> {
    return this.fs.updateRootDocument<Plan>('plans', id, data);
  }

  async deactivatePlan(id: string): Promise<void> {
    return this.fs.updateRootDocument<Plan>('plans', id, { isActive: false } as any);
  }

  // ─── Companies ───────────────────────────────────────────────────────────

  getCompanies(): Observable<Company[]> {
    return this.fs.getRootCollection<Company>('companies');
  }

  getCompany(id: string): Observable<Company | undefined> {
    return this.fs.getRootDocument<Company>('companies', id);
  }

  /**
   * Creates a company and triggers the setupCompany Cloud Function,
   * which creates default warehouses, tax rates, payment terms, and series.
   */
  async createCompany(data: CompanyFormData): Promise<string> {
    const setupCompany = httpsCallable<CompanyFormData, { companyId: string }>(
      this.functions,
      'setupCompany'
    );
    const result = await setupCompany(data);
    return result.data.companyId;
  }

  async updateCompany(id: string, data: Partial<CompanyFormData>): Promise<void> {
    return this.fs.updateRootDocument<Company>('companies', id, data);
  }

  async setCompanyStatus(id: string, status: Company['status']): Promise<void> {
    return this.fs.updateRootDocument<Company>('companies', id, { status } as any);
  }

  /**
   * Assigns custom claims to a user (companyId + role).
   * Used by super-admin to bootstrap first admin of a new company.
   */
  async setUserCustomClaims(targetUid: string, companyId: string, role: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'setUserCustomClaims');
    await fn({ targetUid, companyId, role });
  }

  /**
   * Asigna un plan a una empresa directamente en Firestore.
   * Resuelve módulos desde plan.includedPackages, preserva add-ons activos.
   * (Sustituye la CF assignPlanToCompany hasta que esté implementada en backend.)
   */
  async assignPlanToCompany(companyId: string, planId: string): Promise<void> {
    // 1. Leer plan
    const planSnap = await getDoc(doc(this.firestore, `plans/${planId}`));
    if (!planSnap.exists()) throw new Error(`Plan ${planId} no encontrado`);
    const plan = { id: planSnap.id, ...planSnap.data() } as Plan;

    // 2. Leer todos los paquetes del catálogo
    const pkgsSnap = await getDocs(collection(this.firestore, 'plugin-packages'));
    const allPkgs = pkgsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    // 3. Resolver módulos de los paquetes incluidos en el plan
    const includedPkgCodes: string[] = plan.includedPackages ?? [];
    const planModules: string[] = [
      ...new Set(
        allPkgs
          .filter((p: any) => includedPkgCodes.includes(p.code))
          .flatMap((p: any) => p.modules as string[])
      )
    ];

    // 4. Leer empresa para preservar add-ons y calcular enabledPackages final
    const companySnap = await getDoc(doc(this.firestore, `companies/${companyId}`));
    const companyData = companySnap.data() as any;
    const existingAddons: any[] = companyData?.addonPackages ?? [];
    const addonCodes: string[] = existingAddons.map((a: any) => a.packageCode);
    const addonModules: string[] = [
      ...new Set(
        allPkgs
          .filter((p: any) => addonCodes.includes(p.code))
          .flatMap((p: any) => p.modules as string[])
      )
    ];

    // 5. Escribir en la empresa
    const companyRef = doc(this.firestore, `companies/${companyId}`);
    await updateDoc(companyRef, {
      planId,
      planName:     plan.name,
      planLimits:   plan.limits   ?? null,
      planFeatures: plan.features ?? null,
      enabledPackages: [...new Set([...includedPkgCodes, ...addonCodes])],
      enabledModules:  [...new Set([...planModules, ...addonModules])],
      status:          'active',
      subscriptionStart: Timestamp.now(),
      updatedAt:         Timestamp.now()
    });
  }

  /**
   * Activa un paquete add-on en una empresa (fuera del plan base).
   * Registra el acuerdo comercial en addonPackages[] con snapshot del precio acordado.
   * Escrito por el super_admin — no hay cobro automático.
   */
  async activateAddonPackage(
    companyId: string,
    pkg: PluginPackage,
    enabledPackages: string[],
    enabledModules: string[],
    agreedPrice: number,
    notes: string,
    activatedByUid: string
  ): Promise<void> {
    const companyRef = doc(this.firestore, `companies/${companyId}`);
    await updateDoc(companyRef, {
      enabledPackages,
      enabledModules,
      addonPackages: arrayUnion({
        packageCode:       pkg.code,
        packageName:       pkg.name,
        priceAtActivation: agreedPrice,
        activatedAt:       Timestamp.now(),
        activatedBy:       activatedByUid,
        notes:             notes.trim()
      })
    });
  }

  /**
   * Desactiva un paquete add-on y elimina su registro de addonPackages[].
   */
  async deactivateAddonPackage(
    companyId: string,
    packageCode: string,
    enabledPackages: string[],
    enabledModules: string[],
    currentAddonPackages: Company['addonPackages']
  ): Promise<void> {
    const companyRef = doc(this.firestore, `companies/${companyId}`);
    const updatedAddons = (currentAddonPackages ?? []).filter(a => a.packageCode !== packageCode);
    await updateDoc(companyRef, {
      enabledPackages,
      enabledModules,
      addonPackages: updatedAddons
    });
  }

  // ─── Sync / Seed ─────────────────────────────────────────────────────────

  /**
   * Escribe los 5 planes por defecto y los 11 paquetes de plugins en Firestore.
   * Usa merge: true — no sobreescribe campos que el admin haya personalizado.
   * Seguro para re-ejecutar: idempotente.
   */
  async syncDefaultPlans(): Promise<{ plans: number; packages: number; deleted: number }> {
    const now = Timestamp.now();
    const ALL_PKGS = [
      'pkg_base','pkg_sales','pkg_stock','pkg_sri','pkg_accounting',
      'pkg_purchases','pkg_sales_advanced','pkg_pos','pkg_reports',
      'pkg_marketplace','pkg_team_mgmt'
    ];

    // ── Planes ──────────────────────────────────────────────────────────────
    const planDocs: Array<{ id: string; data: object }> = [
      {
        id: 'emprendedor',
        data: {
          name: 'Emprendedor', sortOrder: 1, priceMonthly: 15, priceYearly: 12,
          billingPeriod: 'monthly', trialDays: 14, isActive: true, isPublic: true,
          color: 'success', audience: 'Personas naturales, RIMPE, autónomos',
          highlights: ['50 facturas/mes','1 usuario','100 personas','200 productos','Catálogo público'],
          description: 'Ideal para personas naturales, RIMPE y negocios unipersonales que inician su actividad con facturación electrónica SRI.',
          includedPackages: ['pkg_base','pkg_sales','pkg_sri','pkg_marketplace'],
          limits: {
            sri:         { invoicesPerMonth:50, invoicesPerYear:600, creditNotesPerMonth:10, debitNotesPerMonth:0, retentionsPerMonth:0, purchasesPerMonth:0, remissionsPerMonth:0, totalSriDocsPerMonth:-1 },
            masterData:  { personasTotal:100, customersTotal:100, suppliersTotal:50, employeesTotal:0, productsTotal:200, familiesTotal:10, manufacturersTotal:10, warehousesTotal:1, costCentersTotal:0, priceListsTotal:1 },
            users:       { activeUsersPerCompany:1, customRolesPerCompany:0, concurrentSessionsPerUser:-1 },
            multiCompany:{ companiesPerAccount:1 },
            operations:  { activeProjectsTotal:0, tasksPerMonth:0, exportsPerMonth:20, scheduledReportsTotal:0, activeIntegrationsTotal:0, apiCallsPerMonth:0 },
            infra:       { storageGb:1, documentHistoryMonths:12, usageHistoryMonths:3 }
          },
          features: { electronicInvoicing:true, purchasesModule:false, accountingModule:false, stockModule:false, teamManagementModule:false, publicCatalogModule:true, publicApiModule:false, prioritySupport:false, betaAccess:false, multiCompanyMode:false }
        }
      },
      {
        id: 'pyme',
        data: {
          name: 'PYME', sortOrder: 2, priceMonthly: 39, priceYearly: 32,
          billingPeriod: 'monthly', trialDays: 14, isActive: true, isPublic: true,
          color: 'primary', audience: 'Pequeñas empresas con retenciones e inventario',
          highlights: ['300 facturas/mes','5 usuarios','1.000 personas','2.000 productos','Stock + Retenciones + Compras'],
          description: 'Para pequeñas empresas con agente retenedor, control de inventario y módulo de compras.',
          includedPackages: ['pkg_base','pkg_sales','pkg_stock','pkg_sri','pkg_purchases','pkg_marketplace'],
          limits: {
            sri:         { invoicesPerMonth:300, invoicesPerYear:3600, creditNotesPerMonth:50, debitNotesPerMonth:30, retentionsPerMonth:100, purchasesPerMonth:100, remissionsPerMonth:0, totalSriDocsPerMonth:-1 },
            masterData:  { personasTotal:1000, customersTotal:1000, suppliersTotal:500, employeesTotal:0, productsTotal:2000, familiesTotal:50, manufacturersTotal:30, warehousesTotal:3, costCentersTotal:0, priceListsTotal:3 },
            users:       { activeUsersPerCompany:5, customRolesPerCompany:0, concurrentSessionsPerUser:-1 },
            multiCompany:{ companiesPerAccount:1 },
            operations:  { activeProjectsTotal:0, tasksPerMonth:0, exportsPerMonth:100, scheduledReportsTotal:0, activeIntegrationsTotal:0, apiCallsPerMonth:0 },
            infra:       { storageGb:5, documentHistoryMonths:24, usageHistoryMonths:6 }
          },
          features: { electronicInvoicing:true, purchasesModule:true, accountingModule:false, stockModule:true, teamManagementModule:false, publicCatalogModule:true, publicApiModule:false, prioritySupport:false, betaAccess:false, multiCompanyMode:false }
        }
      },
      {
        id: 'profesional',
        data: {
          name: 'Profesional', sortOrder: 3, priceMonthly: 79, priceYearly: 65,
          billingPeriod: 'monthly', trialDays: 14, isActive: true, isPublic: true,
          badge: 'Más popular', badgeColor: 'warning',
          color: 'warning', audience: 'Medianas empresas y contadores independientes',
          highlights: ['1.000 facturas/mes','15 usuarios','Personas y productos ilimitados','Hasta 5 empresas','Contabilidad + Team Management'],
          description: 'Medianas empresas, contadores independientes que gestionan hasta 5 empresas simultáneamente.',
          includedPackages: ['pkg_base','pkg_sales','pkg_stock','pkg_sri','pkg_accounting','pkg_purchases','pkg_sales_advanced','pkg_reports','pkg_marketplace','pkg_team_mgmt'],
          limits: {
            sri:         { invoicesPerMonth:1000, invoicesPerYear:12000, creditNotesPerMonth:150, debitNotesPerMonth:100, retentionsPerMonth:300, purchasesPerMonth:300, remissionsPerMonth:0, totalSriDocsPerMonth:-1 },
            masterData:  { personasTotal:-1, customersTotal:-1, suppliersTotal:-1, employeesTotal:0, productsTotal:-1, familiesTotal:-1, manufacturersTotal:-1, warehousesTotal:10, costCentersTotal:20, priceListsTotal:10 },
            users:       { activeUsersPerCompany:15, customRolesPerCompany:3, concurrentSessionsPerUser:-1 },
            multiCompany:{ companiesPerAccount:5 },
            operations:  { activeProjectsTotal:20, tasksPerMonth:500, exportsPerMonth:-1, scheduledReportsTotal:5, activeIntegrationsTotal:2, apiCallsPerMonth:0 },
            infra:       { storageGb:20, documentHistoryMonths:36, usageHistoryMonths:12 }
          },
          features: { electronicInvoicing:true, purchasesModule:true, accountingModule:true, stockModule:true, teamManagementModule:true, publicCatalogModule:true, publicApiModule:false, prioritySupport:false, betaAccess:false, multiCompanyMode:true }
        }
      },
      {
        id: 'empresarial',
        data: {
          name: 'Empresarial', sortOrder: 4, priceMonthly: 149, priceYearly: 120,
          billingPeriod: 'monthly', trialDays: 0, isActive: true, isPublic: true,
          color: 'danger', audience: 'Medianas-grandes empresas y despachos contables',
          highlights: ['5.000 facturas/mes','50 usuarios','Todos los maestros ilimitados','Hasta 25 empresas','Soporte prioritario'],
          description: 'Empresas medianas-grandes, grupos empresariales y despachos contables con múltiples empresas.',
          includedPackages: ALL_PKGS,
          limits: {
            sri:         { invoicesPerMonth:5000, invoicesPerYear:60000, creditNotesPerMonth:500, debitNotesPerMonth:300, retentionsPerMonth:1000, purchasesPerMonth:1000, remissionsPerMonth:0, totalSriDocsPerMonth:-1 },
            masterData:  { personasTotal:-1, customersTotal:-1, suppliersTotal:-1, employeesTotal:-1, productsTotal:-1, familiesTotal:-1, manufacturersTotal:-1, warehousesTotal:-1, costCentersTotal:-1, priceListsTotal:-1 },
            users:       { activeUsersPerCompany:50, customRolesPerCompany:10, concurrentSessionsPerUser:-1 },
            multiCompany:{ companiesPerAccount:25 },
            operations:  { activeProjectsTotal:-1, tasksPerMonth:-1, exportsPerMonth:-1, scheduledReportsTotal:20, activeIntegrationsTotal:10, apiCallsPerMonth:10000 },
            infra:       { storageGb:100, documentHistoryMonths:-1, usageHistoryMonths:24 }
          },
          features: { electronicInvoicing:true, purchasesModule:true, accountingModule:true, stockModule:true, teamManagementModule:true, publicCatalogModule:true, publicApiModule:true, prioritySupport:true, betaAccess:false, multiCompanyMode:true }
        }
      },
      {
        id: 'ilimitado',
        data: {
          name: 'Ilimitado', sortOrder: 5, priceMonthly: 299, priceYearly: 240,
          billingPeriod: 'monthly', trialDays: 0, isActive: true, isPublic: true,
          color: 'dark', audience: 'Grandes despachos y bureaux de servicios',
          highlights: ['Sin límites en todo','Usuarios ilimitados','Empresas ilimitadas','Soporte prioritario + Beta access','Retención documental permanente'],
          description: 'Para grandes despachos contables y bureaux de servicios SRI con volúmenes muy altos.',
          includedPackages: ALL_PKGS,
          limits: {
            sri:         { invoicesPerMonth:-1, invoicesPerYear:-1, creditNotesPerMonth:-1, debitNotesPerMonth:-1, retentionsPerMonth:-1, purchasesPerMonth:-1, remissionsPerMonth:-1, totalSriDocsPerMonth:-1 },
            masterData:  { personasTotal:-1, customersTotal:-1, suppliersTotal:-1, employeesTotal:-1, productsTotal:-1, familiesTotal:-1, manufacturersTotal:-1, warehousesTotal:-1, costCentersTotal:-1, priceListsTotal:-1 },
            users:       { activeUsersPerCompany:-1, customRolesPerCompany:-1, concurrentSessionsPerUser:-1 },
            multiCompany:{ companiesPerAccount:-1 },
            operations:  { activeProjectsTotal:-1, tasksPerMonth:-1, exportsPerMonth:-1, scheduledReportsTotal:-1, activeIntegrationsTotal:-1, apiCallsPerMonth:-1 },
            infra:       { storageGb:-1, documentHistoryMonths:-1, usageHistoryMonths:-1 }
          },
          features: { electronicInvoicing:true, purchasesModule:true, accountingModule:true, stockModule:true, teamManagementModule:true, publicCatalogModule:true, publicApiModule:true, prioritySupport:true, betaAccess:true, multiCompanyMode:true }
        }
      }
    ];

    // ── Paquetes ─────────────────────────────────────────────────────────────
    const pkgDocs: Array<{ id: string; data: object }> = [
      { id:'pkg_base',          data:{ code:'pkg_base',          name:'Base del Sistema',             order:1,  price:0,  isSystem:true,  state:true, currency:'USD', billingPeriod:'monthly', icon:'cil-home',           color:'secondary', modules:['dashboard','settings','users'],                  dependencies:[],            description:'Siempre activo. Incluye dashboard, configuración de empresa y gestión de usuarios. No se puede desactivar.' } },
      { id:'pkg_sales',         data:{ code:'pkg_sales',         name:'Facturación Base',             order:2,  price:29, isSystem:false, state:true, currency:'USD', billingPeriod:'monthly', icon:'cil-description',    color:'primary',   modules:['personas','products','invoices'],                 dependencies:['pkg_base'],  description:'El corazón del sistema. Gestión de clientes/proveedores, productos y emisión de facturas.' } },
      { id:'pkg_sri',           data:{ code:'pkg_sri',           name:'Facturación Electrónica SRI',  order:3,  price:24, isSystem:false, state:true, currency:'USD', billingPeriod:'monthly', icon:'cil-badge',          color:'info',      modules:['sri','debitNotes','retentions'],                  dependencies:['pkg_sales'], description:'Emisión de comprobantes electrónicos al SRI: facturas, notas de débito y retenciones.' } },
      { id:'pkg_stock',         data:{ code:'pkg_stock',         name:'Inventario y Stock',           order:4,  price:19, isSystem:false, state:true, currency:'USD', billingPeriod:'monthly', icon:'cil-storage',        color:'warning',   modules:['stock'],                                         dependencies:['pkg_sales'], description:'Control de inventario, movimientos de stock, kardex y valorización de existencias por bodega.' } },
      { id:'pkg_purchases',     data:{ code:'pkg_purchases',     name:'Módulo Compras',               order:5,  price:19, isSystem:false, state:true, currency:'USD', billingPeriod:'monthly', icon:'cil-cart',           color:'primary',   modules:['purchases'],                                     dependencies:['pkg_sales'], description:'Registro y gestión de órdenes de compra, liquidaciones y control de proveedores.' } },
      { id:'pkg_accounting',    data:{ code:'pkg_accounting',    name:'Módulo Contabilidad',          order:6,  price:29, isSystem:false, state:true, currency:'USD', billingPeriod:'monthly', icon:'cil-calculator',     color:'success',   modules:['accounting'],                                    dependencies:['pkg_sri'],   description:'Contabilidad general, plan de cuentas, asientos, centros de costo y reportes contables.' } },
      { id:'pkg_sales_advanced',data:{ code:'pkg_sales_advanced',name:'Ventas Avanzadas',             order:7,  price:19, isSystem:false, state:true, currency:'USD', billingPeriod:'monthly', icon:'cil-layers',         color:'primary',   modules:['quotes','orders','proformas'],                    dependencies:['pkg_sales'], description:'Cotizaciones, órdenes de venta y proformas con flujo completo desde solicitud hasta factura.' } },
      { id:'pkg_pos',           data:{ code:'pkg_pos',           name:'Punto de Venta',               order:8,  price:15, isSystem:false, state:true, currency:'USD', billingPeriod:'monthly', icon:'cil-screen-desktop', color:'success',   modules:['pos'],                                           dependencies:['pkg_sales'], description:'Interfaz de caja rápida para ventas presenciales con gestión de sesiones y cierre de caja.' } },
      { id:'pkg_reports',       data:{ code:'pkg_reports',       name:'Reportes Avanzados',           order:9,  price:9,  isSystem:false, state:true, currency:'USD', billingPeriod:'monthly', icon:'cil-chart-pie',      color:'info',      modules:['report_invoices','report_products','report_orders'],dependencies:['pkg_sales'], description:'Reportes ejecutivos de ventas, productos e inventario con exportación a Excel/PDF.' } },
      { id:'pkg_marketplace',   data:{ code:'pkg_marketplace',   name:'Catálogo Público',             order:10, price:15, isSystem:false, state:true, currency:'USD', billingPeriod:'monthly', icon:'cil-globe-alt',      color:'success',   modules:['marketplace'],                                   dependencies:['pkg_sales'], description:'Catálogo web público con URL propia, WhatsApp integrado y gestión de precios visibles.' } },
      { id:'pkg_team_mgmt',     data:{ code:'pkg_team_mgmt',     name:'Gestión de Equipos',           order:11, price:49, isSystem:false, state:true, currency:'USD', billingPeriod:'monthly', icon:'cil-people',         color:'warning',   modules:['teamManagement'],                                dependencies:['pkg_base'],  description:'Gestión de proyectos, tareas, sprints, KPIs de productividad y rendimiento del equipo.' } }
    ];

    // ── 1. Detectar y eliminar docs con IDs no canónicos (auto-generados) ────
    const canonicalPlanIds  = new Set(planDocs.map(p => p.id));
    const canonicalPkgIds   = new Set(pkgDocs.map(p => p.id));

    const [plansSnap, pkgsSnap] = await Promise.all([
      getDocs(collection(this.firestore, 'plans')),
      getDocs(collection(this.firestore, 'plugin-packages'))
    ]);

    const staleIds: string[] = [
      ...plansSnap.docs.filter(d => !canonicalPlanIds.has(d.id)).map(d => `plans/${d.id}`),
      ...pkgsSnap.docs.filter(d => !canonicalPkgIds.has(d.id)).map(d => `plugin-packages/${d.id}`)
    ];

    // Firestore: máx 500 ops/batch; borramos los stale primero si los hay
    let deleted = 0;
    if (staleIds.length > 0) {
      const cleanupBatch = writeBatch(this.firestore);
      for (const path of staleIds) {
        cleanupBatch.delete(doc(this.firestore, path));
      }
      await cleanupBatch.commit();
      deleted = staleIds.length;
    }

    // ── 2. Escribir/actualizar los docs canónicos ─────────────────────────────
    const upsertBatch = writeBatch(this.firestore);

    for (const { id, data } of planDocs) {
      upsertBatch.set(doc(this.firestore, `plans/${id}`), { ...data, updatedAt: now }, { merge: true });
    }
    for (const { id, data } of pkgDocs) {
      upsertBatch.set(doc(this.firestore, `plugin-packages/${id}`), { ...data, updatedAt: now }, { merge: true });
    }

    await upsertBatch.commit();
    return { plans: planDocs.length, packages: pkgDocs.length, deleted };
  }
}
