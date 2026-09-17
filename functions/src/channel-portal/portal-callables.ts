import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  Caller,
  assertCallerChannelActive,
  assertChannelAccess,
  isChannelAdmin,
  isSuperAdmin,
  isValidChannelId,
  loadCompanyForCaller,
  readCaller,
} from '../utils/channels';
import {
  PackageDef,
  addonCodesOf,
  companySummary,
  effectivePackages,
  isCompanyStatus,
  packageSummary,
  planSummary,
  sanitizePlanInput,
  withoutDependents,
} from './portal-core';

/**
 * Portal de canal — callables para que un canal administre su cartera desde su
 * propia app (Conectate en Flutter, vía su gateway). Mismo alcance que la
 * pantalla /super-admin de Angular para un channel_admin: empresas, planes y
 * paquetes de SU canal.
 *
 * Todos exigen super_admin o channel_admin con canal activo. El canal sale
 * siempre del token. Ver docs/PLAN_CANALES_MULTIMARCA.md.
 */

const MAX_LIST = 500;

/** Solo roles de administración de plataforma o canal; canal activo si aplica. */
async function requirePortalCaller(db: Firestore, request: Parameters<typeof readCaller>[0]): Promise<Caller> {
  const caller = readCaller(request);
  if (!isSuperAdmin(caller) && !isChannelAdmin(caller)) {
    throw new HttpsError('permission-denied', 'Solo administradores de plataforma o de canal.');
  }
  await assertCallerChannelActive(db, caller);
  return caller;
}

/**
 * Canal sobre el que se consulta. Un channel_admin, siempre el suyo. El super
 * admin puede pedir uno; si no, ve todos (null).
 */
function scopeFor(caller: Caller, requested: unknown): string | null {
  if (isChannelAdmin(caller)) return caller.channelId!;
  if (requested === undefined || requested === null || requested === '') return null;
  if (!isValidChannelId(requested)) throw new HttpsError('invalid-argument', 'channelId inválido.');
  return requested;
}

/** Catálogo de paquetes activos, sin duplicados (prefiere el doc cuyo id es el code). */
async function loadCatalog(db: Firestore): Promise<(PackageDef & Record<string, any>)[]> {
  const snap = await db.collection('plugin-packages').get();
  const byCode = new Map<string, { id: string; data: Record<string, any> }>();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data['code'] || data['state'] === false) continue;
    const existing = byCode.get(data['code']);
    if (!existing || doc.id === data['code']) byCode.set(data['code'], { id: doc.id, data });
  }
  return [...byCode.values()].map(v => v.data as PackageDef & Record<string, any>);
}

async function planPackagesOf(db: Firestore, planId: unknown): Promise<string[]> {
  if (typeof planId !== 'string' || !planId) return [];
  const snap = await db.doc(`plans/${planId}`).get();
  const pkgs = snap.data()?.['includedPackages'];
  return Array.isArray(pkgs) ? pkgs : [];
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new HttpsError('invalid-argument', `'${field}' es requerido.`);
  }
  return v.trim();
}

// ─── Empresas ────────────────────────────────────────────────────────────────

/** Empresas del canal, ordenadas por nombre. Payload: { channelId? } (solo super admin). */
export const portalListCompanies = onCall(async (request) => {
  const db = admin.firestore();
  const caller = await requirePortalCaller(db, request);
  const scope = scopeFor(caller, request.data?.channelId);

  let q: admin.firestore.Query = db.collection('companies');
  if (scope) q = q.where('channelId', '==', scope);
  const snap = await q.limit(MAX_LIST).get();

  const companies = snap.docs
    .map(d => companySummary(d.id, d.data()))
    .sort((a, b) => String(a['name']).localeCompare(String(b['name']), 'es'));

  return { companies, truncated: snap.size >= MAX_LIST };
});

/** Detalle de una empresa con su plan. Payload: { companyId }. */
export const portalGetCompany = onCall(async (request) => {
  const db = admin.firestore();
  const caller = await requirePortalCaller(db, request);
  const companyId = requireString(request.data?.companyId, 'companyId');
  const company = await loadCompanyForCaller(db, caller, companyId);

  let plan: Record<string, unknown> | null = null;
  if (typeof company['planId'] === 'string' && company['planId']) {
    const planSnap = await db.doc(`plans/${company['planId']}`).get();
    if (planSnap.exists) plan = planSummary(planSnap.id, planSnap.data()!);
  }
  return { company: companySummary(companyId, company), plan };
});

