import {
  advanceAvailableCents, advanceNumber, applicationProblem, buildApplicationLines, buildRegisterLines,
  ecuadorDay, ecuadorYearOf, invertLines, invoicePatchFor, invoicePendingCents, normalizeTaxId,
  parseEcuadorDate, positiveCents, sumSide, unapplyProblem, validateRegister, voidProblem,
} from '../accounting/advances/advance-logic';
import { paymentAmount } from '../accounting/utils/payment-entry';
import { DEFAULT_CODES } from '../accounting/utils/get-account-mapping';
import { MAPPING_LABELS } from '../accounting/accounting-setup';

const d = (s: string) => parseEcuadorDate(s)!;

const adv = (over: Record<string, any> = {}) => ({
  status: 'open', isVoid: false, partyType: 'customer', partyTaxId: '1790012345001',
  amountCents: 50000, appliedCents: 0, refundedCents: 0, date: d('2026-03-01'), ...over,
});

const inv = (over: Record<string, any> = {}) => ({
  fullNumber: '001-001-000000010', status: 'issued', sriStatus: 'authorized', isPaid: false,
  customerTaxId: '1790012345001', total: 1150, date: d('2026-03-05'), ...over,
});

describe('fechas y números', () => {
  it('lee AAAA-MM-DD a mediodía de Ecuador y rechaza fechas imposibles', () => {
    expect(d('2026-12-31').toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(ecuadorYearOf(d('2026-12-31'))).toBe(2026);
    expect(parseEcuadorDate('2026-02-30')).toBeNull();
    expect(parseEcuadorDate('31/12/2026')).toBeNull();
    expect(parseEcuadorDate(undefined)).toBeNull();
  });
  it('el día en Ecuador: las 02:00 UTC del 1 de enero aún son el 31', () => {
    expect(ecuadorDay(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31');
  });
  it('numera ANT-AAAA-000001', () => {
    expect(advanceNumber(2026, 7)).toBe('ANT-2026-000007');
  });
  it('solo acepta centavos enteros positivos', () => {
    expect(positiveCents(100)).toBe(100);
    expect(positiveCents('250')).toBe(250);
    expect(positiveCents(10.5)).toBeNull();
    expect(positiveCents(0)).toBeNull();
    expect(positiveCents(-5)).toBeNull();
  });
  it('normaliza la identificación', () => {
    expect(normalizeTaxId(' 1790012345-001 ')).toBe('1790012345001');
  });
});

describe('registrar', () => {
  it('valida cliente, valor y fecha', () => {
    expect(validateRegister({ partyName: 'ACME', partyTaxId: '1790012345001', amountCents: 100, date: '2026-01-02' }).ok).toBe(true);
    expect(validateRegister({ partyName: '', partyTaxId: '1', amountCents: 100, date: '2026-01-02' })).toEqual({ ok: false, error: 'Falta el cliente.' });
    expect(validateRegister({ partyName: 'A', partyTaxId: '', amountCents: 100, date: '2026-01-02' }).ok).toBe(false);
    expect(validateRegister({ partyName: 'A', partyTaxId: '1', amountCents: 0, date: '2026-01-02' }).ok).toBe(false);
    expect(validateRegister({ partyName: 'A', partyTaxId: '1', amountCents: 10, date: 'ayer' }).ok).toBe(false);
  });
  it('asiento: Debe banco / Haber anticipo de clientes, cuadrado', () => {
    const lines = buildRegisterLines(50000, { code: '1.1.01.002', name: 'Banco' }, { code: '2.1.04.008', name: 'Anticipo Clientes' }, 'x');
    expect(lines.map((l) => [l.accountCode, l.debit, l.credit])).toEqual([['1.1.01.002', 500, 0], ['2.1.04.008', 0, 500]]);
    expect(sumSide(lines)).toEqual({ debit: 500, credit: 500 });
  });
  it('la cuenta del anticipo es configurable en el mapeo (Puesta en marcha)', () => {
    expect(DEFAULT_CODES.advancesFromCustomers).toBe('2.1.04.008');
    expect(MAPPING_LABELS.advancesFromCustomers).toBe('Anticipos de clientes');
  });
});

describe('aplicar', () => {
  it('pendiente = total − retenido − anticipos', () => {
    expect(invoicePendingCents(inv({ receivedRetentions: { ivaCents: 105, rentaCents: 20 }, advancesApplied: { cents: 25 } }))).toBe(115000 - 150);
  });
  it('acepta una aplicación válida', () => {
    expect(applicationProblem(adv(), inv(), 50000, d('2026-03-10'))).toBeNull();
  });
  it('no pasa del disponible del anticipo, contando lo ya aplicado en la misma llamada', () => {
    expect(applicationProblem(adv(), inv(), 50001, d('2026-03-10'))).toMatch(/solo tiene \$500.00/);
    expect(applicationProblem(adv(), inv(), 20000, d('2026-03-10'), 40000)).toMatch(/solo tiene \$100.00/);
  });
  it('no pasa de lo que falta cobrar', () => {
    expect(applicationProblem(adv({ amountCents: 200000 }), inv(), 115001, d('2026-03-10'))).toMatch(/faltan \$1150.00/);
    const conRet = inv({ receivedRetentions: { ivaCents: 10500, rentaCents: 2000 } });
    expect(applicationProblem(adv({ amountCents: 200000 }), conRet, 102501, d('2026-03-10'))).toMatch(/faltan \$1025.00/);
  });
  it('exige el mismo cliente', () => {
    expect(applicationProblem(adv(), inv({ customerTaxId: '0102030405' }), 100, d('2026-03-10'))).toMatch(/otro cliente/);
  });
  it('exige factura autorizada, emitida, sin cobrar y viva', () => {
    const f = d('2026-03-10');
    expect(applicationProblem(adv(), inv({ sriStatus: 'pending' }), 100, f)).toMatch(/autorizada/);
    expect(applicationProblem(adv(), inv({ isPaid: true }), 100, f)).toMatch(/cobrada/);
    expect(applicationProblem(adv(), inv({ status: 'paid' }), 100, f)).toMatch(/cobrada/);
    expect(applicationProblem(adv(), inv({ status: 'void', isVoid: true }), 100, f)).toMatch(/anulada/);
    expect(applicationProblem(adv(), inv({ isCreditNote: true }), 100, f)).toMatch(/nota de crédito/);
  });
  it('no antes del anticipo ni de la factura', () => {
    expect(applicationProblem(adv(), inv(), 100, d('2026-02-28'))).toMatch(/anterior al anticipo/);
    expect(applicationProblem(adv(), inv(), 100, d('2026-03-04'))).toMatch(/anterior a la factura/);
  });
  it('no aplica un anticipo anulado ni uno de proveedor', () => {
    expect(applicationProblem(adv({ isVoid: true }), inv(), 100, d('2026-03-10'))).toMatch(/anulado/);
    expect(applicationProblem(adv({ partyType: 'supplier' }), inv(), 100, d('2026-03-10'))).toMatch(/clientes/);
  });
  it('asiento: Debe anticipo / Haber CxC', () => {
    const l = buildApplicationLines(115000, { code: '2.1.04.008', name: 'A' }, { code: '1.1.02.001', name: 'CxC' }, 'x');
    expect(l.map((x) => [x.accountCode, x.debit, x.credit])).toEqual([['2.1.04.008', 1150, 0], ['1.1.02.001', 0, 1150]]);
  });
});

describe('la factura', () => {
  const fecha = d('2026-03-10');
  it('aplicación parcial: solo el acumulado', () => {
    const p = invoicePatchFor(inv(), 'a1', 50000, fecha);
    expect(p).toEqual({ advancesApplied: { cents: 50000, count: 1, lastId: 'a1' } });
  });
  it('si queda saldada, pasa a cobrada por anticipos (sin banco)', () => {
    const p = invoicePatchFor(inv({ advancesApplied: { cents: 50000, count: 1, lastId: 'a1' } }), 'a2', 65000, fecha);
    expect(p).toEqual({
      advancesApplied: { cents: 115000, count: 2, lastId: 'a2' },
      isPaid: true, status: 'paid', paidBy: 'advances', paidAt: fecha,
    });
    expect(p.paymentBankAccountId).toBeUndefined();
  });
  it('con retención, se salda al cubrir total − retenido', () => {
    const p = invoicePatchFor(inv({ receivedRetentions: { ivaCents: 10500, rentaCents: 2000 } }), 'a1', 102500, fecha);
    expect(p.paidBy).toBe('advances');
  });
  it('desaplicar una saldada por anticipos la devuelve a emitida', () => {
    const saldada = inv({ status: 'paid', isPaid: true, paidBy: 'advances', advancesApplied: { cents: 115000, count: 2, lastId: 'a2' } });
    expect(invoicePatchFor(saldada, 'a2', -65000, fecha)).toEqual({
      advancesApplied: { cents: 50000, count: 1, lastId: 'a2' },
      isPaid: false, status: 'issued', paidBy: null, paidAt: null,
    });
  });
  it('el cobro por banco entra por total − retenido − anticipos', () => {
    expect(paymentAmount('invoice', inv({ advancesApplied: { cents: 50000 } }))).toBe(650);
    expect(paymentAmount('invoice', inv({ advancesApplied: { cents: 50000 }, receivedRetentions: { ivaCents: 10500, rentaCents: 2000 } }))).toBe(525);
    expect(paymentAmount('purchase', { total: 230, advancesApplied: { cents: 100 } })).toBe(230);
  });
});

describe('desaplicar y anular', () => {
  it('no desaplica si la factura se cobró por banco', () => {
    expect(unapplyProblem({ status: 'applied' }, inv({ isPaid: true, status: 'paid', paymentBankAccountId: 'b1' }))).toMatch(/banco/);
    expect(unapplyProblem({ status: 'applied' }, inv({ isPaid: true, status: 'paid', paidBy: 'advances' }))).toBeNull();
    expect(unapplyProblem({ status: 'void', isVoid: true }, inv())).toMatch(/ya se deshizo/);
  });
  it('anula solo sin aplicaciones', () => {
    expect(voidProblem(adv())).toBeNull();
    expect(voidProblem(adv({ appliedCents: 1 }))).toMatch(/aplicaciones/);
    expect(voidProblem(adv({ status: 'void', isVoid: true }))).toMatch(/ya está anulado/);
  });
  it('disponible = monto − aplicado − devuelto', () => {
    expect(advanceAvailableCents(adv({ appliedCents: 1000, refundedCents: 500 }))).toBe(48500);
  });
  it('la reversa invierte debe y haber', () => {
    const r = invertLines([{ debit: 5, credit: 0, description: 'a' }, { debit: 0, credit: 5, description: 'b' }]);
    expect(r).toEqual([{ debit: 0, credit: 5, description: '[REVERSA] a' }, { debit: 5, credit: 0, description: '[REVERSA] b' }]);
  });
});
