/**
 * cash-voucher-callables.test.ts — registerCashVoucher y voidCashVoucher
 * (2026-10-16) contra un Firestore en memoria: lo que queda escrito en la
 * transacción (comprobante, acumulados, asiento, contadores) y que el cobro o
 * pago saldado por el comprobante no genera un segundo asiento.
 */

// ─── Firestore en memoria (lo justo para estas callables) ─────────────────────
const store = new Map<string, Record<string, any>>();
const mockDelete = Symbol('delete');
let autoId = 0;

class MockTimestamp {
  constructor(private d: Date) {}
  toDate() { return this.d; }
  static fromDate(d: Date) { return new MockTimestamp(d); }
  static now() { return new MockTimestamp(new Date('2026-10-16T20:00:00Z')); }
}

function snap(path: string) {
  const data = store.get(path);
  return {
    id: path.split('/').pop()!,
    exists: data !== undefined,
    data: () => (data ? { ...data } : undefined),
    get: (f: string) => data?.[f],
  };
}

function docRef(path: string): any {
  return { path, id: path.split('/').pop()!, get: async () => snap(path) };
}

function query(col: string, filters: Array<[string, string, any]>, lim?: number): any {
  const run = () => {
    const docs = [...store.keys()]
      .filter((p) => p.startsWith(`${col}/`) && p.split('/').length === col.split('/').length + 1)
      .map((p) => snap(p))
      .filter((s) => filters.every(([f, op, v]) => (op === 'in' ? v.includes(s.get(f)) : s.get(f) === v)));
    const out = lim ? docs.slice(0, lim) : docs;
    return { empty: out.length === 0, docs: out };
  };
  return {
    isQuery: true,
    where: (f: string, op: string, v: any) => query(col, [...filters, [f, op, v]], lim),
    limit: (n: number) => query(col, filters, n),
    get: async () => run(),
    run,
  };
}

function collectionRef(col: string): any {
  return { ...query(col, []), doc: (id?: string) => docRef(`${col}/${id ?? `auto${++autoId}`}`) };
}

function applyWrite(path: string, data: Record<string, any>, merge: boolean) {
  const base = merge ? { ...(store.get(path) ?? {}) } : {};
  for (const [k, v] of Object.entries(data)) {
    if (v === mockDelete) delete base[k]; else base[k] = v;
  }
  store.set(path, base);
}

const mockDb = {
  doc: (p: string) => docRef(p),
  collection: (p: string) => collectionRef(p),
  runTransaction: async (fn: (tx: any) => Promise<any>) => {
    const writes: Array<() => void> = [];
    const tx = {
      get: async (r: any) => {
        if (writes.length) throw new Error('Firestore: lecturas después de escrituras en la transacción');
        return r.isQuery ? r.run() : snap(r.path);
      },
      set: (r: any, data: any, opts?: { merge?: boolean }) => { writes.push(() => applyWrite(r.path, data, !!opts?.merge)); },
      update: (r: any, data: any) => {
        if (!store.has(r.path)) throw new Error(`update de un documento que no existe: ${r.path}`);
        writes.push(() => applyWrite(r.path, data, true));
      },
    };
    const result = await fn(tx);
    writes.forEach((w) => w());
    return result;
  },
};

jest.mock('firebase-admin', () => ({
  firestore: Object.assign(() => mockDb, {
    FieldValue: { delete: () => mockDelete },
    Timestamp: MockTimestamp,
  }),
}));

import { registerCashVoucher, voidCashVoucher } from '../accounting/cash-vouchers/cash-voucher-callables';
import { paymentNeedsEntry, generatePaymentEntryInternal } from '../accounting/utils/payment-entry';

const C = 'companies/c1';
const asAccountant = { auth: { uid: 'u1', token: { role: 'accountant', companyId: 'c1' } } };
const call = (fn: any, data: any, req: any = asAccountant) => fn.run({ ...req, data });
const ts = (s: string) => MockTimestamp.fromDate(new Date(s));

