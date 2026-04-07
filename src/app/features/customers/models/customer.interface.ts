import { Timestamp } from '@angular/fire/firestore';

// ─── Embedded sub-models ────────────────────────────────────────────────────

export interface CustomerAddress {
  id: string;               // client-generated UUID
  label: string;            // descripcion: "Principal", "Sucursal", etc.
  country: string;          // codpais: "ECU"
  province: string;         // provincia
  city: string;             // ciudad
  address: string;          // direccion
  postalCode?: string;      // codpostal
  isShipping: boolean;      // domenvio
  isBilling: boolean;       // domfacturacion
}

export interface CustomerBankAccount {
  id: string;               // client-generated UUID
  label: string;            // descripcion
  bank?: string;            // entidad
  branch?: string;          // agencia
  iban?: string;            // iban
  swift?: string;           // swift
  isPrimary: boolean;       // principal
  mandateDate?: string;     // fmandato (ISO date string)
}

// ─── Main Customer document ─────────────────────────────────────────────────
// Stored at: /companies/{companyId}/customers/{customerId}

export type TaxIdType = 'RUC' | 'CI' | 'PASAPORTE' | 'EXTERIOR';
export type VatRegime = 'General' | 'Especial' | 'Exportador' | 'No sujeto';

export interface Customer {
  id: string;

  // ── Identification ──────────────────────────────────────────────────────
  code: string;                 // codcliente: "000001" (auto-incremented, 6-pad)
  taxId: string;                // cifnif: RUC, Cédula, Pasaporte
  taxIdType: TaxIdType;         // tipoidfiscal derived
  isCompany: boolean;           // personafisica="0" → isCompany=true

  // ── Names ───────────────────────────────────────────────────────────────
  name: string;                 // nombre: commercial / short name
  legalName: string;            // razonsocial: legal name for SRI invoices
  contactPerson?: string;       // contacto

  // ── Contact ─────────────────────────────────────────────────────────────
  email?: string;
  phone1?: string;              // telefono1
  phone2?: string;              // telefono2
  web?: string;

  // ── Commercial config ────────────────────────────────────────────────────
  currency: string;             // coddivisa: "USD"
  paymentTermCode: string;      // codpago: "CONT"
  paymentDays?: number;         // diaspago
  vatRegime: VatRegime;         // regimeniva
  creditLimit?: number;         // riesgomax
  priceListCode?: string;       // codtarifa

  // ── Embedded collections ─────────────────────────────────────────────────
  addresses: CustomerAddress[];
  bankAccounts: CustomerBankAccount[];

  // ── Status ───────────────────────────────────────────────────────────────
  isActive: boolean;            // debaja="0" → isActive=true
  notes?: string;               // observaciones

  // ── Audit ────────────────────────────────────────────────────────────────
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deactivatedAt?: Timestamp;    // fechabaja
}

export type CustomerInput = Omit<Customer, 'id' | 'code' | 'createdAt' | 'updatedAt'>;
