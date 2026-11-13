import { parseEcuadorDate, sumSide } from '../accounting/advances/advance-logic';
import {
  ADVANCES_TO_SUPPLIERS, buildSupplierApplicationLines, buildSupplierRegisterLines, purchasePatchFor,
  supplierAdvanceNumber, supplierApplicationProblem, unapplySupplierProblem, validateSupplierRegister,
} from '../accounting/advances/supplier-advance-logic';
import { purchasePendingCents } from '../accounting/cash-vouchers/cash-voucher-logic';
import { paymentAmount } from '../accounting/utils/payment-entry';
import { DEFAULT_CODES } from '../accounting/utils/get-account-mapping';
import { MAPPING_LABELS } from '../accounting/accounting-setup';

const d = (s: string) => parseEcuadorDate(s)!;

const adv = (over: Record<string, any> = {}) => ({
  status: 'open', isVoid: false, partyType: 'supplier', partyTaxId: '0991306498001',
  amountCents: 50000, appliedCents: 0, refundedCents: 0, date: d('2026-03-01'), ...over,
});

const purchase = (over: Record<string, any> = {}) => ({
  fullNumber: '001-001-000001234', status: 'received', isPaid: false, supplierRuc: '0991306498001',
  subtotal: 100, totalTax: 15, total: 115, date: d('2026-03-05'), ...over,
});

describe('registrar', () => {
  it('numera APR-AAAA-000001', () => {
    expect(supplierAdvanceNumber(2026, 3)).toBe('APR-2026-000003');
  });
  it('pide proveedor, identificación, valor y fecha', () => {
    expect(validateSupplierRegister({ partyName: '', partyTaxId: '1', amountCents: 1, date: '2026-01-01' }))
      .toEqual({ ok: false, error: 'Falta el proveedor.' });
    expect(validateSupplierRegister({ partyName: 'X', partyTaxId: '', amountCents: 1, date: '2026-01-01' }).ok).toBe(false);
    expect(validateSupplierRegister({ partyName: 'X', partyTaxId: '1', amountCents: 0, date: '2026-01-01' }).ok).toBe(false);
    expect(validateSupplierRegister({ partyName: 'X', partyTaxId: '1', amountCents: 1, date: '01/01/2026' }).ok).toBe(false);
    const ok = validateSupplierRegister({ partyName: ' Claro ', partyTaxId: '1791-251237001', amountCents: 1839, date: '2026-09-30' });
    expect(ok).toEqual({ ok: true, value: { partyName: 'Claro', partyTaxId: '1791251237001', amountCents: 1839, date: d('2026-09-30') } });
  });
  it('asiento: Debe Anticipos a Proveedores / Haber Banco, cuadrado', () => {
    const lines = buildSupplierRegisterLines(1839, { code: '1.1.01.002', name: 'Banco' }, ADVANCES_TO_SUPPLIERS, 'x');
    expect(lines[0]).toMatchObject({ accountCode: '1.1.04.003', debit: 18.39, credit: 0 });
    expect(lines[1]).toMatchObject({ accountCode: '1.1.01.002', debit: 0, credit: 18.39 });
    expect(sumSide(lines)).toEqual({ debit: 18.39, credit: 18.39 });
  });
  it('la cuenta es configurable en el mapeo (Puesta en marcha)', () => {
    expect(DEFAULT_CODES.advancesToSuppliers).toBe('1.1.04.003');
    expect(MAPPING_LABELS.advancesToSuppliers).toBe('Anticipos a proveedores');
  });
});

