import {
  advanceCapProblem, advanceNumber, futureDateProblem, buildPaymentLines, nextPeriod, paymentNumber, paymentProblem, paymentStatusFor,
  payslipPendingCents, validateAccountsInput, validateAdvanceInput, validateMoneySource, validatePaymentInput,
  voidAdvanceProblem,
} from '../payroll/payroll-payment-logic';
import { reverseProblem } from '../payroll/payroll-run-logic';

const bank = { paymentMode: 'bank', bankAccountId: 'b1', paymentMethodCode: '20' };

describe('validateMoneySource', () => {
  it('banco con forma de pago del SRI', () => {
    expect(validateMoneySource(bank)).toEqual({
      ok: true, value: { mode: 'bank', bankAccountId: 'b1', paymentMethodCode: '20', chequeNumber: '' },
    });
  });
  it('por defecto es banco', () => {
    expect(validateMoneySource({ bankAccountId: 'b1', paymentMethodCode: '01' }).ok).toBe(true);
  });
  it('rechaza una forma de pago fuera de la Tabla 24', () => {
    expect(validateMoneySource({ ...bank, paymentMethodCode: '99' }).ok).toBe(false);
  });
  it('cargo a cuenta contable sin banco', () => {
    expect(validateMoneySource({ paymentMode: 'account', creditAccountCode: '1.1.01.001' }))
      .toEqual({ ok: true, value: { mode: 'account', creditAccountCode: '1.1.01.001' } });
    expect(validateMoneySource({ paymentMode: 'account' }).ok).toBe(false);
  });
  it('rechaza modos desconocidos y ids con barra', () => {
    expect(validateMoneySource({ paymentMode: 'cash' }).ok).toBe(false);
    expect(validateMoneySource({ ...bank, bankAccountId: 'a/b' }).ok).toBe(false);
  });
});

describe('validatePaymentInput', () => {
  const ok = { runId: '2026-10_v1', payslipIds: ['s1', 's2'], date: '2026-11-05', ...bank };
  it('acepta lo mínimo', () => {
    const r = validatePaymentInput(ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.payslipIds).toEqual(['s1', 's2']);
  });
  it('exige roles, sin repetir', () => {
    expect(validatePaymentInput({ ...ok, payslipIds: [] }).ok).toBe(false);
    expect(validatePaymentInput({ ...ok, payslipIds: ['s1', 's1'] }).ok).toBe(false);
  });
  it('exige una fecha real', () => {
    expect(validatePaymentInput({ ...ok, date: '2026-02-30' }).ok).toBe(false);
  });
});

describe('paymentProblem', () => {
  const run = { status: 'approved', period: '2026-10' };
  const slip = (o: Record<string, any> = {}) => ({ runId: 'r1', status: 'approved', netCents: 50000, paidCents: 0, employee: { name: 'Ana' }, ...o });
  it('pasa con roles aprobados y pendientes', () => {
    expect(paymentProblem(run, 'r1', [slip()], '2026-11-05')).toBeNull();
  });
  it('solo nóminas aprobadas', () => {
    expect(paymentProblem({ ...run, status: 'draft' }, 'r1', [slip()], '2026-11-05')).toMatch(/aprobada/);
    expect(paymentProblem(undefined, 'r1', [slip()], '2026-11-05')).toMatch(/no existe/);
  });
  it('la fecha no es anterior al mes de la nómina', () => {
    expect(paymentProblem(run, 'r1', [slip()], '2026-09-30')).toMatch(/anterior/);
    expect(paymentProblem(run, 'r1', [slip()], '2026-10-31')).toBeNull();
  });
  it('rechaza un rol ya pagado, de otra nómina o inexistente', () => {
    expect(paymentProblem(run, 'r1', [slip({ paidCents: 50000 })], '2026-11-05')).toMatch(/Ana ya está pagado/);
    expect(paymentProblem(run, 'r1', [slip({ runId: 'r2' })], '2026-11-05')).toMatch(/otra nómina/);
    expect(paymentProblem(run, 'r1', [undefined], '2026-11-05')).toMatch(/ya no existe/);
    expect(paymentProblem(run, 'r1', [slip({ status: 'reversed' })], '2026-11-05')).toMatch(/no está aprobado/);
  });
});

describe('payslipPendingCents y paymentStatusFor', () => {
  it('lo pendiente nunca es negativo', () => {
    expect(payslipPendingCents({ netCents: 1000, paidCents: 400 })).toBe(600);
    expect(payslipPendingCents({ netCents: 1000, paidCents: 1200 })).toBe(0);
    expect(payslipPendingCents(undefined)).toBe(0);
  });
  it('estado del pago', () => {
    expect(paymentStatusFor(1000, 0)).toBe('unpaid');
    expect(paymentStatusFor(1000, 400)).toBe('partial');
    expect(paymentStatusFor(1000, 1000)).toBe('paid');
  });
});

