// ─── Comprobantes de egreso y recibos de caja (2026-10-16) ────────────────────
//
// El dinero que sale (comprobante de egreso, CE) o entra (recibo de caja, RC)
// por un banco o una caja, con su respaldo en papel. Paga compras o cobra
// facturas —total o parcialmente— y, además o en su lugar, registra egresos o
// ingresos sin documento (cuotas de socios, gastos menores, intereses…) contra
// cuentas del plan.
//
//   Egreso:   Debe CxP de cada compra (la del asiento de la compra)
//             Debe cada cuenta de las líneas
//             Haber Banco o caja (linkedGlCode de bank_accounts)
//   Ingreso:  Debe Banco o caja
//             Haber CxC de cada factura (la del asiento de la venta)
//             Haber cada cuenta de las líneas
//   Anular:   reversa del asiento, en la misma transacción.
//
// Documentos (centavos enteros, solo los escribe el servidor):
//   companies/{cid}/cashVouchers/{id}       el comprobante
//   purchases|invoices.cashVouchersApplied = {cents, count, lastId}
//
// Si el comprobante deja el documento sin saldo, el documento queda pagado o
// cobrado con `paidBy: 'cashVoucher'` y `paymentEntryId` = el asiento del
// comprobante: así payment-entry.ts (el trigger del cobro/pago y «Contabilizar
// lo pendiente») no genera un segundo asiento.
//
// Lo de este archivo es puro (sin Firestore), para probarlo con Jest. Las
// callables (cash-voucher-callables.ts) leen y escriben todo en una transacción.

import {
  AccountRef, EntryLineDraft, cents, ecuadorDay, invoicePendingCents, normalizeTaxId,
  parseEcuadorDate, positiveCents,
} from '../advances/advance-logic';
import { appliedAccCents, cashVouchersAppliedCents, readAppliedAcc, AppliedAcc } from '../utils/applied-acc';
import { purchaseAccountingDate } from '../utils/purchase-entry';

export type VoucherKind = 'egreso' | 'ingreso';
export type VoucherTargetType = 'purchase' | 'invoice';

export const VOUCHER_KINDS: readonly VoucherKind[] = ['egreso', 'ingreso'];

/** Formas de pago de la Tabla 24 del SRI (las mismas que acepta paymentMethods). */
export const SRI_PAYMENT_METHOD_CODES = ['01', '15', '16', '17', '18', '19', '20', '21'] as const;

export const MAX_VOUCHER_APPLICATIONS = 20;
export const MAX_VOUCHER_ACCOUNT_LINES = 30;
const MAX_TOTAL_CENTS = 100_000_000_000;

/** La CxP fija del asiento de compras (generate-journal-entry-from-purchase.ts). */
export const ACCOUNTS_PAYABLE: AccountRef = { code: '2.1.01.001', name: 'Cuentas por Pagar Proveedores' };

/** paidBy de un documento saldado por comprobantes. */
export const PAID_BY_CASH_VOUCHER = 'cashVoucher';

// ─── Números ──────────────────────────────────────────────────────────────────

export function voucherPrefix(kind: VoucherKind): 'CE' | 'RC' {
  return kind === 'egreso' ? 'CE' : 'RC';
}

/** CE-2026-000001 / RC-2026-000001 */
export function voucherNumber(kind: VoucherKind, year: number, seq: number): string {
  return `${voucherPrefix(kind)}-${year}-${String(seq).padStart(6, '0')}`;
}

/** La clave del contador en counters/cashVouchers: un secuencial por tipo y año. */
export function voucherCounterKey(kind: VoucherKind, year: number): string {
  return `${voucherPrefix(kind)}_${year}`;
}

/** El egreso paga compras; el ingreso cobra facturas. */
export function targetTypeFor(kind: VoucherKind): VoucherTargetType {
  return kind === 'egreso' ? 'purchase' : 'invoice';
}

// ─── Entrada ──────────────────────────────────────────────────────────────────

export interface VoucherApplicationInput { targetType: VoucherTargetType; targetId: string; amountCents: number }
export interface VoucherAccountLineInput { accountCode: string; amountCents: number; description: string | null }

export interface VoucherInput {
  kind: VoucherKind;
  date: Date;
  partyId: string | null;
  partyName: string;
  partyTaxId: string | null;
  bankAccountId: string;
  paymentMethodCode: string;
  chequeNumber: string | null;
  reference: string | null;
  concept: string;
  notes: string | null;
  applications: VoucherApplicationInput[];
  accountLines: VoucherAccountLineInput[];
  totalCents: number;
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '' && !v.includes('/') && v.trim().length <= 200;
}

