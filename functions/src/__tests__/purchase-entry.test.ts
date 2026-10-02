/**
 * purchase-entry.test.ts
 *
 * El asiento de una compra recibida (2026-10-02). Lo que importa: que el IVA
 * entre, que los servicios no vayan a inventario, que la CxP sea subtotal + IVA
 * (las retenciones las asienta la retención) y que siempre cuadre.
 */

import {
  buildPurchaseEntryLines, chosenExpenseCodes, isInventoryLine, purchaseAccountingDate, ProductKind,
} from '../accounting/utils/purchase-entry';

const accounts = {
  inventory:       { code: '1.1.03.001', name: 'Inventario de Mercaderías' },
  purchaseExpense: { code: '5.1.02.001', name: 'Compras 15% IVA' },
  ivaCredit:       { code: '1.1.05.001', name: 'IVA en Compras' },
  accountsPayable: { code: '2.1.01.001', name: 'Cuentas por Pagar Proveedores' },
};

const products = new Map<string, ProductKind>([
  ['art', { trackStock: true }],
  ['serv', { trackStock: false, type: 'service' }],
  ['sinStock', { trackStock: true, noStock: true }],
]);

const cuadra = (lines: { debit: number; credit: number }[]) => {
  const d = lines.reduce((s, l) => s + l.debit, 0);
  const c = lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(d - c) < 0.005;
};

describe('buildPurchaseEntryLines', () => {
  it('artículo con stock: Inventario + IVA contra CxP bruta (antes faltaba el IVA)', () => {
    const r = buildPurchaseEntryLines({
      fullNumber: 'C-2026-000001', supplierName: 'PROV',
      lines: [{ productId: 'art', qty: 10, unitCost: 10, subtotal: 100, taxAmount: 15 }],
      subtotal: 100, totalTax: 15, totalIrRetention: 1, totalVatRetention: 4.5, total: 109.5,
    }, products, accounts, new Map());
    expect(r.map((l) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['1.1.03.001', 100, 0],
      ['1.1.05.001', 15, 0],
      ['2.1.01.001', 0, 115], // bruta: las retenciones las asienta la retención
    ]);
    expect(cuadra(r)).toBe(true);
  });

  it('servicio sin cuenta elegida: va al gasto por defecto, no a inventario', () => {
    const r = buildPurchaseEntryLines({
      lines: [{ productId: 'serv', qty: 1, unitCost: 50, subtotal: 50 }],
      subtotal: 50, totalTax: 7.5,
    }, products, accounts, new Map());
    expect(r[0]).toMatchObject({ accountCode: '5.1.02.001', debit: 50 });
    expect(cuadra(r)).toBe(true);
  });

  it('cada línea elige su cuenta de gasto; las iguales se suman', () => {
    const compra = {
      lines: [
        { description: 'Luz', qty: 1, unitCost: 30, subtotal: 30, expenseAccountCode: '5.2.01.010' },
        { description: 'Agua', qty: 1, unitCost: 10, subtotal: 10, expenseAccountCode: '5.2.01.010' },
        { description: 'Abogado', qty: 1, unitCost: 200, subtotal: 200, expenseAccountCode: '5.2.01.014' },
        { productId: 'art', qty: 2, unitCost: 5, subtotal: 10 },
      ],
      subtotal: 250, totalTax: 37.5,
    };
    const nombres = new Map([['5.2.01.010', 'Servicios Básicos'], ['5.2.01.014', 'Honorarios Profesionales']]);
    const r = buildPurchaseEntryLines(compra, products, accounts, nombres);
    expect(r.map((l) => [l.accountCode, l.accountName, l.debit])).toEqual([
      ['5.2.01.010', 'Servicios Básicos', 40],
      ['5.2.01.014', 'Honorarios Profesionales', 200],
      ['1.1.03.001', 'Inventario de Mercaderías', 10],
      ['1.1.05.001', 'IVA en Compras', 37.5],
      ['2.1.01.001', 'Cuentas por Pagar Proveedores', 0],
    ]);
    expect(r[4].credit).toBe(287.5);
    expect(chosenExpenseCodes(compra, products)).toEqual(['5.2.01.010', '5.2.01.014']);
  });

  it('un artículo con stock nunca usa la cuenta de gasto de la línea', () => {
    const compra = { lines: [{ productId: 'art', qty: 1, unitCost: 5, subtotal: 5, expenseAccountCode: '5.2.01.010' }], subtotal: 5 };
    expect(buildPurchaseEntryLines(compra, products, accounts, new Map())[0].accountCode).toBe('1.1.03.001');
    expect(chosenExpenseCodes(compra, products)).toEqual([]);
  });

  it('los centavos del redondeo por línea van al mayor débito y el asiento cuadra', () => {
    const r = buildPurchaseEntryLines({
      lines: [
        { productId: 'art', qty: 3, unitCost: 3.333, subtotal: 10.0 },
        { productId: 'serv', qty: 1, unitCost: 2, subtotal: 2 },
      ],
      subtotal: 12.01, totalTax: 1.8,
    }, products, accounts, new Map());
    expect(r[0]).toMatchObject({ accountCode: '1.1.03.001', debit: 10.01 });
    expect(r.at(-1)!.credit).toBe(13.81);
    expect(cuadra(r)).toBe(true);
  });

  it('acepta compras viejas con vatAmount y líneas sin subtotal', () => {
    const r = buildPurchaseEntryLines({
      lines: [{ productId: 'art', qty: 2, unitCost: 10, discount: 10 }], vatAmount: 2.7,
    }, products, accounts, new Map());
    expect(r.map((l) => l.debit + l.credit)).toEqual([18, 2.7, 20.7]);
  });

  it('sin montos, lanza', () => {
    expect(() => buildPurchaseEntryLines({ lines: [] }, products, accounts, new Map())).toThrow('sin montos');
  });
});

describe('isInventoryLine', () => {
  it('mismo criterio que onPurchaseReceive', () => {
    expect(isInventoryLine({ productId: 'art', qty: 1 }, products)).toBe(true);
    expect(isInventoryLine({ productId: 'serv', qty: 1 }, products)).toBe(false);
    expect(isInventoryLine({ productId: 'sinStock', qty: 1 }, products)).toBe(false);
    expect(isInventoryLine({ productId: 'noExiste', qty: 1 }, products)).toBe(false);
    expect(isInventoryLine({ description: 'libre', qty: 1 }, products)).toBe(false);
    expect(isInventoryLine({ productId: 'art', qty: 0 }, products)).toBe(false);
  });
});

describe('purchaseAccountingDate', () => {
  it('la fecha de la factura del proveedor manda sobre la interna', () => {
    const ts = (d: string) => ({ toDate: () => new Date(d) });
    expect(purchaseAccountingDate({ supplierInvoiceDate: ts('2026-09-30T05:00:00Z'), date: ts('2026-10-02T05:00:00Z') })!
      .toISOString()).toBe('2026-09-30T05:00:00.000Z');
    expect(purchaseAccountingDate({ date: ts('2026-10-02T05:00:00Z') })!.toISOString()).toBe('2026-10-02T05:00:00.000Z');
    expect(purchaseAccountingDate({})).toBeNull();
  });
});
