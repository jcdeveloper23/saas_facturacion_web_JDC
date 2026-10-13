/**
 * invoice-buyer-check.ts
 *
 * El comprador de una factura o nota de crédito, antes de que `onInvoiceEmit`
 * genere su XML (2026-10-13). Función pura, para probarla sin Firestore.
 *
 * Por qué: createAndEmitInvoice (Conecta) ya valida la identificación antes de
 * numerar, pero las facturas creadas por la web de FacturaEc o por el POS del
 * navegador entraban directo al pipeline. La factura 1860 de Weconnect Corp.
 * salió con un «RUC» de 14 dígitos y el SRI la dejó NO AUTORIZADA
 * (identificador 69): esa clave ya no se reenvía y se pierde el número. Aquí
 * se frena antes de generar el XML: queda 'invalid_data' y, como el SRI nunca
 * la vio, se corrige el comprador y se reenvía con el MISMO número.
 *
 * Se valida exactamente lo que irá en el XML: el tipo se resuelve con
 * `resolveTipoIdentificacionComprador`, la misma función que usan
 * generate-invoice-xml.ts y generate-credit-note-xml.ts. Así una
 * identificación válida sigue su camino igual que antes (un tipo de texto
 * desconocido viaja como RUC y se valida como RUC).
 */

import { buyerTaxIdProblem } from '../utils/ecuador-tax-id';
import { resolveTipoIdentificacionComprador, TIPO_IDENTIFICACION_COMPRADOR } from '../utils/sri-buyer-id';
import { normalizeSriIdType } from '../utils/sri-id-type';

export const SRI_INVALID_DATA = 'invalid_data';

/**
 * ¿Hay que correr el pipeline con este documento? La misma condición que
 * tenía el trigger: emitido y sin estado del SRI. Las importadas y las ya
 * autorizadas llegan con sriStatus y se saltan; 'invalid_data' también, hasta
 * que alguien lo borre al corregir el comprador.
 */
export function shouldProcessInvoice(after: Record<string, any> | null | undefined): boolean {
  if (!after) return false;
  if (after['status'] !== 'issued') return false;
  if (after['sriStatus']) return false;
  // Defensa: una importada nunca va al SRI, aunque alguien le borre el estado.
  if (after['imported'] === true) return false;
  return true;
}

/** Motivo para `sriError` (sin prefijo: la pantalla antepone «No se envió al SRI:»), o null si está bien. */
export function invoiceBuyerProblem(doc: Record<string, any>): string | null {
  const isCreditNote = doc['isCreditNote'] === true || doc['documentType'] === 'creditNote';
  const quien = isCreditNote ? 'Identificación del comprador de la nota de crédito' : 'Identificación del comprador';

  const taxId = typeof doc['customerTaxId'] === 'string' ? doc['customerTaxId'].trim() : '';
  if (!taxId) return `${quien}: falta la identificación.`;

  const explicitCode = typeof doc['customerIdentificationType'] === 'string'
    ? doc['customerIdentificationType'].trim() : '';
  const textType = typeof doc['customerTaxIdType'] === 'string' ? doc['customerTaxIdType'].trim() : '';

  // El XML escribe `customerIdentificationType` tal cual si viene: tiene que
  // ser un código de la Tabla 6 o el SRI lo rechaza por esquema.
  if (explicitCode && !/^0[4-8]$/.test(explicitCode)) {
    return `${quien} ${taxId}: el código de tipo «${explicitCode}» no es de la Tabla 6 del SRI (04 RUC, 05 cédula, 06 pasaporte, 07 consumidor final, 08 exterior).`;
  }

  const code = resolveTipoIdentificacionComprador(taxId, explicitCode || undefined, textType || undefined);
  const problem = buyerTaxIdProblem(taxId, code);
  if (!problem) return null;

  // Tipo vacío con forma de cédula: viaja como RUC (lo de siempre); se dice
  // por qué, para que se corrija el tipo y no la cédula.
  let pista = '';
  if (!explicitCode && !textType && code === TIPO_IDENTIFICACION_COMPRADOR.RUC
      && normalizeSriIdType('', taxId) === '05') {
    pista = ' El tipo de identificación está vacío y se envía como RUC: si es una cédula, elija el tipo «Cédula».';
  }
  return `${quien} ${taxId}: ${problem}${pista}`;
}
