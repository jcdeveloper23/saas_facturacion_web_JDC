/**
 * Formulario del colaborador (NOMINA_COLABORADOR.md §2 y §5): valores iniciales,
 * precarga al editar y lo que se manda a upsertPayrollEmployee. Puro.
 */

import { isValidCedula } from '../../../../core/validators/ecuador.validators';
import {
  PayrollEmployee, PayrollEmployeeInput, PayrollPersonInput, PayMode, parseMoneyCents,
} from '../../models/payroll.models';
import { PersonIdType, profilePayload, toEmployeeProfile } from '../../models/payroll-employee-profile.models';

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Los controles del formulario (todos planos). */
export function emptyEmployeeForm() {
  return {
    taxIdType: 'CI' as string, taxId: '', firstNames: '', lastNames: '', email: '', position: '', groupId: '',
    hireDate: '', endDate: '', salary: '', contractType: 'indefinite', workdayType: 'full', region: 'sierra',
    expenseGroup: 'admin', isActive: true, iessNumber: '', bankAccount: '',
    accReserve: false, accThirteenth: false, accFourteenth: false,
    ...toEmployeeProfile({}),
  };
}
export type EmployeeFormValue = ReturnType<typeof emptyEmployeeForm>;

/** Una identificación guardada como RUC de persona natural (cédula + 001) se edita como su cédula. */
const asCedula = (taxId: string) => (/^\d{13}$/.test(taxId) && taxId.endsWith('001') ? taxId.slice(0, 10) : taxId);

/** Los antiguos no tienen tipo: 10 o 13 dígitos = cédula; si no, pasaporte. */
function guessIdType(e: PayrollEmployee): PersonIdType {
  if (e.taxIdType === 'CI' || e.taxIdType === 'PASAPORTE' || e.taxIdType === 'EXTERIOR') return e.taxIdType;
  return /^\d{10}(\d{3})?$/.test(e.taxId) ? 'CI' : 'PASAPORTE';
}

/**
 * Precarga de la edición. Si el colaborador no tiene nombres y apellidos por
 * separado (los anteriores al §5), el nombre completo va en Nombres y
 * Apellidos queda vacío y obligatorio.
 */
export function formFromEmployee(e: PayrollEmployee, position: string): EmployeeFormValue {
  const split = !!(e.firstNames || e.lastNames);
  return {
    ...emptyEmployeeForm(),
    ...toEmployeeProfile(e as unknown as Record<string, any>),
    taxIdType: guessIdType(e), taxId: asCedula(e.taxId),
    firstNames: split ? e.firstNames : e.name, lastNames: split ? e.lastNames : '',
    email: e.email, position, groupId: e.groupId,
    hireDate: e.hireDate, endDate: e.endDate ?? '', salary: (e.salaryCents / 100).toFixed(2),
    contractType: e.contractType, workdayType: e.workdayType, region: e.region, expenseGroup: e.expenseGroup,
    isActive: e.isActive, iessNumber: e.iessNumber, bankAccount: e.bankAccount,
    accReserve: e.reserveFundMode === 'accumulated', accThirteenth: e.thirteenthMode === 'accumulated',
    accFourteenth: e.fourteenthMode === 'accumulated',
  };
}

/** Lo que falta o está mal en la identificación (como validatePersonInput). */
export function taxIdProblem(type: string, raw: string): string {
  const id = String(raw ?? '').replace(/\s/g, '').toUpperCase();
  if (!id) return '';
  if (type === 'CI') return isValidCedula(id) ? '' : 'La cédula no es válida (revisa los 10 dígitos).';
  return id.length >= 4 && /^[A-Z0-9-]+$/.test(id) ? '' : 'El número de pasaporte o identificación no es válido.';
}

/** El primer problema del formulario, o '' si se puede guardar. */
export function formProblem(v: EmployeeFormValue): string {
  if (!String(v.taxId).trim()) return 'Escribe el número de identificación.';
  const id = taxIdProblem(v.taxIdType, v.taxId);
  if (id) return id;
  if (!v.firstNames.trim()) return 'Escribe los nombres.';
  if (!v.lastNames.trim()) return 'Escribe los apellidos.';
  if (v.email.trim() && !EMAIL_PATTERN.test(v.email.trim())) return 'El correo no es válido.';
  if (!v.hireDate) return 'Elige la fecha de ingreso.';
  if (!parseMoneyCents(v.salary)) return 'Escribe el sueldo con decimales, sin separador de miles: p. ej. 1234,56.';
  if (v.endDate && v.endDate < v.hireDate) return 'La salida no puede ser antes del ingreso.';
  const dis = Number(v.disabilityPct || 0);
  if (!Number.isInteger(dis) || dis < 0 || dis > 100) return 'La discapacidad va de 0 a 100 %, sin decimales.';
  const deps = Number(v.familyDependents || 0);
  if (!Number.isInteger(deps) || deps < 0 || deps > 30) return 'Las cargas familiares van de 0 a 30.';
  return '';
}

const mode = (acc: boolean): PayMode => (acc ? 'accumulated' : 'monthly');

/** `person` y `employee` para upsertPayrollEmployee. La ficha va entera: un texto vacío la borra. */
export function toUpsertPayload(v: EmployeeFormValue): { person: PayrollPersonInput; employee: PayrollEmployeeInput } {
  const taxId = String(v.taxId).replace(/\s/g, '').toUpperCase();
  const profile = profilePayload(v);
  const person: PayrollPersonInput = {
    taxIdType: v.taxIdType as PayrollPersonInput['taxIdType'], taxId,
    firstNames: v.firstNames.trim(), lastNames: v.lastNames.trim(),
    ...(v.email.trim() ? { email: v.email.trim() } : {}),
    ...(profile.phone ? { phone: profile.phone } : {}),
    ...(profile.mobile ? { mobile: profile.mobile } : {}),
    ...(v.position.trim() ? { position: v.position.trim() } : {}),
  };
  const employee: PayrollEmployeeInput = {
    ...profile,
    // El servidor toma nombre y cédula de la persona; van por compatibilidad con validateEmployee.
    name: `${person.lastNames} ${person.firstNames}`.trim(), taxId,
    email: v.email.trim(), iessNumber: v.iessNumber.trim(), hireDate: v.hireDate, endDate: v.endDate || null,
    contractType: v.contractType, salaryCents: parseMoneyCents(v.salary)!,
    workdayType: v.workdayType as 'full' | 'efficient', region: v.region as 'sierra' | 'costa',
    expenseGroup: v.expenseGroup as 'admin' | 'sales',
    thirteenthMode: mode(v.accThirteenth), fourteenthMode: mode(v.accFourteenth), reserveFundMode: mode(v.accReserve),
    bankAccount: v.bankAccount.trim(), isActive: v.isActive, groupId: v.groupId,
  };
  return { person, employee };
}
