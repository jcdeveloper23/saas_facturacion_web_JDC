import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

/**
 * checkPlanLimit
 *
 * Callable CF — any authenticated user with access to the company.
 * Checks whether a company has reached a specific plan limit.
 *
 * Payload: { companyId: string; limitType: string }
 *
 * Returns: { allowed: boolean; current: number; limit: number; limitType: string }
 *
 * Limit conventions:
 *   -1 → ilimitado (always allowed: true)
 *    0 → deshabilitado (always allowed: false)
 *   >0 → compare current vs limit
 *
 * If planLimits is not present on the company doc (legacy company),
 * the function returns allowed: true to avoid blocking existing workflows.
 */
export const checkPlanLimit = onCall(async (request) => {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'No autenticado.');
  }

  // ── Input validation ────────────────────────────────────────────────────────
  const data = request.data as { companyId?: string; limitType?: string };

  if (!data.companyId || typeof data.companyId !== 'string') {
    throw new HttpsError('invalid-argument', 'companyId es requerido y debe ser string.');
  }
  if (!data.limitType || typeof data.limitType !== 'string') {
    throw new HttpsError('invalid-argument', 'limitType es requerido y debe ser string.');
  }

  const { companyId, limitType } = data;

  console.log('[checkPlanLimit] Verificando:', { companyId, limitType });

  const db = admin.firestore();

  // ── Determine current period (YYYY-MM) for usage-based limits ───────────────
  const now    = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // ── Classify limitType: usage-based vs company-field-based ──────────────────
  type UsageLimitDef = {
    source: 'usage';
    usageField: string;
    limitPath: string[];      // path into planLimits object
  };
  type CompanyLimitDef = {
    source: 'company';
    companyField: string;
    limitPath: string[];
  };
  type LimitDef = UsageLimitDef | CompanyLimitDef;

  const LIMIT_MAP: Record<string, LimitDef> = {
    invoices:       { source: 'usage',   usageField: 'invoicesEmitted',       limitPath: ['sri', 'invoicesPerMonth']            },
    creditNotes:    { source: 'usage',   usageField: 'creditNotesEmitted',     limitPath: ['sri', 'creditNotesPerMonth']          },
    debitNotes:     { source: 'usage',   usageField: 'debitNotesEmitted',      limitPath: ['sri', 'debitNotesPerMonth']           },
    retentions:     { source: 'usage',   usageField: 'retentionsEmitted',      limitPath: ['sri', 'retentionsPerMonth']           },
    totalSriDocs:   { source: 'usage',   usageField: 'totalSriDocsEmitted',    limitPath: ['sri', 'totalSriDocsPerMonth']         },
    personas:       { source: 'company', companyField: 'totalPersonasActive',  limitPath: ['masterData', 'personasTotal']         },
    customers:      { source: 'company', companyField: 'totalCustomersActive', limitPath: ['masterData', 'customersTotal']        },
    products:       { source: 'company', companyField: 'totalProductsActive',  limitPath: ['masterData', 'productsTotal']         },
    warehouses:     { source: 'company', companyField: 'totalWarehousesActive',limitPath: ['masterData', 'warehousesTotal']       },
    users:          { source: 'company', companyField: 'totalUsersActive',     limitPath: ['users', 'activeUsersPerCompany']      },
    customRoles:    { source: 'company', companyField: 'totalCustomRoles',     limitPath: ['users', 'customRolesPerCompany']      },
    activeProjects: { source: 'company', companyField: 'totalActiveProjects',  limitPath: ['operations', 'activeProjectsTotal']   },
    exports:        { source: 'usage',   usageField: 'exportsGenerated',       limitPath: ['operations', 'exportsPerMonth']       },
    tasks:          { source: 'usage',   usageField: 'tasksCreated',           limitPath: ['operations', 'tasksPerMonth']         },
  };

  const limitDef = LIMIT_MAP[limitType];
  if (!limitDef) {
    throw new HttpsError('invalid-argument', `limitType no reconocido: ${limitType}`);
  }

  // ── Read company document ────────────────────────────────────────────────────
  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) {
    throw new HttpsError('not-found', `Empresa no encontrada: ${companyId}`);
  }
  const company = companySnap.data() as Record<string, any>;
  const planLimits = company['planLimits'] as Record<string, any> | null | undefined;

  // ── If no planLimits, company is legacy — always allow ──────────────────────
  if (!planLimits) {
    console.log('[checkPlanLimit] Sin planLimits en empresa (legacy) — allowed: true', { companyId, limitType });
    return { allowed: true, current: 0, limit: -1, limitType };
  }

  // ── Resolve limit value from planLimits ─────────────────────────────────────
  const resolvePath = (obj: Record<string, any>, path: string[]): number | undefined => {
    let cur: any = obj;
    for (const key of path) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[key];
    }
    return typeof cur === 'number' ? cur : undefined;
  };

  const limit = resolvePath(planLimits, limitDef.limitPath) ?? -1;

  // ── Resolve current value ────────────────────────────────────────────────────
  let current = 0;

  if (limitDef.source === 'usage') {
    const usageSnap = await db.doc(`companies/${companyId}/usage/${period}`).get();
    if (usageSnap.exists) {
      const usageData = usageSnap.data() as Record<string, any>;
      current = (usageData[(limitDef as UsageLimitDef).usageField] as number) ?? 0;
    }
  } else {
    // source === 'company'
    current = (company[(limitDef as CompanyLimitDef).companyField] as number) ?? 0;
  }

  console.log('[checkPlanLimit] Resultado:', { companyId, limitType, current, limit });

  // ── Apply limit rules ────────────────────────────────────────────────────────
  // -1 = ilimitado → always allowed
  if (limit === -1) {
    return { allowed: true, current, limit, limitType };
  }

  // 0 = deshabilitado → always blocked
  if (limit === 0) {
    return { allowed: false, current, limit, limitType };
  }

  // >0 = compare
  const allowed = current < limit;
  return { allowed, current, limit, limitType };
});