describe('cruzar con la compra', () => {
  const pend = (p: Record<string, any>) => purchasePendingCents(p, null);

  it('acepta un cruce válido', () => {
    const p = purchase();
    expect(supplierApplicationProblem(adv(), p, 11500, d('2026-03-10'), pend(p))).toBeNull();
  });
  it('el saldo de la compra resta la retención estimada y lo ya cruzado', () => {
    const p = purchase({ totalIrRetention: 1.75, total: 113.25, advancesApplied: { cents: 1000 } });
    expect(pend(p)).toBe(11500 - 175 - 1000);
  });
  it('rechaza anticipos de clientes, anulados y compras ajenas o no recibidas', () => {
    const p = purchase();
    const day = d('2026-03-10');
    expect(supplierApplicationProblem(adv({ partyType: 'customer' }), p, 100, day, pend(p))).toMatch(/proveedores/);
    expect(supplierApplicationProblem(adv({ isVoid: true }), p, 100, day, pend(p))).toMatch(/anulado/);
    expect(supplierApplicationProblem(adv(), purchase({ supplierRuc: '1790012345001' }), 100, day, pend(p))).toMatch(/otro proveedor/);
    expect(supplierApplicationProblem(adv(), purchase({ status: 'draft' }), 100, day, pend(p))).toMatch(/recibida/);
    expect(supplierApplicationProblem(adv(), purchase({ isPaid: true }), 100, day, pend(p))).toMatch(/pagada/);
    expect(supplierApplicationProblem(adv(), purchase({ status: 'cancelled' }), 100, day, pend(p))).toMatch(/anulada/);
  });
  it('rechaza fechas anteriores y valores de más', () => {
    const p = purchase();
    expect(supplierApplicationProblem(adv(), p, 100, d('2026-02-28'), pend(p))).toMatch(/anterior al anticipo/);
    expect(supplierApplicationProblem(adv(), p, 100, d('2026-03-04'), pend(p))).toMatch(/anterior a la compra/);
    expect(supplierApplicationProblem(adv({ amountCents: 5000 }), p, 6000, d('2026-03-10'), pend(p))).toMatch(/\$50\.00 disponibles/);
    expect(supplierApplicationProblem(adv(), p, 11600, d('2026-03-10'), pend(p))).toMatch(/\$115\.00 por pagar/);
    expect(supplierApplicationProblem(adv(), p, 100, d('2026-03-10'), pend(p), 49950)).toMatch(/\$0\.50 disponibles/);
  });
  it('asiento: Debe CxP / Haber Anticipos a Proveedores', () => {
    const lines = buildSupplierApplicationLines(11500, ADVANCES_TO_SUPPLIERS, { code: '2.1.01.001', name: 'CxP' }, 'x');
    expect(lines[0]).toMatchObject({ accountCode: '2.1.01.001', debit: 115, credit: 0 });
    expect(lines[1]).toMatchObject({ accountCode: '1.1.04.003', debit: 0, credit: 115 });
  });
});

describe('la compra', () => {
  it('queda pagada por anticipos cuando no le queda saldo', () => {
    const patch = purchasePatchFor(purchase(), 'app1', 11500, 0, d('2026-03-10'));
    expect(patch).toMatchObject({
      advancesApplied: { cents: 11500, count: 1, lastId: 'app1' }, isPaid: true, status: 'paid', paidBy: 'advances',
    });
  });
  it('un cruce parcial solo suma al acumulado', () => {
    const patch = purchasePatchFor(purchase(), 'app1', 5000, 6500, d('2026-03-10'));
    expect(patch).toEqual({ advancesApplied: { cents: 5000, count: 1, lastId: 'app1' } });
  });
  it('al deshacer vuelve a recibida', () => {
    const p = purchase({ isPaid: true, status: 'paid', paidBy: 'advances', advancesApplied: { cents: 11500, count: 1, lastId: 'a' } });
    expect(purchasePatchFor(p, 'a', -11500, 1, new Date())).toMatchObject({
      advancesApplied: { cents: 0, count: 0 }, isPaid: false, status: 'received', paidBy: null, paidAt: null,
    });
  });
  it('no se deshace si la compra se pagó por banco', () => {
    expect(unapplySupplierProblem({}, purchase({ isPaid: true, paidBy: 'manual' }))).toMatch(/banco/);
    expect(unapplySupplierProblem({}, purchase({ isPaid: true, paidBy: 'advances' }))).toBeNull();
    expect(unapplySupplierProblem({ isVoid: true }, purchase())).toMatch(/deshizo/);
    expect(unapplySupplierProblem({}, undefined)).toMatch(/no existe/);
  });
  it('el pago por banco del resto descuenta lo cruzado', () => {
    expect(paymentAmount('purchase', { total: 115, advancesApplied: { cents: 5000 } })).toBe(65);
  });
});
