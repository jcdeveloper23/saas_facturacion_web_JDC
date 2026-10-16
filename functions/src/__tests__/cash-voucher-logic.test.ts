/**
 * cash-voucher-logic.test.ts — comprobantes de egreso y recibos de caja
 * (2026-10-16): validación de la entrada, la parte, los saldos, lo que cambia
 * en la compra o factura y el asiento.
 */
import {
  ACCOUNTS_PAYABLE, buildVoucherEntryLines, docParty, invoiceVoucherPendingCents, payableFromPurchaseEntry,
  purchaseGrossCents, purchasePendingCents, purchaseRetainedCents, resolveAccountLines, resolveParty, targetTypeFor,
  validateVoucherInput, voidTargetProblem, voidVoucherProblem, voucherCounterKey, voucherNumber,
  voucherTargetPatch, voucherTargetProblem,
} from '../accounting/cash-vouchers/cash-voucher-logic';
import {
  applicationProblem, cents, invoicePatchFor, invoicePendingCents, parseEcuadorDate, sumSide, unapplyProblem,
} from '../accounting/advances/advance-logic';
import { paymentAmount, paymentNeedsEntry } from '../accounting/utils/payment-entry';
import { cashVouchersAppliedCents, readAppliedAcc } from '../accounting/utils/applied-acc';

const d = (s: string) => parseEcuadorDate(s)!;

const base = (over: Record<string, any> = {}) => ({
  kind: 'egreso', date: '2026-10-16', partyName: 'Proveedor S.A.', bankAccountId: 'b1',
  paymentMethodCode: '20', concept: 'Pago de facturas',
  applications: [{ targetType: 'purchase', targetId: 'p1', amountCents: 11500 }],
  accountLines: [], ...over,
});

const purchase = (over: Record<string, any> = {}) => ({
  fullNumber: 'C-2026-000010', status: 'received', isPaid: false, supplierName: 'Proveedor S.A.',
  supplierRuc: '1790012345001', total: 115, supplierInvoiceDate: d('2026-10-01'), ...over,
});

const invoice = (over: Record<string, any> = {}) => ({
  fullNumber: '001-001-000000020', status: 'issued', sriStatus: 'authorized', isPaid: false,
  customerName: 'Cliente', customerTaxId: '0912345678', total: 230, date: d('2026-10-02'), ...over,
});

describe('números', () => {
  it('CE y RC con su propio secuencial por año', () => {
    expect(voucherNumber('egreso', 2026, 1)).toBe('CE-2026-000001');
    expect(voucherNumber('ingreso', 2026, 42)).toBe('RC-2026-000042');
    expect(voucherCounterKey('egreso', 2026)).toBe('CE_2026');
    expect(voucherCounterKey('ingreso', 2027)).toBe('RC_2027');
    expect(targetTypeFor('egreso')).toBe('purchase');
    expect(targetTypeFor('ingreso')).toBe('invoice');
  });
});