/** Cambia el estado de una empresa. Payload: { companyId, status }. */
export const portalSetCompanyStatus = onCall(async (request) => {
  const db = admin.firestore();
  const caller = await requirePortalCaller(db, request);
  const companyId = requireString(request.data?.companyId, 'companyId');
  const status = request.data?.status;
  if (!isCompanyStatus(status)) {
    throw new HttpsError('invalid-argument', "status debe ser 'active', 'suspended', 'cancelled' o 'trial'.");
  }
  await loadCompanyForCaller(db, caller, companyId);

  await db.doc(`companies/${companyId}`).update({
    status,
    statusChangedAt: Timestamp.now(),
    statusChangedBy: caller.uid,
    updatedAt: Timestamp.now(),
  });
  console.log('[portalSetCompanyStatus]', { companyId, status, by: caller.uid });
  return { success: true, companyId, status };
});

/**
 * Activa o retira un paquete add-on (fuera del plan) en una empresa.
 *
 * Payload: { companyId, packageCode, action: 'activate' | 'deactivate', agreedPrice?, notes? }
 *
 * - Activar exige que sus dependencias ya estén (en el plan o como add-on), igual
 *   que la pantalla de Angular. No se activan dependencias en silencio porque
 *   cada paquete tiene su precio.
 * - Retirar arrastra los add-on que dependen de él y los devuelve en `removed`.
 * - Los módulos se recalculan desde plan + add-on; es la misma fórmula que usan
 *   asignar plan y editar plan.
 */
export const portalSetAddon = onCall(async (request) => {
  const db = admin.firestore();
  const caller = await requirePortalCaller(db, request);
  const companyId = requireString(request.data?.companyId, 'companyId');
  const packageCode = requireString(request.data?.packageCode, 'packageCode');
  const action = request.data?.action;
  if (action !== 'activate' && action !== 'deactivate') {
    throw new HttpsError('invalid-argument', "action debe ser 'activate' o 'deactivate'.");
  }

  const company = await loadCompanyForCaller(db, caller, companyId);
  const [catalog, planPkgs] = await Promise.all([loadCatalog(db), planPackagesOf(db, company['planId'])]);
  const pkg = catalog.find(p => p.code === packageCode);
  if (!pkg) throw new HttpsError('not-found', `El paquete '${packageCode}' no existe.`);
  if (pkg.isSystem) throw new HttpsError('failed-precondition', `'${pkg.name}' es parte del sistema y no se puede cambiar.`);
  if (planPkgs.includes(packageCode)) {
    throw new HttpsError('failed-precondition', `'${pkg.name}' ya viene incluido en el plan de la empresa.`);
  }

  const currentAddons: any[] = Array.isArray(company['addonPackages']) ? company['addonPackages'] : [];
  const currentCodes = addonCodesOf(company);
  let nextAddons: any[];
  let removed: string[] = [];

  if (action === 'activate') {
    if (currentCodes.includes(packageCode)) {
      throw new HttpsError('already-exists', `'${pkg.name}' ya está activo.`);
    }
    const available = new Set([...planPkgs, ...currentCodes]);
    const missing = (pkg.dependencies ?? []).filter(d => !available.has(d));
    if (missing.length) {
      const names = missing.map(c => catalog.find(p => p.code === c)?.name ?? c);
      throw new HttpsError('failed-precondition', `Primero activa: ${names.join(', ')}.`);
    }
    const agreedPrice = request.data?.agreedPrice ?? pkg.price ?? 0;
    if (typeof agreedPrice !== 'number' || !Number.isFinite(agreedPrice) || agreedPrice < 0) {
      throw new HttpsError('invalid-argument', 'El precio acordado debe ser un número mayor o igual a 0.');
    }
    nextAddons = [...currentAddons, {
      packageCode,
      packageName: pkg.name ?? packageCode,
      priceAtActivation: agreedPrice,
      activatedAt: Timestamp.now(),
      activatedBy: caller.uid,
      notes: typeof request.data?.notes === 'string' ? request.data.notes.trim().slice(0, 500) : '',
    }];
  } else {
    if (!currentCodes.includes(packageCode)) {
      throw new HttpsError('failed-precondition', `'${pkg.name}' no está activo como add-on.`);
    }
    const keep = new Set(withoutDependents(packageCode, currentCodes, catalog));
    removed = currentCodes.filter(c => !keep.has(c));
    nextAddons = currentAddons.filter(a => keep.has(typeof a === 'string' ? a : a?.packageCode));
  }

  const nextCodes = nextAddons.map(a => (typeof a === 'string' ? a : a.packageCode));
  const effective = effectivePackages(planPkgs, nextCodes, catalog);
  await db.doc(`companies/${companyId}`).update({
    ...effective,
    addonPackages: nextAddons,
    updatedAt: Timestamp.now(),
  });

  console.log('[portalSetAddon]', { companyId, packageCode, action, removed, by: caller.uid });
  return { success: true, companyId, action, removed, ...effective };
});

