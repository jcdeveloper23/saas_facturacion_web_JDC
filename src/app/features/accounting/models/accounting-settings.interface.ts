// ─── Accounting Settings ──────────────────────────────────────────────────────
// Stored at: companies/{companyId}/settings/accounting
// Allows each company to override the default account codes used by
// the automated Cloud Functions (invoice, retention, credit note triggers).

export interface AccountMapping {
  // Ingresos
  sales15:             string;   // Ventas con IVA (default: '4.1.01.001')
  sales0:              string;   // Ventas 0% IVA  (default: '4.1.01.002')
  salesExempt:         string;   // Ventas exentas  (default: '4.1.01.003')
  // IVA
  ivaCollected:        string;   // IVA en Ventas   (default: '2.1.04.001')
  // Activos
  accountsReceivable:  string;   // CxC Clientes    (default: '1.1.02.001')
  inventory:           string;   // Inventario      (default: '1.1.03.001')
  // Costos
  cogs:                string;   // Costo de Ventas (default: '5.1.01.001')
}

export interface AccountingSettings {
  accountMapping: AccountMapping;
  updatedAt?: any;
  updatedBy?: string;
}

export const DEFAULT_ACCOUNT_MAPPING: AccountMapping = {
  sales15:            '4.1.01.001',
  sales0:             '4.1.01.002',
  salesExempt:        '4.1.01.003',
  ivaCollected:       '2.1.04.001',
  accountsReceivable: '1.1.02.001',
  inventory:          '1.1.03.001',
  cogs:               '5.1.01.001',
};

export const ACCOUNT_MAPPING_LABELS: Record<keyof AccountMapping, string> = {
  sales15:            'Ventas con IVA (15%)',
  sales0:             'Ventas 0% IVA',
  salesExempt:        'Ventas Exentas de IVA',
  ivaCollected:       'IVA en Ventas por Pagar',
  accountsReceivable: 'Cuentas por Cobrar Clientes',
  inventory:          'Inventario de Mercaderías',
  cogs:               'Costo de Ventas (COGS)',
};
