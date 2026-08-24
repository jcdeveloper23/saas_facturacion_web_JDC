/**
 * sri-buyer-id.ts
 *
 * Resolución del código SRI `tipoIdentificacionComprador` (Ficha Técnica de
 * Comprobantes Electrónicos, Tabla 6 — Identificación del comprador).
 */

export const CONSUMIDOR_FINAL_TAX_ID = '9999999999999';

export const TIPO_IDENTIFICACION_COMPRADOR = {
  RUC:                     '04',
  CEDULA:                  '05',
  PASAPORTE:               '06',
  CONSUMIDOR_FINAL:        '07',
  IDENTIFICACION_EXTERIOR: '08',
} as const;

/** Map a free-text/legacy tax id type string to the SRI numeric code. */
export function mapTipoIdentificacion(type: string | undefined): string {
  if (!type) return TIPO_IDENTIFICACION_COMPRADOR.RUC;
  const t = type.trim().toUpperCase();
  if (t === 'RUC' || t === '04') return TIPO_IDENTIFICACION_COMPRADOR.RUC;
  if (t === 'CI' || t === 'CEDULA' || t === '05') return TIPO_IDENTIFICACION_COMPRADOR.CEDULA;
  if (t === 'PASAPORTE' || t === '06') return TIPO_IDENTIFICACION_COMPRADOR.PASAPORTE;
  if (t === 'CONSUMIDOR_FINAL' || t === 'CONSUMIDOR FINAL' || t === '07') return TIPO_IDENTIFICACION_COMPRADOR.CONSUMIDOR_FINAL;
  if (t === 'EXTERIOR' || t === '08') return TIPO_IDENTIFICACION_COMPRADOR.IDENTIFICACION_EXTERIOR;
  return TIPO_IDENTIFICACION_COMPRADOR.RUC;
}

/**
 * Resolves the SRI tipoIdentificacionComprador code.
 *
 * The customer's fixed identification number '9999999999999' is the
 * authoritative Consumidor Final signal per SRI convention — it takes
 * priority over whatever taxIdType text happens to be stored on the
 * document, because that field can drift out of sync with the actual
 * customer record (e.g. a "Consumidor Final" customer accidentally saved
 * with taxIdType='RUC' via the regular customer form instead of the
 * dedicated helper). See src/app/features/invoices/invoice-form.component.ts
 * selectConsumidorFinal()/createConsumidorFinalCustomer() for where '07' is
 * meant to be set at the source — this is the defensive backstop.
 *
 * `explicitCode`, if present, is trusted as-is (already a resolved SRI code
 * coming from an upstream caller that did its own mapping).
 */
export function resolveTipoIdentificacionComprador(
  customerTaxId: string | undefined,
  explicitCode?: string,
  taxIdType?: string,
): string {
  if (customerTaxId?.trim() === CONSUMIDOR_FINAL_TAX_ID) {
    return TIPO_IDENTIFICACION_COMPRADOR.CONSUMIDOR_FINAL;
  }
  if (explicitCode) return explicitCode;
  return mapTipoIdentificacion(taxIdType);
}