function seed() {
  store.clear();
  autoId = 0;
  store.set(`${C}/accounting_periods/y2026`, { year: 2026, status: 'open' });
  store.set(`${C}/bank_accounts/b1`, { bankName: 'Pichincha', accountNumber: '2200123456', linkedGlCode: '1.1.01.003', linkedGlName: 'Bancos', isActive: true });
  store.set(`${C}/chart_of_accounts/a1`, { code: '5.2.02.001', name: 'Útiles de oficina', allowsMovement: true });
  store.set(`${C}/chart_of_accounts/a2`, { code: '4.2.01.001', name: 'Cuotas de socios', allowsMovement: true });
  store.set(`${C}/journal_entries/jeP`, { status: 'posted', lines: [
    { accountCode: '5.1.02.001', debit: 100, credit: 0 },
    { accountCode: '1.1.05.001', debit: 15, credit: 0 },
    { accountCode: '2.1.01.001', accountName: 'Cuentas por Pagar Proveedores', debit: 0, credit: 115 },
  ] });
  store.set(`${C}/purchases/p1`, { fullNumber: 'C-2026-000001', status: 'received', isPaid: false,
    // total NETO de la retención estimada (1 % renta + 30 % IVA = 5,50); la emitida, 2,30.
    subtotal: 100, totalTax: 15, totalIrRetention: 1, totalVatRetention: 4.5, total: 109.5,
    supplierName: 'Proveedor S.A.', supplierRuc: '1790012345001', supplierInvoiceDate: ts('2026-10-01T17:00:00Z'),
    accountingEntryId: 'jeP', retentionId: 'r1' });
  store.set(`${C}/retentions/r1`, { status: 'issued', totalRetained: 2.3 });
  store.set(`${C}/journal_entries/jeV`, { status: 'posted', lines: [
    { accountCode: '1.1.02.005', accountName: 'CxC relacionadas', debit: 230, credit: 0 },
    { accountCode: '4.1.01.001', debit: 0, credit: 200 },
    { accountCode: '2.1.04.001', debit: 0, credit: 30 },
  ] });
  store.set(`${C}/invoices/f1`, { fullNumber: '001-001-000000020', status: 'issued', sriStatus: 'authorized', isPaid: false,
    total: 230, customerName: 'Cliente', customerTaxId: '0912345678', date: ts('2026-10-02T17:00:00Z'),
    accountingEntryId: 'jeV' });
}

const egreso = (over: Record<string, any> = {}) => ({
  companyId: 'c1', kind: 'egreso', date: '2026-10-16', partyName: '', bankAccountId: 'b1',
  paymentMethodCode: '20', chequeNumber: '000123', concept: 'Pago a proveedor',
  applications: [{ targetType: 'purchase', targetId: 'p1', amountCents: 11270 }],
  accountLines: [{ accountCode: '5.2.02.001', amountCents: 500, description: 'Útiles' }], ...over,
});

beforeEach(seed);

