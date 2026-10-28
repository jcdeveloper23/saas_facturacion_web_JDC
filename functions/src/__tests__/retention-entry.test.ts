/**
 * retention-entry.test.ts
 *
 * Asiento de la retención que la empresa hace a un proveedor (2026-10-28): las
 * retenciones por pagar salen del mapeo de la empresa, no fijas en el código.
 * Solo lógica pura.
 */
import { buildRetentionLines, RetentionDoc } from '../accounting/generate-journal-entry-from-retention';
import { DEFAULT_CODES } from '../accounting/utils/get-account-mapping';
import { MAPPING_LABELS, FIXED_CODES, effectiveMapping } from '../accounting/accounting-setup';

const retention = {
  status: 'issued', fullNumber: '001-001-000000001', supplierName: 'PROVEEDOR', supplierTaxId: '0190434990001',
  totalRetained: 12, fiscalYear: '2026', supportDocNumber: '001-001-000000123',
  taxes: [
    { id: 'a', taxCode: '1', taxCodeName: 'Renta', pctCode: '310', pctName: 'Bienes', rate: 2, taxableBase: 100, retainedAmount: 2 },
    { id: 'b', taxCode: '2', taxCodeName: 'IVA', pctCode: '2', pctName: 'IVA 70 %', rate: 70, taxableBase: 15, retainedAmount: 10 },
  ],
} as unknown as RetentionDoc;

const accounts = {
  accountsPayable: { code: '2.1.01.001', name: 'Cuentas por Pagar Proveedores' },
  retIrPayable: { code: '2.1.04.009', name: 'Renta propia' },
  retIvaPayable: { code: '2.1.04.010', name: 'IVA propio' },
};

describe('asiento de la retención emitida', () => {
  it('la renta y el IVA van a las cuentas del mapeo', () => {
    const lines = buildRetentionLines(retention, accounts);
    const haber = lines.filter((l) => l.credit > 0).map((l) => [l.accountCode, l.credit]);
    expect(haber).toEqual([['2.1.04.009', 2], ['2.1.04.010', 10]]);
    const debe = lines.filter((l) => l.debit > 0).map((l) => [l.accountCode, l.debit]);
    expect(debe).toEqual([['2.1.01.001', 2], ['2.1.01.001', 10]]);
  });

  it('sin mapeo guardado, las cuentas de siempre', () => {
    expect(DEFAULT_CODES.retIrPayable).toBe('2.1.04.003');
    expect(DEFAULT_CODES.retIvaPayable).toBe('2.1.04.002');
    const m = effectiveMapping({ retIrPayable: '2.1.04.009' });
    expect(m.retIrPayable).toBe('2.1.04.009');
    expect(m.retIvaPayable).toBe('2.1.04.002');
  });

  it('se configuran en Puesta en marcha y ya no figuran como fijas', () => {
    expect(MAPPING_LABELS.retIrPayable).toBeTruthy();
    expect(MAPPING_LABELS.retIvaPayable).toBeTruthy();
    expect(FIXED_CODES['2.1.04.003']).toBeUndefined();
    expect(FIXED_CODES['2.1.04.002']).toBeUndefined();
  });
});