describe('buildPaymentLines', () => {
  it('un Debe por cuenta del neto y un Haber por el total; cuadra', () => {
    const lines = buildPaymentLines([
      { netPayableAccount: '2.1.01.003', amountCents: 50000 },
      { netPayableAccount: '2.1.01.003', amountCents: 30000 },
      { netPayableAccount: '2.1.1.06.01', amountCents: 20000 },
    ], '1.1.01.002');
    expect(lines).toEqual([
      { accountCode: '2.1.01.003', debitCents: 80000, creditCents: 0 },
      { accountCode: '2.1.1.06.01', debitCents: 20000, creditCents: 0 },
      { accountCode: '1.1.01.002', debitCents: 0, creditCents: 100000 },
    ]);
    const d = lines.reduce((s, l) => s + l.debitCents, 0);
    const c = lines.reduce((s, l) => s + l.creditCents, 0);
    expect(d).toBe(c);
  });
});

describe('validateAdvanceInput', () => {
  const ok = { employeeId: 'e1', amountCents: 5000, date: '2026-11-15', ...bank };
  it('por defecto se descuenta en el mes de la fecha', () => {
    const r = validateAdvanceInput(ok);
    expect(r.ok && r.value.period).toBe('2026-11');
  });
  it('acepta el mes siguiente, también al cambiar de año', () => {
    expect(validateAdvanceInput({ ...ok, period: '2026-12' }).ok).toBe(true);
    const r = validateAdvanceInput({ ...ok, date: '2026-12-20', period: '2027-01' });
    expect(r.ok && r.value.period).toBe('2027-01');
  });
  it('rechaza un mes anterior o más lejano', () => {
    expect(validateAdvanceInput({ ...ok, period: '2026-10' }).ok).toBe(false);
    expect(validateAdvanceInput({ ...ok, period: '2027-01' }).ok).toBe(false);
  });
  it('exige empleado y valor positivo en centavos', () => {
    expect(validateAdvanceInput({ ...ok, employeeId: '' }).ok).toBe(false);
    expect(validateAdvanceInput({ ...ok, amountCents: 0 }).ok).toBe(false);
    expect(validateAdvanceInput({ ...ok, amountCents: 10.5 }).ok).toBe(false);
  });
  it('nextPeriod', () => {
    expect(nextPeriod('2026-11')).toBe('2026-12');
    expect(nextPeriod('2026-12')).toBe('2027-01');
  });
});

describe('advanceCapProblem (art. 90)', () => {
  it('pasa hasta el tope, contando lo que ya tiene el mes', () => {
    expect(advanceCapProblem(100000, 10, 0, 10000)).toBeNull();
    expect(advanceCapProblem(100000, 10, 4000, 6000)).toBeNull();
  });
  it('rechaza lo que se pasa y dice cuánto queda', () => {
    expect(advanceCapProblem(100000, 10, 4000, 6001)).toMatch(/quedan 60\.00/);
  });
});

describe('voidAdvanceProblem', () => {
  it('solo mientras la nómina del mes no esté aprobada', () => {
    expect(voidAdvanceProblem({ status: 'posted' }, 'draft', 'error')).toBeNull();
    expect(voidAdvanceProblem({ status: 'posted' }, undefined, 'error')).toBeNull();
    expect(voidAdvanceProblem({ status: 'posted' }, 'approved', 'error')).toMatch(/aprobada/);
  });
  it('exige motivo y que no esté anulado', () => {
    expect(voidAdvanceProblem({ status: 'posted' }, 'draft', ' ')).toMatch(/motivo/);
    expect(voidAdvanceProblem({ status: 'voided' }, 'draft', 'x')).toMatch(/ya está anulado/);
    expect(voidAdvanceProblem(undefined, 'draft', 'x')).toMatch(/no existe/);
  });
});

describe('validateAccountsInput', () => {
  it('acepta claves conocidas; vacía vuelve a la sugerida', () => {
    expect(validateAccountsInput({ netPayable: ' 2.1.1.06.01 ', advances: '' }))
      .toEqual({ ok: true, value: { netPayable: '2.1.1.06.01', advances: '' } });
  });
  it('rechaza claves desconocidas y formatos raros', () => {
    expect(validateAccountsInput({ salary: '5.1' }).ok).toBe(false);
    expect(validateAccountsInput({ netPayable: 'a/b' }).ok).toBe(false);
    expect(validateAccountsInput(['x']).ok).toBe(false);
    expect(validateAccountsInput(null).ok).toBe(false);
  });
});

describe('números y reversa', () => {
  it('formato de los números', () => {
    expect(advanceNumber(2026, 7)).toBe('ANE-2026-000007');
    expect(paymentNumber(2026, 12)).toBe('PNO-2026-000012');
  });
  it('no se reversa una nómina con pagos vivos', () => {
    expect(reverseProblem({ status: 'approved', paidCents: 100 }, 'error')).toMatch(/pagos registrados/);
    expect(reverseProblem({ status: 'approved', paidCents: 0 }, 'error')).toBeNull();
  });
});

describe('futureDateProblem', () => {
  // 2026-11-19 00:30 UTC = 2026-11-18 19:30 en Ecuador.
  const now = new Date('2026-11-19T00:30:00Z');
  it('hoy y antes pasan; mañana no (en hora de Ecuador)', () => {
    expect(futureDateProblem('2026-11-18', now)).toBeNull();
    expect(futureDateProblem('2026-10-31', now)).toBeNull();
    expect(futureDateProblem('2026-11-19', now)).toMatch(/futura/);
  });
});
