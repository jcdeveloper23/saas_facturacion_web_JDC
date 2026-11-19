/**
 * Ficha del colaborador y «Asumir aporte IESS» (NOMINA_COLABORADOR.md,
 * 2026-11-18). Campos planos de `payrollEmployees`; los valida
 * validateProfile (functions/src/payroll/payroll-run-logic.ts). Solo se
 * escriben los que se mandan; un texto vacío borra el valor.
 */

export interface EmployeeProfile {
  assumesIessPersonal: boolean;
  disabilityPct: number;
  familyDependents: number;
  birthDate: string;
  sex: '' | 'M' | 'F';
  maritalStatus: string;
  bloodType: string;
  address: string;
  phone: string;
  mobile: string;
  education: string;
  title: string;
  bankName: string;
  bankAccountType: '' | 'savings' | 'checking';
  notes: string;
  /** Solo clasifica (sistema actual): no cambia el cálculo. */
  collaboratorType: string;
  description: string;
}

/** Tipo de colaborador, en el orden del sistema actual. */
export const COLLABORATOR_TYPE_LABELS: Record<string, string> = {
  shareholder: 'Accionistas', regular: 'Comunes', intern: 'Pasantes', partTime: 'Tiempo parcial', construction: 'Construcción',
};

/** Sin RUC: un colaborador es persona natural (payroll-person-logic.ts). */
export const PERSON_ID_TYPE_LABELS: Record<string, string> = {
  CI: 'Cédula', PASAPORTE: 'Pasaporte', EXTERIOR: 'Identificación del exterior',
};
export type PersonIdType = 'CI' | 'PASAPORTE' | 'EXTERIOR';

export const SEX_LABELS: Record<string, string> = { M: 'Masculino', F: 'Femenino' };

export const MARITAL_LABELS: Record<string, string> = {
  single: 'Soltero/a', married: 'Casado/a', divorced: 'Divorciado/a', widowed: 'Viudo/a', freeUnion: 'Unión libre',
};

export const EDUCATION_LABELS: Record<string, string> = {
  none: 'Ninguna', primary: 'Primaria', secondary: 'Secundaria', technical: 'Técnica/tecnológica',
  university: 'Superior', postgraduate: 'Posgrado',
};

export const BANK_ACCOUNT_TYPE_LABELS: Record<string, string> = { savings: 'Ahorros', checking: 'Corriente' };

export const ASSUMED_IESS_HINT =
  'La empresa paga el 9,45 % del aporte personal: no se descuenta al empleado y va al costo de la empresa.';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown, max: number) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= max ? n : 0; };
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | '' => (allowed.includes(v as T) ? (v as T) : '');

/** Lee la ficha de un documento de payrollEmployees (los que no tienen el campo, vacío). */
export function toEmployeeProfile(d: Record<string, any>): EmployeeProfile {
  return {
    assumesIessPersonal: d['assumesIessPersonal'] === true,
    disabilityPct: int(d['disabilityPct'], 100),
    familyDependents: int(d['familyDependents'], 30),
    birthDate: str(d['birthDate'], 10),
    sex: pick(d['sex'], ['M', 'F'] as const),
    maritalStatus: pick(d['maritalStatus'], Object.keys(MARITAL_LABELS)),
    bloodType: str(d['bloodType'], 5),
    address: str(d['address'], 200),
    phone: str(d['phone'], 30),
    mobile: str(d['mobile'], 30),
    education: pick(d['education'], Object.keys(EDUCATION_LABELS)),
    title: str(d['title'], 120),
    bankName: str(d['bankName'], 80),
    bankAccountType: pick(d['bankAccountType'], ['savings', 'checking'] as const),
    notes: str(d['notes'], 500),
    collaboratorType: pick(d['collaboratorType'], Object.keys(COLLABORATOR_TYPE_LABELS)),
    description: str(d['description'], 500),
  };
}

/** Lo que va a upsertPayrollEmployee: textos recortados; números enteros (vacío = 0). */
export function profilePayload(v: Record<string, any>): EmployeeProfile {
  return toEmployeeProfile({
    ...v,
    assumesIessPersonal: v['assumesIessPersonal'] === true,
    disabilityPct: Math.trunc(Number(v['disabilityPct'] || 0)),
    familyDependents: Math.trunc(Number(v['familyDependents'] || 0)),
  });
}
