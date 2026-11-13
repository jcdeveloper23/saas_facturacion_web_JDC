import { ADVANCES_FROM_CUSTOMERS, parseEcuadorDate, sumSide } from '../accounting/advances/advance-logic';
import { buildRefundLines, refundProblem } from '../accounting/advances/advance-refund-logic';
import { ADVANCES_TO_SUPPLIERS } from '../accounting/advances/supplier-advance-logic';

const d = (s: string) => parseEcuadorDate(s)!;
const bank = { code: '1.1.01.002', name: 'Banco' };

const adv = (over: Record<string, any> = {}) => ({
  version: 2, status: 'open', isVoid: false, partyType: 'customer',
  amountCents: 10000, appliedCents: 3000, refundedCents: 0, date: d('2026-03-01'), ...over,
});

describe('devolución de anticipos', () => {
  it('devuelve hasta lo disponible', () => {
    expect(refundProblem(adv(), 7000, d('2026-03-10'))).toBeNull();
    expect(refundProblem(adv(), 7001, d('2026-03-10'))).toMatch(/\$70\.00 disponibles/);
    expect(refundProblem(adv({ refundedCents: 7000 }), 1, d('2026-03-10'))).toMatch(/\$0\.00/);
  });
  it('no devuelve anulados, del sistema anterior, en cero ni antes del anticipo', () => {
    expect(refundProblem(adv({ isVoid: true }), 100, d('2026-03-10'))).toMatch(/anulado/);
    expect(refundProblem(adv({ version: 1 }), 100, d('2026-03-10'))).toMatch(/sistema anterior/);
    expect(refundProblem(adv(), 0, d('2026-03-10'))).toMatch(/mayor que cero/);
    expect(refundProblem(adv(), 100, d('2026-02-28'))).toMatch(/anterior al anticipo/);
  });
  it('de cliente: Debe Anticipo Clientes / Haber Banco', () => {
    const l = buildRefundLines('customer', 7000, bank, ADVANCES_FROM_CUSTOMERS, 'x');
    expect(l[0]).toMatchObject({ accountCode: '2.1.04.008', debit: 70, credit: 0 });
    expect(l[1]).toMatchObject({ accountCode: '1.1.01.002', debit: 0, credit: 70 });
    expect(sumSide(l)).toEqual({ debit: 70, credit: 70 });
  });
  it('de proveedor: Debe Banco / Haber Anticipos a Proveedores', () => {
    const l = buildRefundLines('supplier', 7000, bank, ADVANCES_TO_SUPPLIERS, 'x');
    expect(l[0]).toMatchObject({ accountCode: '1.1.01.002', debit: 70, credit: 0 });
    expect(l[1]).toMatchObject({ accountCode: '1.1.04.003', debit: 0, credit: 70 });
  });
  it('sin partyType cuenta como de cliente', () => {
    expect(buildRefundLines(undefined, 100, bank, ADVANCES_FROM_CUSTOMERS, 'x')[0].accountCode).toBe('2.1.04.008');
  });
});