describe('validateVoucherInput', () => {
  it('acepta un egreso que paga una compra', () => {
    const r = validateVoucherInput(base());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.totalCents).toBe(11500);
      expect(r.value.chequeNumber).toBeNull();
      expect(r.value.partyTaxId).toBeNull();
      expect(r.value.date.toISOString()).toBe('2026-10-16T17:00:00.000Z');
    }
  });
  it('acepta un ingreso solo con líneas a cuentas (cuotas de socios)', () => {
    const r = validateVoucherInput(base({ kind: 'ingreso', applications: [],
      accountLines: [{ accountCode: '4.2.01.001', amountCents: 2000, description: 'Cuota octubre' }] }));
    expect(r.ok && r.value.totalCents).toBe(2000);
  });
  it('rechaza tipo, fecha, forma de pago y concepto inválidos', () => {
    expect(validateVoucherInput(base({ kind: 'otro' })).ok).toBe(false);
    expect(validateVoucherInput(base({ date: '16/10/2026' })).ok).toBe(false);
    expect(validateVoucherInput(base({ paymentMethodCode: '99' })).ok).toBe(false);
    expect(validateVoucherInput(base({ paymentMethodCode: undefined })).ok).toBe(false);
    expect(validateVoucherInput(base({ concept: '  ' })).ok).toBe(false);
    expect(validateVoucherInput(base({ bankAccountId: 'a/b' })).ok).toBe(false);
  });
  it('el egreso solo paga compras y el ingreso solo cobra facturas', () => {
    expect(validateVoucherInput(base({ applications: [{ targetType: 'invoice', targetId: 'f1', amountCents: 1 }] })))
      .toEqual({ ok: false, error: 'Un comprobante de egreso solo paga compras.' });
    expect(validateVoucherInput(base({ kind: 'ingreso' })))
      .toEqual({ ok: false, error: 'Un recibo de caja solo cobra facturas.' });
  });
  it('exige al menos un documento o una línea, montos enteros y sin repetir', () => {
    expect(validateVoucherInput(base({ applications: [] })).ok).toBe(false);
    expect(validateVoucherInput(base({ applications: [{ targetType: 'purchase', targetId: 'p1', amountCents: 10.5 }] })).ok).toBe(false);
    expect(validateVoucherInput(base({ applications: [{ targetType: 'purchase', targetId: 'p1', amountCents: 0 }] })).ok).toBe(false);
    expect(validateVoucherInput(base({ applications: [
      { targetType: 'purchase', targetId: 'p1', amountCents: 1 }, { targetType: 'purchase', targetId: 'p1', amountCents: 2 },
    ] })).ok).toBe(false);
    expect(validateVoucherInput(base({ accountLines: [{ accountCode: '', amountCents: 1 }] })).ok).toBe(false);
  });
  it('suma documentos y líneas en el total', () => {
    const r = validateVoucherInput(base({ accountLines: [{ accountCode: '5.2.02.001', amountCents: 350 }] }));
    expect(r.ok && r.value.totalCents).toBe(11850);
  });
});

describe('resolveParty', () => {
  const given = { partyName: '', partyTaxId: null };
  it('sin documentos: el nombre escrito, o el de la persona elegida', () => {
    expect(resolveParty('ingreso', { partyName: 'Socio', partyTaxId: null }, null, []))
      .toEqual({ ok: true, partyName: 'Socio', partyTaxId: null });
    expect(resolveParty('ingreso', { partyName: 'x', partyTaxId: null }, { name: 'Socio Real', taxId: '0912345678' }, []))
      .toEqual({ ok: true, partyName: 'Socio Real', partyTaxId: '0912345678' });
    expect(resolveParty('egreso', given, null, []).ok).toBe(false);
  });
  it('con documentos: se toma del documento', () => {
    const r = resolveParty('egreso', given, null, [docParty('purchase', purchase())]);
    expect(r).toEqual({ ok: true, partyName: 'Proveedor S.A.', partyTaxId: '1790012345001' });
  });
  it('documentos de distintas partes, o de otra que la indicada: no', () => {
    const a = docParty('purchase', purchase());
    const b = docParty('purchase', purchase({ supplierRuc: '1790099999001', fullNumber: 'C-2026-000011' }));
    expect(resolveParty('egreso', given, null, [a, b]).ok).toBe(false);
    expect(resolveParty('egreso', { partyName: 'X', partyTaxId: '0999999999' }, null, [a]).ok).toBe(false);
    expect(resolveParty('ingreso', given, { taxId: '0912345678' }, [docParty('invoice', invoice())]).ok).toBe(true);
  });
});

