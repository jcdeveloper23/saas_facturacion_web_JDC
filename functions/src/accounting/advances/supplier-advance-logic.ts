// ─── Anticipos a proveedores (2026-11-13) ─────────────────────────────────────
//
// La empresa le paga al proveedor antes de tener su factura. El dinero sale del
// banco y el proveedor nos debe ese valor (en bienes o servicios) hasta que
// llega su factura y se cruza con la compra. Es el espejo de los anticipos de
// clientes (advance-logic.ts):
//
//   Registrar:   Debe 1.1.04.003 Anticipos a Proveedores / Haber Banco
//   Cruzar:      Debe CxP (la del asiento de la compra)  / Haber 1.1.04.003
//   Desaplicar / anular: reversa del asiento correspondiente.
//
// Documentos (centavos enteros, solo los escribe el servidor), los mismos que
// los de clientes:
//   companies/{cid}/advances/{id}             partyType: 'supplier'
//   companies/{cid}/advanceApplications/{id}  targetType: 'purchase'
//   purchases.advancesApplied = {cents, count, lastId}
//
// El saldo de la compra (purchasePendingCents) y la anulación de una compra
// recibida (void-received-purchase.ts) ya cuentan con `advancesApplied`.
//
// Lo de este archivo es puro (sin Firestore), para probarlo con Jest.

import {
  AdvanceLike, EntryLineDraft, AccountRef, advanceAvailableCents, ecuadorDay, normalizeTaxId,
  parseEcuadorDate, positiveCents,
} from './advance-logic';
import { AppliedAcc, readAppliedAcc } from '../utils/applied-acc';
import { purchaseAccountingDate } from '../utils/purchase-entry';

export const ADVANCES_TO_SUPPLIERS = { code: '1.1.04.003', name: 'Anticipos a Proveedores' } as const;

/** paidBy de una compra saldada solo con anticipos (igual que en facturas). */
export const PAID_BY_ADVANCES = 'advances';

/** APR-2026-000001 (los de clientes son ANT-). */
export function supplierAdvanceNumber(year: number, seq: number): string {
  return `APR-${year}-${String(seq).padStart(6, '0')}`;
}

/** La clave del secuencial en counters/advances. */
export function supplierAdvanceCounterKey(year: number): string {
  return `APR_${year}`;
}

/** La identificación del proveedor de una compra, normalizada. */
export function purchaseSupplierTaxId(p: Record<string, any>): string {
  return normalizeTaxId(p.supplierRuc ?? p.supplierTaxId);
}

// ─── Validaciones ─────────────────────────────────────────────────────────────

export interface SupplierRegisterInput {
  partyName: string;
  partyTaxId: string;
  amountCents: number;
  date: Date;
}

export function validateSupplierRegister(i: {
  partyName?: unknown; partyTaxId?: unknown; amountCents?: unknown; date?: unknown;
}): { ok: true; value: SupplierRegisterInput } | { ok: false; error: string } {
  const partyName = String(i.partyName ?? '').trim();
  const partyTaxId = normalizeTaxId(i.partyTaxId);
  const amountCents = positiveCents(i.amountCents);
  const date = parseEcuadorDate(i.date);
  if (!partyName) return { ok: false, error: 'Falta el proveedor.' };
  if (partyName.length > 300) return { ok: false, error: 'El nombre del proveedor es demasiado largo.' };
  if (!partyTaxId || partyTaxId.length > 20) {
    return { ok: false, error: 'Falta el RUC, cédula o pasaporte del proveedor (hasta 20 caracteres).' };
  }
  if (amountCents === null) return { ok: false, error: 'El valor del anticipo tiene que ser mayor que cero.' };
  if (!date) return { ok: false, error: 'La fecha va como AAAA-MM-DD.' };
  return { ok: true, value: { partyName, partyTaxId, amountCents, date } };
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return null;
}

const money = (c: number) => `$${(Math.max(c, 0) / 100).toFixed(2)}`;

/**
 * Por qué no se puede cruzar [amountCents] del anticipo [a] con la compra, o
 * null. [pendingCents] es lo que le falta pagar a la compra
 * (purchasePendingCents, con su retención). [alreadyInThisCall] es lo que ya
 * se reparte del mismo anticipo en otras compras de la misma llamada.
 */
