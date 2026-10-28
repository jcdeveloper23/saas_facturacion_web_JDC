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
  box?:        string;  // casillero del formulario 103 (solo IR)
  variable?:   boolean; // sin un porcentaje único: se escribe a mano
}

// Catálogo completo de conceptos de retención en la fuente de renta del ATS,
// con los porcentajes vigentes desde el 2026-03-01 (Resolución
// NAC-DGERCGC26-00000009, RO 233, 4.º suplemento, 2026-02-27). La resolución
// trae conceptos y porcentajes; los códigos del ATS y los casilleros del 103
// salen de las tablas publicadas para marzo de 2026.
// ⛔ Es COPIA de Conecta (App_Web_Conectate,
// lib/features/accounting/retentions/retention.dart, `irRetentionCodes`): se
// cambian juntas. Hasta el 2026-10-28 esta lista tenía 22 códigos y varios
// corridos: 309 era «transporte» y 310 «bienes muebles» (el SRI: 309
// publicidad, 310 transporte, 312 bienes muebles), 319 «inmuebles» (es el
// mercantil; inmuebles es 320) y 3030/3140/3430/3370 eran casilleros del 103,
// no códigos del ATS. `rate` es el valor sugerido; el formulario lo deja
// editable.
// ⏳ Sin confirmar con la contadora: 323N / 323O (las tablas publicadas no
// coinciden en cuál es cuál; los dos al 0 %).
export const SRI_IR_RETENTION_CODES: SriRetentionCode[] = [
  { taxCode: '1', taxCodeName: 'IR', pctCode: '303', pctName: 'Honorarios profesionales y demás pagos por servicios relacionados con el título profesional', rate: 10, box: '303' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '303A', pctName: 'Servicios profesionales prestados por sociedades residentes', rate: 5, box: '3030' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '304', pctName: 'Servicios donde predomina el intelecto no relacionados con el título profesional', rate: 10, box: '304' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '304A', pctName: 'Comisiones y demás pagos por servicios donde predomina el intelecto no relacionados con el título profesional', rate: 10, box: '304' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '304B', pctName: 'Pagos a notarios y registradores de la propiedad y mercantil por sus actividades ejercidas como tales', rate: 10, box: '304' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '304C', pctName: 'Pagos a deportistas, entrenadores, árbitros y miembros del cuerpo técnico por sus actividades ejercidas como tales', rate: 10, box: '304' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '304D', pctName: 'Pagos a artistas por sus actividades ejercidas como tales', rate: 10, box: '304' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '304E', pctName: 'Honorarios y demás pagos por servicios de docencia', rate: 10, box: '304' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '307', pctName: 'Servicios donde predomina la mano de obra', rate: 3, box: '307' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '308', pctName: 'Utilización o aprovechamiento de la imagen o renombre (personas naturales, sociedades, «influencers»)', rate: 10, box: '308' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '309', pctName: 'Servicios prestados por medios de comunicación y agencias de publicidad', rate: 3, box: '309' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '310', pctName: 'Servicio de transporte privado de pasajeros o transporte público o privado de carga', rate: 1, box: '310' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '311', pctName: 'Pagos a través de liquidación de compra (nivel cultural o rusticidad)', rate: 3, box: '311' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '312', pctName: 'Transferencia de bienes muebles de naturaleza corporal', rate: 2, box: '312' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '312A', pctName: 'Compras al productor: bienes de origen agrícola, avícola, pecuario, apícola, cunícola, bioacuático, forestal y carnes en estado natural (art. 27.1 LRTI)', rate: 1, box: '3120' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '312C', pctName: 'Compras al comercializador: bienes de origen agrícola, avícola, pecuario, apícola, cunícola, bioacuático, forestal y carnes en estado natural (art. 27.1 LRTI)', rate: 1.75, box: '3121' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '314A', pctName: 'Regalías por franquicias (Código INGENIOS) — pago a personas naturales', rate: 10, box: '314' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '314B', pctName: 'Cánones, derechos de autor, marcas, patentes y similares (Código INGENIOS) — pago a personas naturales', rate: 10, box: '314' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '314C', pctName: 'Regalías por franquicias (Código INGENIOS) — pago a sociedades', rate: 10, box: '314' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '314D', pctName: 'Cánones, derechos de autor, marcas, patentes y similares (Código INGENIOS) — pago a sociedades', rate: 10, box: '314' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '319', pctName: 'Cuotas de arrendamiento mercantil (prestado por sociedades), inclusive la de opción de compra', rate: 2, box: '319' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '320', pctName: 'Arrendamiento de bienes inmuebles', rate: 10, box: '320' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '322', pctName: 'Seguros y reaseguros (primas y cesiones)', rate: 2, box: '322' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323', pctName: 'Rendimientos financieros pagados a personas naturales y sociedades (no a IFIs)', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323A', pctName: 'Rendimientos financieros: depósitos en cuenta corriente', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323B1', pctName: 'Rendimientos financieros: depósitos en cuenta de ahorros de sociedades', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323E', pctName: 'Rendimientos financieros: depósitos a plazo fijo gravados', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323E2', pctName: 'Rendimientos financieros: depósitos a plazo fijo exentos', rate: 0, box: '3230' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323F', pctName: 'Rendimientos financieros: operaciones de reporto (repos)', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323G', pctName: 'Inversiones (captaciones): rendimientos distintos de los pagados a IFIs', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323H', pctName: 'Rendimientos financieros: obligaciones', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323I', pctName: 'Rendimientos financieros: bonos convertibles en acciones', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323M', pctName: 'Rendimientos financieros: inversiones en títulos valores de renta fija gravados', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323N', pctName: 'Rendimientos financieros: inversiones en títulos valores de renta fija exentos', rate: 0, box: '3230' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323O', pctName: 'Intereses y demás rendimientos financieros pagados a bancos y entidades controladas por la Superintendencia de Bancos o de Economía Popular y Solidaria', rate: 0, box: '3230' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323P', pctName: 'Intereses pagados por entidades del sector público a favor de sujetos pasivos', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323Q', pctName: 'Otros intereses y rendimientos financieros gravados', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323R', pctName: 'Otros intereses y rendimientos financieros exentos', rate: 0, box: '3230' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323S', pctName: 'Pagos del BCE y depósitos centralizados de valores, como intermediarios, por cuenta de personas naturales y sociedades', rate: 3, box: '323' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323T', pctName: 'Rendimientos financieros de la deuda pública ecuatoriana', rate: 0, box: '3230' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '323U', pctName: 'Rendimientos de títulos de obligaciones de 360 días o más para proyectos públicos en asociación público-privada', rate: 0, box: '3230' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '324A', pctName: 'Intereses y comisiones en operaciones de crédito entre instituciones del sistema financiero y de la economía popular y solidaria', rate: 2, box: '324' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '324B', pctName: 'Inversiones entre instituciones del sistema financiero y de la economía popular y solidaria', rate: 2, box: '324' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '324C', pctName: 'Pagos del BCE y depósitos centralizados de valores, como intermediarios, por cuenta de otras instituciones del sistema financiero', rate: 2, box: '324' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '325', pctName: 'Anticipo de dividendos', rate: 25 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '325A', pctName: 'Préstamos a accionistas, beneficiarios o partícipes residentes o establecidos en el Ecuador', rate: 25 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '3250', pctName: 'Dividendos exentos (por no llegar a la franja exenta o por beneficio de otras leyes)', rate: 0 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '326', pctName: 'Dividendos distribuidos que correspondan al impuesto a la renta único del art. 27 de la LRTI (12 o 14 %)', rate: 0, variable: true },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '327', pctName: 'Dividendos distribuidos a personas naturales residentes (12 o 14 %)', rate: 0, variable: true },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '328', pctName: 'Dividendos distribuidos a sociedades residentes', rate: 0 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '329', pctName: 'Dividendos distribuidos a fideicomisos residentes', rate: 0 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '331', pctName: 'Dividendos en acciones (capitalización de utilidades)', rate: 0 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '332', pctName: 'Otras compras de bienes y servicios no sujetas a retención (incluye RIMPE negocios populares)', rate: 0, box: '332' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '332B', pctName: 'Compra de bienes inmuebles', rate: 0, box: '332' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '332C', pctName: 'Transporte público de pasajeros', rate: 0, box: '332' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '332D', pctName: 'Pagos en el país por transporte de pasajeros o transporte internacional de carga, a compañías de aviación o marítimas', rate: 0, box: '332' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '332E', pctName: 'Valores entregados por las cooperativas de transporte a sus socios', rate: 0, box: '332' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '332F', pctName: 'Compraventa de divisas distintas al dólar de los Estados Unidos', rate: 0, box: '332' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '332G', pctName: 'Pagos con tarjeta de crédito', rate: 0, box: '332' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '332H', pctName: 'Pago al exterior con tarjeta de crédito reportado por la emisora (solo recap)', rate: 0, box: '332' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '332I', pctName: 'Pago a través de convenio de débito (clientes de IFIs)', rate: 0, box: '332' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '333', pctName: 'Ganancia en la enajenación de derechos representativos de capital que se coticen en bolsa de valores del Ecuador', rate: 10, box: '333' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '334', pctName: 'Contraprestación por la enajenación de derechos representativos de capital no cotizados en bolsa de valores del Ecuador', rate: 2, box: '334' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '335', pctName: 'Loterías, rifas, pronósticos deportivos, apuestas y similares', rate: 15 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '336', pctName: 'Venta de combustibles a comercializadoras (2 por mil)', rate: 0.2 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '337', pctName: 'Venta de combustibles a distribuidores (3 por mil)', rate: 0.3 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '338', pctName: 'Producción y venta local de banano (1 a 2 %)', rate: 0, variable: true },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '340', pctName: 'Impuesto único a la exportación de banano', rate: 3 },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '343', pctName: 'Otras retenciones aplicables al 1 % (incluye RIMPE emprendedores)', rate: 1, box: '343' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '343A', pctName: 'Energía eléctrica', rate: 2, box: '343' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '343B', pctName: 'Actividades de construcción de obra material inmueble, urbanización, lotización o similares', rate: 2, box: '343' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '343C', pctName: 'Recepción de botellas plásticas no retornables de PET', rate: 2, box: '344' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '3440', pctName: 'Otras retenciones aplicables al 3 % (pagos sin un porcentaje específico)', rate: 3, box: '3440' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '344A', pctName: 'Pago local con tarjeta de crédito o débito reportado por la emisora o la entidad financiera', rate: 2, box: '344' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '344B', pctName: 'Adquisición de sustancias minerales dentro del territorio nacional', rate: 2, box: '344' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '346', pctName: 'Otras retenciones aplicables a otros porcentajes', rate: 0, variable: true },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '346A', pctName: 'Otras ganancias de capital distintas de la enajenación de derechos representativos de capital', rate: 0, variable: true },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '346B', pctName: 'Donaciones en dinero — impuesto a las donaciones (art. 36 LRTI, literal d)', rate: 0, variable: true },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '346C', pctName: 'Retención a cargo del propio sujeto pasivo por la producción o comercialización de minerales y otros bienes (0 o 10 %)', rate: 0, variable: true },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '346D', pctName: 'Retención a cargo del propio sujeto pasivo por la comercialización de productos forestales (0 o 10 %)', rate: 0, variable: true },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '350', pctName: 'Otras autorretenciones (art. 92.1 RLRTI, 1,50 o 1,75 %)', rate: 0, variable: true },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '3480', pctName: 'Impuesto a la renta único de los operadores de pronósticos deportivos', rate: 15, box: '3480' },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '3481', pctName: 'Autorretenciones de sociedades grandes contribuyentes', rate: 0, box: '3481', variable: true },
  { taxCode: '1', taxCodeName: 'IR', pctCode: '3482', pctName: 'Comisiones a sociedades nacionales o extranjeras residentes y establecimientos permanentes domiciliados en el país', rate: 5, box: '3140' },
];

/** El concepto de renta por defecto: 312, transferencia de bienes muebles. */
export const DEFAULT_IR_RETENTION_CODE = '312';

// Códigos de retención de IVA de la ficha técnica (tabla «Retención de IVA»).
// Hasta 2026-10-06 eran 3=30 %, 4=70 %, 5=100 % sector público y 1=100 % no
// domiciliados, que no son los del SRI: 1 es el 30 %, 2 el 70 % y 3 el 100 %.
// No había ninguna retención emitida, así que no hay datos que migrar.
export const SRI_IVA_RETENTION_CODES: SriRetentionCode[] = [
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '9',  pctName: 'Retención IVA 10%', rate: 10 },
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '10', pctName: 'Retención IVA 20%', rate: 20 },
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '1',  pctName: 'Retención IVA 30% — bienes', rate: 30 },
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '11', pctName: 'Retención IVA 50%', rate: 50 },
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '2',  pctName: 'Retención IVA 70% — servicios', rate: 70 },
  { taxCode: '2', taxCodeName: 'IVA', pctCode: '3',  pctName: 'Retención IVA 100%', rate: 100 },
];

export const SRI_ISD_RETENTION_CODES: SriRetentionCode[] = [
  { taxCode: '6', taxCodeName: 'ISD', pctCode: '4580', pctName: 'ISD — Impuesto a la Salida de Divisas', rate: 5 },
];

export const ALL_RETENTION_CODES: SriRetentionCode[] = [
  ...SRI_IR_RETENTION_CODES,
  ...SRI_IVA_RETENTION_CODES,
  ...SRI_ISD_RETENTION_CODES,
];

// Sustento tributario (tabla 5 del ATS): core/constants/sri-sustento-codes.ts.

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
  supportDocCodSust: string;      // código de sustento tributario, tabla 5 del ATS (ej: '01' = crédito tributario IVA)

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