describe('saldos', () => {
  // Compra de 100 + IVA 15 = 115 bruto (lo que acredita la CxP). Proveedor con
  // 1 % de renta y 30 % de IVA: estimada 1,00 + 4,50; total NETO 109,50.
  const conRet = (over: Record<string, any> = {}) => purchase({ subtotal: 100, totalTax: 15,
    totalIrRetention: 1, totalVatRetention: 4.5, total: 109.5, ...over });
  it('sin retención estimada: el total (que es el bruto)', () => {
    const p = purchase({ subtotal: 100, totalTax: 15, totalIrRetention: 0, totalVatRetention: 0, total: 115 });
    expect(purchaseGrossCents(p)).toBe(11500);
    expect(purchasePendingCents(p, null)).toBe(11500);
  });
  it('con estimada y sin retención emitida: bruto − estimada = total, sin descontarla dos veces', () => {
    expect(purchaseRetainedCents(conRet(), null)).toBe(550);
    expect(purchasePendingCents(conRet(), null)).toBe(10950);
    expect(purchasePendingCents(conRet(), undefined)).toBe(cents(109.5));
  });
  it('con retención emitida distinta de la estimada: manda la emitida', () => {
    expect(purchasePendingCents(conRet(), { status: 'issued', totalRetained: 3.15 })).toBe(11500 - 315);
    expect(purchasePendingCents(conRet(), { status: 'draft', totalRetained: 3.15 })).toBe(11500 - 315);
  });
  it('con la emitida anulada: vuelve a la estimada', () => {
    expect(purchasePendingCents(conRet(), { status: 'void', totalRetained: 3.15 })).toBe(10950);
    expect(purchasePendingCents(conRet(), { status: 'issued', isVoid: true, totalRetained: 3.15 })).toBe(10950);
  });
  it('resta anticipos y comprobantes', () => {
    expect(purchasePendingCents(conRet({ cashVouchersApplied: { cents: 5000, count: 1, lastId: 'v1' },
      advancesApplied: { cents: 1000, count: 1, lastId: 'a' } }), null)).toBe(10950 - 6000);
  });
  it('sin subtotal: reconstruye el bruto desde total + estimada', () => {
    expect(purchaseGrossCents({ total: 109.5, totalIrRetention: 1, totalVatRetention: 4.5 })).toBe(11500);
    expect(purchasePendingCents(purchase(), null)).toBe(11500);
  });
  it('factura: el mismo cálculo que los anticipos, menos los recibos de caja', () => {
    const f = invoice({ receivedRetentions: { ivaCents: 300, rentaCents: 200 },
      advancesApplied: { cents: 1000, count: 1, lastId: 'a' }, cashVouchersApplied: { cents: 4000, count: 1, lastId: 'v' } });
    expect(invoiceVoucherPendingCents(f)).toBe(23000 - 500 - 1000 - 4000);
    expect(invoicePendingCents(f)).toBe(invoiceVoucherPendingCents(f));
  });
});

describe('voucherTargetProblem', () => {
  const day = d('2026-10-16');
  it('compra recibida y con saldo: bien; pago parcial permitido', () => {
    expect(voucherTargetProblem('purchase', purchase(), 5000, day, 11500)).toBeNull();
    expect(voucherTargetProblem('purchase', purchase(), 11500, day, 11500)).toBeNull();
  });
  it('compra anulada, pagada, sin recibir, de antes o por más del saldo: no', () => {
    expect(voucherTargetProblem('purchase', purchase({ status: 'cancelled' }), 1, day, 11500)).toMatch(/anulada/);
    expect(voucherTargetProblem('purchase', purchase({ status: 'paid', isPaid: true }), 1, day, 11500)).toMatch(/pagada/);
    expect(voucherTargetProblem('purchase', purchase({ status: 'sent' }), 1, day, 11500)).toMatch(/recibida/);
    expect(voucherTargetProblem('purchase', purchase(), 1, d('2026-09-30'), 11500)).toMatch(/anterior/);
    expect(voucherTargetProblem('purchase', purchase(), 11501, day, 11500)).toBe('A la compra C-2026-000010 solo le faltan $115.00 por pagar.');
    expect(voucherTargetProblem('purchase', undefined, 1, day, 0)).toMatch(/no existe/);
  });
  it('factura autorizada o sin SRI, emitida y sin cobrar: bien', () => {
    expect(voucherTargetProblem('invoice', invoice(), 100, day, 23000)).toBeNull();
    expect(voucherTargetProblem('invoice', invoice({ sriStatus: 'not_required' }), 100, day, 23000)).toBeNull();
  });
  it('NC, anulada, sin autorizar, cobrada o por más del saldo: no', () => {
    expect(voucherTargetProblem('invoice', invoice({ isCreditNote: true }), 1, day, 23000)).toMatch(/nota de crédito/);
    expect(voucherTargetProblem('invoice', invoice({ status: 'void', isVoid: true }), 1, day, 23000)).toMatch(/anulada/);
    expect(voucherTargetProblem('invoice', invoice({ sriStatus: 'rejected' }), 1, day, 23000)).toMatch(/autorizada/);
    expect(voucherTargetProblem('invoice', invoice({ status: 'paid', isPaid: true }), 1, day, 23000)).toMatch(/cobrada/);
    expect(voucherTargetProblem('invoice', invoice(), 23001, day, 23000)).toMatch(/solo le faltan \$230.00 por cobrar/);
  });
});

