/**
 * sri-id-type.ts
 *
 * El tipo de identificación llega escrito de muchas formas según quién creó el
 * documento (2026-10-13):
 *
 *   · Conecta: el código del SRI ('04', '05', '06', '08') en retenciones; 'RUC',
 *     'CI', 'PASAPORTE', 'EXTERIOR' en compras y personas.
 *   · Web de FacturaEc: '04'…'08' en el formulario de retención; 'RUC', 'CI',
 *     'PASAPORTE', 'EXTERIOR' en personas; 'ruc', 'cedula', 'passport' en
 *     compras importadas y datos de prueba.
 *   · POS: el del cliente elegido, o '' con el cliente por defecto del terminal.
 *
 * Aquí se resuelve todo eso al código de la Tabla 6 del SRI, y se valida la
 * identificación del SUJETO RETENIDO con las mismas reglas que la del
 * comprador (`ecuador-tax-id.ts`, que no se toca: así esta pieza no obliga a
 * redesplegar createAndEmitInvoice).
 */

import { buyerTaxIdProblem } from './ecuador-tax-id';
import { CONSUMIDOR_FINAL_TAX_ID } from './sri-buyer-id';

export type SriIdCode = '04' | '05' | '06' | '07' | '08';

const ALIASES: Record<string, SriIdCode> = {
  '04': '04', '4': '04', 'RUC': '04',
  '05': '05', '5': '05', 'CI': '05', 'CEDULA': '05', 'CÉDULA': '05',
  '06': '06', '6': '06', 'PASAPORTE': '06', 'PASSPORT': '06',
  '07': '07', '7': '07', 'CONSUMIDOR_FINAL': '07', 'CONSUMIDOR FINAL': '07', 'CF': '07',
  '08': '08', '8': '08', 'EXTERIOR': '08', 'IDENTIFICACION_EXTERIOR': '08', 'FOREIGN': '08',
};

/**
 * Código del SRI a partir de lo que diga el documento.
 *
 * Vacío: se deduce de la identificación (9999999999999 → 07, 13 dígitos → 04,
 * 10 dígitos → 05); si no se puede, '04', que es lo que se mandaba antes.
 * Un texto que no se reconoce devuelve null: mejor decirlo que adivinar.
 */
export function normalizeSriIdType(rawType: string | null | undefined, taxId?: string | null): SriIdCode | null {
  const t = (rawType ?? '').trim().toUpperCase();
  if (t) return ALIASES[t] ?? null;
  return inferSriIdType(taxId);
}

/** Solo por la forma de la identificación; '04' si no hay pista. */
export function inferSriIdType(taxId: string | null | undefined): SriIdCode {
  const v = (taxId ?? '').trim();
  if (v === CONSUMIDOR_FINAL_TAX_ID) return '07';
  if (/^\d{10}$/.test(v)) return '05';
  return '04';
}

/**
 * Texto de tipo para guardar en una factura cuyo tipo vino vacío (POS con el
 * cliente por defecto del terminal). Es el texto que entiende
 * `mapTipoIdentificacion`, para que la factura viaje con lo que se validó.
 */
export function inferBuyerTaxIdType(taxId: string | null | undefined): 'RUC' | 'CI' | 'CONSUMIDOR_FINAL' {
  const code = inferSriIdType(taxId);
  if (code === '07') return 'CONSUMIDOR_FINAL';
  if (code === '05') return 'CI';
  return 'RUC';
}

export interface SubjectIdCheck {
  /** Código que va al XML (`tipoIdentificacionSujetoRetenido`), o null si el tipo no se reconoce. */
  code: SriIdCode | null;
  /** Qué está mal, en castellano, o null si está bien. */
  problem: string | null;
}

/**
 * La identificación del proveedor al que se le retiene.
 * Mismas reglas que la del comprador (provincia 30, tercer dígito 6,
 * sociedad y pública solo por forma, pasaporte/exterior hasta 20), y además:
 * no hay retención a consumidor final.
 */
export function retainedSubjectIdCheck(taxIdRaw: string | null | undefined, rawType: string | null | undefined): SubjectIdCheck {
  const taxId = (taxIdRaw ?? '').trim();
  const code = normalizeSriIdType(rawType, taxId);

  if (!taxId) return { code, problem: 'Falta la identificación del proveedor (sujeto retenido).' };
  if (code === null) {
    return {
      code,
      problem: `El tipo de identificación del proveedor («${rawType}») no se reconoce: use RUC, cédula, pasaporte o identificación del exterior.`,
    };
  }
  if (code === '07' || taxId === CONSUMIDOR_FINAL_TAX_ID) {
    return { code, problem: 'Una retención no se emite a consumidor final: el proveedor necesita su RUC, cédula o pasaporte.' };
  }
  const problem = buyerTaxIdProblem(taxId, code);
  return { code, problem: problem ? `Identificación del proveedor ${taxId}: ${problem}` : null };
}
