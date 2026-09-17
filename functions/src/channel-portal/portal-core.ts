/**
 * portal-core.ts — Lógica pura del portal de canal
 *
 * El portal es lo que un canal (Conectate, Mi Buseta) usa para administrar SU
 * cartera desde su propia app, a través de callables: listar empresas, darles
 * plan, activarles paquetes y mantener su catálogo de planes. Angular hace lo
 * mismo leyendo Firestore directo; una app de otro proyecto no puede, por eso
 * existe esta capa.
 *
 * Todo lo de este archivo es puro (sin Firestore) para poder probarlo.
 * Ver docs/PLAN_CANALES_MULTIMARCA.md.
 */

import { HttpsError } from 'firebase-functions/v2/https';

// ─── Paquetes y módulos ──────────────────────────────────────────────────────

export interface PackageDef {
  code: string;
  name?: string;
  modules?: string[];
  dependencies?: string[];
  isSystem?: boolean;
  price?: number;
}

/** Módulos que activan un conjunto de paquetes. Misma regla que PluginPackagesService. */
export function resolveModules(packageCodes: string[], catalog: PackageDef[]): string[] {
  const active = new Set(packageCodes);
  return [...new Set(
    catalog.filter(p => active.has(p.code)).flatMap(p => p.modules ?? [])
  )];
}

/** Activar un paquete arrastra sus dependencias, recursivamente. */
export function withDependencies(code: string, active: string[], catalog: PackageDef[]): string[] {
  const byCode = new Map(catalog.map(p => [p.code, p]));
  const result = new Set(active);
  const pending = [code];
  while (pending.length) {
    const current = pending.pop()!;
    if (result.has(current) && current !== code) continue;
    result.add(current);
    for (const dep of byCode.get(current)?.dependencies ?? []) {
      if (!result.has(dep)) pending.push(dep);
    }
  }
  return [...result];
}

/** Desactivar un paquete arrastra a los que dependen de él, recursivamente. */
export function withoutDependents(code: string, active: string[], catalog: PackageDef[]): string[] {
  const result = new Set(active);
  const pending = [code];
  while (pending.length) {
    const current = pending.pop()!;
    if (!result.delete(current)) continue;
    for (const p of catalog) {
      if ((p.dependencies ?? []).includes(current) && result.has(p.code)) pending.push(p.code);
    }
  }
  return [...result];
}

/**
 * Paquetes y módulos efectivos de una empresa: los del plan más los add-on
 * contratados aparte. Es la única fórmula; la usan asignar plan, editar plan y
 * activar paquetes, para que no diverjan.
 */
export function effectivePackages(
  planPackages: string[],
  addonCodes: string[],
  catalog: PackageDef[]
): { enabledPackages: string[]; enabledModules: string[] } {
  const enabledPackages = [...new Set([...planPackages, ...addonCodes])];
  return { enabledPackages, enabledModules: resolveModules(enabledPackages, catalog) };
}

/** Códigos de los add-on registrados en una empresa (acepta el formato viejo de string). */
export function addonCodesOf(company: Record<string, any>): string[] {
  const addons: any[] = Array.isArray(company['addonPackages']) ? company['addonPackages'] : [];
  return addons.map(a => (typeof a === 'string' ? a : a?.packageCode)).filter((c): c is string => !!c);
}

// ─── Estados de empresa ──────────────────────────────────────────────────────

export const COMPANY_STATUSES = ['active', 'suspended', 'cancelled', 'trial'] as const;
export type CompanyStatus = typeof COMPANY_STATUSES[number];

export function isCompanyStatus(v: unknown): v is CompanyStatus {
  return typeof v === 'string' && (COMPANY_STATUSES as readonly string[]).includes(v);
}

// ─── Planes ──────────────────────────────────────────────────────────────────

/**
 * Límites por defecto de un plan nuevo de canal: los del plan PYME del catálogo
 * base (scripts/seed-plans.ts). El canal ajusta solo lo que le interesa y el
 * resto queda con valores razonables, nunca indefinido.
 * Convención: -1 ilimitado, 0 deshabilitado.
 */
export const DEFAULT_PLAN_LIMITS = {
  sri: {
    invoicesPerMonth: 300, invoicesPerYear: 3600, creditNotesPerMonth: 50,
    debitNotesPerMonth: 30, retentionsPerMonth: 100, purchasesPerMonth: 100,
    remissionsPerMonth: 0, totalSriDocsPerMonth: -1,
  },
  masterData: {
    personasTotal: 1000, customersTotal: 1000, suppliersTotal: 500, employeesTotal: 0,
    productsTotal: 2000, familiesTotal: 50, manufacturersTotal: 30, warehousesTotal: 3,
    costCentersTotal: 0, priceListsTotal: 3,
  },
  users: { activeUsersPerCompany: 5, customRolesPerCompany: 0, concurrentSessionsPerUser: -1 },
  multiCompany: { companiesPerAccount: 1 },
  operations: {
    activeProjectsTotal: 0, tasksPerMonth: 0, exportsPerMonth: 100,
    scheduledReportsTotal: 0, activeIntegrationsTotal: 0, apiCallsPerMonth: 0,
  },
  infra: { storageGb: 5, documentHistoryMonths: 24, usageHistoryMonths: 6 },
} as const;

