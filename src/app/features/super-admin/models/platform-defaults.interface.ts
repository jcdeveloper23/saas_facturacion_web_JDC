export interface PlatformConfig {
  country: string;
  defaultCurrency: string;
  defaultVatRate: number;
}

export interface DefaultTaxRate {
  id: string;
  code: string;
  name: string;
  rate: number;
  sriCode: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface DefaultPaymentTerm {
  id: string;
  code: string;
  name: string;
  days: number;
  isActive: boolean;
}

export interface DefaultDocumentSeries {
  id: string;
  code: string;
  name: string;
  documentType: string;
  isActive: boolean;
}

export interface DefaultWarehouse {
  id: string;
  code: string;
  name: string;
  isMain: boolean;
  isActive: boolean;
}

export interface DefaultCurrency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  buyRate: number;
  sellRate: number;
  isoCode: string;
  isActive: boolean;
}

export interface DefaultCountry {
  id: string;
  code2: string;
  code3: string;
  name: string;
  isActive: boolean;
}