describe('voucherTargetPatch', () => {
  const pay = { date: d('2026-10-16'), bankAccountId: 'b1', entryId: 'je1' };
  it('pago parcial: solo el acumulado', () => {
    const patch = voucherTargetPatch('purchase', purchase(), 'v1', 5000, 6500, pay);
    expect(patch).toEqual({ cashVouchersApplied: { cents: 5000, count: 1, lastId: 'v1' } });
  });
  it('saldo en cero: pagada por el comprobante, con su asiento como paymentEntryId', () => {
    const patch = voucherTargetPatch('invoice', invoice(), 'v1', 23000, 0, pay);
    expect(patch).toMatchObject({
      isPaid: true, status: 'paid', paidBy: 'cashVoucher', paymentVoucherId: 'v1',
      paymentBankAccountId: 'b1', paymentEntryId: 'je1', paidAt: pay.date,
    });
  });
  it('la saldada por comprobante no genera un segundo asiento de cobro o pago', () => {
    const f = { ...invoice(), ...voucherTargetPatch('invoice', invoice(), 'v1', 23000, 0, pay) };
    expect(paymentNeedsEntry(f)).toBe(false);
    const c = { ...purchase(), ...voucherTargetPatch('purchase', purchase(), 'v1', 11500, 0, pay) };
    expect(paymentNeedsEntry(c)).toBe(false);
    // Aunque se perdiera paymentEntryId, el importe pendiente de cobro sería cero.
    expect(paymentAmount('invoice', { ...f, paymentEntryId: undefined })).toBe(0);
    expect(paymentAmount('purchase', { ...c, paymentEntryId: undefined })).toBe(0);
  });
  it('anular: devuelve el acumulado y la deja sin pagar, borrando lo del comprobante', () => {
    const paid = { ...purchase(), ...voucherTargetPatch('purchase', purchase(), 'v1', 11500, 0, pay) };
    const patch = voucherTargetPatch('purchase', paid, 'v1', -11500, 11500, null);
    expect(patch).toEqual({
      cashVouchersApplied: { cents: 0, count: 0, lastId: 'v1' },
      isPaid: false, status: 'received', paidAt: null, paidBy: null,
      paymentVoucherId: null, paymentBankAccountId: null, paymentEntryId: null,
    });
  });
  it('anular uno parcial de una factura saldada con anticipos: vuelve a emitida', () => {
    const f = invoice({ isPaid: true, status: 'paid', paidBy: 'advances',
      cashVouchersApplied: { cents: 3000, count: 1, lastId: 'v1' }, advancesApplied: { cents: 20000, count: 1, lastId: 'a' } });
    const patch = voucherTargetPatch('invoice', f, 'v1', -3000, 3000, null);
    expect(patch).toEqual({
      cashVouchersApplied: { cents: 0, count: 0, lastId: 'v1' },
      isPaid: false, status: 'issued', paidAt: null, paidBy: null,
    });
  });
  it('anular uno parcial de una no pagada: solo el acumulado', () => {
    const f = invoice({ cashVouchersApplied: { cents: 3000, count: 1, lastId: 'v1' } });
    expect(voucherTargetPatch('invoice', f, 'v1', -3000, 23000, null))
      .toEqual({ cashVouchersApplied: { cents: 0, count: 0, lastId: 'v1' } });
  });
});

