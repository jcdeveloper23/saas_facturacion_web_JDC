import {
  COLLABORATOR_TYPE_LABELS, existingPersonPatch, newPersonDoc, nextEmployeeCode, personName, sameIdCandidates, validatePersonInput,
} from '../payroll/payroll-person-logic';
import { validateProfile } from '../payroll/payroll-run-logic';

const ok = { taxIdType: 'CI', taxId: '0102030400', firstNames: 'Ana  María', lastNames: 'Pérez Soto', email: 'ana@x.ec' };

describe('validatePersonInput', () => {
  it('cédula válida, espacios normalizados', () => {
    const r = validatePersonInput(ok);
    expect(r.ok && r.value).toMatchObject({ taxId: '0102030400', firstNames: 'Ana María', lastNames: 'Pérez Soto' });
  });
  it('rechaza cédula con dígito verificador malo, RUC como tipo y faltantes', () => {
    expect(validatePersonInput({ ...ok, taxId: '0102030401' }).ok).toBe(false);
    expect(validatePersonInput({ ...ok, taxIdType: 'RUC' }).ok).toBe(false);
    expect(validatePersonInput({ ...ok, firstNames: '' }).ok).toBe(false);
    expect(validatePersonInput({ ...ok, lastNames: ' ' }).ok).toBe(false);
    expect(validatePersonInput({ ...ok, email: 'a@b' }).ok).toBe(false);
    expect(validatePersonInput(null).ok).toBe(false);
  });
  it('pasaporte: letras y números', () => {
    expect(validatePersonInput({ ...ok, taxIdType: 'PASAPORTE', taxId: 'ab12345' })).toMatchObject({ ok: true, value: { taxId: 'AB12345' } });
    expect(validatePersonInput({ ...ok, taxIdType: 'PASAPORTE', taxId: 'a/1' }).ok).toBe(false);
  });
});

describe('persona', () => {
  it('nombre como el resto del sistema: apellidos y nombres en mayúsculas', () => {
    expect(personName({ firstNames: 'Ana María', lastNames: 'Pérez Soto' })).toBe('PÉREZ SOTO ANA MARÍA');
  });
  it('la cédula también encuentra su RUC de persona natural', () => {
    expect(sameIdCandidates('0102030405')).toEqual(['0102030405', '0102030405001']);
    expect(sameIdCandidates('AB12345')).toEqual(['AB12345']);
  });
  it('código siguiente de la secuencia de empleados', () => {
    expect(nextEmployeeCode(['000003', '000010', undefined, 'x'])).toBe('000011');
    expect(nextEmployeeCode([])).toBe('000001');
  });
  it('persona nueva con el rol de empleado y su código', () => {
    const v = validatePersonInput({ ...ok, position: 'Asistente' });
    const d = newPersonDoc(v.ok ? v.value : (null as any), '000004', 'now');
    expect(d).toMatchObject({ roles: ['employee'], taxIdType: 'CI', isCompany: false, name: 'PÉREZ SOTO ANA MARÍA',
      employeeData: { code: '000004', position: 'Asistente' }, email: 'ana@x.ec', addresses: [], bankAccounts: [] });
  });
  it('persona existente: gana el rol, conserva su código y su correo', () => {
    const v = validatePersonInput(ok);
    const p = existingPersonPatch({ roles: ['customer'], email: 'otro@x.ec', employeeData: { code: '000002' } },
      v.ok ? v.value : (null as any), '000009', 'now');
    expect(p.roles).toEqual(['customer', 'employee']);
    expect(p.employeeData.code).toBe('000002');
    expect('email' in p).toBe(false);
  });
});

describe('tipo de colaborador', () => {
  it('los del sistema actual', () => {
    expect(Object.values(COLLABORATOR_TYPE_LABELS)).toEqual(['Accionistas', 'Comunes', 'Pasantes', 'Tiempo parcial', 'Construcción']);
    expect(validateProfile({ collaboratorType: 'intern', description: ' x ' })).toEqual({ ok: true, value: { collaboratorType: 'intern', description: 'x' } });
    expect(validateProfile({ collaboratorType: 'pasante' }).ok).toBe(false);
  });
});

describe('campos que el formulario actual no pide (2026-11-19)', () => {
  const { validateEmployee, toEmployeeInput, companyRegionOf } = require('../payroll/payroll-run-logic');
  it('sin contrato, jornada, región ni gasto: no se escriben (se conserva lo guardado)', () => {
    const r = validateEmployee({ salaryCents: 100000, hireDate: '2024-03-01' });
    expect(r.ok).toBe(true);
    for (const k of ['contractType', 'workdayType', 'region', 'expenseGroup']) expect(k in r.value).toBe(false);
  });
  it('si vienen, se validan como antes', () => {
    expect(validateEmployee({ salaryCents: 1, hireDate: '2024-03-01', region: 'oriente' }).ok).toBe(false);
    expect(validateEmployee({ salaryCents: 1, hireDate: '2024-03-01', expenseGroup: 'sales' }).value.expenseGroup).toBe('sales');
  });
  it('la región de la empresa manda; sin configurar, Sierra', () => {
    expect(companyRegionOf(undefined)).toBe('sierra');
    expect(companyRegionOf({ payrollRegion: 'costa' })).toBe('costa');
    expect(toEmployeeInput('e1', { region: 'sierra', salaryCents: 1 }, null, 'costa').region).toBe('costa');
    expect(toEmployeeInput('e1', { salaryCents: 1 }).region).toBe('sierra');
    expect(toEmployeeInput('e1', { salaryCents: 1 })).toMatchObject({ workdayType: 'full', expenseGroup: 'admin' });
  });
});