// ─── Planes ──────────────────────────────────────────────────────────────────

/** Planes del canal. Payload: { includeInactive?, channelId? (solo super admin) }. */
export const portalListPlans = onCall(async (request) => {
  const db = admin.firestore();
  const caller = await requirePortalCaller(db, request);
  const scope = scopeFor(caller, request.data?.channelId);
  const includeInactive = request.data?.includeInactive === true;

  let q: admin.firestore.Query = db.collection('plans');
  if (scope) q = q.where('channelId', '==', scope);
  const snap = await q.limit(MAX_LIST).get();

  const plans = snap.docs
    .map(d => planSummary(d.id, d.data()))
    .filter(p => includeInactive || p['isActive'] !== false)
    .sort((a, b) => Number(a['sortOrder']) - Number(b['sortOrder']));
  return { plans };
});

/**
 * Crea o edita un plan del canal.
 * Payload: { planId?, plan: {...}, channelId? (solo super admin, al crear) }
 *
 * Editar límites, flags o paquetes se propaga a las empresas del plan por el
 * trigger onPlanUpdated.
 */
export const portalUpsertPlan = onCall(async (request) => {
  const db = admin.firestore();
  const caller = await requirePortalCaller(db, request);
  const catalogCodes = (await loadCatalog(db)).map(p => p.code);
  const now = Timestamp.now();
  const planId = request.data?.planId;

  if (planId !== undefined && planId !== null && planId !== '') {
    const id = requireString(planId, 'planId');
    const ref = db.doc(`plans/${id}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', `El plan '${id}' no existe.`);
    const current = snap.data()!;
    assertChannelAccess(caller, current['channelId'], `el plan '${id}'`);

    const data = sanitizePlanInput(request.data?.plan, catalogCodes, current as any);
    await ref.update({ ...data, updatedAt: now, updatedBy: caller.uid });
    console.log('[portalUpsertPlan] actualizado', { planId: id, by: caller.uid });
    return { success: true, planId: id, created: false };
  }

  const channelId = isChannelAdmin(caller)
    ? caller.channelId!
    : scopeFor(caller, request.data?.channelId);
  if (!channelId) {
    throw new HttpsError('invalid-argument', 'El super admin debe indicar el canal del plan nuevo.');
  }
  const data = sanitizePlanInput(request.data?.plan, catalogCodes);
  const ref = db.collection('plans').doc();
  await ref.set({ ...data, channelId, createdAt: now, updatedAt: now, createdBy: caller.uid });
  console.log('[portalUpsertPlan] creado', { planId: ref.id, channelId, by: caller.uid });
  return { success: true, planId: ref.id, created: true };
});

// ─── Conexión ────────────────────────────────────────────────────────────────

/**
 * Con qué identidad llega la app a FacturaEc y en qué estado está su canal.
 * Lo usa el indicador de conexión de la app del canal.
 *
 * No exige canal activo: justamente debe poder informar que está suspendido.
 */
export const portalWhoAmI = onCall(async (request) => {
  const db = admin.firestore();
  const caller = readCaller(request);
  if (!isSuperAdmin(caller) && !isChannelAdmin(caller)) {
    throw new HttpsError('permission-denied', 'Solo administradores de plataforma o de canal.');
  }

  let email: string | null = null;
  try {
    email = (await admin.auth().getUser(caller.uid)).email ?? null;
  } catch {
    // Identidad de integración sin registro de usuario: se informa sin correo.
  }

  let channel: Record<string, unknown> | null = null;
  if (caller.channelId) {
    const snap = await db.doc(`channels/${caller.channelId}`).get();
    channel = snap.exists
      ? { id: snap.id, name: snap.data()?.['name'] ?? snap.id, status: snap.data()?.['status'] ?? 'unknown' }
      : { id: caller.channelId, name: caller.channelId, status: 'missing' };
  }

  return {
    uid: caller.uid,
    email,
    role: caller.role ?? null,
    channelId: caller.channelId ?? null,
    channel,
    project: process.env.GCLOUD_PROJECT ?? null,
    checkedAt: new Date().toISOString(),
  };
});

// ─── Catálogo ────────────────────────────────────────────────────────────────

/** Catálogo de paquetes (lo comparten todos los canales; solo lectura). */
export const portalListPackages = onCall(async (request) => {
  const db = admin.firestore();
  await requirePortalCaller(db, request);
  const packages = (await loadCatalog(db))
    .map(packageSummary)
    .sort((a, b) => Number(a['order']) - Number(b['order']));
  return { packages };
});
