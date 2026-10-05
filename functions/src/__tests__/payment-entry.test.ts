/**
 * payment-entry.test.ts
 *
 * Qué cuenta como «le falta el asiento» para compras, cobros y pagos, y el año
 * contable en hora de Ecuador (2026-10-05). Solo lógica pura.
 */

import {
  ecuadorYear, ecuadorYearRange, paymentNeedsEntry, purchaseNeedsEntry,
} from '../accounting/utils/payment-entry';

describe('año contable en hora de Ecuador', () => {
  it('el 31 de diciembre a las 20:00 de Ecuador sigue siendo ese año', () => {
    expect(ecuadorYear(new Date('2027-01-01T01:00:00Z'))).toBe(2026);
    expect(ecuadorYear(new Date('2027-01-01T05:00:00Z'))).toBe(2027);
  });

  it('el rango del año empieza y acaba a medianoche de Ecuador', () => {
    const { from, to } = ecuadorYearRange(2026);
    expect(from.toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(to.toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });
});

describe('paymentNeedsEntry', () => {
  const cobrada = { isPaid: true, paymentBankAccountId: 'b1', total: 10 };

  it('cobrada con cuenta y sin asiento de cobro: sí', () => {
    expect(paymentNeedsEntry(cobrada)).toBe(true);
  });

  it('ya tiene asiento, sin cuenta, anulada, en cero o sin cobrar: no', () => {
    expect(paymentNeedsEntry({ ...cobrada, paymentEntryId: 'e1' })).toBe(false);
    expect(paymentNeedsEntry({ ...cobrada, paymentBankAccountId: ' ' })).toBe(false);
    expect(paymentNeedsEntry({ ...cobrada, paymentBankAccountId: undefined })).toBe(false);
    expect(paymentNeedsEntry({ ...cobrada, isVoid: true })).toBe(false);
    expect(paymentNeedsEntry({ ...cobrada, total: 0 })).toBe(false);
    expect(paymentNeedsEntry({ ...cobrada, isPaid: false })).toBe(false);
  });
});

describe('purchaseNeedsEntry', () => {
  const recibida = { stockProcessed: true, status: 'received' };

  it('recibida y sin asiento: sí (también si ya está pagada)', () => {
    expect(purchaseNeedsEntry(recibida)).toBe(true);
    expect(purchaseNeedsEntry({ ...recibida, status: 'paid' })).toBe(true);
  });

  it('sin recibir, con asiento, anulada o cancelada: no', () => {
    expect(purchaseNeedsEntry({ status: 'sent' })).toBe(false);
    expect(purchaseNeedsEntry({ ...recibida, accountingEntryId: 'e1' })).toBe(false);
    expect(purchaseNeedsEntry({ ...recibida, isVoid: true })).toBe(false);
    expect(purchaseNeedsEntry({ ...recibida, status: 'cancelled' })).toBe(false);
  });
});
