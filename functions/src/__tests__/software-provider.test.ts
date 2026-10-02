/**
 * software-provider.test.ts
 *
 * El «RUC Proveedor» que exige el SRI en todo comprobante: el del canal, si lo
 * tiene; si no, el de la plataforma; si no, el de WECONNECT CORP. Un valor mal
 * escrito se ignora, para no mandar al SRI un campo que lo haga rechazar.
 */

const docs: Record<string, Record<string, unknown> | undefined> = {};

jest.mock('firebase-admin', () => ({
  firestore: () => ({
    doc: (path: string) => ({ get: async () => ({ data: () => docs[path] }) }),
  }),
}));

import {
  DEFAULT_SOFTWARE_PROVIDER_RUC,
  clearSoftwareProviderCache,
  isProviderRuc,
  resolveSoftwareProviderRuc,
} from '../utils/software-provider';

beforeEach(() => {
  for (const k of Object.keys(docs)) delete docs[k];
  clearSoftwareProviderCache();
});

describe('isProviderRuc', () => {
  it('13 dígitos terminados en 001', () => {
    expect(isProviderRuc('0190434990001')).toBe(true);
    expect(isProviderRuc('019043499000')).toBe(false);
    expect(isProviderRuc('0190434990002')).toBe(false);
    expect(isProviderRuc('0190434990')).toBe(false);
    expect(isProviderRuc(190434990001)).toBe(false);
  });
});

describe('resolveSoftwareProviderRuc', () => {
  it('sin nada configurado, el de WECONNECT CORP.', async () => {
    expect(DEFAULT_SOFTWARE_PROVIDER_RUC).toBe('0190434990001');
    expect(await resolveSoftwareProviderRuc({})).toBe('0190434990001');
  });

  it('el de la plataforma gana al de por defecto', async () => {
    docs['platform/defaults/sriConfig/data'] = { softwareProviderRuc: '1790000000001' };
    expect(await resolveSoftwareProviderRuc({ channelId: 'conecta-app' })).toBe('1790000000001');
  });

  it('el del canal gana al de la plataforma', async () => {
    docs['platform/defaults/sriConfig/data'] = { softwareProviderRuc: '1790000000001' };
    docs['channels/mi-buseta'] = { softwareProviderRuc: '0990000000001' };
    expect(await resolveSoftwareProviderRuc({ channelId: 'mi-buseta' })).toBe('0990000000001');
  });

  it('un valor mal escrito se ignora y pasa al siguiente', async () => {
    docs['channels/mi-buseta'] = { softwareProviderRuc: '099-000' };
    expect(await resolveSoftwareProviderRuc({ channelId: 'mi-buseta' })).toBe('0190434990001');
  });
});
