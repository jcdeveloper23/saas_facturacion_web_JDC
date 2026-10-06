// ─── Código de porcentaje del IVA (tabla 17 de la ficha técnica) ──────────────
//
// Una sola tabla para todos los generadores (2026-10-06). Antes cada uno tenía
// su propio respaldo, y varios estaban mal: el 0 % salía con '2' (que es el
// 12 %) y el 15 % con '3' (que es el 14 %). En producción no llegó a pasar
// porque manda la configuración de plataforma (`platform/defaults/sriConfig/
// data.taxCodes`, que está bien) y las tarifas de cada empresa, pero el
// respaldo es lo que se usa en un emulador, en un proyecto nuevo o en el POS
// cuando la línea no trae su código.

/** Tarifa → código. 0 % es «IVA 0 %»; no objeto (6) y exento (7) van aparte. */
export const SRI_VAT_CODES: Readonly<Record<number, string>> = {
  0: '0',
  5: '5',
  8: '8',
  12: '2',
  13: '10',
  14: '3',
  15: '4',
};

export interface SriTaxCodeConfig {
  vatPct: number;
  sriCode: string;
  isExempt?: boolean;
}

/**
 * El código de una tarifa: el de la configuración si lo trae (sin contar los
 * exentos/no objeto, que también son 0 %), si no el de la tabla. Una tarifa
 * desconocida cae en la vigente (15 %, '4') y lo deja en el log: es mejor que
 * inventar un 12 % que ya no existe.
 */
export function sriVatCode(rate: number, taxCodes?: SriTaxCodeConfig[]): string {
  const r = Math.round(Number(rate ?? 0) * 100) / 100;
  const match = taxCodes?.find((tc) => tc.vatPct === r && !tc.isExempt);
  if (match?.sriCode) return match.sriCode;
  const code = SRI_VAT_CODES[r];
  if (code) return code;
  console.warn('[sri-vat-codes] Tarifa de IVA sin código conocido, se usa la del 15 %:', rate);
  return '4';
}

/** Las tarifas por defecto de una empresa nueva, si la plataforma no tiene. */
export const DEFAULT_COMPANY_TAX_RATES = [
  { code: 'VAT15', name: 'IVA 15%', rate: 15, sriCode: '4', isDefault: true },
  { code: 'VAT5', name: 'IVA 5%', rate: 5, sriCode: '5', isDefault: false },
  { code: 'VAT0', name: 'IVA 0%', rate: 0, sriCode: '0', isDefault: false },
  { code: 'NOOBJ', name: 'No objeto de IVA', rate: 0, sriCode: '6', isDefault: false },
  { code: 'EXEMPT', name: 'Exento de IVA', rate: 0, sriCode: '7', isDefault: false },
];
