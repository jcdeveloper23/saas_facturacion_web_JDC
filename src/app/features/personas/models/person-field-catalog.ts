import { PersonRole } from './person.interface';

export type FieldSection =
  | 'fiscal'
  | 'contact'
  | 'customer_commercial'
  | 'supplier_commercial'
  | 'employee_hr';

export interface FieldDefinition {
  key: string;
  defaultLabel: string;
  section: FieldSection;
  /** If defined, field only applies when person has this role */
  requiresRole?: PersonRole;
  alwaysVisible: boolean;
  alwaysRequired: boolean;
  defaultVisible: boolean;
  defaultRequired: boolean;
}

/**
 * Master catalog of all configurable fields in the Person form.
 * Stored per company at /companies/{id}/form-config/personas.
 */
export const PERSON_FIELD_CATALOG: FieldDefinition[] = [
  // ── Fiscal (always locked) ────────────────────────────────────────────────
  { key: 'taxIdType',  defaultLabel: 'Tipo de Identificación',   section: 'fiscal', alwaysVisible: true,  alwaysRequired: true,  defaultVisible: true,  defaultRequired: true  },
  { key: 'taxId',      defaultLabel: 'RUC / Cédula / Pasaporte', section: 'fiscal', alwaysVisible: true,  alwaysRequired: true,  defaultVisible: true,  defaultRequired: true  },
  { key: 'name',       defaultLabel: 'Nombre Comercial',         section: 'fiscal', alwaysVisible: true,  alwaysRequired: true,  defaultVisible: true,  defaultRequired: true  },
  { key: 'legalName',  defaultLabel: 'Razón Social',             section: 'fiscal', alwaysVisible: true,  alwaysRequired: true,  defaultVisible: true,  defaultRequired: true  },

  // ── Fiscal (configurable) ─────────────────────────────────────────────────
  { key: 'isCompany',  defaultLabel: 'Es Empresa',               section: 'fiscal', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },

  // ── Contact (configurable) ────────────────────────────────────────────────
  { key: 'contactPerson', defaultLabel: 'Persona de Contacto',  section: 'contact', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'email',         defaultLabel: 'Correo Electrónico',   section: 'contact', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'phone1',        defaultLabel: 'Teléfono Principal',   section: 'contact', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'phone2',        defaultLabel: 'Teléfono Secundario',  section: 'contact', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'web',           defaultLabel: 'Sitio Web',            section: 'contact', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },

  // ── Customer commercial (locked) ──────────────────────────────────────────
  { key: 'customer.paymentTermCode',   defaultLabel: 'Forma de Pago',          section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: true,  alwaysRequired: true,  defaultVisible: true,  defaultRequired: true  },

  // ── Customer commercial (configurable) ────────────────────────────────────
  { key: 'customer.currency',          defaultLabel: 'Divisa',                 section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'customer.vatRegime',         defaultLabel: 'Régimen IVA',            section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'customer.creditLimit',       defaultLabel: 'Límite de Crédito',      section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'customer.discountPct',       defaultLabel: 'Descuento Comercial %',  section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'customer.paymentDays',       defaultLabel: 'Días de Pago',           section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'customer.priceListCode',     defaultLabel: 'Lista de Precios',       section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'customer.agentCode',         defaultLabel: 'Vendedor Asignado',      section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'customer.customerGroupCode', defaultLabel: 'Grupo de Clientes',      section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'customer.documentSeriesCode',defaultLabel: 'Serie de Documento',     section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'customer.accountingCode',    defaultLabel: 'Código Contable',        section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'customer.defaultCostCenterId', defaultLabel: 'Centro de Costo por Defecto', section: 'customer_commercial', requiresRole: 'customer', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },

  // ── Supplier commercial (locked) ──────────────────────────────────────────
  { key: 'supplier.paymentTermCode',   defaultLabel: 'Cond. Pago Compras',     section: 'supplier_commercial', requiresRole: 'supplier', alwaysVisible: true,  alwaysRequired: true,  defaultVisible: true,  defaultRequired: true  },

  // ── Supplier commercial (configurable) ────────────────────────────────────
  { key: 'supplier.currency',          defaultLabel: 'Divisa',                 section: 'supplier_commercial', requiresRole: 'supplier', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'supplier.vatRegime',         defaultLabel: 'Régimen IVA Compras',    section: 'supplier_commercial', requiresRole: 'supplier', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'supplier.vatRetentionPct',   defaultLabel: 'Retención IVA %',        section: 'supplier_commercial', requiresRole: 'supplier', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'supplier.irRetentionPct',    defaultLabel: 'Retención Renta %',      section: 'supplier_commercial', requiresRole: 'supplier', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'supplier.paymentDays',       defaultLabel: 'Días Pago Proveedor',    section: 'supplier_commercial', requiresRole: 'supplier', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'supplier.accountingCode',    defaultLabel: 'Código Contable',        section: 'supplier_commercial', requiresRole: 'supplier', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'supplier.defaultCostCenterId', defaultLabel: 'Centro de Costo por Defecto', section: 'supplier_commercial', requiresRole: 'supplier', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },

  // ── Employee HR (configurable) ────────────────────────────────────────────
  { key: 'employee.iessNumber',   defaultLabel: 'N° Afiliación IESS',  section: 'employee_hr', requiresRole: 'employee', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'employee.position',     defaultLabel: 'Cargo',               section: 'employee_hr', requiresRole: 'employee', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'employee.department',   defaultLabel: 'Departamento',        section: 'employee_hr', requiresRole: 'employee', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'employee.salary',       defaultLabel: 'Salario Base (USD)',  section: 'employee_hr', requiresRole: 'employee', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'employee.hireDate',     defaultLabel: 'Fecha de Ingreso',    section: 'employee_hr', requiresRole: 'employee', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'employee.endDate',      defaultLabel: 'Fecha de Salida',     section: 'employee_hr', requiresRole: 'employee', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'employee.contractType', defaultLabel: 'Tipo de Contrato',    section: 'employee_hr', requiresRole: 'employee', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },

  // ── Notes (common, configurable) ──────────────────────────────────────────
  { key: 'notes', defaultLabel: 'Notas', section: 'fiscal', alwaysVisible: false, alwaysRequired: false, defaultVisible: true, defaultRequired: false },
];

export const PERSON_FIELD_MAP = new Map(
  PERSON_FIELD_CATALOG.map(f => [f.key, f])
);
