export type FieldSection = 'fiscal' | 'contact' | 'commercial';

export interface FieldDefinition {
  key: string;
  defaultLabel: string;
  section: FieldSection;
  /** If true, the field is always shown and cannot be hidden */
  alwaysVisible: boolean;
  /** If true, the field is always required and cannot be made optional */
  alwaysRequired: boolean;
  /** Default visible state when no config exists */
  defaultVisible: boolean;
  /** Default required state when no config exists */
  defaultRequired: boolean;
}

/**
 * Master catalog of all configurable fields in the Customer form.
 * Mirrors FacturaScripts fs_vars `nuevocli_*` pattern but structured
 * per entity, per company, stored at /companies/{id}/form-config/customers.
 */
export const CUSTOMER_FIELD_CATALOG: FieldDefinition[] = [
  // ── Fiscal section (locked) ──────────────────────────────────────────────
  { key: 'taxIdType',  defaultLabel: 'Tipo de Identificación', section: 'fiscal',     alwaysVisible: true,  alwaysRequired: true,  defaultVisible: true,  defaultRequired: true  },
  { key: 'taxId',      defaultLabel: 'RUC / Cédula / Pasaporte', section: 'fiscal',   alwaysVisible: true,  alwaysRequired: true,  defaultVisible: true,  defaultRequired: true  },
  { key: 'name',       defaultLabel: 'Nombre Comercial',        section: 'fiscal',    alwaysVisible: true,  alwaysRequired: true,  defaultVisible: true,  defaultRequired: true  },
  { key: 'legalName',  defaultLabel: 'Razón Social',            section: 'fiscal',    alwaysVisible: true,  alwaysRequired: true,  defaultVisible: true,  defaultRequired: true  },

  // ── Fiscal section (configurable) ────────────────────────────────────────
  { key: 'isCompany',  defaultLabel: 'Es Empresa',              section: 'fiscal',    alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'vatRegime',  defaultLabel: 'Régimen IVA',             section: 'fiscal',    alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },

  // ── Contact section (configurable) ───────────────────────────────────────
  { key: 'contactPerson', defaultLabel: 'Persona de Contacto', section: 'contact',   alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'email',         defaultLabel: 'Correo Electrónico',  section: 'contact',   alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'phone1',        defaultLabel: 'Teléfono Principal',  section: 'contact',   alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'phone2',        defaultLabel: 'Teléfono Secundario', section: 'contact',   alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
  { key: 'web',           defaultLabel: 'Sitio Web',           section: 'contact',   alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },

  // ── Commercial section (locked) ───────────────────────────────────────────
  { key: 'paymentTermCode', defaultLabel: 'Forma de Pago',     section: 'commercial', alwaysVisible: true,  alwaysRequired: true,  defaultVisible: true,  defaultRequired: true  },

  // ── Commercial section (configurable) ─────────────────────────────────────
  { key: 'paymentDays',  defaultLabel: 'Días de Pago',         section: 'commercial', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'creditLimit',  defaultLabel: 'Límite de Crédito',    section: 'commercial', alwaysVisible: false, alwaysRequired: false, defaultVisible: false, defaultRequired: false },
  { key: 'notes',        defaultLabel: 'Notas',                section: 'commercial', alwaysVisible: false, alwaysRequired: false, defaultVisible: true,  defaultRequired: false },
];

export const CUSTOMER_FIELD_MAP = new Map(
  CUSTOMER_FIELD_CATALOG.map(f => [f.key, f])
);
