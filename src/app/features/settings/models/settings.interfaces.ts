import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// /companies/{companyId}/configuration/general  ← single document
export interface CompanySettings {
  companyName: string;
  taxId: string;
  fiscalAddress: string;
  city: string;
  province: string;
  zipCode?: string;
  country: string;
  phone: string;
  email: string;
  website?: string;
  logoUrl?: string;
  defaultCurrency: 'USD' | 'EUR';
  vatRate: number;          // 15 (Ecuador 2024)
  fiscalYear: number;
  updatedAt: Timestamp;
  updatedBy: string;
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

// /companies/{companyId}/document-series/{seriesId}
export interface DocumentSeries extends BaseDocument {
  code: string;                     // '001', 'A', 'B'
  name: string;
  description?: string;
  documentType: 'invoice' | 'quote' | 'order';
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
