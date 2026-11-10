/**
 * payroll-auth.ts — Quién entra a la nómina (PLAN_NOMINA.md D-N2, §3.1, §5.4).
 *
 * ⛔ No se usa requireCompanyRole: deja pasar siempre a super_admin. Aquí solo
 * entran el admin y el contador DE ESA EMPRESA. Ni el super admin ni el admin
 * del canal ven sueldos (consecuencia aceptada, §12).
 */

import { HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

export const PAYROLL_ROLES = ['admin', 'accountant'];

/** Puro: el motivo del rechazo, o null si pasa. */
export function payrollRoleProblem(
  token: Record<string, any> | undefined | null, companyId: string,
): { code: 'unauthenticated' | 'permission-denied'; message: string } | null {
  if (!token) return { code: 'unauthenticated', message: 'Debe estar autenticado.' };
  if (token['companyId'] !== companyId) {
    return { code: 'permission-denied', message: 'No tiene permisos para esta empresa.' };
  }
  if (!PAYROLL_ROLES.includes(String(token['role'] ?? ''))) {
    return { code: 'permission-denied', message: 'La nómina la operan solo el administrador de la empresa y el contador.' };
  }
  return null;
}

export function requirePayrollRole(
  request: { auth?: { token?: Record<string, any> } | null }, companyId: string,
): void {
  const p = payrollRoleProblem(request.auth ? (request.auth.token ?? {}) : null, companyId);
  if (p) throw new HttpsError(p.code, p.message);
}

/** Puro: la empresa tiene el módulo payroll (o el paquete pkg_hr) encendido. */
export function hasPayrollModule(company: Record<string, any> | undefined): boolean {
  const mods: unknown[] = Array.isArray(company?.enabledModules) ? company!.enabledModules : [];
  const pkgs: unknown[] = Array.isArray(company?.enabledPackages) ? company!.enabledPackages : [];
  return mods.includes('payroll') || pkgs.includes('pkg_hr');
}

/** Lee la empresa y exige el módulo. Devuelve el documento para no releerlo. */
export async function requirePayrollModule(
  db: admin.firestore.Firestore, companyId: string,
): Promise<Record<string, any>> {
  const snap = await db.doc(`companies/${companyId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'La empresa no existe.');
  const company = snap.data() as Record<string, any>;
  if (!hasPayrollModule(company)) {
    throw new HttpsError('failed-precondition', 'La empresa no tiene el módulo de Nómina (paquete pkg_hr).');
  }
  return company;
}

export function readCompanyId(data: any): string {
  const companyId = typeof data?.companyId === 'string' ? data.companyId.trim() : '';
  if (!companyId || companyId.includes('/')) throw new HttpsError('invalid-argument', 'Falta la empresa.');
  return companyId;
}

export function readId(data: any, key: string, label: string): string {
  const v = typeof data?.[key] === 'string' ? data[key].trim() : '';
  if (!v || v.includes('/')) throw new HttpsError('invalid-argument', `Falta ${label}.`);
  return v;
}

export function fail(msg: string): never {
  throw new HttpsError('failed-precondition', msg);
}
