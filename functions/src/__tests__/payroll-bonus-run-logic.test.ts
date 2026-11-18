import {
  BonusRunLine, bonusKey, bonusLabel, bonusMonths, bonusOpenProblem, bonusPayProblem, bonusRunId, bonusTotals,
  buildBonusPaymentLines, validateBonusKey,
} from '../payroll/payroll-bonus-run-logic';
import { DEFAULT_PAYROLL_ACCOUNTS } from '../payroll/payroll-entry';

const line = (o: Partial<BonusRunLine>): BonusRunLine => ({
  kind: 'thirteenth', year: 2026, from: '2025-12-01', to: '2026-11-30', totalIncomeCents: 0, monthsWorked: 12,
  monthsAccumulated: 12, amountCents: 0, provisionedCents: 0, adjustmentCents: 0, alreadyPaidCents: 0, balanceCents: 0,
  errors: [], employeeId: 'e1', employeeName: 'ANA', groupId: '', expenseGroup: 'admin', ...o,
});

describe('clave del lote', () => {
  it('13.º sin región; 14.º exige región', () => {
    expect(validateBonusKey({ kind: 'thirteenth', year: 2026, region: 'costa' })).toEqual({ ok: true, value: { kind: 'thirteenth', year: 2026, region: null } });
    expect(validateBonusKey({ kind: 'fourteenth', year: 2026 }).ok).toBe(false);
    expect(validateBonusKey({ kind: 'xiii', year: 2026 }).ok).toBe(false);
  });
  it('ids y rótulos', () => {
    const k = { kind: 'fourteenth' as const, year: 2026, region: 'sierra' as const };
    expect(bonusKey(k)).toBe('fourteenth_2026_sierra');
    expect(bonusRunId(k, 2)).toBe('fourteenth_2026_sierra_v2');
    expect(bonusLabel(k)).toBe('Décimo cuarto 2026 (Sierra)');
  });
});

describe('bonusMonths', () => {
  it('13.º: diciembre anterior a noviembre, 12 meses', () => {
    const r = bonusMonths({ kind: 'thirteenth', year: 2026, region: null });
    expect(r.months).toHaveLength(12);
    expect([r.months[0], r.months[11]]).toEqual(['2025-12', '2026-11']);
  });
  it('14.º Costa: marzo anterior a febrero', () => {
    const r = bonusMonths({ kind: 'fourteenth', year: 2028, region: 'costa' });
    expect([r.months[0], r.months[11], r.months.length]).toEqual(['2027-03', '2028-02', 12]);
  });
});

describe('bonusOpenProblem', () => {
  const k = { kind: 'thirteenth' as const, year: 2026, region: null };
  it('desde el último mes del periodo', () => {
    expect(bonusOpenProblem(k, '2026-10-31', undefined)).toMatch(/todavía no/);
    expect(bonusOpenProblem(k, '2026-11-01', undefined)).toBeNull();
  });
  it('un solo lote vivo', () => {
    expect(bonusOpenProblem(k, '2026-12-01', { status: 'draft' })).toMatch(/borrador/);
    expect(bonusOpenProblem(k, '2026-12-01', { status: 'paid' })).toMatch(/pagado/);
    expect(bonusOpenProblem(k, '2026-12-01', { status: 'voided' })).toBeNull();
  });
});

describe('bonusPayProblem', () => {
  it('borrador, sin errores y con algo que pagar', () => {
    expect(bonusPayProblem({ status: 'draft', lines: [line({ balanceCents: 100 })] })).toBeNull();
    expect(bonusPayProblem({ status: 'paid', lines: [] })).toMatch(/borrador/);
    expect(bonusPayProblem({ status: 'draft', lines: [line({ balanceCents: 0 })] })).toMatch(/nada que pagar/);
    expect(bonusPayProblem({ status: 'draft', lines: [line({ balanceCents: 100, errors: ['saldo negativo'] })] })).toMatch(/ANA: saldo negativo/);
  });
});

describe('buildBonusPaymentLines', () => {
  const accts = () => ({ ...DEFAULT_PAYROLL_ACCOUNTS });
  const sums = (ls: { debitCents: number; creditCents: number }[]) =>
    [ls.reduce((s, l) => s + l.debitCents, 0), ls.reduce((s, l) => s + l.creditCents, 0)];
  it('descarga la provisión, el ajuste al gasto y el total al banco; cuadra', () => {
    const lines = buildBonusPaymentLines('thirteenth', [
      line({ amountCents: 100000, provisionedCents: 99990, adjustmentCents: 10, balanceCents: 100000 }),
      line({ employeeId: 'e2', amountCents: 50000, provisionedCents: 50000, adjustmentCents: 0, balanceCents: 50000 }),
    ], accts, '1.1.01.002');
    expect(lines).toEqual([
      { accountCode: '2.1.03.001', debitCents: 149990, creditCents: 0 },
      { accountCode: '5.2.01.003', debitCents: 10, creditCents: 0 },
      { accountCode: '1.1.01.002', debitCents: 0, creditCents: 150000 },
    ]);
    const [d, c] = sums(lines);
    expect(d).toBe(c);
  });
  it('ajustes de signo distinto en el gasto se netean; 14.º usa sus cuentas', () => {
    const lines = buildBonusPaymentLines('fourteenth', [
      line({ kind: 'fourteenth', amountCents: 40000, provisionedCents: 40030, adjustmentCents: -30, balanceCents: 40000 }),
      line({ kind: 'fourteenth', employeeId: 'e2', amountCents: 40000, provisionedCents: 39980, adjustmentCents: 20, balanceCents: 40000 }),
    ], accts, '1.1.01.002');
    expect(lines).toEqual([
      { accountCode: '2.1.03.002', debitCents: 80010, creditCents: 0 },
      { accountCode: '5.2.01.004', debitCents: 0, creditCents: 10 },
      { accountCode: '1.1.01.002', debitCents: 0, creditCents: 80000 },
    ]);
    const [d, c] = sums(lines);
    expect(d).toBe(c);
  });
  it('sin saldo no entra; totales', () => {
    const ls = [line({ amountCents: 0, balanceCents: 0 }), line({ amountCents: 500, provisionedCents: 500, balanceCents: 500 })];
    expect(buildBonusPaymentLines('thirteenth', ls, accts, 'B')).toHaveLength(2);
    expect(bonusTotals(ls)).toMatchObject({ employees: 2, amountCents: 500, balanceCents: 500 });
  });
});