export function supplierApplicationProblem(
  a: AdvanceLike,
  p: Record<string, any>,
  amountCents: number,
  date: Date,
  pendingCents: number,
  alreadyInThisCall = 0,
): string | null {
  const num = p.fullNumber ? ` ${p.fullNumber}` : '';
  if (a.isVoid === true || a.status === 'void') return 'El anticipo está anulado.';
  if (a.partyType !== 'supplier') return 'Solo se cruzan con compras los anticipos a proveedores.';
  if (p.isVoid === true || p.status === 'cancelled' || p.status === 'void') return `La compra${num} está anulada.`;
  if (p.isPaid === true || p.status === 'paid') return `La compra${num} ya está pagada.`;
  if (p.status !== 'received') return `La compra${num} todavía no está recibida.`;
  const supplier = purchaseSupplierTaxId(p);
  if (!supplier) return `La compra${num} no tiene el RUC del proveedor.`;
  if (supplier !== normalizeTaxId(a.partyTaxId)) return `La compra${num} es de otro proveedor (${supplier}).`;
  const advDate = toDate(a.date);
  if (advDate && ecuadorDay(date) < ecuadorDay(advDate)) return 'El cruce no puede ser anterior al anticipo.';
  const pDate = purchaseAccountingDate(p);
  if (pDate && ecuadorDay(date) < ecuadorDay(pDate)) return `El cruce no puede ser anterior a la compra${num}.`;
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'El valor a cruzar tiene que ser mayor que cero.';
  const available = advanceAvailableCents(a) - alreadyInThisCall;
  if (amountCents > available) return `El anticipo solo tiene ${money(available)} disponibles.`;
  if (amountCents > pendingCents) return `A la compra${num} solo le faltan ${money(pendingCents)} por pagar.`;
  return null;
}

/** Por qué no se puede deshacer el cruce con esta compra, o null. */
export function unapplySupplierProblem(app: Record<string, any>, p: Record<string, any> | undefined): string | null {
  if (app.isVoid === true || app.status === 'void') return 'Ese cruce ya se deshizo.';
  if (!p) return 'La compra ya no existe.';
  // Pagada por banco (con su asiento de pago): primero se deshace ese pago.
  if (p.isPaid === true && p.paidBy !== PAID_BY_ADVANCES && p.paidBy !== 'cashVoucher') {
    return 'La compra ya se pagó por banco: no se puede quitar el anticipo.';
  }
  return null;
}

// ─── Lo que cambia en la compra ───────────────────────────────────────────────

/**
 * Lo que cambia en la compra al cruzar (+) o deshacer (−): el acumulado y, si
 * queda saldada, el pago (`paidBy: 'advances'`, sin banco: payment-entry.ts no
 * genera asiento de pago). Al deshacer una saldada por anticipos o por un
 * comprobante, vuelve a 'received'. `null` en un campo = borrarlo.
 */
export function purchasePatchFor(
  p: Record<string, any>,
  appId: string,
  deltaCents: number,
  pendingAfterCents: number,
  date: Date,
): Record<string, unknown> {
  const acc = readAppliedAcc(p, 'advancesApplied');
  const next: AppliedAcc = {
    cents: acc.cents + deltaCents,
    count: Math.max(0, acc.count + (deltaCents > 0 ? 1 : -1)),
    lastId: appId,
  };
  const patch: Record<string, unknown> = { advancesApplied: next };
  if (deltaCents > 0 && pendingAfterCents <= 0) {
    patch.isPaid = true;
    patch.status = 'paid';
    patch.paidBy = PAID_BY_ADVANCES;
    patch.paidAt = date;
  } else if (deltaCents < 0 && p.isPaid === true && (p.paidBy === PAID_BY_ADVANCES || p.paidBy === 'cashVoucher')) {
    patch.isPaid = false;
    patch.status = 'received';
    patch.paidBy = null;
    patch.paidAt = null;
    if (p.paidBy === 'cashVoucher') {
      // La saldó un comprobante de egreso: su asiento sigue vivo como pago
      // parcial; la compra deja de apuntarlo como «el» pago.
      patch.paymentVoucherId = null;
      patch.paymentBankAccountId = null;
      patch.paymentEntryId = null;
    }
  }
  return patch;
}

// ─── Asientos ─────────────────────────────────────────────────────────────────

/** Registrar: Debe Anticipos a Proveedores / Haber Banco. */
export function buildSupplierRegisterLines(
  amountCents: number,
  bank: AccountRef,
  advances: AccountRef,
  label: string,
): EntryLineDraft[] {
  const v = amountCents / 100;
  return [
    { accountCode: advances.code, accountName: advances.name, debit: v, credit: 0, description: label },
    { accountCode: bank.code, accountName: bank.name, debit: 0, credit: v, description: label },
  ];
}

/** Cruzar: Debe CxP de la compra / Haber Anticipos a Proveedores. */
export function buildSupplierApplicationLines(
  amountCents: number,
  advances: AccountRef,
  payable: AccountRef,
  label: string,
): EntryLineDraft[] {
  const v = amountCents / 100;
  return [
    { accountCode: payable.code, accountName: payable.name, debit: v, credit: 0, description: label },
    { accountCode: advances.code, accountName: advances.name, debit: 0, credit: v, description: label },
  ];
}
