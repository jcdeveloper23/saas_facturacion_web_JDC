import {
  AccountIndex, LedgerEntry, LedgerLine, balanceSheet, collectPages, compareAccountCodes,
  countsForReports, incomeStatement, libroDiario, libroMayor, toCents, trialBalance,
} from './ledger-reports';

// Mismos casos que las pruebas de Conecta (ledger_test.dart): plan mínimo, una
// apertura, ventas, una venta anulada con su reversa, un borrador, una anulación
// manual y el cierre.

const plan = new AccountIndex([
  { code: '1',         name: 'Activo',              type: 'activo',     nature: 'deudora' },
  { code: '1.1.01',    name: 'Caja',                type: 'activo',     nature: 'deudora' },
  { code: '1.1.02',    name: 'Clientes',            type: 'activo',     nature: 'deudora' },
  { code: '1.2.01',    name: 'Equipos',             type: 'activo',     nature: 'deudora' },
  { code: '1.2.02',    name: 'Depreciación acum.',  type: 'activo',     nature: 'acreedora' },
  { code: '2.1.01',    name: 'Proveedores',         type: 'pasivo',     nature: 'acreedora' },
  { code: '2.1.02',    name: 'IVA por pagar',       type: 'pasivo',     nature: 'acreedora' },
  { code: '3.1.01',    name: 'Capital',             type: 'patrimonio', nature: 'acreedora' },
  { code: '3.3.01',    name: 'Utilidad del ejercicio', type: 'patrimonio', nature: 'acreedora' },
  { code: '4.1.01',    name: 'Ventas',              type: 'ingreso',    nature: 'acreedora' },
  { code: '5.1.01',    name: 'Costo de ventas',     type: 'costo',      nature: 'deudora' },
  { code: '5.2.01',    name: 'Sueldos',             type: 'gasto',      nature: 'deudora' },
  { code: '5.2.02',    name: 'Depreciación',        type: 'gasto',      nature: 'deudora' },
]);

function l(code: string, debit: number, credit: number): LedgerLine {
  return { accountCode: code, accountName: '', debit: toCents(debit), credit: toCents(credit) };
}

let seq = 0;
function e(day: string, lines: LedgerLine[], extra: Partial<LedgerEntry> = {}): LedgerEntry {
  seq++;
  return {
    id: extra.id ?? `e${seq}`, number: seq, day, description: '', reference: '',
    type: 'automatic', status: 'posted', lines, ...extra,
  };
}

function entries(): LedgerEntry[] {
  seq = 0;
  return [
    e('2026-01-01', [l('1.1.01', 1000, 0), l('1.2.01', 500, 0), l('3.1.01', 0, 1500)], { type: 'opening' }),
    // Venta 1: 100 + IVA 15
    e('2026-02-10', [l('1.1.02', 115, 0), l('4.1.01', 0, 100), l('2.1.02', 0, 15)]),
    e('2026-02-10', [l('5.1.01', 40, 0), l('1.1.01', 0, 40)]),
    // Venta 2 anulada: original 'cancelled' con reversa, y la reversa 'posted'
    e('2026-03-05', [l('1.1.02', 230, 0), l('4.1.01', 0, 200), l('2.1.02', 0, 30)],
      { id: 'orig', status: 'cancelled', reversalEntryId: 'rev' }),
    e('2026-03-20', [l('4.1.01', 200, 0), l('2.1.02', 30, 0), l('1.1.02', 0, 230)],
      { id: 'rev', type: 'adjustment', reversalOf: 'orig' }),
    // Borrador y anulación manual: no cuentan
    e('2026-03-21', [l('5.2.01', 999, 0), l('1.1.01', 0, 999)], { status: 'draft', type: 'manual' }),
    e('2026-03-22', [l('5.2.01', 777, 0), l('1.1.01', 0, 777)], { status: 'cancelled', type: 'manual' }),
    // Sueldos y depreciación
    e('2026-04-30', [l('5.2.01', 20, 0), l('1.1.01', 0, 20)], { type: 'manual' }),
    e('2026-12-31', [l('5.2.02', 10, 0), l('1.2.02', 0, 10)], { type: 'manual' }),
  ];
}

function closing(): LedgerEntry {
  // Resultado: 100 − 40 − 20 − 10 = 30
  return e('2026-12-31', [
    l('4.1.01', 100, 0), l('5.1.01', 0, 40), l('5.2.01', 0, 20), l('5.2.02', 0, 10), l('3.3.01', 0, 30),
  ], { type: 'closing' });
}

