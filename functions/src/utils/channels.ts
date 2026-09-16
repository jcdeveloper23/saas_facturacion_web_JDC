/**
 * channels.ts — Aislamiento por canal (multimarca)
 *
 * FacturaEc es una sola instancia para varios productos. Conectate y Mi Buseta
 * no son tenants: son CANALES. Cada uno tiene su super admin, que administra
 * solo SUS empresas. Los tenants siguen siendo las empresas.
 *
 *   channels/{channelId}
 *   companies/{companyId}.channelId
 *   plans/{planId}.channelId
 *
 * Regla que no se negocia: el canal sale SIEMPRE del token del llamador, nunca
 * del payload. El `channelId` que mande el cliente se ignora — salvo el caso
 * explícito del super admin de plataforma dando de alta en un canal ajeno.
 *
 * Ver docs/PLAN_CANALES_MULTIMARCA.md.
 */

import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';

/** Rol de los gateways de cada producto (Conectate, Mi Buseta). */
export const CHANNEL_ADMIN_ROLE = 'channel_admin';

/** Dueño de la plataforma: ve todos los canales. */
export const SUPER_ADMIN_ROLE = 'super_admin';

/** Canal de las empresas que existían antes de este modelo. */
export const DEFAULT_CHANNEL_ID = 'directo';

/** Formato de un channelId: minúsculas, dígitos y guiones, 2-40 caracteres. */
export function isValidChannelId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{1,39}$/.test(value);
}

/** Identidad del llamador, ya normalizada desde el token. */
export interface Caller {
  uid: string;
  role?: string;
  channelId?: string;
  companyId?: string;
}

/** Lee la identidad del token. Lanza si no hay sesión. */
export function readCaller(request: CallableRequest<unknown>): Caller {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'No autenticado.');
  }
  const token = request.auth.token as Record<string, unknown>;
  const str = (key: string): string | undefined =>
    typeof token[key] === 'string' && token[key] !== '' ? (token[key] as string) : undefined;

  return {
    uid: request.auth.uid,
    role: str('role'),
    channelId: str('channelId'),
    companyId: str('companyId'),
  };
}

export function isSuperAdmin(caller: Caller): boolean {
  return caller.role === SUPER_ADMIN_ROLE;
}

export function isChannelAdmin(caller: Caller): boolean {
  return caller.role === CHANNEL_ADMIN_ROLE;
}

/**
 * ¿Puede este llamador operar sobre un recurso de este canal?
 *
 * Función pura: es el corazón del aislamiento y por eso se prueba sola.
 * Niega por defecto — un `channel_admin` sin `channelId`, o un recurso sin
 * canal estampado (migración a medias), no pasan.
 */
export function canOperateOnChannel(caller: Caller, resourceChannelId?: string | null): boolean {
  if (isSuperAdmin(caller)) return true;
  if (!isChannelAdmin(caller)) return false;
  if (!caller.channelId) return false;
  if (!resourceChannelId) return false;
  return caller.channelId === resourceChannelId;
}

/** Igual que la anterior, pero lanza el error que ve el cliente. */
export function assertChannelAccess(
  caller: Caller,
  resourceChannelId?: string | null,
  what = 'esta empresa'
): void {
  if (canOperateOnChannel(caller, resourceChannelId)) return;

  console.warn('[channels] Acceso denegado', {
    uid: caller.uid,
    role: caller.role ?? null,
    callerChannel: caller.channelId ?? null,
    resourceChannel: resourceChannelId ?? null,
  });
  throw new HttpsError('permission-denied', `No tiene permiso sobre ${what}.`);
}

/**
 * Canal a estampar en una empresa nueva.
 *
 * El `channel_admin` la crea siempre en el suyo. El super admin de plataforma
 * puede indicar uno explícito (es el único que da de alta fuera de un canal);
 * si no lo indica, cae en el canal `directo`.
 */
export function resolveChannelForNewCompany(caller: Caller, requestedChannelId?: unknown): string {
  if (isChannelAdmin(caller)) {
    if (!caller.channelId) {
      throw new HttpsError('permission-denied', 'El token de canal no tiene channelId.');
    }
    return caller.channelId;
  }
  if (isSuperAdmin(caller)) {
    return typeof requestedChannelId === 'string' && requestedChannelId !== ''
      ? requestedChannelId
      : DEFAULT_CHANNEL_ID;
  }
  throw new HttpsError('permission-denied', 'Solo super_admin o channel_admin pueden crear empresas.');
}

/**
 * Un plan solo se asigna a empresas de su mismo canal.
 *
 * Vale para todos, incluido el super admin de plataforma: cruzar catálogos
 * rompe el cobro, y equivocarse acá es tan fácil como elegir mal en una lista.
 */
export function assertPlanMatchesCompany(
  planChannelId: string | null | undefined,
  companyChannelId: string | null | undefined
): void {
  const planChannel = planChannelId || DEFAULT_CHANNEL_ID;
  const companyChannel = companyChannelId || DEFAULT_CHANNEL_ID;
  if (planChannel === companyChannel) return;

  throw new HttpsError(
    'permission-denied',
    `El plan pertenece al canal '${planChannel}' y la empresa al canal '${companyChannel}'.`
  );
}

/**
 * Un channel_admin solo opera si su canal existe y está activo. Suspender un
 * canal corta a su admin de inmediato, sin tocarle los claims.
 * El super admin de plataforma no depende de ningún canal.
 */
export async function assertCallerChannelActive(db: Firestore, caller: Caller): Promise<void> {
  if (!isChannelAdmin(caller)) return;
  if (!caller.channelId) {
    throw new HttpsError('permission-denied', 'El token de canal no tiene channelId.');
  }
  const snap = await db.doc(`channels/${caller.channelId}`).get();
  if (!snap.exists || snap.data()?.['status'] !== 'active') {
    throw new HttpsError('permission-denied', `El canal '${caller.channelId}' no está activo.`);
  }
}

/**
 * Carga la empresa y verifica el canal de una sola vez.
 * Es lo que llaman los callables antes de tocar nada.
 */
export async function loadCompanyForCaller(
  db: Firestore,
  caller: Caller,
  companyId: string
): Promise<Record<string, any>> {
  await assertCallerChannelActive(db, caller);
  const snap = await db.doc(`companies/${companyId}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `La empresa '${companyId}' no existe.`);
  }
  const company = snap.data() as Record<string, any>;
  assertChannelAccess(caller, company['channelId'], `la empresa '${companyId}'`);
  return company;
}
