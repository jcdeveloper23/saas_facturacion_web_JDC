import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// /companies/{companyId}/configuration/general  ← single document
export interface CompanySettings {
  companyName: string;
  taxId: string;
  taxIdType: 'ruc' | 'cedula';   // 'ruc' = 13 dígitos, 'cedula' = 10 dígitos (persona natural)
  fiscalAddress: string;
  city: string;
  province: string;
  zipCode?: string;
  country: string;
  phone: string;
  email: string;
  website?: string;
  logoUrl?: string;
  brandColor?: string;       // hex: '#0d6efd' — color primario de marca
  brandAccentColor?: string; // hex: '#0dcaf0' — color de acento/secundario
  sidebarTheme?: 'dark' | 'brand' | 'light'; // estilo del sidebar
  buttonStyle?: 'square' | 'sharp' | 'rounded' | 'pill'; // estilo de redondeo de botones (square=0px)
  cardRadius?: 'none' | 'sm' | 'md' | 'lg';              // estilo de redondeo de tarjetas (none=0px)
  appTitleSuffix?: string;                   // leyenda en la pestaña del navegador
  showLogoOnPdf?: boolean;    // true = incluir logo en la cabecera de PDFs generados
  pdfFooterMessage?: string; // mensaje de agradecimiento/pie de página en PDFs
  defaultCurrency: 'USD' | 'EUR';
  vatRate: number;          // 15 (Ecuador 2024)
  fiscalYear: number;
  updatedAt: Timestamp;
  updatedBy: string;
  // ── Inventario ────────────────────────────────────────────────────────────
  stock?: {
    defaultWarehouseCode: string;       // almacén por defecto en facturas
    blockSaleOnInsufficient: boolean;   // true = bloquear Emitir si stock < qty
  };
}

// /companies/{companyId}/warehouses/{warehouseId}
export interface Warehouse extends BaseDocument {
  code: string;
  name: string;
  address?: string;
  city?: string;
  isMain: boolean;
  isActive: boolean;
}

export type WarehouseFormData = Pick<Warehouse, 'code' | 'name' | 'address' | 'city' | 'isMain' | 'isActive'>;

// /companies/{companyId}/establishments/{code}
// El id del documento ES el código SRI de 3 dígitos: único por empresa. De aquí
// sale <dirEstablecimiento> de cada comprobante emitido con ese código.
export interface EmissionPoint {
  code: string;                     // '001'
  name: string;
  isActive: boolean;
}

export interface Establishment extends BaseDocument {
  code: string;                     // '001' matriz, '002' sucursal…
  name: string;
  address: string;
  city?: string;
  phone?: string;
  isMain: boolean;
  emissionPoints: EmissionPoint[];
}

export type EstablishmentFormData = Pick<
  Establishment,
  'code' | 'name' | 'address' | 'city' | 'phone' | 'isMain' | 'isActive' | 'emissionPoints'
>;

// /companies/{companyId}/document-series/{seriesId}
export interface DocumentSeries extends BaseDocument {
  code: string;                     // '001', 'A', 'B'
  name: string;
  description?: string;
  documentType: 'invoice' | 'creditNote' | 'debitNote' | 'retention' | 'quote' | 'order' | 'remission';
  establishment: string;            // '001'
  emissionPoint: string;            // '001'
  isActive: boolean;
}

export type DocumentSeriesFormData = Pick<
  DocumentSeries,
  'code' | 'name' | 'description' | 'documentType' | 'establishment' | 'emissionPoint' | 'isActive'
>;

// /companies/{companyId}/payment-terms/{termId}
export interface PaymentTerm extends BaseDocument {
  code: string;
  name: string;
  days: number;             // 0 = cash, 30, 60, 90
  isActive: boolean;
}

export type PaymentTermFormData = Pick<PaymentTerm, 'code' | 'name' | 'days' | 'isActive'>;

// /companies/{companyId}/tax-rates/{taxId}
export interface TaxRate extends BaseDocument {
  code: string;             // VAT15, VAT5, VAT0, EXEMPT
  name: string;
  rate: number;             // 15, 5, 0
  sriCode: string;          // SRI code: '2'=12%, '3'=15%, '0'=0%, '6'=exempt
  isDefault: boolean;
  isActive: boolean;
}

export type TaxRateFormData = Pick<TaxRate, 'code' | 'name' | 'rate' | 'sriCode' | 'isDefault' | 'isActive'>;

// /companies/{companyId}/currencies/{currencyId}
export interface Currency extends BaseDocument {
  code: string;       // USD, EUR, ...
  name: string;       // DÓLARES EE.UU.
  symbol: string;     // $
  buyRate: number;
  sellRate: number;
  isoCode: string;    // 840
  isDefault?: boolean;
  isActive: boolean;
}

export type CurrencyFormData = Pick<Currency, 'code' | 'name' | 'symbol' | 'buyRate' | 'sellRate' | 'isoCode' | 'isDefault' | 'isActive'>;

// /companies/{companyId}/countries/{countryId}
export interface Country extends BaseDocument {
  code2: string;  // EC
  code3: string;  // ECU
  name: string;   // Ecuador
  isActive: boolean;
}

export type CountryFormData = Pick<Country, 'code2' | 'code3' | 'name' | 'isActive'>;

// /companies/{companyId}/configuration/sri  ← documento único por empresa
export interface SriCompanyConfig {
  // Datos tal como deben aparecer en el XML
  razonSocial:              string;
  nombreComercial?:         string;
  direccionMatriz:          string;
  direccionEstablecimiento: string;
  telefono?:                string;
  correo?:                  string;

  // Flags contribuyente para XML
  obligadoContabilidad:  'SI' | 'NO';
  contribuyenteEspecial: string;   // número de resolución o '' si no aplica

  // Datos tributarios adicionales
  agenteRetencion?:     string;          // Número de resolución de agente retenedor (ej: '1234567890')
  tipoContribuyente?:   '01' | '02';    // '01' = persona natural, '02' = sociedad
  regimenMicroempresa?: boolean;         // true si la empresa está en régimen de microempresas
  emailReplyTo?:        string;          // Email reply-to para los correos de comprobantes

  // Campos adicionales libres — bloque <infoAdicional> del XML
  // Soportan templates: ${invoice.field}, ${customer.field}, ${company.field}
  additionalInfoFields: Array<{
    nombre: string;
    valor:  string;
  }>;

  updatedAt?: Timestamp;
  updatedBy?: string;
}
