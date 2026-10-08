/**
 * received-retention.test.ts
 *
 * Retenciones que los clientes le hacen a la empresa (2026-10-08): el asiento
 * (Debe retenciones / Haber CxC), las cuentas con respaldo, y que el cobro de
 * la factura descuente lo retenido. Solo lógica pura.
 */
import {
  buildReceivedRetentionLines, receivableFromSaleEntry, receivedRetentionCents, receivedRetentionNeedsEntry,
  resolveReceivedRetentionAccount, retainedOnInvoice,
} from '../accounting/utils/received-retention';
import { paymentAmount } from '../accounting/utils/payment-entry';

const accounts = {
  iva: { code: '1.1.05.006', name: 'Retenciones IVA' },
  renta: { code: '1.1.05.005', name: 'Retenciones en la Fuente IR' },
  receivable: { code: '1.1.02.001', name: 'Cuentas por Cobrar Clientes' },
};

describe('asiento de la retención recibida', () => {
  it('Debe IVA y renta retenidos, Haber CxC por la suma; cuadra al centavo', () => {
    const lines = buildReceivedRetentionLines(
      { number: '001-001-000000123', invoiceNumber: '001-001-000000010', customerName: 'ACME', ivaCents: 1050, rentaCents: 175 },
      accounts,
    );
    expect(lines.map((l) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['1.1.05.006', 10.5, 0],
      ['1.1.05.005', 1.75, 0],
      ['1.1.02.001', 0, 12.25],
    ]);
    const debe = lines.reduce((s, l) => s + Math.round(l.debit * 100), 0);
    const haber = lines.reduce((s, l) => s + Math.round(l.credit * 100), 0);
    expect(debe).toBe(haber);
  });

  it('solo renta: sin línea de IVA', () => {
    const lines = buildReceivedRetentionLines({ ivaCents: 0, rentaCents: 100 }, accounts);
    expect(lines.map((l) => l.accountCode)).toEqual(['1.1.05.005', '1.1.02.001']);
  });

  it('sin los centavos guardados, suma las líneas', () => {
    expect(receivedRetentionCents({ lines: [
      { tax: 'iva', code: '2', base: 15, rate: 70, amount: 10.5 },
      { tax: 'renta', code: '312', base: 100, rate: 1.75, amount: 1.75 },
    ] })).toEqual({ iva: 1050, renta: 175 });
  });

  it('necesita asiento: registrada, viva, sin asiento y con algo retenido', () => {
    const ok = { status: 'registered', ivaCents: 100, rentaCents: 0 };
    expect(receivedRetentionNeedsEntry(ok)).toBe(true);
    expect(receivedRetentionNeedsEntry({ ...ok, accountingEntryId: 'e1' })).toBe(false);
    expect(receivedRetentionNeedsEntry({ ...ok, status: 'void', isVoid: true })).toBe(false);
    expect(receivedRetentionNeedsEntry({ ...ok, ivaCents: 0 })).toBe(false);
  });
});

describe('cuentas', () => {
  it('la estándar si la empresa la tiene, o si no hay plan que mirar', () => {
    expect(resolveReceivedRetentionAccount('iva', new Map([['1.1.05.006', 'Retenciones IVA']])).account.code).toBe('1.1.05.006');
    expect(resolveReceivedRetentionAccount('renta', new Map()).account.code).toBe('1.1.05.005');
  });

  it('sin la estándar, el respaldo (crédito tributario), con aviso', () => {
    const r = resolveReceivedRetentionAccount('iva', new Map([['1.1.05.002', 'Crédito Tributario IVA']]));
    expect(r).toMatchObject({ account: { code: '1.1.05.002' }, fallbackUsed: true, missing: false });
  });

  it('sin ninguna de las dos, la estándar igual y se marca que falta', () => {
    const r = resolveReceivedRetentionAccount('renta', new Map([['__plan__', '']]));
    expect(r).toMatchObject({ account: { code: '1.1.05.005' }, missing: true });
  });

  it('la CxC sale del asiento de la venta (primera línea al Debe bajo 1.1.02)', () => {
    expect(receivableFromSaleEntry([
      { accountCode: '5.1.01.001', debit: 4, credit: 0 },
      { accountCode: '1.1.02.009', accountName: 'CxC Relacionadas', debit: 115, credit: 0 },
      { accountCode: '4.1.01.001', debit: 0, credit: 100 },
    ])).toEqual({ code: '1.1.02.009', name: 'CxC Relacionadas' });
    expect(receivableFromSaleEntry([{ accountCode: '4.1.01.001', debit: 0, credit: 100 }])).toBeNull();
  });
});

describe('cobro de una factura con retenciones', () => {
  it('entra al banco el total menos lo retenido', () => {
    const f = { total: 115, receivedRetentions: { ivaCents: 1050, rentaCents: 175, count: 1 } };
    expect(retainedOnInvoice(f)).toBe(12.25);
    expect(paymentAmount('invoice', f)).toBe(102.75);
  });

  it('sin retenciones, el total; y una compra no se toca', () => {
    expect(paymentAmount('invoice', { total: 115 })).toBe(115);
    expect(paymentAmount('purchase', { total: 115, receivedRetentions: { ivaCents: 1000 } })).toBe(115);
  });
});
