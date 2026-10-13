/**
 * pos-buyer-check.ts
 *
 * El comprador de una venta del POS, antes de numerar su factura (2026-10-13).
 * Función pura, para probarla sin Firestore.
 */

import { buyerTaxIdProblem } from '../utils/ecuador-tax-id';
import { inferBuyerTaxIdType } from '../utils/sri-id-type';

export interface PosBuyerCheck {
  /** Tipo que se guarda en la factura (el de la venta, o deducido si venía vacío). */
  taxIdType: string;
  /** Mensaje para `invoiceError` de la venta, o null si se puede facturar. */
  problem: string | null;
}

export function posBuyerCheck(taxIdRaw: unknown, taxIdTypeRaw: unknown): PosBuyerCheck {
  const taxId = typeof taxIdRaw === 'string' ? taxIdRaw.trim() : '';
  const rawType = typeof taxIdTypeRaw === 'string' ? taxIdTypeRaw.trim() : '';
  // Antes: `?? 'CI'`, que con '' (cliente por defecto del terminal) no
  // aplicaba y la factura viajaba como RUC aunque fuera una cédula.
  const taxIdType = rawType || inferBuyerTaxIdType(taxId);

  if (!taxId) {
    return {
      taxIdType,
      problem: 'Factura no emitida: la venta no tiene identificación del comprador. '
        + 'Emita la factura desde Facturas con el cliente (o Consumidor final, 9999999999999).',
    };
  }
  const problem = buyerTaxIdProblem(taxId, taxIdType);
  return {
    taxIdType,
    problem: problem
      ? `Factura no emitida: identificación del comprador ${taxId} — ${problem} Corrija el cliente y emita la factura desde Facturas.`
      : null,
  };
}