export const DEFAULT_PLAN_FEATURES = {
  electronicInvoicing: true, purchasesModule: true, accountingModule: false,
  stockModule: true, teamManagementModule: false, publicCatalogModule: false,
  publicApiModule: false, whiteLabelModule: false, prioritySupport: false,
  betaAccess: false, multiCompanyMode: false,
} as const;

const BILLING_PERIODS = ['monthly', 'yearly', 'one_time'];

export interface PlanInput {
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  billingPeriod: string;
  trialDays: number;
  sortOrder: number;
  isActive: boolean;
  isPublic: boolean;
  includedPackages: string[];
  highlights: string[];
  limits: Record<string, Record<string, number>>;
  features: Record<string, boolean>;
}

function bad(msg: string): never {
  throw new HttpsError('invalid-argument', msg);
}

function num(v: unknown, field: string, { min = 0, allowUnlimited = false } = {}): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) bad(`'${field}' debe ser un número.`);
  if (allowUnlimited && n === -1) return -1;
  if (n < min) bad(`'${field}' no puede ser menor que ${min}${allowUnlimited ? ' (usa -1 para ilimitado)' : ''}.`);
  return n;
}

/**
 * Valida y completa lo que manda la app para crear o editar un plan.
 *
 * - Solo pasan campos conocidos: nada de channelId, planLimits u otros que
 *   pertenecen al servidor.
 * - `limits` y `features` se mezclan sobre `base` (el plan actual al editar, o
 *   los valores por defecto al crear), así un formulario parcial no borra nada.
 * - Los paquetes deben existir en el catálogo; `pkg_base` va siempre.
 */
export function sanitizePlanInput(
  raw: unknown,
  catalogCodes: string[],
  base?: Partial<PlanInput>
): PlanInput {
  if (!raw || typeof raw !== 'object') bad('Faltan los datos del plan.');
  const r = raw as Record<string, any>;
  const b = base ?? {};

  const name = typeof r['name'] === 'string' ? r['name'].trim() : (b.name ?? '');
  if (!name) bad('El plan necesita un nombre.');
  if (name.length > 80) bad('El nombre del plan es demasiado largo.');

  const billingPeriod = r['billingPeriod'] ?? b.billingPeriod ?? 'monthly';
  if (!BILLING_PERIODS.includes(billingPeriod)) bad(`Periodo de cobro inválido: '${billingPeriod}'.`);

  const packagesRaw = r['includedPackages'] ?? b.includedPackages ?? ['pkg_base'];
  if (!Array.isArray(packagesRaw) || packagesRaw.some(p => typeof p !== 'string')) {
    bad("'includedPackages' debe ser una lista de códigos.");
  }
  const unknown = (packagesRaw as string[]).filter(p => !catalogCodes.includes(p));
  if (unknown.length) bad(`Paquetes inexistentes: ${unknown.join(', ')}.`);
  const includedPackages = [...new Set(['pkg_base', ...(packagesRaw as string[])])]
    .filter(p => catalogCodes.includes(p) || p === 'pkg_base');

  // Límites: se parte de base (o default) y se pisan solo los numéricos conocidos.
  const baseLimits = (b.limits ?? DEFAULT_PLAN_LIMITS) as Record<string, Record<string, number>>;
  const limits: Record<string, Record<string, number>> = {};
  for (const [group, fields] of Object.entries(DEFAULT_PLAN_LIMITS)) {
    limits[group] = {};
    for (const field of Object.keys(fields)) {
      const incoming = r['limits']?.[group]?.[field];
      const current = baseLimits?.[group]?.[field] ?? (fields as Record<string, number>)[field];
      limits[group][field] = incoming === undefined
        ? current
        : num(incoming, `limits.${group}.${field}`, { allowUnlimited: true });
    }
  }

  const baseFeatures = (b.features ?? DEFAULT_PLAN_FEATURES) as Record<string, boolean>;
  const features: Record<string, boolean> = {};
  for (const key of Object.keys(DEFAULT_PLAN_FEATURES)) {
    const incoming = r['features']?.[key];
    features[key] = incoming === undefined
      ? (baseFeatures[key] ?? (DEFAULT_PLAN_FEATURES as Record<string, boolean>)[key])
      : incoming === true;
  }

  const highlightsRaw = r['highlights'] ?? b.highlights ?? [];
  const highlights = Array.isArray(highlightsRaw)
    ? highlightsRaw.filter((h): h is string => typeof h === 'string').map(h => h.trim()).filter(Boolean).slice(0, 10)
    : [];

  return {
    name,
    description: typeof r['description'] === 'string' ? r['description'].trim() : (b.description ?? ''),
    priceMonthly: num(r['priceMonthly'] ?? b.priceMonthly ?? 0, 'priceMonthly'),
    priceYearly: num(r['priceYearly'] ?? b.priceYearly ?? 0, 'priceYearly'),
    billingPeriod,
    trialDays: num(r['trialDays'] ?? b.trialDays ?? 0, 'trialDays'),
    sortOrder: num(r['sortOrder'] ?? b.sortOrder ?? 99, 'sortOrder'),
    isActive: r['isActive'] === undefined ? (b.isActive ?? true) : r['isActive'] === true,
    isPublic: r['isPublic'] === undefined ? (b.isPublic ?? true) : r['isPublic'] === true,
    includedPackages,
    highlights,
    limits,
    features,
  };
}

