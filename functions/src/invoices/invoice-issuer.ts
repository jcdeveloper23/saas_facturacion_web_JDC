/**
 * invoice-issuer.ts
 *
 * Quién puede emitir una factura con `createAndEmitInvoice`. Antes solo se
 * miraba que fuera de la empresa, así que cualquier rol —también solo
 * lectura— facturaba por aquí, aunque las reglas de `invoices` no lo dejan.
 *
 * Emiten: super admin (integraciones), administrador, vendedor y cajero, como
 * `canWrite()` de las reglas; y el contador si su empresa lo permite
 * (2026-11-19, `companies/{cid}/settings/permissions.accountantCanIssueInvoices`,
 * el interruptor de «Permisos de la empresa» en Conecta).
 */

import * as admin from 'firebase-admin';

export const INVOICE_ISSUER_ROLES: readonly string[] = ['super_admin', 'admin', 'seller', 'cashier'];

/** ¿Puede [role] emitir sin mirar los permisos de la empresa? */
export function roleAlwaysIssuesInvoices(role: string | undefined): boolean {
  return role !== undefined && INVOICE_ISSUER_ROLES.includes(role);
}

/** ¿Puede [role] emitir facturas en [companyId]? */
export async function callerMayIssueInvoices(
  db: admin.firestore.Firestore,
  companyId: string,
  role: string | undefined,
): Promise<boolean> {
  if (roleAlwaysIssuesInvoices(role)) return true;
  if (role !== 'accountant') return false;
  const ajustes = await db.doc(`companies/${companyId}/settings/permissions`).get();
  return ajustes.data()?.['accountantCanIssueInvoices'] === true;
}
