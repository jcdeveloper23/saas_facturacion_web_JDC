// ─── Anticipos de clientes (E1, 2026-10-14) ───────────────────────────────────
//
// Un cliente paga antes de que exista la factura. El dinero entra al banco y
// la empresa le debe ese valor (en bienes, servicios o devolución) hasta que
// se aplica a una factura.
//
//   Registrar:   Debe Banco (linkedGlCode)          / Haber 2.1.04.008 Anticipo Clientes
//   Aplicar:     Debe 2.1.04.008 Anticipo Clientes  / Haber CxC (la del asiento de la venta)
//   Desaplicar / anular: reversa del asiento correspondiente.
//
// IVA en anticipos de servicios (LRTI art. 61): NO se genera IVA al recibir el
// anticipo; queda pendiente de confirmar con el contador.
//
// Documentos (centavos enteros, solo los escribe el servidor):
//   companies/{cid}/advances/{id}             el anticipo
//   companies/{cid}/advanceApplications/{id}  cada aplicación a una factura
//   invoices.advancesApplied = {cents, count, lastId}
//
// Lo de este archivo es puro (sin Firestore), para probarlo con Jest. Las
// callables (advance-callables.ts) leen y escriben todo en una transacción.

export const ADVANCES_FROM_CUSTOMERS = { code: '2.1.04.008', name: 'Anticipo Clientes' } as const;

export interface AccountRef { code: string; name: string }

export interface EntryLineDraft {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

// ─── Números y fechas ─────────────────────────────────────────────────────────

/** Centavos enteros positivos, o null si el valor no sirve. */
export function positiveCents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isInteger(n) || n <= 0 || n > 100_000_000_000) return null;
  return n;
}