// ─── Serialización hacia la app ──────────────────────────────────────────────

/** Timestamps → ISO, recursivo. Lo que sale por un callable debe ser JSON plano. */
export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toPlain(v)]));
  }
  return value;
}

/**
 * Lo que la app ve de una empresa. Lista blanca: nunca sale el bloque del
 * certificado (ruta, clave) ni contadores internos.
 */
export function companySummary(id: string, d: Record<string, any>): Record<string, unknown> {
  const sri = d['sri'] ?? {};
  return toPlain({
    id,
    name: d['name'] ?? '',
    tradeName: d['tradeName'] ?? '',
    taxId: d['taxId'] ?? '',
    email: d['email'] ?? '',
    phone: d['phone'] ?? '',
    city: d['city'] ?? '',
    fiscalAddress: d['fiscalAddress'] ?? '',
    channelId: d['channelId'] ?? null,
    status: d['status'] ?? 'active',
    planId: d['planId'] ?? null,
    planName: d['planName'] ?? '',
    subscriptionStart: d['subscriptionStart'] ?? null,
    subscriptionEnd: d['subscriptionEnd'] ?? null,
    enabledPackages: d['enabledPackages'] ?? [],
    enabledModules: d['enabledModules'] ?? [],
    addonPackages: (Array.isArray(d['addonPackages']) ? d['addonPackages'] : []).map((a: any) =>
      typeof a === 'string'
        ? { packageCode: a }
        : {
          packageCode: a?.packageCode, packageName: a?.packageName,
          priceAtActivation: a?.priceAtActivation ?? 0, activatedAt: a?.activatedAt ?? null, notes: a?.notes ?? '',
        }),
    sri: {
      environment: sri['environment'] ?? 'testing',
      ruc: sri['ruc'] ?? '',
      businessName: sri['businessName'] ?? '',
      establishment: sri['establishment'] ?? '',
      emissionPoint: sri['emissionPoint'] ?? '',
      contributorType: sri['contributorType'] ?? '',
      accountingRequired: sri['accountingRequired'] === true,
      regimen: sri['regimen'] ?? '',
      hasCertificate: !!sri['certificatePath'],
      certificateExpiry: sri['certificateExpiry'] ?? null,
    },
    createdAt: d['createdAt'] ?? null,
  }) as Record<string, unknown>;
}

export function planSummary(id: string, d: Record<string, any>): Record<string, unknown> {
  return toPlain({
    id,
    channelId: d['channelId'] ?? null,
    name: d['name'] ?? '',
    description: d['description'] ?? '',
    priceMonthly: d['priceMonthly'] ?? 0,
    priceYearly: d['priceYearly'] ?? 0,
    billingPeriod: d['billingPeriod'] ?? 'monthly',
    trialDays: d['trialDays'] ?? 0,
    sortOrder: d['sortOrder'] ?? 99,
    isActive: d['isActive'] !== false,
    isPublic: d['isPublic'] !== false,
    includedPackages: d['includedPackages'] ?? [],
    highlights: d['highlights'] ?? [],
    limits: d['limits'] ?? null,
    features: d['features'] ?? null,
    updatedAt: d['updatedAt'] ?? null,
  }) as Record<string, unknown>;
}

export function packageSummary(d: Record<string, any>): Record<string, unknown> {
  return {
    code: d['code'],
    name: d['name'] ?? d['code'],
    description: d['description'] ?? '',
    modules: d['modules'] ?? [],
    dependencies: d['dependencies'] ?? [],
    price: d['price'] ?? 0,
    billingPeriod: d['billingPeriod'] ?? 'monthly',
    isSystem: d['isSystem'] === true,
    order: d['order'] ?? 99,
  };
}