function optText(v: unknown, max: number): string | null {
  const s = String(v ?? '').trim().slice(0, max);
  return s === '' ? null : s;
}

/**
 * Valida y normaliza lo que llega a registerCashVoucher. No mira Firestore:
 * que existan la cuenta bancaria, las cuentas del plan y los documentos lo
 * comprueba la callable.
 */
export function validateVoucherInput(raw: Record<string, any>):
  { ok: true; value: VoucherInput } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error });
  const kind = raw?.kind;
  if (!VOUCHER_KINDS.includes(kind)) return bad("El tipo de comprobante es 'egreso' o 'ingreso'.");
  const date = parseEcuadorDate(raw.date);
  if (!date) return bad('La fecha va como AAAA-MM-DD.');

  const partyId = isId(raw.partyId) ? raw.partyId.trim() : null;
  const partyName = String(raw.partyName ?? '').trim();
  if (partyName.length > 300) return bad('El nombre es demasiado largo.');
  const taxId = normalizeTaxId(raw.partyTaxId);
  if (taxId.length > 20) return bad('La identificación tiene hasta 20 caracteres.');

  if (!isId(raw.bankAccountId)) return bad('Falta la cuenta de banco o caja.');
  const paymentMethodCode = String(raw.paymentMethodCode ?? '').trim();
  if (!(SRI_PAYMENT_METHOD_CODES as readonly string[]).includes(paymentMethodCode)) {
    return bad('La forma de pago tiene que ser un código de la Tabla 24 del SRI.');
  }
  const concept = String(raw.concept ?? '').trim();
  if (!concept) return bad('Escribe el concepto.');
  if (concept.length > 300) return bad('El concepto es demasiado largo (hasta 300 caracteres).');

  const rawApps = raw.applications ?? [];
  const rawLines = raw.accountLines ?? [];
  if (!Array.isArray(rawApps) || !Array.isArray(rawLines)) return bad('Las aplicaciones y las líneas van como listas.');
  if (rawApps.length > MAX_VOUCHER_APPLICATIONS) return bad(`Hasta ${MAX_VOUCHER_APPLICATIONS} documentos por comprobante.`);
  if (rawLines.length > MAX_VOUCHER_ACCOUNT_LINES) return bad(`Hasta ${MAX_VOUCHER_ACCOUNT_LINES} líneas por comprobante.`);
  if (rawApps.length === 0 && rawLines.length === 0) {
    return bad(kind === 'egreso'
      ? 'Elige al menos una compra o una cuenta.'
      : 'Elige al menos una factura o una cuenta.');
  }

  const expected = targetTypeFor(kind);
  const applications: VoucherApplicationInput[] = [];
  for (const a of rawApps) {
    if (a?.targetType !== expected) {
      return bad(kind === 'egreso'
        ? 'Un comprobante de egreso solo paga compras.'
        : 'Un recibo de caja solo cobra facturas.');
    }
    if (!isId(a.targetId)) return bad(kind === 'egreso' ? 'Falta la compra.' : 'Falta la factura.');
    const amountCents = positiveCents(a.amountCents);
    if (amountCents === null) return bad('Cada valor tiene que ser mayor que cero (en centavos enteros).');
    applications.push({ targetType: expected, targetId: a.targetId.trim(), amountCents });
  }
  if (new Set(applications.map((a) => a.targetId)).size !== applications.length) {
    return bad('Un documento aparece dos veces.');
  }

  const accountLines: VoucherAccountLineInput[] = [];
  for (const l of rawLines) {
    const accountCode = String(l?.accountCode ?? '').trim();
    if (!accountCode || accountCode.length > 40 || accountCode.includes('/')) return bad('Falta la cuenta de una línea.');
    const amountCents = positiveCents(l.amountCents);
    if (amountCents === null) return bad('Cada valor tiene que ser mayor que cero (en centavos enteros).');
    accountLines.push({ accountCode, amountCents, description: optText(l.description, 300) });
  }

  const totalCents = applications.reduce((s, a) => s + a.amountCents, 0)
    + accountLines.reduce((s, l) => s + l.amountCents, 0);
  if (totalCents <= 0) return bad('El total tiene que ser mayor que cero.');
  if (totalCents > MAX_TOTAL_CENTS) return bad('El total es demasiado grande.');

  return {
    ok: true,
    value: {
      kind, date, partyId, partyName, partyTaxId: taxId || null,
      bankAccountId: raw.bankAccountId.trim(), paymentMethodCode,
      chequeNumber: optText(raw.chequeNumber, 30),
      reference: optText(raw.reference, 120),
      concept,
      notes: optText(raw.notes, 500),
      applications, accountLines, totalCents,
    },
  };
}

