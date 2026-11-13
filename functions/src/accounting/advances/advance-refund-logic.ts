// ─── Devoluciones de anticipos (2026-11-13) ───────────────────────────────────
//
// Lo que sobra de un anticipo se devuelve por el banco:
//
//   Cliente:    la empresa le devuelve el saldo
//               Debe 2.1.04.008 Anticipo Clientes      / Haber Banco
//   Proveedor:  el proveedor le devuelve el saldo a la empresa
//               Debe Banco                             / Haber 1.1.04.003 Anticipos a Proveedores
//   Deshacer:   reversa del asiento (unapplyAdvance, con `kind: 'refund'`).
//
// La devolución es un movimiento más del anticipo: va en
// companies/{cid}/advanceApplications con `kind: 'refund'` y `targetType:
// 'bank'`, y suma a `refundedCents` del anticipo. Un anticipo con
// devoluciones no se anula (voidProblem): primero se deshacen.
//
// Lo de este archivo es puro (sin Firestore), para probarlo con Jest.

import { AccountRef, AdvanceLike, EntryLineDraft, advanceAvailableCents, ecuadorDay } from './advance-logic';

export const REFUND_KIND = 'refund';

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return null;
}

/** Por qué no se puede devolver [amountCents] del anticipo, o null. */
export function refundProblem(a: AdvanceLike & { version?: unknown }, amountCents: number, date: Date): string | null {
  if (a.isVoid === true || a.status === 'void') return 'El anticipo está anulado.';
  if (a.version !== 2) return 'Este anticipo es del sistema anterior: no se devuelve desde aquí.';
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'El valor a devolver tiene que ser mayor que cero.';
  const advDate = toDate(a.date);
  if (advDate && ecuadorDay(date) < ecuadorDay(advDate)) return 'La devolución no puede ser anterior al anticipo.';
  const available = advanceAvailableCents(a);
  if (amountCents > available) {
    return `El anticipo solo tiene $${(Math.max(available, 0) / 100).toFixed(2)} disponibles para devolver.`;
  }
  return null;
}

/**
 * El asiento de la devolución. De cliente: sale del banco y baja el pasivo.
 * De proveedor: entra al banco y baja el activo.
 */
export function buildRefundLines(
  partyType: string | undefined,
  amountCents: number,
  bank: AccountRef,
  advances: AccountRef,
  label: string,
): EntryLineDraft[] {
  const v = amountCents / 100;
  const advLine = (debit: number, credit: number): EntryLineDraft =>
    ({ accountCode: advances.code, accountName: advances.name, debit, credit, description: label });
  const bankLine = (debit: number, credit: number): EntryLineDraft =>
    ({ accountCode: bank.code, accountName: bank.name, debit, credit, description: label });
  return partyType === 'supplier'
    ? [bankLine(v, 0), advLine(0, v)]
    : [advLine(v, 0), bankLine(0, v)];
}
