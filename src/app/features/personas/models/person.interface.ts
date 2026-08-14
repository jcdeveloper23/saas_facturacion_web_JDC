import { Timestamp } from '@angular/fire/firestore';

// ─── Enums & Types ───────────────────────────────────────────────────────────

export type TaxIdType    = 'RUC' | 'CI' | 'PASAPORTE' | 'EXTERIOR';
export type VatRegime    = 'General' | 'Especial' | 'Exportador' | 'No sujeto';
export type PersonRole   = 'customer' | 'supplier' | 'employee' | 'contact' | 'other' | 'student' | 'teacher';
export type ContractType = 'indefinido' | 'plazo_fijo' | 'honorarios' | 'obra_cierta';

export const ROLE_LABELS: Record<PersonRole, string> = {
  customer: 'Cliente',
  supplier: 'Proveedor',
  employee: 'Empleado',
  contact:  'Contacto',
  other:    'Otro',
  student:  'Estudiante',
  teacher:  'Profesor',
};

export const ROLE_PLURAL_LABELS: Record<PersonRole, string> = {
  customer: 'Clientes',
  supplier: 'Proveedores',
  employee: 'Empleados',
  contact:  'Contactos',
  other:    'Otros',
  student:  'Estudiantes',
  teacher:  'Profesores',
};

export const ROLE_COLORS: Record<PersonRole, string> = {
  customer: 'info',
  supplier: 'warning',
  employee: 'success',
  contact:  'secondary',
  other:    'dark',
  student:  'primary',
  teacher:  'success',
};

/** Roles base del sistema (sin extensiones de paquetes). */
export const BASE_ROLES: PersonRole[] = ['customer', 'supplier', 'employee', 'contact', 'other'];

/**
 * @deprecated Usa PersonaExtensionsService.allAvailableRoles() para obtener
 * la lista completa incluyendo roles de paquetes activos (ej. student, teacher).
 * ALL_ROLES se mantiene por compatibilidad con código existente.
 */
export const ALL_ROLES: PersonRole[] = BASE_ROLES;

// ─── Shared embedded sub-models ─────────────────────────────────────────────

export interface PersonAddress {
  id: string;
  label: string;
  country: string;
  province: string;
  city: string;
  address: string;
  postalCode?: string;
  isShipping: boolean;
  isBilling: boolean;
}

export interface PersonBankAccount {
  id: string;
  label: string;
  bank?: string;
  branch?: string;
  iban?: string;
  swift?: string;
  isPrimary: boolean;
  mandateDate?: string;
}

// ─── Role-specific data objects ─────────────────────────────────────────────

export interface CustomerData {
  code: string;               // codcliente: "000001" (independent sequence)
  currency: string;           // coddivisa: "USD"
  paymentTermCode: string;    // codpago
  paymentDays?: number;
  vatRegime: VatRegime;
  creditLimit?: number;       // creditoMax
  discountPct?: number;       // dtopor — descuento comercial general %
  priceListCode?: string;     // codtarifa
  agentCode?: string;         // codagente — vendedor asignado
  customerGroupCode?: string; // codgrupo — grupo de clientes
  documentSeriesCode?: string;// codserie — serie de documento por defecto
  accountingCode?: string;    // codsubcuenta — código contable
  vatIncluded?: boolean;      // ivaincluido — los precios ya incluyen IVA para este cliente
  isDefault?: boolean;        // cliente cargado automáticamente al crear nueva factura
}

export interface SupplierData {
  code: string;               // codproveedor: independent sequence
  currency: string;           // coddivisa
  paymentTermCode: string;    // codpago
  paymentDays?: number;
  vatRegime: VatRegime;
  vatRetentionPct?: number;   // porRetencionIVA — % retención IVA (ej: 30, 70, 100)
  irRetentionPct?: number;    // porRetencionIR  — % retención Renta (ej: 1, 2, 8, 10)
  purchaseAccount?: string;   // cuenta de compras (legacy)
  accountingCode?: string;    // codsubcuenta — código contable
}

export interface EmployeeData {
  code: string;             // codemp: independent sequence
  iessNumber?: string;
  position?: string;
  department?: string;
  salary?: number;
  hireDate?: string;        // ISO date string
  endDate?: string;
  contractType?: ContractType;
}

// ── Extension role data (pkg_school_bar) ─────────────────────────────────────
// Presentes solo cuando el tenant tiene pkg_school_bar activo y la persona
// tiene el rol correspondiente. Vinculan la persona con el módulo escolar.

export interface StudentPersonaData {
  code: string;            // código de estudiante (secuencia independiente por empresa)
  gradeId?: string;        // ref a /companies/{id}/school_grades/{gradeId}
  gradeName?: string;      // denormalizado para lectura rápida
  section?: string;        // 'A', 'B', 'C', 'Única'
  allergenIds?: string[];  // IDs de /companies/{id}/school_allergens seleccionados
}

export interface TeacherPersonaData {
  code: string;              // código de profesor
  gradeId?: string;          // grado principal asignado
  gradeName?: string;
  specialization?: string;   // materia o área principal
}

// ─── Main Person document ─────────────────────────────────────────────────────
// Stored at: /companies/{companyId}/personas/{personId}

export interface Person {
  id: string;

  // ── Roles ──────────────────────────────────────────────────────────────────
  roles: PersonRole[];

  // ── Common identification ───────────────────────────────────────────────────
  taxId: string;
  taxIdType: TaxIdType;
  isCompany: boolean;

  // ── Common names ────────────────────────────────────────────────────────────
  name: string;
  legalName: string;
  contactPerson?: string;

  // ── Common contact ──────────────────────────────────────────────────────────
  email?: string;
  phone1?: string;
  phone2?: string;
  web?: string;

  // ── Role-specific data (present only when role is active) ───────────────────
  customerData?: CustomerData;
  supplierData?: SupplierData;
  employeeData?: EmployeeData;
  // Extension roles (pkg_school_bar)
  studentData?: StudentPersonaData;
  teacherData?: TeacherPersonaData;

  // ── Embedded collections (shared across roles) ──────────────────────────────
  addresses: PersonAddress[];
  bankAccounts: PersonBankAccount[];

  // ── Status & audit ──────────────────────────────────────────────────────────
  isActive: boolean;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deactivatedAt?: Timestamp;
}

// ─── Convenience helpers ─────────────────────────────────────────────────────

export function personHasRole(p: Person, role: PersonRole): boolean {
  return p.roles.includes(role);
}

export function getPersonCode(p: Person, preferRole?: PersonRole | null): string {
  if (preferRole === 'customer') return p.customerData?.code ?? '—';
  if (preferRole === 'supplier') return p.supplierData?.code ?? '—';
  if (preferRole === 'employee') return p.employeeData?.code ?? '—';
  if (preferRole === 'student')  return p.studentData?.code  ?? '—';
  if (preferRole === 'teacher')  return p.teacherData?.code  ?? '—';
  return p.customerData?.code
      ?? p.supplierData?.code
      ?? p.employeeData?.code
      ?? p.studentData?.code
      ?? p.teacherData?.code
      ?? '—';
}
