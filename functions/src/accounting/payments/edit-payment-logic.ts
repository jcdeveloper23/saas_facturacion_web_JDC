import { ecuadorDay, ecuadorYearOf } from '../advances/advance-logic';
import { PAID_BY_CASH_VOUCHER } from '../cash-vouchers/cash-voucher-logic';
import { purchaseAccountingDate } from '../utils/purchase-entry';

// ─── Editar un cobro o pago ya registrado (2026-11-16) ────────────────────────
//
// Pedido del usuario: en «Cobros realizados» y «Pagos realizados» se corrigen
// la fecha, la referencia y las notas, como en su sistema anterior. La forma
// de pago (la cuenta y su asiento) NO se cambia: para eso se anula y se
// registra de nuevo.
//
// La fecha mueve también la del asiento. Por eso solo dentro del mismo año
// (el número del documento y del asiento son de ese ejercicio), con el
// ejercicio abierto y el asiento sin conciliar. La referencia y las notas no
// tocan la contabilidad: se cambian siempre que el documento esté vivo.

export type PaymentSource = 'invoice' | 'purchase' | 'cashVoucher' | 'advance' | 'refund';

export const PAYMENT_SOURCES: PaymentSource[] = ['invoice', 'purchase', 'cashVoucher', 'advance', 'refund'];

/** Dónde vive cada cosa en cada tipo de documento. */
export interface SourceFields {
  collection: string;
  date: string;
  reference: string;
  notes: string;
  entry: string;
}

export function sourceFields(s: PaymentSource): SourceFields {
  switch (s) {
    case 'invoice':
      return { collection: 'invoices', date: 'paidAt', reference: 'paymentReference', notes: 'paymentNotes', entry: 'paymentEntryId' };
    case 'purchase':
      return { collection: 'purchases', date: 'paidAt', reference: 'paymentReference', notes: 'paymentNotes', entry: 'paymentEntryId' };
    case 'cashVoucher':
      return { collection: 'cashVouchers', date: 'date', reference: 'reference', notes: 'notes', entry: 'accountingEntryId' };
    case 'advance':
      return { collection: 'advances', date: 'date', reference: 'reference', notes: 'notes', entry: 'accountingEntryId' };
    case 'refund':
      return { collection: 'advanceApplications', date: 'date', reference: 'reference', notes: 'notes', entry: 'accountingEntryId' };
  }
}

export function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return null;
}

/** Por qué no se puede editar este documento (ni siquiera la referencia), o null. */
export function editableProblem(s: PaymentSource, doc: Record<string, any> | undefined): string | null {
  if (!doc) return 'El documento ya no existe.';
  const voided = doc.isVoid === true || ['void', 'cancelled'].includes(doc.status);
  if (voided) return 'El documento está anulado: no se edita.';
  if (s === 'invoice' || s === 'purchase') {
    if (doc.isPaid !== true && doc.status !== 'paid') {
      return s === 'invoice' ? 'La factura no está cobrada.' : 'La compra no está pagada.';
    }
    if (doc.paidBy === PAID_BY_CASH_VOUCHER) {
      return s === 'invoice'
        ? 'La factura se cobró con un recibo de caja: edita el recibo.'
        : 'La compra se pagó con un comprobante de egreso: edita el comprobante.';
    }
    if (doc.paidBy === 'advances') return 'Se saldó con anticipos: no hay un cobro que editar.';
  }
  if (s === 'advance' && doc.version !== 2) return 'Este anticipo es del sistema anterior: no se edita desde aquí.';
  if (s === 'refund' && doc.kind !== 'refund') return 'El movimiento no es una devolución.';
  return null;
}

/**
 * Por qué la nueva fecha no vale, o null. [notBefore]: el día desde el que
 * puede ser (la factura, la compra, el anticipo); [notAfter]: el día hasta el
 * que puede ser (la primera aplicación del anticipo). [today] es hoy.
 */
export function newDateProblem(p: {
  current: Date | null;
  next: Date;
  today: Date;
  notBefore?: Array<{ date: Date | null; label: string }>;
  notAfter?: Array<{ date: Date | null; label: string }>;
}): string | null {
  if (ecuadorDay(p.next) > ecuadorDay(p.today)) return 'La fecha no puede ser futura.';
  if (p.current) {
    const year = ecuadorYearOf(p.current);
    if (ecuadorYearOf(p.next) !== year) {
      return `La fecha tiene que quedar en ${year}: el documento y su asiento son de ese ejercicio. `
        + 'Para pasarlo a otro año, anúlalo y regístralo de nuevo.';
    }
  }
  for (const b of p.notBefore ?? []) {
    if (b.date && ecuadorDay(p.next) < ecuadorDay(b.date)) return `La fecha no puede ser anterior a ${b.label}.`;
  }
  for (const a of p.notAfter ?? []) {
    if (a.date && ecuadorDay(p.next) > ecuadorDay(a.date)) return `La fecha no puede ser posterior a ${a.label}.`;
  }
  return null;
}

/** El día desde el que puede ser el cobro o pago de una factura o compra. */
export function targetDate(kind: 'invoice' | 'purchase', doc: Record<string, any> | undefined): Date | null {
  if (!doc) return null;
  return kind === 'purchase' ? purchaseAccountingDate(doc) : toDate(doc.date);
}