// ─── La parte (proveedor o cliente) ───────────────────────────────────────────

export interface DocParty { name: string; taxId: string; number: string }

/** Quién es la parte del documento, para comparar y para tomarla de él. */
export function docParty(targetType: VoucherTargetType, doc: Record<string, any>): DocParty {
  return targetType === 'purchase'
    ? { name: String(doc.supplierName ?? '').trim(), taxId: normalizeTaxId(doc.supplierRuc ?? doc.supplierTaxId),
      number: String(doc.fullNumber ?? '') }
    : { name: String(doc.customerName ?? '').trim(), taxId: normalizeTaxId(doc.customerTaxId),
      number: String(doc.fullNumber ?? '') };
}

/**
 * El nombre y la identificación que lleva el comprobante. La persona elegida
 * (`persona`) manda sobre lo escrito. Con documentos, todos tienen que ser de
 * la misma parte; si no se dio identificación se toma del documento, y si se
 * dio tiene que coincidir.
 */
export function resolveParty(
  kind: VoucherKind,
  given: { partyName: string; partyTaxId: string | null },
  persona: { name?: string; taxId?: string } | null,
  docs: DocParty[],
): { ok: true; partyName: string; partyTaxId: string | null } | { ok: false; error: string } {
  const quien = kind === 'egreso' ? 'proveedor' : 'cliente';
  let name = String(persona?.name ?? '').trim() || given.partyName;
  let taxId = normalizeTaxId(persona?.taxId) || given.partyTaxId || '';
  if (docs.length > 0) {
    const first = docs[0];
    if (!first.taxId) return { ok: false, error: `El documento ${first.number} no tiene la identificación del ${quien}.` };
    const other = docs.find((d) => d.taxId !== first.taxId);
    if (other) return { ok: false, error: `Los documentos son de distintos ${quien}s (${first.number} y ${other.number}).` };
    if (taxId && taxId !== first.taxId) {
      return { ok: false, error: `El documento ${first.number} es de otro ${quien} (${first.taxId}).` };
    }
    taxId = first.taxId;
    if (!name) name = first.name;
  }
  if (!name) return { ok: false, error: kind === 'egreso' ? 'Falta a quién se paga.' : 'Falta de quién se recibe.' };
  return { ok: true, partyName: name, partyTaxId: taxId || null };
}

// ─── Saldos ───────────────────────────────────────────────────────────────────

/**
 * Si la retención ligada a la compra (`retentionId`) sigue viva: existe y no
 * está anulada. Un borrador cuenta: lo retenido no se le paga al proveedor.
 */
export function isLiveRetention(ret: Record<string, any> | undefined | null): boolean {
  return !!ret && ret.isVoid !== true && ret.status !== 'void' && ret.status !== 'cancelled';
}

/**
 * La CxP BRUTA de la compra, en centavos: subtotal + IVA, lo mismo que
 * acredita su asiento (purchase-entry.ts). `total` NO sirve: en la web y en
 * Conecta va NETO de la retención estimada con los % del proveedor
 * (calcPurchaseTotals). Si faltan subtotal e IVA, se reconstruye desde total.
 */
export function purchaseGrossCents(p: Record<string, any>): number {
  const tax = p.totalTax ?? p.vatAmount;
  if (typeof p.subtotal === 'number' && Number.isFinite(p.subtotal)) {
    return cents(p.subtotal) + cents(tax ?? 0);
  }
  return cents(p.total) + cents(p.totalIrRetention ?? 0) + cents(p.totalVatRetention ?? 0);
}

/**
 * Lo retenido al proveedor, en centavos: el `totalRetained` de la retención
 * ligada si está viva; si no hay (o se anuló), la estimada de la compra
 * (totalIrRetention + totalVatRetention).
 */
export function purchaseRetainedCents(p: Record<string, any>, ret: Record<string, any> | undefined | null): number {
  const c = isLiveRetention(ret)
    ? cents(ret!.totalRetained)
    : cents(p.totalIrRetention ?? 0) + cents(p.totalVatRetention ?? 0);
  return c > 0 ? c : 0;
}

/**
 * Lo que falta pagar de una compra, coherente con su CxP: bruto − retenido −
 * anticipos − comprobantes. Sin retención ligada, y con la estimada, da
 * `total` − anticipos − comprobantes.
 */
export function purchasePendingCents(p: Record<string, any>, ret: Record<string, any> | undefined | null): number {
  return purchaseGrossCents(p) - purchaseRetainedCents(p, ret)
    - appliedAccCents(p, 'advancesApplied') - cashVouchersAppliedCents(p);
}