describe('registerCashVoucher', () => {
  it('egreso que salda la compra (descontando la retención) y paga útiles', async () => {
    const r = await call(registerCashVoucher, egreso());
    expect(r.number).toBe('CE-2026-000001');
    const v = store.get(`${C}/cashVouchers/${r.voucherId}`)!;
    expect(v).toMatchObject({
      version: 1, kind: 'egreso', number: 'CE-2026-000001', fiscalYear: '2026',
      partyName: 'Proveedor S.A.', partyTaxId: '1790012345001', partyId: null,
      bankAccountId: 'b1', bankAccountName: 'Pichincha ****3456', glCode: '1.1.01.003',
      paymentMethodCode: '20', chequeNumber: '000123', reference: null, notes: null,
      targetIds: ['p1'],
      applications: [{ targetType: 'purchase', targetId: 'p1', targetNumber: 'C-2026-000001', amountCents: 11270 }],
      accountLines: [{ accountCode: '5.2.02.001', accountName: 'Útiles de oficina', amountCents: 500, description: 'Útiles' }],
      totalCents: 11770, status: 'posted', isVoid: false, accountingEntryId: r.accountingEntryId, reversalEntryId: null,
      createdBy: 'u1',
    });
    const je = store.get(`${C}/journal_entries/${r.accountingEntryId}`)!;
    expect(je).toMatchObject({ type: 'cash_voucher', status: 'posted', number: 1, periodId: 'y2026', isBalanced: true,
      totalDebit: 117.7, totalCredit: 117.7, reference: 'CE-2026-000001', referenceId: r.voucherId });
    expect(je.lines.map((l: any) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['2.1.01.001', 112.7, 0], ['5.2.02.001', 5, 0], ['1.1.01.003', 0, 117.7],
    ]);
    const p = store.get(`${C}/purchases/p1`)!;
    expect(p).toMatchObject({ isPaid: true, status: 'paid', paidBy: 'cashVoucher', paymentVoucherId: r.voucherId,
      paymentBankAccountId: 'b1', paymentEntryId: r.accountingEntryId,
      cashVouchersApplied: { cents: 11270, count: 1, lastId: r.voucherId } });
    expect(store.get(`${C}/counters/cashVouchers`)).toEqual({ CE_2026: 1 });
    expect(store.get(`${C}/counters/journal_entries`)).toEqual({ journal_2026: 1 });

    // El trigger del pago (y «Contabilizar lo pendiente») no crea otro asiento.
    expect(paymentNeedsEntry(p)).toBe(false);
    const again = await generatePaymentEntryInternal('c1', 'purchase', 'p1');
    expect(again).toMatchObject({ created: false, reason: 'already_exists', entryId: r.accountingEntryId });
    expect([...store.keys()].filter((k) => k.startsWith(`${C}/journal_entries/`))).toHaveLength(3);
  });

  it('pago parcial: la compra sigue recibida y el siguiente no puede pasar del saldo', async () => {
    await call(registerCashVoucher, egreso({ applications: [{ targetType: 'purchase', targetId: 'p1', amountCents: 5000 }], accountLines: [] }));
    expect(store.get(`${C}/purchases/p1`)).toMatchObject({ isPaid: false, status: 'received',
      cashVouchersApplied: { cents: 5000, count: 1 } });
    await expect(call(registerCashVoucher, egreso({ applications: [{ targetType: 'purchase', targetId: 'p1', amountCents: 6271 }], accountLines: [] })))
      .rejects.toThrow('solo le faltan $62.70');
    const r2 = await call(registerCashVoucher, egreso({ applications: [{ targetType: 'purchase', targetId: 'p1', amountCents: 6270 }], accountLines: [] }));
    expect(r2.number).toBe('CE-2026-000002');
    expect(store.get(`${C}/purchases/p1`)).toMatchObject({ isPaid: true, paidBy: 'cashVoucher', paymentEntryId: r2.accountingEntryId,
      cashVouchersApplied: { cents: 11270, count: 2, lastId: r2.voucherId } });
  });

  it('con la retención emitida anulada, el pendiente vuelve a bruto − estimada (= total)', async () => {
    store.set(`${C}/retentions/r1`, { status: 'void', totalRetained: 2.3 });
    await expect(call(registerCashVoucher, egreso({ applications: [{ targetType: 'purchase', targetId: 'p1', amountCents: 10951 }], accountLines: [] })))
      .rejects.toThrow('solo le faltan $109.50');
    const r = await call(registerCashVoucher, egreso({ applications: [{ targetType: 'purchase', targetId: 'p1', amountCents: 10950 }], accountLines: [] }));
    expect(store.get(`${C}/purchases/p1`)).toMatchObject({ isPaid: true, paidBy: 'cashVoucher' });
    expect(store.get(`${C}/cashVouchers/${r.voucherId}`)!.targetIds).toEqual(['p1']);
  });

  it('recibo de caja: Haber la CxC del asiento de la venta; numeración propia', async () => {
    const r = await call(registerCashVoucher, { companyId: 'c1', kind: 'ingreso', date: '2026-10-16', partyName: '',
      bankAccountId: 'b1', paymentMethodCode: '01', concept: 'Cobro',
      applications: [{ targetType: 'invoice', targetId: 'f1', amountCents: 23000 }],
      accountLines: [{ accountCode: '4.2.01.001', amountCents: 2000 }] });
    expect(r.number).toBe('RC-2026-000001');
    const je = store.get(`${C}/journal_entries/${r.accountingEntryId}`)!;
    expect(je.lines.map((l: any) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['1.1.01.003', 250, 0], ['1.1.02.005', 0, 230], ['4.2.01.001', 0, 20],
    ]);
    const f = store.get(`${C}/invoices/f1`)!;
    expect(f).toMatchObject({ isPaid: true, status: 'paid', paidBy: 'cashVoucher', paymentEntryId: r.accountingEntryId });
    expect(store.get(`${C}/cashVouchers/${r.voucherId}`)).toMatchObject({ partyName: 'Cliente', partyTaxId: '0912345678' });
    expect(await generatePaymentEntryInternal('c1', 'invoice', 'f1')).toMatchObject({ created: false, reason: 'already_exists' });
  });

  it('rechaza rol, ejercicio cerrado, cuenta agrupadora, otro proveedor y la misma cuenta del banco', async () => {
    await expect(call(registerCashVoucher, egreso(), { auth: { uid: 'u2', token: { role: 'seller', companyId: 'c1' } } }))
      .rejects.toThrow('Su rol no tiene permiso');
    store.set(`${C}/accounting_periods/y2026`, { year: 2026, status: 'closed' });
    await expect(call(registerCashVoucher, egreso())).rejects.toThrow('No hay un ejercicio contable abierto para 2026');
    seed();
    store.set(`${C}/chart_of_accounts/a3`, { code: '5.2', name: 'GASTOS', allowsMovement: false });
    await expect(call(registerCashVoucher, egreso({ accountLines: [{ accountCode: '5.2', amountCents: 1 }] }))).rejects.toThrow('agrupadora');
    await expect(call(registerCashVoucher, egreso({ partyTaxId: '0999999999' }))).rejects.toThrow('otro proveedor');
    store.set(`${C}/chart_of_accounts/a4`, { code: '1.1.01.003', name: 'Bancos', allowsMovement: true });
    await expect(call(registerCashVoucher, egreso({ accountLines: [{ accountCode: '1.1.01.003', amountCents: 1 }] }))).rejects.toThrow('misma del banco');
    // Nada quedó escrito.
    expect([...store.keys()].some((k) => k.includes('/cashVouchers/'))).toBe(false);
    expect(store.get(`${C}/purchases/p1`)!.cashVouchersApplied).toBeUndefined();
  });
});

