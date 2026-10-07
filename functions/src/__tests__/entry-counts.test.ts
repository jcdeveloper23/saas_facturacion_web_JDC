/**
 * entry-counts.test.ts
 *
 * Qué asientos cuentan para los saldos del cierre y de la apertura
 * (countsForBalances) y el asiento de cierre que sale de ellos
 * (buildClosingLines). Una anulación deja el original 'cancelled' con
 * reversalEntryId y una reversa 'posted': juntos deben dar efecto neto 0
 * (2026-10-07). Solo lógica pura.
 */

import { BalanceEntry, countsForBalances, sumAccountBalances } from '../accounting/utils/entry-counts';
import { buildClosingLines } from '../accounting/utils/closing-entry';

type Entry = BalanceEntry & { id: string; periodId: string; date: string };

function line(accountCode: string, debit: number, credit: number) {
  return { accountCode, accountName: accountCode, debit, credit };
}

/** Venta de 100 + IVA 15, cobrada en caja. */
function sale(id: string, extra: Partial<Entry> = {}): Entry {
  return {
    id, periodId: 'p2026', date: '2026-03-10', status: 'posted',
    lines: [line('1.1.01.001', 115, 0), line('4.1.01.001', 0, 100), line('2.1.07.001', 0, 15)],
    ...extra,
  };
}

/** La reversa que crea generateReversalEntry: líneas invertidas, posted, mismo periodId. */
function reversalOf(original: Entry, id: string, date: string): Entry {
  return {
    id, periodId: original.periodId, date, status: 'posted',
    lines: (original.lines ?? []).map(l => line(l.accountCode!, l.credit ?? 0, l.debit ?? 0)),
  };
}

/** Gasto de 40 pagado en caja. */
const expense: Entry = {
  id: 'g1', periodId: 'p2026', date: '2026-04-01', status: 'posted',
  lines: [line('5.2.01.001', 40, 0), line('1.1.01.001', 0, 40)],
};

/** Simula la consulta del cierre: where periodId == x (sin filtrar estado). */
function ofPeriod(entries: Entry[], periodId: string): Entry[] {
  return entries.filter(e => e.periodId === periodId);
}

describe('countsForBalances', () => {
  it('posted cuenta', () => {
    expect(countsForBalances({ status: 'posted' })).toBe(true);
  });

  it('cancelled con reversalEntryId cuenta (su reversa lo neutraliza)', () => {
    expect(countsForBalances({ status: 'cancelled', reversalEntryId: 'r1' })).toBe(true);
  });

  it('cancelled sin reversalEntryId (anulado a mano) no cuenta', () => {
    expect(countsForBalances({ status: 'cancelled' })).toBe(false);
    expect(countsForBalances({ status: 'cancelled', reversalEntryId: null })).toBe(false);
    expect(countsForBalances({ status: 'cancelled', reversalEntryId: '' })).toBe(false);
  });

  it('borrador y estados desconocidos nunca cuentan', () => {
    expect(countsForBalances({ status: 'draft' })).toBe(false);
    expect(countsForBalances({ status: 'draft', reversalEntryId: 'r1' })).toBe(false);
    expect(countsForBalances({})).toBe(false);
    expect(countsForBalances(null)).toBe(false);
  });
});

describe('sumAccountBalances', () => {
  it('anulado + reversa en el mismo año: efecto neto 0', () => {
    const original = sale('v1', { status: 'cancelled', reversalEntryId: 'r1' });
    const reversa  = reversalOf(sale('v1'), 'r1', '2026-05-02');
    const b = sumAccountBalances([original, reversa]);
    for (const code of ['1.1.01.001', '4.1.01.001', '2.1.07.001']) {
      const bal = b.get(code)!;
      expect(bal.debit - bal.credit).toBeCloseTo(0, 2);
    }
  });

  it('el error de antes: solo con los posted, la reversa queda sola y resta la venta', () => {
    const original = sale('v1', { status: 'cancelled', reversalEntryId: 'r1' });
    const reversa  = reversalOf(sale('v1'), 'r1', '2026-05-02');
    const onlyPosted = [original, reversa].filter(e => e.status === 'posted');
    const ingreso = sumAccountBalances(onlyPosted).get('4.1.01.001')!;
    expect(ingreso.debit - ingreso.credit).toBe(100); // ingreso con saldo deudor: mal
  });

  it('el borrador no cuenta', () => {
    const b = sumAccountBalances([sale('v1'), sale('d1', { status: 'draft' })]);
    expect(b.get('4.1.01.001')!.credit).toBe(100);
  });

  it('el anulado a mano sin reversalEntryId no cuenta', () => {
    const b = sumAccountBalances([sale('v1'), sale('m1', { status: 'cancelled' })]);
    expect(b.get('4.1.01.001')!.credit).toBe(100);
  });

  it('filtra por cuenta (apertura: solo grupos 1, 2 y 3)', () => {
    const b = sumAccountBalances([sale('v1'), expense], c => /^[123]/.test(c));
    expect([...b.keys()].sort()).toEqual(['1.1.01.001', '2.1.07.001']);
    expect(b.get('1.1.01.001')!.debit).toBe(115);
    expect(b.get('1.1.01.001')!.credit).toBe(40);
  });
});