export function cents(amount: unknown): number {
  const n = Number(amount ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** 'AAAA-MM-DD' → mediodía de Ecuador (17:00 UTC), o null. */
export function parseEcuadorDate(s: unknown): Date | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d, 17));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** El día (AAAA-MM-DD) en hora de Ecuador (UTC-5). */
export function ecuadorDay(d: Date): string {
  return new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function ecuadorYearOf(d: Date): number {
  return Number(ecuadorDay(d).slice(0, 4));
}

/** ANT-2026-000001 */
export function advanceNumber(year: number, seq: number): string {
  return `ANT-${year}-${String(seq).padStart(6, '0')}`;
}

/** La identificación sin espacios ni guiones, para comparar. */
export function normalizeTaxId(s: unknown): string {
  return String(s ?? '').replace(/[\s.-]/g, '').toUpperCase();
}

// ─── Saldos ───────────────────────────────────────────────────────────────────

/** Lo aplicado a una factura según su acumulado, en centavos (0 si nada). */
export function advancesAppliedCents(inv: Record<string, any> | undefined): number {
  const c = Number(inv?.advancesApplied?.cents ?? 0);
  return Number.isInteger(c) && c > 0 ? c : 0;
}

/** Lo retenido por el cliente a una factura, en centavos. */
export function retainedCents(inv: Record<string, any> | undefined): number {
  const r = inv?.receivedRetentions;
  if (!r || typeof r !== 'object') return 0;
  const c = Number(r.ivaCents ?? 0) + Number(r.rentaCents ?? 0);
  return Number.isFinite(c) && c > 0 ? Math.round(c) : 0;
}

/**
 * Lo que falta cobrar de una factura, en centavos: total − retenido −
 * anticipos aplicados. Las NC no se restan (igual que el cobro,
 * payment-entry.ts): una factura con NC se corrige anulando o con la NC.
 */
export function invoicePendingCents(inv: Record<string, any>): number {
  return cents(inv.total) - retainedCents(inv) - advancesAppliedCents(inv);
}

export interface AdvanceLike {
  status?: string;
  isVoid?: boolean;
  amountCents?: number;
  appliedCents?: number;
  refundedCents?: number;
  partyType?: string;
  partyTaxId?: string;
  date?: { toDate(): Date } | Date;
}

export function advanceAvailableCents(a: AdvanceLike): number {
  return Number(a.amountCents ?? 0) - Number(a.appliedCents ?? 0) - Number(a.refundedCents ?? 0);
}

export function advanceStatusFor(availableCents: number): 'open' | 'applied' {
  return availableCents > 0 ? 'open' : 'applied';
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return null;
}

// ─── Validaciones ─────────────────────────────────────────────────────────────

export interface RegisterInput {
  partyName: string;
  partyTaxId: string;
  amountCents: number;
  date: Date;
}

export function validateRegister(i: { partyName?: unknown; partyTaxId?: unknown; amountCents?: unknown; date?: unknown }):
  { ok: true; value: RegisterInput } | { ok: false; error: string } {
  const partyName = String(i.partyName ?? '').trim();
  const partyTaxId = normalizeTaxId(i.partyTaxId);
  const amountCents = positiveCents(i.amountCents);
  const date = parseEcuadorDate(i.date);
  if (!partyName) return { ok: false, error: 'Falta el cliente.' };
  if (partyName.length > 300) return { ok: false, error: 'El nombre del cliente es demasiado largo.' };
  if (!partyTaxId || partyTaxId.length > 20) {
    return { ok: false, error: 'Falta la cédula, RUC o pasaporte del cliente (hasta 20 caracteres).' };
  }
  if (amountCents === null) return { ok: false, error: 'El valor del anticipo tiene que ser mayor que cero.' };
  if (!date) return { ok: false, error: 'La fecha va como AAAA-MM-DD.' };
  return { ok: true, value: { partyName, partyTaxId, amountCents, date } };
}

/**
 * Por qué no se puede aplicar [amountCents] del anticipo a esta factura, o
 * null. [alreadyInThisCall] es lo que ya se aplicó del mismo anticipo en esta
 * misma llamada (varias facturas a la vez).
 */
export function applicationProblem(
  a: AdvanceLike,
  inv: Record<string, any>,
  amountCents: number,
  date: Date,
  alreadyInThisCall = 0,
): string | null {
  const num = inv.fullNumber ? ` ${inv.fullNumber}` : '';
  if (a.isVoid === true || a.status === 'void') return 'El anticipo está anulado.';
  if (a.partyType !== 'customer') return 'Solo se aplican a facturas los anticipos de clientes.';
  if (inv.isCreditNote === true || inv.documentType === 'creditNote') return `La${num} es una nota de crédito.`;
  if (inv.isVoid === true || inv.status === 'void' || inv.status === 'cancelled') return `La factura${num} está anulada.`;
  if (inv.sriStatus !== 'authorized') return `La factura${num} todavía no está autorizada por el SRI.`;
  if (inv.status !== 'issued' || inv.isPaid === true) return `La factura${num} ya está cobrada.`;
  if (normalizeTaxId(inv.customerTaxId) !== normalizeTaxId(a.partyTaxId)) {
    return `La factura${num} es de otro cliente (${inv.customerTaxId ?? 'sin identificación'}).`;
  }
  const advDate = toDate(a.date);
  if (advDate && ecuadorDay(date) < ecuadorDay(advDate)) return 'La aplicación no puede ser anterior al anticipo.';
  const invDate = toDate(inv.date);
  if (invDate && ecuadorDay(date) < ecuadorDay(invDate)) return `La aplicación no puede ser anterior a la factura${num}.`;
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'El valor a aplicar tiene que ser mayor que cero.';
  const available = advanceAvailableCents(a) - alreadyInThisCall;
  if (amountCents > available) {
    return `El anticipo solo tiene $${(Math.max(available, 0) / 100).toFixed(2)} disponibles.`;
  }
  const pending = invoicePendingCents(inv);
  if (amountCents > pending) {
    return `A la factura${num} solo le faltan $${(Math.max(pending, 0) / 100).toFixed(2)} por cobrar.`;
  }
  return null;
}

/** Por qué no se puede desaplicar, o null. */
export function unapplyProblem(app: Record<string, any>, inv: Record<string, any> | undefined): string | null {
  if (app.isVoid === true || app.status === 'void') return 'Esa aplicación ya se deshizo.';
  if (!inv) return 'La factura ya no existe.';
  // Cobrada por banco (con su asiento de cobro): primero se deshace el cobro.
  if (inv.isPaid === true && inv.paidBy !== 'advances') {
    return 'La factura ya se cobró por banco: no se puede quitar el anticipo.';
  }
  return null;
}

/** Por qué no se puede anular el anticipo, o null. */
export function voidProblem(a: AdvanceLike): string | null {
  if (a.isVoid === true || a.status === 'void') return 'El anticipo ya está anulado.';
  if (Number(a.appliedCents ?? 0) > 0) return 'El anticipo tiene aplicaciones: deshazlas primero.';
  if (Number(a.refundedCents ?? 0) > 0) return 'El anticipo tiene devoluciones.';
  return null;
}

// ─── Acumulado en la factura ──────────────────────────────────────────────────

export interface AppliedAcc { cents: number; count: number; lastId: string }

export function readAcc(inv: Record<string, any> | undefined): AppliedAcc {
  const a = inv?.advancesApplied ?? {};
  return {
    cents: Number.isInteger(a.cents) ? a.cents : 0,
    count: Number.isInteger(a.count) ? a.count : 0,
    lastId: typeof a.lastId === 'string' ? a.lastId : '',
  };
}

/**
 * Lo que cambia en la factura al aplicar (+) o desaplicar (−): el acumulado y,
 * si queda saldada solo con anticipos, el cobro (`paidBy: 'advances'`, sin
 * banco: no genera asiento de cobro). Al desaplicar una saldada por anticipos
 * vuelve a 'issued'. `null` en un campo = borrarlo.
 */
export function invoicePatchFor(
  inv: Record<string, any>,
  appId: string,
  deltaCents: number,
  date: Date,
): Record<string, unknown> {
  const acc = readAcc(inv);
  const next: AppliedAcc = {
    cents: acc.cents + deltaCents,
    count: acc.count + (deltaCents > 0 ? 1 : -1),
    lastId: appId,
  };
  const patch: Record<string, unknown> = { advancesApplied: next };
  const pendingAfter = cents(inv.total) - retainedCents(inv) - next.cents;
  if (deltaCents > 0 && pendingAfter <= 0) {
    patch.isPaid = true;
    patch.status = 'paid';
    patch.paidBy = 'advances';
    patch.paidAt = date;
  } else if (deltaCents < 0 && inv.paidBy === 'advances') {
    patch.isPaid = false;
    patch.status = 'issued';
    patch.paidBy = null;
    patch.paidAt = null;
  }
  return patch;
}

// ─── Asientos ─────────────────────────────────────────────────────────────────

export function buildRegisterLines(
  amountCents: number,
  bank: AccountRef,
  advances: AccountRef,
  label: string,
): EntryLineDraft[] {
  const v = amountCents / 100;
  return [
    { accountCode: bank.code, accountName: bank.name, debit: v, credit: 0, description: label },
    { accountCode: advances.code, accountName: advances.name, debit: 0, credit: v, description: label },
  ];
}

export function buildApplicationLines(
  amountCents: number,
  advances: AccountRef,
  receivable: AccountRef,
  label: string,
): EntryLineDraft[] {
  const v = amountCents / 100;
  return [
    { accountCode: advances.code, accountName: advances.name, debit: v, credit: 0, description: label },
    { accountCode: receivable.code, accountName: receivable.name, debit: 0, credit: v, description: label },
  ];
}

/** Las líneas de la reversa: debe y haber cambiados, como processReversal. */
export function invertLines<T extends { debit: number; credit: number; description?: string }>(lines: T[]): T[] {
  return lines.map((l) => ({
    ...l,
    debit: l.credit,
    credit: l.debit,
    description: `[REVERSA] ${l.description ?? ''}`,
  }));
}

export function sumSide(lines: Array<{ debit: number; credit: number }>): { debit: number; credit: number } {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    debit: r2(lines.reduce((s, l) => s + Number(l.debit || 0), 0)),
    credit: r2(lines.reduce((s, l) => s + Number(l.credit || 0), 0)),
  };
}
