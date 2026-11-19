/**
 * payroll-person-logic.ts — Alta del colaborador desde la nómina con sus
 * datos de identidad (NOMINA_COLABORADOR.md §5, 2026-11-19). Puro.
 *
 * El formulario del sistema actual crea al colaborador escribiendo tipo y
 * número de identificación, nombres y apellidos: no elige una persona. La
 * identidad sigue viviendo en `personas` (D-N8: todo el sistema la comparte),
 * así que la callable busca la persona por identificación y, si no existe, la
 * crea con el rol `employee`. Una persona que ya era cliente o proveedor no se
 * duplica: solo gana el rol.
 */

import { isValidCedula } from '../utils/ecuador-tax-id';
import type { Ok } from './payroll-run-logic';

export const COLLABORATOR_TYPES = ['shareholder', 'regular', 'intern', 'partTime', 'construction'] as const;
export type CollaboratorType = typeof COLLABORATOR_TYPES[number];
/** Los del sistema actual, en su orden. */
export const COLLABORATOR_TYPE_LABELS: Record<CollaboratorType, string> = {
  shareholder: 'Accionistas', regular: 'Comunes', intern: 'Pasantes', partTime: 'Tiempo parcial', construction: 'Construcción',
};

/** Los mismos tipos que `personas.taxIdType` (sin RUC: un colaborador es persona natural). */
export const PERSON_ID_TYPES = ['CI', 'PASAPORTE', 'EXTERIOR'] as const;
export type PersonIdType = typeof PERSON_ID_TYPES[number];

export interface PersonInput {
  taxIdType: PersonIdType;
  taxId: string;
  firstNames: string;
  lastNames: string;
  email: string;
  phone: string;
  mobile: string;
  position: string;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** El nombre como lo muestra el resto del sistema: apellidos y nombres, en mayúsculas. */
export const personName = (p: Pick<PersonInput, 'firstNames' | 'lastNames'>) =>
  `${p.lastNames} ${p.firstNames}`.trim().toLocaleUpperCase('es');

export function validatePersonInput(raw: unknown): Ok<PersonInput> {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const taxIdType = text(p.taxIdType, 12) as PersonIdType;
  if (!PERSON_ID_TYPES.includes(taxIdType)) return { ok: false, error: 'Elige el tipo de identificación: cédula, pasaporte o del exterior.' };
  const taxId = text(p.taxId, 20).replace(/\s/g, '').toUpperCase();
  if (!taxId) return { ok: false, error: 'Escribe el número de identificación.' };
  if (taxIdType === 'CI' && !isValidCedula(taxId)) return { ok: false, error: 'La cédula no es válida (revisa los 10 dígitos).' };
  if (taxIdType !== 'CI' && (taxId.length < 4 || !/^[A-Z0-9-]+$/.test(taxId))) {
    return { ok: false, error: 'El número de pasaporte o identificación no es válido.' };
  }
  const firstNames = text(p.firstNames, 80);
  const lastNames = text(p.lastNames, 80);
  if (!firstNames) return { ok: false, error: 'Escribe los nombres.' };
  if (!lastNames) return { ok: false, error: 'Escribe los apellidos.' };
  const email = text(p.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'El correo no es válido.' };
  return {
    ok: true,
    value: { taxIdType, taxId, firstNames, lastNames, email, phone: text(p.phone, 30), mobile: text(p.mobile, 30), position: text(p.position, 80) },
  };
}

/** Una cédula con RUC de persona natural (cédula + 001) es la misma persona. */
export const sameIdCandidates = (taxId: string) =>
  /^\d{10}$/.test(taxId) ? [taxId, `${taxId}001`] : [taxId];

/** El código de empleado siguiente (misma secuencia que la web de Personas: 000001…). */
export function nextEmployeeCode(codes: unknown[]): string {
  const max = codes.reduce<number>((m, c) => {
    const n = parseInt(String(c ?? '0'), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1).padStart(6, '0');
}

/** Persona nueva con el rol de empleado (misma forma que personas.service.ts de la web). */
export function newPersonDoc(p: PersonInput, employeeCode: string, now: unknown) {
  const name = personName(p);
  return {
    roles: ['employee'], taxId: p.taxId, taxIdType: p.taxIdType, isCompany: false,
    name, legalName: name, firstNames: p.firstNames, lastNames: p.lastNames,
    ...(p.email ? { email: p.email } : {}),
    ...(p.phone ? { phone1: p.phone } : {}),
    ...(p.mobile ? { phone2: p.mobile } : {}),
    employeeData: { code: employeeCode, ...(p.position ? { position: p.position } : {}) },
    addresses: [], bankAccounts: [], isActive: true, createdAt: now, updatedAt: now, createdFrom: 'payroll',
  };
}

/** Qué cambia en una persona que ya existía: el rol, el código si no tenía y el cargo si vino. */
export function existingPersonPatch(existing: Record<string, any>, p: PersonInput, employeeCode: string, now: unknown) {
  const roles: string[] = Array.isArray(existing.roles) ? existing.roles : [];
  const emp = (existing.employeeData ?? {}) as Record<string, any>;
  return {
    roles: roles.includes('employee') ? roles : [...roles, 'employee'],
    employeeData: { ...emp, code: emp.code || employeeCode, ...(p.position ? { position: p.position } : {}) },
    ...(p.email && !existing.email ? { email: p.email } : {}),
    updatedAt: now,
  };
}
