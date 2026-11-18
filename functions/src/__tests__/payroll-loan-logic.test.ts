import {
  cancelLoanPlan, duplicateGroupName, loanAppliesTo, loanNumber, validateGroupInput, validateLoanInput, validateLoanUpdate,
} from '../payroll/payroll-loan-logic';

describe('validateGroupInput', () => {
  it('nombre obligatorio; guarda solo las cuentas con código', () => {
    expect(validateGroupInput({ name: ' ' }).ok).toBe(false);
    const r = validateGroupInput({ name: 'VENTAS', accounts: { netPayable: '2.1.1.06.01', advances: '' } });
    expect(r).toEqual({ ok: true, value: { groupId: null, name: 'VENTAS', description: '', accounts: { netPayable: '2.1.1.06.01' }, isActive: true } });
  });
  it('rechaza claves de cuenta desconocidas e ids con barra', () => {
    expect(validateGroupInput({ name: 'X', accounts: { sueldo: '1' } }).ok).toBe(false);
    expect(validateGroupInput({ name: 'X', groupId: 'a/b' }).ok).toBe(false);
  });
  it('nombre repetido sin importar mayúsculas ni espacios', () => {
    const others = [{ id: 'g1', name: 'Rol  General' }];
    expect(duplicateGroupName('rol general', others, null)).toBe(true);
    expect(duplicateGroupName('rol general', others, 'g1')).toBe(false);
    expect(duplicateGroupName('Ventas', others, null)).toBe(false);
  });
});

describe('validateLoanInput', () => {
  const ok = { employeeId: 'e1', type: 'companyLoan', amountCents: 60000, installmentCents: 10000, startPeriod: '2026-12' };
  it('el saldo empieza en el monto', () => {
    const r = validateLoanInput(ok);
    expect(r.ok && r.value.balanceCents).toBe(60000);
    expect(r.ok && r.value.disbursement).toBeNull();
  });
  it('un préstamo que ya venía descontándose trae su saldo', () => {
    const r = validateLoanInput({ ...ok, balanceCents: 30000 });
    expect(r.ok && r.value.balanceCents).toBe(30000);
    expect(validateLoanInput({ ...ok, balanceCents: 70000 }).ok).toBe(false);
  });
  it('cuota ≤ saldo, tipo conocido, mes válido', () => {
    expect(validateLoanInput({ ...ok, installmentCents: 70000 }).ok).toBe(false);
    expect(validateLoanInput({ ...ok, type: 'personal' }).ok).toBe(false);
    expect(validateLoanInput({ ...ok, startPeriod: '2026-13' }).ok).toBe(false);
  });
  it('la entrega: solo préstamos de la empresa, sin saldo previo, y no después del primer descuento', () => {
    const d = { date: '2026-11-20', paymentMode: 'bank', bankAccountId: 'b1', paymentMethodCode: '20' };
    expect(validateLoanInput({ ...ok, disbursement: d }).ok).toBe(true);
    expect(validateLoanInput({ ...ok, type: 'iessQuirografario', disbursement: d }).ok).toBe(false);
    expect(validateLoanInput({ ...ok, balanceCents: 30000, disbursement: d }).ok).toBe(false);
    expect(validateLoanInput({ ...ok, startPeriod: '2026-10', disbursement: d }).ok).toBe(false);
    expect(validateLoanInput({ ...ok, disbursement: { ...d, paymentMethodCode: '99' } }).ok).toBe(false);
  });
});

describe('validateLoanUpdate', () => {
  const active = { status: 'active', type: 'companyLoan', balanceCents: 50000, installmentCents: 10000 };
  it('cambia la cuota; no deja una cuota mayor que el saldo', () => {
    expect(validateLoanUpdate(active, { installmentCents: 20000 })).toEqual({ ok: true, value: { installmentCents: 20000, balanceCents: null, notes: null } });
    expect(validateLoanUpdate(active, { installmentCents: 60000 }).ok).toBe(false);
  });
  it('el saldo solo se edita en los del IESS', () => {
    expect(validateLoanUpdate(active, { balanceCents: 40000 }).ok).toBe(false);
    expect(validateLoanUpdate({ ...active, type: 'iessHipotecario' }, { balanceCents: 40000 }).ok).toBe(true);
  });
  it('solo activos y con algún cambio', () => {
    expect(validateLoanUpdate({ ...active, status: 'paid' }, { notes: 'x' }).ok).toBe(false);
    expect(validateLoanUpdate(active, {}).ok).toBe(false);
    expect(validateLoanUpdate(undefined, { notes: 'x' }).ok).toBe(false);
  });
});

describe('cancelLoanPlan', () => {
  it('reversa la entrega solo si no se descontó nada', () => {
    const l = { status: 'active', amountCents: 60000, balanceCents: 60000, disbursement: { entryId: 'j1' } };
    expect(cancelLoanPlan(l, 'error')).toEqual({ ok: true, value: { reverseEntry: true } });
    expect(cancelLoanPlan({ ...l, balanceCents: 50000 }, 'error')).toEqual({ ok: true, value: { reverseEntry: false } });
    expect(cancelLoanPlan({ ...l, disbursement: null }, 'error')).toEqual({ ok: true, value: { reverseEntry: false } });
  });
  it('exige motivo y préstamo activo', () => {
    expect(cancelLoanPlan({ status: 'active' }, ' ').ok).toBe(false);
    expect(cancelLoanPlan({ status: 'cancelled' }, 'x').ok).toBe(false);
  });
});

describe('loanAppliesTo y número', () => {
  it('activo y desde su primer mes; los viejos sin mes, siempre', () => {
    expect(loanAppliesTo({ status: 'active', startPeriod: '2026-12' }, '2026-11')).toBe(false);
    expect(loanAppliesTo({ status: 'active', startPeriod: '2026-12' }, '2026-12')).toBe(true);
    expect(loanAppliesTo({ status: 'active' }, '2026-01')).toBe(true);
    expect(loanAppliesTo({ status: 'paid', startPeriod: '2026-01' }, '2026-05')).toBe(false);
  });
  it('PRE-AAAA-NNNNNN', () => expect(loanNumber(2026, 3)).toBe('PRE-2026-000003'));
});
