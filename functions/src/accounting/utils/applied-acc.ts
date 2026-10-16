// ─── Acumulados de lo ya aplicado a un documento (2026-10-16) ─────────────────
//
// Las facturas y las compras llevan acumulados de lo que ya las saldó por
// fuera del cobro o pago «a mano»: anticipos (`advancesApplied`, 2026-10-14) y
// comprobantes de egreso o recibos de caja (`cashVouchersApplied`,
// 2026-10-16). Los dos tienen la misma forma {cents, count, lastId} y los
// escribe solo el servidor. Aparte para que lo usen anticipos, comprobantes y
// payment-entry.ts sin importarse entre sí.

export interface AppliedAcc { cents: number; count: number; lastId: string }

export type AppliedAccField = 'advancesApplied' | 'cashVouchersApplied';

/** El acumulado del campo, con ceros si falta o está mal formado. */
export function readAppliedAcc(doc: Record<string, any> | undefined, field: AppliedAccField): AppliedAcc {
  const a = doc?.[field] ?? {};
  return {
    cents: Number.isInteger(a.cents) ? a.cents : 0,
    count: Number.isInteger(a.count) ? a.count : 0,
    lastId: typeof a.lastId === 'string' ? a.lastId : '',
  };
}

/** Los centavos aplicados según el acumulado (0 si nada o si no sirve). */
export function appliedAccCents(doc: Record<string, any> | undefined, field: AppliedAccField): number {
  const c = Number(doc?.[field]?.cents ?? 0);
  return Number.isInteger(c) && c > 0 ? c : 0;
}

/** Lo pagado o cobrado con comprobantes de egreso o recibos de caja, en centavos. */
export function cashVouchersAppliedCents(doc: Record<string, any> | undefined): number {
  return appliedAccCents(doc, 'cashVouchersApplied');
}
