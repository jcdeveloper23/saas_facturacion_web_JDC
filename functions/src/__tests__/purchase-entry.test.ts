/**
 * purchase-entry.test.ts
 *
 * El asiento de una compra recibida (2026-10-02). Lo que importa: que el IVA
 * entre, que los servicios no vayan a inventario, que la CxP sea subtotal + IVA
 * (las retenciones las asienta la retención) y que siempre cuadre.
 */

import {
  buildPurchaseEntryLines, chosenExpenseCodes, isInventoryLine, purchaseAccountingDate, purchaseVatTreatment, ProductKind,
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

describe('la cuenta del artículo (2026-10-07)', () => {
  const conCuenta = new Map<string, ProductKind>([
    ['casco', { trackStock: true, purchaseAccountCode: '1.1.03.002' }],
    ['flete', { type: 'service', purchaseAccountCode: '5.2.01.010' }],
    ['art', { trackStock: true }],
  ]);
  const nombres = new Map([['1.1.03.002', 'Inventario cascos'], ['5.2.01.010', 'Fletes'], ['5.9.9', 'Otra']]);

  it('inventario va a la cuenta del artículo; sin cuenta, a la del mapeo', () => {
    const r = buildPurchaseEntryLines({
      fullNumber: 'C-1', lines: [
        { productId: 'casco', qty: 2, unitCost: 10, subtotal: 20 },
        { productId: 'art', qty: 1, unitCost: 5, subtotal: 5 },
      ], subtotal: 25, totalTax: 0,
    }, conCuenta, accounts, nombres);
    expect(r.map((l) => [l.accountCode, l.accountName, l.debit])).toEqual([
      ['1.1.03.002', 'Inventario cascos', 20],
      ['1.1.03.001', 'Inventario de Mercaderías', 5],
      ['2.1.01.001', 'Cuentas por Pagar Proveedores', 0],
    ]);
    expect(cuadra(r)).toBe(true);
  });

  it('gasto: manda la cuenta de la línea; si no eligió, la del artículo', () => {
    const r = buildPurchaseEntryLines({
      fullNumber: 'C-2', lines: [
        { productId: 'flete', qty: 1, unitCost: 10, subtotal: 10 },
        { productId: 'flete', qty: 1, unitCost: 4, subtotal: 4, expenseAccountCode: '5.9.9' },
      ], subtotal: 14, totalTax: 0,
    }, conCuenta, accounts, nombres);
    expect(r.map((l) => [l.accountCode, l.debit])).toEqual([['5.2.01.010', 10], ['5.9.9', 4], ['2.1.01.001', 0]]);
  });

  it('las cuentas del artículo también se validan', () => {
    expect(chosenExpenseCodes({ lines: [
      { productId: 'casco', qty: 1 }, { productId: 'flete', qty: 1 }, { productId: 'art', qty: 1 },
    ] }, conCuenta).sort()).toEqual(['1.1.03.002', '5.2.01.010']);
  });
});

// ─── IVA según el sustento tributario (tabla 5 del ATS, 2026-10-08) ───────────
describe('buildPurchaseEntryLines — IVA según el sustento', () => {
  const productos = new Map<string, ProductKind>([
    ['art', { trackStock: true }],
    ['artPropio', { trackStock: true, purchaseAccountCode: '1.1.03.009' }],
    ['activo', { trackStock: false, type: 'service', purchaseAccountCode: '1.2.01.005' }],
  ]);
  const nombres = new Map([
    ['1.1.03.009', 'Inventario de repuestos'], ['1.2.01.005', 'Equipo de computación'],
    ['5.2.01.014', 'Honorarios Profesionales'],
  ]);
  const compra = (sriSustentoCode: string | undefined, extra: Record<string, any> = {}) => ({
    fullNumber: 'C-1', supplierName: 'PROV', sriSustentoCode,
    lines: [
      { description: 'Abogado', qty: 1, unitCost: 100, subtotal: 100, taxRate: 15, taxAmount: 15, expenseAccountCode: '5.2.01.014' },
      { productId: 'art', qty: 2, unitCost: 25, subtotal: 50, taxRate: 15, taxAmount: 7.5 },
    ],
    subtotal: 150, totalTax: 22.5, ...extra,
  });
  const filas = (r: { accountCode: string; debit: number; credit: number }[]) => r.map((l) => [l.accountCode, l.debit, l.credit]);

  it('01 (con crédito): el IVA va a IVA en compras', () => {
    const r = buildPurchaseEntryLines(compra('01'), productos, accounts, nombres);
    expect(filas(r)).toEqual([
      ['5.2.01.014', 100, 0], ['1.1.03.001', 50, 0], ['1.1.05.001', 22.5, 0], ['2.1.01.001', 0, 172.5],
    ]);
    expect(cuadra(r)).toBe(true);
  });

  it('06 (inventario con crédito): igual que 01', () => {
    const r = buildPurchaseEntryLines(compra('6'), productos, accounts, nombres);
    expect(r.find((l) => l.accountCode === '1.1.05.001')?.debit).toBe(22.5);
    expect(cuadra(r)).toBe(true);
  });

  it('02 (sin crédito): el IVA de cada línea va a la cuenta de su base, nada a 1.1.05.001', () => {
    const r = buildPurchaseEntryLines(compra('02'), productos, accounts, nombres);
    expect(filas(r)).toEqual([
      ['5.2.01.014', 100, 0], ['1.1.03.001', 50, 0],
      ['5.2.01.014', 15, 0], ['1.1.03.001', 7.5, 0],
      ['2.1.01.001', 0, 172.5],
    ]);
    expect(r.some((l) => l.accountCode === '1.1.05.001')).toBe(false);
    expect(r[2].description).toContain('sustento 02');
    expect(cuadra(r)).toBe(true);
  });

  it('07 (inventario sin crédito): el IVA va a la cuenta de inventario del artículo', () => {
    const r = buildPurchaseEntryLines({
      sriSustentoCode: '07', lines: [{ productId: 'artPropio', qty: 3, unitCost: 10, subtotal: 30, taxAmount: 4.5 }],
      subtotal: 30, totalTax: 4.5,
    }, productos, accounts, nombres);
    expect(filas(r)).toEqual([['1.1.03.009', 30, 0], ['1.1.03.009', 4.5, 0], ['2.1.01.001', 0, 34.5]]);
    expect(cuadra(r)).toBe(true);
  });

  it('04 (activo fijo sin crédito): el IVA va a la cuenta de activo del artículo', () => {
    const r = buildPurchaseEntryLines({
      sriSustentoCode: '04', lines: [{ productId: 'activo', qty: 1, unitCost: 800, subtotal: 800, taxAmount: 120 }],
      subtotal: 800, totalTax: 120,
    }, productos, accounts, nombres);
    expect(filas(r)).toEqual([['1.2.01.005', 800, 0], ['1.2.01.005', 120, 0], ['2.1.01.001', 0, 920]]);
  });

  it('sin crédito con líneas 0 % y redondeo: reparte al centavo y cuadra con totalTax', () => {
    const r = buildPurchaseEntryLines({
      sriSustentoCode: '02',
      lines: [
        { description: 'A', qty: 1, unitCost: 10, subtotal: 10, taxAmount: 1.0005, expenseAccountCode: '5.2.01.014' },
        { description: 'B', qty: 1, unitCost: 20, subtotal: 20, taxAmount: 0 },
        { productId: 'art', qty: 1, unitCost: 3.33, subtotal: 3.33, taxAmount: 0.4995 },
      ],
      subtotal: 33.33, totalTax: 1.5,
    }, productos, accounts, nombres);
    const ivaLineas = r.filter((l) => l.description.startsWith('IVA'));
    expect(ivaLineas.reduce((s, l) => s + l.debit, 0)).toBeCloseTo(1.5, 10);
    expect(ivaLineas.map((l) => l.accountCode)).toEqual(['5.2.01.014', '1.1.03.001']); // la de 0 % no recibe IVA
    expect(cuadra(r)).toBe(true);
  });

  it('sin crédito y líneas sin IVA guardado: reparte por la base', () => {
    const r = buildPurchaseEntryLines({
      sriSustentoCode: '02',
      lines: [{ description: 'A', qty: 1, unitCost: 30, subtotal: 30 }, { productId: 'art', qty: 1, unitCost: 10, subtotal: 10 }],
      subtotal: 40, totalTax: 6,
    }, productos, accounts, nombres);
    expect(r.filter((l) => l.description.startsWith('IVA')).map((l) => [l.accountCode, l.debit]))
      .toEqual([['5.1.02.001', 4.5], ['1.1.03.001', 1.5]]);
    expect(cuadra(r)).toBe(true);
  });

  it.each([[undefined], [''], ['99'], ['00']])('sustento %p (vacío o fuera de la tabla vigente): como antes, a crédito', (code) => {
    const r = buildPurchaseEntryLines(compra(code as any), productos, accounts, nombres);
    expect(r.find((l) => l.accountCode === '1.1.05.001')?.debit).toBe(22.5);
    expect(purchaseVatTreatment(code)).toMatchObject({ mode: 'credit', known: false });
    expect(cuadra(r)).toBe(true);
  });

  it('purchaseVatTreatment: 01/03/06 crédito; 02/04/05/07 costo', () => {
    expect(['01', '03', '06'].map((c) => purchaseVatTreatment(c).mode)).toEqual(['credit', 'credit', 'credit']);
    expect(['02', '04', '05', '07', '15'].map((c) => purchaseVatTreatment(c).mode)).toEqual(['cost', 'cost', 'cost', 'cost', 'cost']);
  });
});