describe('voidCashVoucher', () => {
  it('anula: reversa del asiento y la compra vuelve a no pagada', async () => {
    const r = await call(registerCashVoucher, egreso());
    const out = await call(voidCashVoucher, { companyId: 'c1', voucherId: r.voucherId, reason: 'Cheque mal girado' });
    expect(out.ok).toBe(true);
    const orig = store.get(`${C}/journal_entries/${r.accountingEntryId}`)!;
    expect(orig).toMatchObject({ status: 'cancelled', reversalEntryId: out.reversalEntryId });
    const rev = store.get(`${C}/journal_entries/${out.reversalEntryId}`)!;
    expect(rev).toMatchObject({ type: 'cash_voucher', status: 'posted', reversalOf: r.accountingEntryId, number: 2, isBalanced: true });
    expect(rev.lines.map((l: any) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['2.1.01.001', 0, 112.7], ['5.2.02.001', 0, 5], ['1.1.01.003', 117.7, 0],
    ]);
    const p = store.get(`${C}/purchases/p1`)!;
    expect(p).toMatchObject({ isPaid: false, status: 'received', cashVouchersApplied: { cents: 0, count: 0 } });
    for (const k of ['paidBy', 'paidAt', 'paymentVoucherId', 'paymentEntryId', 'paymentBankAccountId']) expect(p[k]).toBeUndefined();
    expect(store.get(`${C}/cashVouchers/${r.voucherId}`)).toMatchObject({ status: 'void', isVoid: true,
      voidReason: 'Cheque mal girado', voidedBy: 'u1', reversalEntryId: out.reversalEntryId });
    await expect(call(voidCashVoucher, { companyId: 'c1', voucherId: r.voucherId, reason: 'otra vez' })).rejects.toThrow('ya está anulado');
  });

  it('no con el asiento conciliado, en ejercicio cerrado ni sin motivo', async () => {
    const r = await call(registerCashVoucher, egreso());
    await expect(call(voidCashVoucher, { companyId: 'c1', voucherId: r.voucherId, reason: '' })).rejects.toThrow('motivo');
    store.set(`${C}/bank_reconciled_entries/${r.accountingEntryId}`, { statementId: 's1' });
    await expect(call(voidCashVoucher, { companyId: 'c1', voucherId: r.voucherId, reason: 'x' })).rejects.toThrow('conciliado');
    store.delete(`${C}/bank_reconciled_entries/${r.accountingEntryId}`);
    store.set(`${C}/accounting_periods/y2026`, { year: 2026, status: 'closed' });
    await expect(call(voidCashVoucher, { companyId: 'c1', voucherId: r.voucherId, reason: 'x' })).rejects.toThrow('cerrado');
    expect(store.get(`${C}/purchases/p1`)).toMatchObject({ isPaid: true, paidBy: 'cashVoucher' });
  });

  it('anular uno parcial deja el otro y la compra sin pagar', async () => {
    const a = await call(registerCashVoucher, egreso({ applications: [{ targetType: 'purchase', targetId: 'p1', amountCents: 5000 }], accountLines: [] }));
    const b = await call(registerCashVoucher, egreso({ applications: [{ targetType: 'purchase', targetId: 'p1', amountCents: 6270 }], accountLines: [] }));
    await call(voidCashVoucher, { companyId: 'c1', voucherId: a.voucherId, reason: 'x' });
    const p = store.get(`${C}/purchases/p1`)!;
    expect(p).toMatchObject({ isPaid: false, status: 'received', cashVouchersApplied: { cents: 6270, count: 1, lastId: a.voucherId } });
    expect(store.get(`${C}/journal_entries/${b.accountingEntryId}`)!.status).toBe('posted');
  });
});
