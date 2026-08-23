import { Timestamp } from '@angular/fire/firestore';
import { SriDocumentStatus } from '../../invoices/models/invoice.interface';

// ─── Status ───────────────────────────────────────────────────────────────────

export type RetentionStatus = 'draft' | 'issued' | 'void';

export const RETENTION_STATUS_LABELS: Record<RetentionStatus, string> = {
  draft: 'Borrador',
  issued: 'Emitida',
  void:   'Anulada',
};

export const RETENTION_STATUS_COLORS: Record<RetentionStatus, string> = {
  draft: 'secondary',
  issued: 'primary',
  void:   'danger',
};

// ─── SRI tax codes for retenciones ───────────────────────────────────────────

export interface SriRetentionCode {
  taxCode:     string;  // '1'=IR, '2'=IVA, '6'=ISD
  taxCodeName: string;
  pctCode:     string;  // '303', '304', '3', '4', etc.
  pctName:     string;
  rate:        number;  // ej: 10.00 para IR honorarios, 30 para IVA 30%
}

export const SRI_IR_RETENTION_CODES: SriRetentionCode[] = [
  { taxCode: '1', taxCodeName: 'IR', pctCode: '303', pctName: 'Honorarios profesionales', rate: 10 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '304', pctName: 'Servicios (predomina intelecto)', rate: 1.75 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '307', pctName: 'Servicios (predomina mano de obra)', rate: 2 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '308', pctName: 'Marcas, patentes, derechos de autor', rate: 5 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '309', pctName: 'Transporte privado de pasajeros', rate: 1 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '310', pctName: 'Transferencia de bienes muebles', rate: 1.75 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '312', pctName: 'Transferencia de bienes inmuebles', rate: 1 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '319', pctName: 'Arrendamiento bienes inmuebles personas naturales', rate: 10 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '322', pctName: 'Seguros y reaseguros', rate: 1 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323', pctName: 'Reaseguros — compañías extranjeras', rate: 2 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '340', pctName: 'Pagos a no domiciliados / no residentes', rate: 22 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '343', pctName: 'Otras retenciones IR', rate: 2.75 },
];

export const SRI_IVA_RETENTION_CODES: SriRetentionCode[] = [
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '3',  pctName: 'Retención IVA 30% — bienes', rate: 30 },
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '4',  pctName: 'Retención IVA 70% — servicios', rate: 70 },
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '5',  pctName: 'Retención IVA 100% — sector público', rate: 100 },
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '9',  pctName: 'Retención IVA 10%', rate: 10 },
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '10', pctName: 'Retención IVA 20%', rate: 20 },
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '1',  pctName: 'Retención IVA 100% — no domiciliados', rate: 100 },
];

export const SRI_ISD_RETENTION_CODES: SriRetentionCode[] = [
  { taxCode: '6', taxCodeName: 'ISD', pctCode: '4580', pctName: 'ISD — Impuesto a la Salida de Divisas', rate: 5 },
];

export const ALL_RETENTION_CODES: SriRetentionCode[] = [
  ...SRI_IR_RETENTION_CODES,
  ...SRI_IVA_RETENTION_CODES,
  ...SRI_ISD_RETENTION_CODES,
];

// ─── Sustento tributario SRI ──────────────────────────────────────────────────

export const SRI_SUSTENTO_CODES = [
  { code: '01', name: 'Compras' },
  { code: '02', name: 'Servicios' },
  { code: '03', name: 'Honorarios Profesionales' },
  { code: '04', name: 'Liquidación de Compras' },
  { code: '05', name: 'Rendimientos Financieros' },
  { code: '06', name: 'Dividendos' },
  { code: '07', name: 'Arriendo de bienes inmuebles' },
  { code: '08', name: 'Comisiones' },
  { code: '09', name: 'Loterías, rifas y similares' },
  { code: '10', name: 'Regalías' },
  { code: '11', name: 'Seguros' },
  { code: '12', name: 'Fletes Internacionales' },
  { code: '20', name: 'Anticipo de dividendos' },
] as const;

