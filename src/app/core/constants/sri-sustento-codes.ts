// ─── Código de sustento tributario (tabla 5 de la ficha técnica del ATS) ──────
//
// El catálogo ÚNICO del front (2026-10-08): compras, retenciones y ATS lo leen
// de aquí. Es copia de functions/src/utils/sri-sustento-codes.ts (el servidor
// no comparte código con el front); si cambia uno, cambiar el otro.
//
// Antes decía «01 Compras, 02 Servicios, 03 Honorarios…»: conceptos de
// retención de renta, no la tabla 5. El código viaja tal cual al <codSustento>
// de la retención y del ATS.
//
// Fuente: docs/Ficha-Tecnica-Transaccional-Simplificado-ATS-2025.pdf,
// «Tabla 5: SUSTENTO DEL COMPROBANTE» (p. 81) y la aplicación de cada código
// (pp. 11-12). Textos copiados de la ficha.

export interface SriSustentoCode {
  code: string;
  name: string;
  /** El IVA pagado es crédito tributario (la ficha: «con derecho a crédito tributario»). */
  givesVatCredit: boolean;
  /** Vigencia según la tabla 5 (dd/mm/aaaa → aaaa-mm-dd). */
  validFrom: string;
  validTo?: string;
}

export const SRI_SUSTENTO_CODES: readonly SriSustentoCode[] = [
  { code: '01', name: 'Crédito Tributario para declaración de IVA (servicios y bienes distintos de inventarios y activos fijos)', givesVatCredit: true, validFrom: '2000-01-01' },
  { code: '02', name: 'Costo o Gasto para declaración de IR (servicios y bienes distintos de inventarios y activos fijos)', givesVatCredit: false, validFrom: '2000-01-01' },
  { code: '03', name: 'Activo Fijo - Crédito Tributario para declaración de IVA', givesVatCredit: true, validFrom: '2000-01-01' },
  { code: '04', name: 'Activo Fijo - Costo o Gasto para declaración de IR', givesVatCredit: false, validFrom: '2000-01-01' },
  { code: '05', name: 'Liquidación Gastos de Viaje, hospedaje y alimentación Gastos IR (a nombre de empleados y no de la empresa)', givesVatCredit: false, validFrom: '2000-01-01' },
  { code: '06', name: 'Inventario - Crédito Tributario para declaración de IVA', givesVatCredit: true, validFrom: '2000-01-01' },
  { code: '07', name: 'Inventario - Costo o Gasto para declaración de IR', givesVatCredit: false, validFrom: '2000-01-01' },
  { code: '08', name: 'Valor pagado para solicitar Reembolso de Gasto (intermediario)', givesVatCredit: false, validFrom: '2000-01-01' },
  { code: '09', name: 'Reembolso por Siniestros', givesVatCredit: false, validFrom: '2000-01-01' },
  { code: '10', name: 'Distribución de Dividendos, Beneficios o Utilidades', givesVatCredit: false, validFrom: '2000-01-01' },
  { code: '11', name: 'Convenios de débito o recaudación para IFI´s', givesVatCredit: false, validFrom: '2015-03-01' },
  { code: '12', name: 'Impuestos y retenciones presuntivos', givesVatCredit: false, validFrom: '2015-03-01' },
  { code: '13', name: 'Valores reconocidos por entidades del sector público a favor de sujetos pasivos', givesVatCredit: false, validFrom: '2015-03-01' },
  { code: '14', name: 'Valores facturados por socios a operadoras de transporte (que no constituyen gasto de dicha operadora)', givesVatCredit: false, validFrom: '2018-01-01' },
  { code: '15', name: 'Pagos efectuados por consumos propios y de terceros de servicios digitales', givesVatCredit: false, validFrom: '2020-06-01' },
  { code: '00', name: 'Casos especiales cuyo sustento no aplica en las opciones anteriores', givesVatCredit: false, validFrom: '2000-01-01', validTo: '2015-02-28' },
];

/** El código por defecto de una compra o retención nueva. */
export const DEFAULT_SRI_SUSTENTO_CODE = '01';

/** Los que se pueden elegir hoy (el 00 dejó de valer el 28/02/2015). */
export const SRI_SUSTENTO_CODES_VIGENTES: readonly SriSustentoCode[] =
  SRI_SUSTENTO_CODES.filter((c) => !c.validTo);

/** ¿El IVA de un comprobante con este sustento es crédito tributario? */
export function givesVatCredit(code: string | null | undefined): boolean {
  return SRI_SUSTENTO_CODES.find((c) => c.code === code)?.givesVatCredit ?? false;
}

export function sriSustentoName(code: string | null | undefined): string {
  return SRI_SUSTENTO_CODES.find((c) => c.code === code)?.name ?? '';
}