describe('anular', () => {
  it('no dos veces', () => {
    expect(voidVoucherProblem({ status: 'posted', isVoid: false })).toBeNull();
    expect(voidVoucherProblem({ status: 'void', isVoid: true })).toMatch(/ya está anulado/);
  });
  it('no si el documento se pagó por banco; sí si lo saldaron comprobantes o anticipos', () => {
    expect(voidTargetProblem('purchase', purchase({ isPaid: true, status: 'paid' }))).toMatch(/por banco/);
    expect(voidTargetProblem('invoice', invoice({ isPaid: true, status: 'paid' }))).toMatch(/por banco/);
    expect(voidTargetProblem('invoice', invoice({ isPaid: true, paidBy: 'cashVoucher' }))).toBeNull();
    expect(voidTargetProblem('invoice', invoice({ isPaid: true, paidBy: 'advances' }))).toBeNull();
    expect(voidTargetProblem('purchase', purchase())).toBeNull();
    expect(voidTargetProblem('purchase', undefined)).toBeNull();
  });
});

describe('cuentas de las líneas', () => {
  const chart = new Map([
    ['5.2.02.001', { name: 'Útiles de oficina', allowsMovement: true }],
    ['5.2', { name: 'GASTOS', allowsMovement: false }],
    ['5.2.02.009', { name: 'Vieja', allowsMovement: true, isActive: false }],
    ['1.1.01.003', { name: 'Bancos', allowsMovement: true }],
  ]);
  const line = (accountCode: string) => ({ accountCode, amountCents: 100, description: null });
  it('de movimiento, activa y existente: con su nombre', () => {
    const r = resolveAccountLines([line('5.2.02.001')], chart, '1.1.01.003');
    expect(r.ok && r.names.get('5.2.02.001')).toBe('Útiles de oficina');
  });
  it('agrupadora, inactiva, inexistente o la misma del banco: no', () => {
    expect(resolveAccountLines([line('5.2')], chart, '1.1.01.003').ok).toBe(false);
    expect(resolveAccountLines([line('5.2.02.009')], chart, '1.1.01.003').ok).toBe(false);
    expect(resolveAccountLines([line('9.9')], chart, '1.1.01.003').ok).toBe(false);
    expect(resolveAccountLines([line('1.1.01.003')], chart, '1.1.01.003'))
      .toEqual({ ok: false, error: 'La cuenta 1.1.01.003 es la misma del banco o la caja.' });
  });
});

