import { claimSriProcessing, isIssuedWithoutSriStatus } from '../utils/sri-claim';
import { shouldProcessInvoice } from '../invoices/invoice-buyer-check';

jest.mock('firebase-admin', () => ({ firestore: { Timestamp: { now: () => 'now' } } }));

/** Firestore mínimo: transacciones que se ejecutan una tras otra sobre un solo documento. */
function fakeDb(initial: Record<string, any> | null) {
  let data = initial ? { ...initial } : null;
  let queue = Promise.resolve();
  const db: any = {
    doc: (path: string) => ({ path }),
    runTransaction: (fn: (tx: any) => Promise<any>) => {
      const run = queue.then(() => fn({
        get: async () => ({ exists: data !== null, data: () => ({ ...data }) }),
        update: (_ref: any, patch: Record<string, any>) => { data = { ...data, ...patch }; },
      }));
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
  };
  return { db, read: () => data };
}

describe('claimSriProcessing', () => {
  it('dos ejecuciones a la vez: solo una reclama la factura', async () => {
    const { db, read } = fakeDb({ status: 'issued' });
    const results = await Promise.all([
      claimSriProcessing(db, 'companies/c/invoices/i', shouldProcessInvoice),
      claimSriProcessing(db, 'companies/c/invoices/i', shouldProcessInvoice),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(read()?.['sriStatus']).toBe('pending');
  });

  it('no reclama una que ya tiene estado del SRI', async () => {
    const { db } = fakeDb({ status: 'issued', sriStatus: 'pending' });
    expect(await claimSriProcessing(db, 'p', shouldProcessInvoice)).toBe(false);
  });

  it('no reclama un documento borrado', async () => {
    const { db } = fakeDb(null);
    expect(await claimSriProcessing(db, 'p', isIssuedWithoutSriStatus)).toBe(false);
  });

  it('retenciones y ND: emitida y sin estado', () => {
    expect(isIssuedWithoutSriStatus({ status: 'issued' })).toBe(true);
    expect(isIssuedWithoutSriStatus({ status: 'issued', sriStatus: 'rejected' })).toBe(false);
    expect(isIssuedWithoutSriStatus({ status: 'draft' })).toBe(false);
  });
});
