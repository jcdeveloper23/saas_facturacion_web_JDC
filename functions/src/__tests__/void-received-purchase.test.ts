/**
 * void-received-purchase.test.ts
 *
 * «Anular compra» recibida (2026-10-28): cuándo se puede y el motivo. Solo
 * lógica pura; la transacción es la de redoPurchaseEntry.
 */
import { voidPurchaseBlocker, readVoidReason, VoidPurchaseFacts } from '../accounting/void-received-purchase';

const base: VoidPurchaseFacts = { status: 'received', liveRetention: false, stockMovements: 0 };

describe('anular una compra recibida', () => {
  it('recibida, sin pago, retención, anticipos, comprobantes ni stock: se anula', () => {
    expect(voidPurchaseBlocker(base)).toBeNull();
    // La retención anulada no estorba; los acumulados en 0 tampoco.
    expect(voidPurchaseBlocker({ ...base, advancesApplied: 0, cashVouchersApplied: 0 })).toBeNull();
  });

  it('no se anula si ya está anulada, pagada o no está recibida', () => {
    expect(voidPurchaseBlocker({ ...base, isVoid: true })).toMatch(/ya está anulada/);
    expect(voidPurchaseBlocker({ ...base, status: 'cancelled' })).toMatch(/ya está anulada/);
    expect(voidPurchaseBlocker({ ...base, status: 'paid' })).toMatch(/pagada/);
    expect(voidPurchaseBlocker({ ...base, isPaid: true })).toMatch(/pagada/);
    expect(voidPurchaseBlocker({ ...base, paymentEntryId: 'p1' })).toMatch(/pagada/);
    expect(voidPurchaseBlocker({ ...base, status: 'draft' })).toMatch(/se cancela/);
  });

  it('no se anula con retención viva, anticipos, comprobantes o stock', () => {
    expect(voidPurchaseBlocker({ ...base, liveRetention: true })).toMatch(/retención/);
    expect(voidPurchaseBlocker({ ...base, advancesApplied: 10 })).toMatch(/anticipos/);
    expect(voidPurchaseBlocker({ ...base, cashVouchersApplied: 5 })).toMatch(/comprobantes/);
    expect(voidPurchaseBlocker({ ...base, stockMovements: 1 })).toMatch(/inventario/);
  });

  it('el motivo es obligatorio y corto', () => {
    expect(readVoidReason('  Factura registrada dos veces ')).toBe('Factura registrada dos veces');
    expect(() => readVoidReason('')).toThrow(/motivo/);
    expect(() => readVoidReason(undefined)).toThrow(/motivo/);
    expect(() => readVoidReason('x'.repeat(301))).toThrow(/300/);
  });
});