describe('ledger-reports', () => {
  it('countsForReports: posted y anulado con reversa', () => {
    expect(countsForReports({ status: 'posted' })).toBeTrue();
    expect(countsForReports({ status: 'cancelled', reversalEntryId: 'x' })).toBeTrue();
    expect(countsForReports({ status: 'cancelled' })).toBeFalse();
    expect(countsForReports({ status: 'draft' })).toBeFalse();
  });

  it('orden de códigos por segmentos', () => {
    expect(compareAccountCodes('1.1.9', '1.1.10')).toBeLessThan(0);
    expect(compareAccountCodes('1.1', '1.1.01')).toBeLessThan(0);
  });

  it('libro diario: incluye el anulado con reversa, excluye borrador y anulación manual', () => {
    const d = libroDiario(entries(), '2026-01-01', '2026-12-31');
    expect(d.entries.map(x => x.id)).toContain('orig');
    expect(d.entries.map(x => x.id)).toContain('rev');
    expect(d.entries.length).toBe(7);
    expect(d.totalDebit).toBe(d.totalCredit);
    expect(d.entries[0].type).toBe('opening');
  });

  it('libro mayor: saldo inicial con apertura y movimientos previos', () => {
    const m = libroMayor(entries(), plan, '1.1.01', '2026-03-01', '2026-12-31');
    expect(m.openingBalance).toBe(toCents(960));   // 1000 − 40
    expect(m.movements.length).toBe(1);             // sueldos 20
    expect(m.closingBalance).toBe(toCents(940));
    const c = libroMayor(entries(), plan, '1.1.02', '2026-01-01', '2026-12-31');
    expect(c.closingBalance).toBe(toCents(115));    // la venta anulada se compensa
    const iva = libroMayor(entries(), plan, '2.1.02', '2026-01-01', '2026-12-31');
    expect(iva.debitNature).toBeFalse();
    expect(iva.closingBalance).toBe(toCents(15));   // acreedora: positivo
  });

  it('balance de comprobación: cuadra y separa la apertura', () => {
    const tb = trialBalance(entries(), plan, '2026-01-01', '2026-12-31');
    expect(tb.isBalanced).toBeTrue();
    const caja = tb.rows.find(r => r.code === '1.1.01')!;
    expect(caja.openingDebit).toBe(toCents(1000));
    expect(caja.credit).toBe(toCents(60));
    expect(caja.closingDebit).toBe(toCents(940));
    expect(tb.openingDebit).toBe(toCents(1500));
    expect(tb.openingCredit).toBe(toCents(1500));
  });

  it('estado de resultados: costo vs gasto por tipo y sin el cierre', () => {
    const er = incomeStatement([...entries(), closing()], plan, '2026-01-01', '2026-12-31');
    expect(er.totalIncome).toBe(toCents(100));
    expect(er.totalCosts).toBe(toCents(40));
    expect(er.totalExpenses).toBe(toCents(30));
    expect(er.grossProfit).toBe(toCents(60));
    expect(er.netResult).toBe(toCents(30));
  });

  it('balance general: resultado del ejercicio y contra-cuenta que resta', () => {
    const bs = balanceSheet(entries(), plan, '2026-12-31');
    expect(bs.periodResult).toBe(toCents(30));
    const dep = bs.nonCurrentAssets.rows.find(r => r.code === '1.2.02')!;
    expect(dep.amount).toBe(toCents(-10));
    expect(bs.totalAssets).toBe(toCents(940 + 115 + 500 - 10));
    expect(bs.isBalanced).toBeTrue();
  });

  it('balance general con el año cerrado: resultado 0 y sigue cuadrando', () => {
    const bs = balanceSheet([...entries(), closing()], plan, '2026-12-31');
    expect(bs.periodResult).toBe(0);
    expect(bs.equity.total).toBe(toCents(1530));
    expect(bs.isBalanced).toBeTrue();
  });

  it('collectPages: pagina y marca el tope', async () => {
    const data = Array.from({ length: 12 }, (_, i) => i);
    const fetch = async (last: number | null, n: number) => {
      const start = last === null ? 0 : last + 1;
      return data.slice(start, start + n);
    };
    const all = await collectPages(fetch, 5, 20);
    expect(all.items.length).toBe(12);
    expect(all.truncated).toBeFalse();
    const capped = await collectPages(fetch, 5, 10);
    expect(capped.items.length).toBe(10);
    expect(capped.truncated).toBeTrue();
  });
});
