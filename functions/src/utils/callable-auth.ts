import { HttpsError } from 'firebase-functions/v2/https';

/**
 * requireCompanyRole
 *
 * Shared guard for `onCall` functions that operate on a single tenant
 * (`companyId` in the payload) and should mirror the same admin/accountant
 * restrictions already enforced by firestore.rules for the underlying
 * collection. Admin SDK callables bypass firestore.rules entirely, so
 * without this check any authenticated user — or, if `request.auth` isn't
 * even verified, anyone with the project's public apiKey — can call them
 * for any company.
 *
 * `super_admin` (platform staff) is always allowed, regardless of companyId.
 */
export function requireCompanyRole(
  request: { auth?: { token?: Record<string, any> } | null },
  companyId: string,
  allowedRoles: string[]
): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debe estar autenticado.');
  }

  const callerRole      = request.auth.token?.['role']      as string | undefined;
  const callerCompanyId = request.auth.token?.['companyId'] as string | undefined;

  if (callerRole === 'super_admin') return;

  if (callerCompanyId !== companyId) {
    throw new HttpsError('permission-denied', 'No tiene permisos para esta empresa.');
  }
  if (!callerRole || !allowedRoles.includes(callerRole)) {
    throw new HttpsError('permission-denied', 'Su rol no tiene permiso para esta acción.');
  }
}