/** Lo que falta cobrar de una factura (el mismo cálculo que los anticipos). */
export function invoiceVoucherPendingCents(inv: Record<string, any>): number {
  return invoicePendingCents(inv);
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return null;
}

const money = (c: number) => `$${(Math.max(c, 0) / 100).toFixed(2)}`;

/** Por qué no se puede aplicar [amountCents] a la compra o factura, o null. */
export function voucherTargetProblem(
  targetType: VoucherTargetType,
  doc: Record<string, any> | undefined,
  amountCents: number,
  date: Date,
  pendingCents: number,
): string | null {
  if (!doc) return targetType === 'purchase' ? 'Una de las compras ya no existe.' : 'Una de las facturas ya no existe.';
  const num = doc.fullNumber ? ` ${doc.fullNumber}` : '';
  if (targetType === 'purchase') {
    if (doc.isVoid === true || doc.status === 'cancelled' || doc.status === 'void') return `La compra${num} está anulada.`;
    if (doc.isPaid === true || doc.status === 'paid') return `La compra${num} ya está pagada.`;
    if (doc.status !== 'received') return `La compra${num} todavía no está recibida.`;
    const docDate = purchaseAccountingDate(doc);
    if (docDate && ecuadorDay(date) < ecuadorDay(docDate)) return `El pago no puede ser anterior a la compra${num}.`;
  } else {
    if (doc.isCreditNote === true || doc.documentType === 'creditNote') return `La${num} es una nota de crédito.`;
    if (doc.isVoid === true || doc.status === 'void' || doc.status === 'cancelled') return `La factura${num} está anulada.`;
    if (!['authorized', 'not_required'].includes(doc.sriStatus)) return `La factura${num} todavía no está autorizada por el SRI.`;
    if (doc.isPaid === true || doc.status !== 'issued') return `La factura${num} ya está cobrada.`;
    const docDate = toDate(doc.date);
    if (docDate && ecuadorDay(date) < ecuadorDay(docDate)) return `El cobro no puede ser anterior a la factura${num}.`;
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'El valor tiene que ser mayor que cero.';
  if (amountCents > pendingCents) {
    return targetType === 'purchase'
      ? `A la compra${num} solo le faltan ${money(pendingCents)} por pagar.`
      : `A la factura${num} solo le faltan ${money(pendingCents)} por cobrar.`;
  }
  return null;
}

/**
 * Por qué no se puede anular el comprobante por este documento, o null. Si el
 * documento ya se pagó o cobró por banco (no por comprobantes ni anticipos),
 * quitarle el comprobante lo dejaría pagado dos veces: primero se deshace ese
 * pago.
 */
export function voidTargetProblem(targetType: VoucherTargetType, doc: Record<string, any> | undefined): string | null {
  if (!doc) return null;
  const num = doc.fullNumber ? ` ${doc.fullNumber}` : '';
  if (doc.isPaid === true && doc.paidBy !== PAID_BY_CASH_VOUCHER && doc.paidBy !== 'advances') {
    return targetType === 'purchase'
      ? `La compra${num} ya se pagó por banco: primero deshaz ese pago.`
      : `La factura${num} ya se cobró por banco: primero deshaz ese cobro.`;
  }
  return null;
}

/** Por qué no se puede anular el comprobante, o null. */
export function voidVoucherProblem(v: Record<string, any>): string | null {
  if (v.isVoid === true || v.status === 'void') return 'El comprobante ya está anulado.';
  return null;
}

// ─── Lo que cambia en la compra o factura ─────────────────────────────────────

/**
 * Lo que cambia en el documento al aplicar (+) o anular (−) un comprobante:
 * el acumulado `cashVouchersApplied` y, si queda sin saldo, el pago o cobro
 * (`paidBy: 'cashVoucher'`, con el asiento del comprobante en
 * `paymentEntryId` para que payment-entry.ts no cree otro). Al anular, un
 * documento que estaba saldado por comprobantes o anticipos vuelve a no
 * pagado. `null` en un campo = borrarlo.
 */
export function voucherTargetPatch(
  targetType: VoucherTargetType,
  doc: Record<string, any>,
  voucherId: string,
  deltaCents: number,
  pendingAfterCents: number,
  pay: { date: Date; bankAccountId: string; entryId: string } | null,
): Record<string, unknown> {
  const acc = readAppliedAcc(doc, 'cashVouchersApplied');
  const next: AppliedAcc = {
    cents: acc.cents + deltaCents,
    count: Math.max(0, acc.count + (deltaCents > 0 ? 1 : -1)),
    lastId: voucherId,
  };
  const patch: Record<string, unknown> = { cashVouchersApplied: next };
  if (deltaCents > 0 && pendingAfterCents <= 0 && pay) {
    patch.isPaid = true;
    patch.status = 'paid';
    patch.paidAt = pay.date;
    patch.paidBy = PAID_BY_CASH_VOUCHER;
    patch.paymentVoucherId = voucherId;
    patch.paymentBankAccountId = pay.bankAccountId;
    patch.paymentEntryId = pay.entryId;
  } else if (deltaCents < 0 && doc.isPaid === true
    && (doc.paidBy === PAID_BY_CASH_VOUCHER || doc.paidBy === 'advances')) {
    patch.isPaid = false;
    patch.status = targetType === 'purchase' ? 'received' : 'issued';
    patch.paidAt = null;
    patch.paidBy = null;
    if (doc.paidBy === PAID_BY_CASH_VOUCHER) {
      patch.paymentVoucherId = null;
      patch.paymentBankAccountId = null;
      patch.paymentEntryId = null;
    }
  }
  return patch;
}

// ─── Cuentas de las líneas ────────────────────────────────────────────────────

export interface ChartAccount { name?: string; allowsMovement?: boolean; isActive?: boolean }

/**
 * Las cuentas de las líneas sin documento: tienen que existir, estar activas y
 * admitir movimiento, y no ser la misma cuenta del banco o la caja (el asiento
 * se anularía consigo mismo). Devuelve el nombre de cada una.
 */
export function resolveAccountLines(
  lines: VoucherAccountLineInput[],
  chart: Map<string, ChartAccount>,
  bankCode: string,
): { ok: true; names: Map<string, string> } | { ok: false; error: string } {
  const names = new Map<string, string>();
  for (const l of lines) {
    if (l.accountCode === bankCode) {
      return { ok: false, error: `La cuenta ${l.accountCode} es la misma del banco o la caja.` };
    }
    const c = chart.get(l.accountCode);
    if (!c) return { ok: false, error: `La cuenta ${l.accountCode} no existe en el plan de cuentas.` };
    if (c.isActive === false) return { ok: false, error: `La cuenta ${l.accountCode} está inactiva.` };
    if (c.allowsMovement !== true) return { ok: false, error: `La cuenta ${l.accountCode} es agrupadora: elige una de movimiento.` };
    names.set(l.accountCode, String(c.name ?? l.accountCode));
  }
  return { ok: true, names };
}

// ─── Asiento ──────────────────────────────────────────────────────────────────

/**
 * La CxP del asiento de la compra: la primera línea al Haber bajo 2.1.01
 * (proveedores). Así el Debe del pago va a la misma cuenta aunque el mapeo
 * cambie. Null si no la encuentra.
 */
export function payableFromPurchaseEntry(lines: Array<Record<string, any>> | undefined): AccountRef | null {
  for (const l of lines ?? []) {
    const code = String(l?.accountCode ?? '');
    if (Number(l?.credit ?? 0) > 0 && (code === '2.1.01' || code.startsWith('2.1.01.'))) {
      return { code, name: String(l?.accountName ?? code) };
    }
  }
  return null;
}

export interface VoucherLinePlan { account: AccountRef; amountCents: number; description: string }

/**
 * Las líneas del asiento, en dólares como el resto del diario. La del banco
 * va por el total en centavos, así que el asiento cuadra al centavo.
 */
export function buildVoucherEntryLines(
  kind: VoucherKind,
  bank: AccountRef,
  docLines: VoucherLinePlan[],
  accountLines: VoucherLinePlan[],
  bankDescription: string,
): EntryLineDraft[] {
  const totalCents = [...docLines, ...accountLines].reduce((s, l) => s + l.amountCents, 0);
  const side = (l: VoucherLinePlan): EntryLineDraft => {
    const v = l.amountCents / 100;
    return {
      accountCode: l.account.code, accountName: l.account.name,
      debit: kind === 'egreso' ? v : 0, credit: kind === 'egreso' ? 0 : v,
      description: l.description,
    };
  };
  const bankLine: EntryLineDraft = {
    accountCode: bank.code, accountName: bank.name,
    debit: kind === 'egreso' ? 0 : totalCents / 100, credit: kind === 'egreso' ? totalCents / 100 : 0,
    description: bankDescription,
  };
  const others = [...docLines, ...accountLines].map(side);
  return kind === 'egreso' ? [...others, bankLine] : [bankLine, ...others];
}
