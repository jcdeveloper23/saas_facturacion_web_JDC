/**
 * redo-purchase-entry.test.ts — «Rehacer asiento» de una compra (2026-10-14):
 * cuándo el asiento nuevo es igual al viejo (no se toca nada) y la reversa.
 */
jest.mock('firebase-admin', () => ({ firestore: Object.assign(() => ({}), { FieldValue: {}, Timestamp: {} }) }));
import { sameEntryLines } from '../accounting/redo-purchase-entry';
import { invertEntryLines } from '../accounting/generate-reversal-entry';

const l = (accountCode: string, debit: number, credit: number) => ({ accountCode, debit, credit });

describe('sameEntryLines', () => {
  it('mismas cuentas e importes en otro orden: igual', () => {
    expect(sameEntryLines([l('5.1', 200, 0), l('1.1.05.001', 30, 0), l('2.1.01.001', 0, 230)],
      [l('2.1.01.001', 0, 230), l('5.1', 200, 0), l('1.1.05.001', 30, 0)])).toBe(true);
  });
  it('el IVA pasa de crédito tributario a la cuenta del gasto (sustento 02): distinto', () => {
    expect(sameEntryLines([l('5.1', 200, 0), l('1.1.05.001', 30, 0), l('2.1.01.001', 0, 230)],
      [l('5.1', 200, 0), l('5.1', 30, 0), l('2.1.01.001', 0, 230)])).toBe(false);
  });
  it('compara al centavo', () => {
    expect(sameEntryLines([l('5.1', 0.1 + 0.2, 0)], [l('5.1', 0.3, 0)])).toBe(true);
    expect(sameEntryLines([l('5.1', 0.31, 0)], [l('5.1', 0.3, 0)])).toBe(false);
  });
});

describe('invertEntryLines', () => {
  it('cambia débito y crédito y conserva la cuenta', () => {
    const r = invertEntryLines([{ id: 'a', accountCode: '5.1', accountName: 'Gasto', debit: 200, credit: 0,
      costCenterId: null, costCenterName: null, description: 'x' }]);
    expect(r[0]).toMatchObject({ accountCode: '5.1', debit: 0, credit: 200, description: '[REVERSA] x' });
    expect(r[0].id).not.toBe('a');
  });
});
