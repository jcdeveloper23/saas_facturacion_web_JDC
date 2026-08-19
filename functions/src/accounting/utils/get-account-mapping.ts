import * as admin from 'firebase-admin';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountEntry {
  code: string;
  name: string;
}

export interface ResolvedAccountMapping {
  sales15:            AccountEntry;
  sales0:             AccountEntry;
  salesExempt:        AccountEntry;
  ivaCollected:       AccountEntry;
  accountsReceivable: AccountEntry;
  inventory:          AccountEntry;
  cogs:               AccountEntry;
}

// ─── Ecuador standard defaults ────────────────────────────────────────────────

const DEFAULT_CODES: Record<keyof ResolvedAccountMapping, string> = {
  sales15:            '4.1.01.001',
  sales0:             '4.1.01.002',
  salesExempt:        '4.1.01.003',
  ivaCollected:       '2.1.04.001',
  accountsReceivable: '1.1.02.001',
  inventory:          '1.1.03.001',
  cogs:               '5.1.01.001',
};

const DEFAULT_NAMES: Record<string, string> = {
  '4.1.01.001': 'Ventas 15% IVA',
  '4.1.01.002': 'Ventas 0% IVA',
  '4.1.01.003': 'Ventas Exentas de IVA',
  '2.1.04.001': 'IVA en Ventas',
  '1.1.02.001': 'Cuentas por Cobrar Clientes',
  '1.1.03.001': 'Inventario de Mercaderías',
  '5.1.01.001': 'Costo de Ventas',
};

// ─── Resolver ─────────────────────────────────────────────────────────────────
//
// 1. Reads companies/{companyId}/settings/accounting to get custom account codes.
// 2. Falls back to DEFAULT_CODES for any missing key.
// 3. For codes that differ from defaults (company customization), fetches account
//    names from the chart of accounts so journal entry lines have correct names.

export async function getAccountMapping(companyId: string): Promise<ResolvedAccountMapping> {
  const db = admin.firestore();

  // Step 1: read company-level accounting settings
  const settingsSnap = await db
    .doc(`companies/${companyId}/settings/accounting`)
    .get();

  const saved = settingsSnap.exists
    ? (settingsSnap.data()?.accountMapping ?? {}) as Record<string, string>
    : {};

  // Merge saved codes with defaults
  const keys = Object.keys(DEFAULT_CODES) as (keyof ResolvedAccountMapping)[];
  const codes: Record<keyof ResolvedAccountMapping, string> = {} as any;
  for (const key of keys) {
    codes[key] = saved[key] || DEFAULT_CODES[key];
  }

  // Step 2: build name map — start with defaults, then fetch custom ones
  const nameMap: Record<string, string> = { ...DEFAULT_NAMES };

  const customCodes = [...new Set(Object.values(codes))].filter(c => !DEFAULT_NAMES[c]);

  if (customCodes.length > 0) {
    // Firestore 'in' supports up to 30 values — safe here (max 7 unique codes)
    const accountsSnap = await db
      .collection(`companies/${companyId}/accounts`)
      .where('code', 'in', customCodes)
      .get();

    for (const docSnap of accountsSnap.docs) {
      const data = docSnap.data();
      if (data.code && data.name) {
        nameMap[data.code as string] = data.name as string;
      }
    }
  }

  // Step 3: assemble the resolved mapping
  const resolve = (key: keyof ResolvedAccountMapping): AccountEntry => {
    const code = codes[key];
    return { code, name: nameMap[code] ?? code };
  };

  return {
    sales15:            resolve('sales15'),
    sales0:             resolve('sales0'),
    salesExempt:        resolve('salesExempt'),
    ivaCollected:       resolve('ivaCollected'),
    accountsReceivable: resolve('accountsReceivable'),
    inventory:          resolve('inventory'),
    cogs:               resolve('cogs'),
  };
}