describe('buildClosingLines', () => {
  it('con una venta anulada y su reversa, el cierre solo lleva lo vivo y cuadra', () => {
    const entries: Entry[] = [
      sale('v1'),                                                   // venta viva
      sale('v2', { status: 'cancelled', reversalEntryId: 'r2' }),   // venta anulada
      reversalOf(sale('v2'), 'r2', '2026-06-15'),                   // su reversa
      sale('d1', { status: 'draft' }),                              // borrador
      sale('m1', { status: 'cancelled' }),                          // anulado a mano
      expense,
    ];
    const res = buildClosingLines(sumAccountBalances(ofPeriod(entries, 'p2026')), 2026);

    expect(res.totalIncome).toBe(100);
    expect(res.totalExpense).toBe(40);
    expect(res.netResult).toBe(60);
    expect(res.isBalanced).toBe(true);
    expect(res.totalDebit).toBe(100);
    expect(res.totalCredit).toBe(100);

    const utilidad = res.lines.find(l => l.accountCode === '3.3.02.001')!;
    expect(utilidad.credit).toBe(60);
    // Solo cuentas 4, 5 y 3.3.02
    expect(res.lines.every(l => /^(4|5|3\.3\.02)/.test(l.accountCode))).toBe(true);
  });

  it('pérdida: va al débito de 3.3.02.002 y cuadra', () => {
    const big: Entry = {
      ...expense, id: 'g2',
      lines: [line('5.2.01.001', 300, 0), line('1.1.01.001', 0, 300)],
    };
    const res = buildClosingLines(sumAccountBalances([sale('v1'), big]), 2026);
    expect(res.netResult).toBe(-200);
    expect(res.lines.find(l => l.accountCode === '3.3.02.002')!.debit).toBe(200);
    expect(res.isBalanced).toBe(true);
  });

  it('si toda la venta se anuló, el cierre no lleva líneas de esa venta', () => {
    const entries: Entry[] = [
      sale('v1', { status: 'cancelled', reversalEntryId: 'r1' }),
      reversalOf(sale('v1'), 'r1', '2026-02-01'),
    ];
    const res = buildClosingLines(sumAccountBalances(entries), 2026);
    expect(res.lines).toHaveLength(0);
    expect(res.netResult).toBe(0);
  });
});

describe('reversa en otro año que su original', () => {
  // generateReversalEntry copia periodId y periodYear del original y solo
  // pone como fecha el día de la anulación. Cada asiento cuenta en su
  // ejercicio por periodId, no por fecha: original y reversa se compensan
  // en el ejercicio del original aunque la anulación sea del año siguiente.
  const original = sale('v1', { status: 'cancelled', reversalEntryId: 'r1' });
  const reversa  = reversalOf(sale('v1'), 'r1', '2027-01-20'); // periodId p2026
  const nuevoAnio: Entry = { ...expense, id: 'g27', periodId: 'p2027', date: '2027-02-01' };
  const all = [original, reversa, nuevoAnio];

  it('el ejercicio del original queda en 0', () => {
    const res = buildClosingLines(sumAccountBalances(ofPeriod(all, 'p2026')), 2026);
    expect(res.lines).toHaveLength(0);
  });

  it('el ejercicio siguiente no ve la reversa', () => {
    const res = buildClosingLines(sumAccountBalances(ofPeriod(all, 'p2027')), 2027);
    expect(res.totalIncome).toBe(0);
    expect(res.totalExpense).toBe(40);
    expect(res.isBalanced).toBe(true);
  });
});
