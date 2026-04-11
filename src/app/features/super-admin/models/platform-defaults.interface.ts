import { Timestamp } from '@angular/fire/firestore';

// /platform/defaults/sriConfig/data  ← documento único, solo super-admin
// Fuente: Ficha Técnica Comprobantes Electrónicos SRI v2.32, octubre 2025
export interface SriPlatformConfig {

  // ── Versiones de schema XML ─────────────────────────────────────────────────
  facturaVersion:               string;   // '1.0.0'
  notaCreditoVersion:           string;   // '1.0.0'
  notaDebitoVersion:            string;   // '1.0.0'
  comprobanteRetencionVersion:  string;   // '1.0.0' — schema XML retención (SRI v2.32)

  // ── Endpoints WSDL del SRI (Secciones 7.2 y 8.2) ───────────────────────────
  endpoints: {
    testing: {
      receptionUrl:           string;  // RecepcionComprobantesOffline
      authorizationUrl:       string;  // AutorizacionComprobantesOffline
      consultaComprobanteUrl: string;  // ConsultaComprobante (validez)
      consultaFacturaUrl:     string;  // ConsultaFactura (negociable)
    };
    production: {
      receptionUrl:           string;
      authorizationUrl:       string;
      consultaComprobanteUrl: string;
      consultaFacturaUrl:     string;
    };
  };

  // ── Configuración general de emisión ────────────────────────────────────────

  /** TABLA 2: Tipo de emisión — '1' = Normal (único para offline) */
  emissionType: string;

  /** TABLA 4: Códigos de ambiente para clave de acceso */
  environmentCodes: {
    testing:    string;  // '1'
    production: string;  // '2'
  };

  /** Identificación de Consumidor Final (Sección 9.10) */
  consumidorFinalId:           string;  // '9999999999999' (13 nueves)
  consumidorFinalMaxAmountUsd: number;  // 50 — sobre este monto debe identificarse

  // ── Tipos de comprobante (TABLA 3) ──────────────────────────────────────────
  documentTypeCodes: {
    invoice:     string;  // '01' — Factura
    liquidacion: string;  // '03' — Liquidación de Compra de Bienes y Prestación de Servicios
    creditNote:  string;  // '04' — Nota de Crédito
    debitNote:   string;  // '05' — Nota de Débito
    remission:   string;  // '06' — Guía de Remisión
    retention:   string;  // '07' — Comprobante de Retención
  };

  // ── Códigos de tipo de impuesto para el campo <codigo> en XML (TABLA 16) ───
  taxTypeCodes: {
    iva:     string;  // '2'
    ice:     string;  // '3'
    irbpnr:  string;  // '5'
  };

  // ── Tarifas IVA para <codigoPorcentaje> en XML (TABLA 17) ──────────────────
  taxCodes: Array<{
    vatPct:    number;   // porcentaje: 0, 5, 8, 15
    sriCode:   string;   // '0'=0%, '4'=15%, '5'=5%, '6'=No obj, '7'=Exento, '8'=diferenciado
    name:      string;
    isExempt?: boolean;
  }>;

  // ── Retención por tipo de impuesto (TABLA 19) ───────────────────────────────
  retentionTaxCodes: Array<{
    taxName:  string;  // 'RENTA', 'IVA', 'ISD'
    taxLabel: string;  // label legible
    code:     string;  // '1', '2', '6'
  }>;

  // ── Retención IVA — porcentaje → código SRI (TABLA 20) ─────────────────────
  ivaRetentionCodes: Array<{
    pct:         number;  // 0, 10, 20, 30, 50, 70, 100
    code:        string;  // código SRI
    description: string;  // texto explicativo
  }>;

  // ── Códigos ICE (TABLA 18) ──────────────────────────────────────────────────
  iceCodes: Array<{
    code:           string;   // p. ej. '3011'
    description:    string;
    adValoremPct?:  number;   // tarifa ad valorem %
    especificaUsd?: number;   // tarifa específica USD
  }>;

  // ── Formas de pago (TABLA 24) ───────────────────────────────────────────────
  paymentMethodCodes: Array<{
    code: string;
    name: string;
  }>;

  // ── Tipos de identificación del comprador (TABLA 6) ─────────────────────────
  identificationTypes: Array<{
    code:      string;   // '04', '05', '06', '07', '08'
    name:      string;
    isRuc?:    boolean;  // valida 13 dígitos + módulo 11 RUC
    isCedula?: boolean;  // valida 10 dígitos + algoritmo cédula
    isFinal?:  boolean;  // acepta 9999999999999 sin validación
  }>;

  updatedAt?: Timestamp;
  updatedBy?: string;
}

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

// /platform/defaults/smtpConfig/data  ← documento único, solo super-admin
export interface SmtpPlatformConfig {
  host:       string;   // e.g. 'smtp.gmail.com'
  port:       number;   // 587 (TLS) | 465 (SSL) | 25
  secure:     boolean;  // true = SSL (port 465), false = STARTTLS
  user:       string;   // SMTP username / email
  pass:       string;   // SMTP password (stored in Firestore, solo super-admin)
  from:       string;   // Display address: 'Empresa <noreply@empresa.com>'
  isActive:   boolean;  // false = usa fallback a variables de entorno
  updatedAt?: Timestamp;
  updatedBy?: string;
}