describe('asiento', () => {
  const bank = { code: '1.1.01.003', name: 'Bancos' };
  it('la CxP sale del asiento de la compra; si no, la fija', () => {
    expect(payableFromPurchaseEntry([
      { accountCode: '5.1.02.001', debit: 100, credit: 0 },
      { accountCode: '2.1.01.002', accountName: 'Proveedores locales', debit: 0, credit: 115 },
    ])).toEqual({ code: '2.1.01.002', name: 'Proveedores locales' });
    expect(payableFromPurchaseEntry([{ accountCode: '5.1', debit: 1, credit: 0 }])).toBeNull();
    expect(ACCOUNTS_PAYABLE.code).toBe('2.1.01.001');
  });
  it('egreso: Debe CxP y gastos / Haber banco, cuadrado al centavo', () => {
    const lines = buildVoucherEntryLines('egreso', bank,
      [{ account: ACCOUNTS_PAYABLE, amountCents: 10001, description: 'Pago compra C-1' },
        { account: ACCOUNTS_PAYABLE, amountCents: 20002, description: 'Pago compra C-2' }],
      [{ account: { code: '5.2.02.001', name: 'Útiles' }, amountCents: 333, description: 'Útiles' }], 'CE-2026-000001');
    expect(lines.map((l) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['2.1.01.001', 100.01, 0], ['2.1.01.001', 200.02, 0], ['5.2.02.001', 3.33, 0], ['1.1.01.003', 0, 303.36],
    ]);
    expect(sumSide(lines)).toEqual({ debit: 303.36, credit: 303.36 });
  });
  it('ingreso: Debe banco / Haber CxC e ingresos', () => {
    const lines = buildVoucherEntryLines('ingreso', bank,
      [{ account: { code: '1.1.02.001', name: 'CxC' }, amountCents: 23000, description: 'Cobro' }],
      [{ account: { code: '4.2.01.001', name: 'Cuotas' }, amountCents: 1, description: 'Cuota' }], 'RC-2026-000001');
    expect(lines.map((l) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['1.1.01.003', 230.01, 0], ['1.1.02.001', 0, 230], ['4.2.01.001', 0, 0.01],
    ]);
    expect(sumSide(lines)).toEqual({ debit: 230.01, credit: 230.01 });
  });
  it('muchas líneas de centavos sueltos siguen cuadrando', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ account: { code: `5.${i}`, name: 'g' }, amountCents: 1 + i * 7, description: 'x' }));
    expect((() => { const s = sumSide(buildVoucherEntryLines('egreso', bank, [], many, 'x')); return s.debit === s.credit; })()).toBe(true);
  });
});

describe('convivencia con anticipos y con el cobro a mano', () => {
  const pay = { date: d('2026-10-16'), bankAccountId: 'b1', entryId: 'je1' };
  const adv = { status: 'open', isVoid: false, partyType: 'customer', partyTaxId: '0912345678',
    amountCents: 50000, appliedCents: 0, refundedCents: 0, date: d('2026-10-01') };
  it('un anticipo no puede aplicar más de lo que dejó el recibo de caja', () => {
    const f = invoice({ cashVouchersApplied: { cents: 20000, count: 1, lastId: 'v1' } });
    expect(applicationProblem(adv, f, 3001, d('2026-10-16'))).toMatch(/solo le faltan \$30.00/);
    expect(applicationProblem(adv, f, 3000, d('2026-10-16'))).toBeNull();
    // Y si el anticipo la salda, queda cobrada por anticipos.
    expect(invoicePatchFor(f, 'ap1', 3000, d('2026-10-16'))).toMatchObject({ isPaid: true, paidBy: 'advances' });
  });
  it('desaplicar un anticipo de una saldada por recibo de caja: vuelve a emitida', () => {
    const f = { ...invoice({ advancesApplied: { cents: 3000, count: 1, lastId: 'ap1' },
      cashVouchersApplied: { cents: 0, count: 0, lastId: '' } }) };
    const paid = { ...f, ...voucherTargetPatch('invoice', f, 'v1', 20000, 0, pay) };
    expect(unapplyProblem({ status: 'applied' }, paid)).toBeNull();
    expect(invoicePatchFor(paid, 'ap1', -3000, d('2026-10-17'))).toMatchObject({
      isPaid: false, status: 'issued', paidBy: null, paymentVoucherId: null, paymentEntryId: null,
    });
  });
  it('el cobro a mano descuenta lo ya cobrado con recibos de caja', () => {
    expect(paymentAmount('invoice', invoice({ cashVouchersApplied: { cents: 5000, count: 1, lastId: 'v' } }))).toBe(180);
    expect(paymentAmount('purchase', purchase({ cashVouchersApplied: { cents: 1500, count: 1, lastId: 'v' } }))).toBe(100);
    expect(paymentAmount('purchase', purchase())).toBe(115);
  });
  it('lee los acumulados con ceros si faltan', () => {
    expect(readAppliedAcc({}, 'cashVouchersApplied')).toEqual({ cents: 0, count: 0, lastId: '' });
    expect(cashVouchersAppliedCents({ cashVouchersApplied: { cents: -5 } })).toBe(0);
  });
});
