import { parseEcuadorDate } from '../accounting/advances/advance-logic';
import { editableProblem, newDateProblem, sourceFields } from '../accounting/payments/edit-payment-logic';

const d = (s: string) => parseEcuadorDate(s)!;
const today = d('2026-11-16');

describe('editar un cobro o pago', () => {
  it('cada tipo apunta a sus campos', () => {
    expect(sourceFields('invoice')).toMatchObject({ collection: 'invoices', date: 'paidAt', entry: 'paymentEntryId' });
    expect(sourceFields('cashVoucher')).toMatchObject({ collection: 'cashVouchers', date: 'date', reference: 'reference' });
    expect(sourceFields('refund').collection).toBe('advanceApplications');
  });

  it('no edita anulados ni facturas saldadas por otra vía', () => {
    expect(editableProblem('cashVoucher', { isVoid: true })).toMatch(/anulado/);
    expect(editableProblem('cashVoucher', { status: 'posted' })).toBeNull();
    expect(editableProblem('invoice', { isPaid: false, status: 'issued' })).toMatch(/no está cobrada/);
    expect(editableProblem('invoice', { isPaid: true, paidBy: 'cashVoucher' })).toMatch(/edita el recibo/);
    expect(editableProblem('purchase', { isPaid: true, paidBy: 'cashVoucher' })).toMatch(/edita el comprobante/);
    expect(editableProblem('invoice', { isPaid: true, paidBy: 'advances' })).toMatch(/anticipos/);
    expect(editableProblem('invoice', { isPaid: true, status: 'paid' })).toBeNull();
    expect(editableProblem('advance', { version: 1 })).toMatch(/sistema anterior/);
    expect(editableProblem('refund', { kind: 'application' })).toMatch(/no es una devolución/);
    expect(editableProblem('invoice', undefined)).toMatch(/no existe/);
  });

  it('la fecha: mismo año, no futura, dentro de sus límites', () => {
    const current = d('2026-10-10');
    expect(newDateProblem({ current, next: d('2026-10-05'), today })).toBeNull();
    expect(newDateProblem({ current, next: d('2026-11-17'), today })).toMatch(/futura/);
    expect(newDateProblem({ current, next: d('2025-12-31'), today })).toMatch(/quedar en 2026/);
    expect(newDateProblem({
      current, next: d('2026-10-01'), today, notBefore: [{ date: d('2026-10-03'), label: 'la factura 001' }],
    })).toMatch(/anterior a la factura 001/);
    expect(newDateProblem({
      current, next: d('2026-10-03'), today, notBefore: [{ date: d('2026-10-03'), label: 'la factura' }],
    })).toBeNull();
    expect(newDateProblem({
      current, next: d('2026-10-20'), today, notAfter: [{ date: d('2026-10-15'), label: 'su devolución' }],
    })).toMatch(/posterior a su devolución/);
  });
});