// ─── Support document types ────────────────────────────────────────────────────

export const SUPPORT_DOC_TYPES: { code: string; name: string }[] = [
  { code: '01', name: 'Factura de venta' },
  { code: '02', name: 'Nota de débito' },
  { code: '03', name: 'Liquidación de compra' },
  { code: '04', name: 'Nota de crédito' },
  { code: '18', name: 'Comprobante de pago de fondos' },
  { code: '20', name: 'Estado de cuenta bancario' },
  { code: '41', name: 'Comprobante de venta — gastos de viaje' },
  { code: '42', name: 'Comprobante de venta — reembolso de gastos' },
  { code: '44', name: 'Facturas y notas débito del exterior' },
];

// ─── Retention tax line ────────────────────────────────────────────────────────

export interface RetentionTax {
  id:             string;
  taxCode:        string;   // '1'=IR, '2'=IVA, '6'=ISD
  taxCodeName:    string;
  pctCode:        string;   // '303', '4', etc.
  pctName:        string;
  rate:           number;   // ej: 10.00
  taxableBase:    number;   // base imponible
  retainedAmount: number;   // taxableBase * rate / 100
}

// ─── Main Retention document ───────────────────────────────────────────────────
// Stored at: /companies/{companyId}/retentions/{retentionId}

export interface Retention {
  id: string;

  // ── Numbering ───────────────────────────────────────────────────────────────
  seriesCode:          string;   // e.g. "A"
  seriesEstablishment: string;   // "001"
  seriesEmissionPoint: string;   // "001"
  number:              number;
  fullNumber:          string;   // "001-001-000000001"
  fiscalYear:          string;   // "2025"

  // ── Dates ───────────────────────────────────────────────────────────────────
  date:         Timestamp;
  periodoFiscal: string;          // "MM/YYYY" — fiscal period of the retention

  // ── Retained party (sujeto retenido) ────────────────────────────────────────
  supplierId?:        string;
  supplierName:       string;
  supplierTaxId:      string;
  supplierTaxIdType:  string;    // '04'=RUC, '05'=CI, '06'=PASAPORTE

  // ── Support document ────────────────────────────────────────────────────────
  supportDocType:    string;      // '01'=factura, '02'=nota débito, etc.
  supportDocNumber:  string;      // '001-001-000000001'
  supportDocDate:    Timestamp;
  supportDocAuth?:   string;      // authorization number of support doc
  supportDocTotal:   number;      // importeTotal del doc sustento
  supportDocCodSust: string;      // código de sustento tributario SRI (ej: '01'=Compras)

  // ── Retention taxes ─────────────────────────────────────────────────────────
  taxes:         RetentionTax[];
  totalRetained: number;

  // ── Status ──────────────────────────────────────────────────────────────────
  status:    RetentionStatus;
  isVoid:    boolean;
  voidedAt?: Timestamp;

  // ── Notes & audit ───────────────────────────────────────────────────────────
  notes?:    string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string;

  // ── SRI Electronic Document ─────────────────────────────────────────────────
  sriStatus?:          SriDocumentStatus;
  accessKey?:          string;
  codigoNumerico?:     string;
  authorizationNumber?: string;
  authorizedAt?:       Timestamp;
  sriError?:           string;
  xmlUrl?:             string;
  pdfUrl?:             string;

  // ── Contabilidad (generado por Cloud Function) ──────────────────────────────
  accountingEntryId?: string;  // id del asiento en journal_entries, si ya se generó
  reversalEntryId?:   string;  // id del asiento de reversa, si el documento fue anulado
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildRetentionFullNumber(
  establishment: string,
  emissionPoint: string,
  number: number
): string {
  return `${establishment.padStart(3, '0')}-${emissionPoint.padStart(3, '0')}-${String(number).padStart(9, '0')}`;
}

export function calcRetentionTax(base: number, rate: number): number {
  return Math.round(base * rate) / 100;
}

export function findRetentionCode(pctCode: string): SriRetentionCode | undefined {
  return ALL_RETENTION_CODES.find(c => c.pctCode === pctCode);
}
