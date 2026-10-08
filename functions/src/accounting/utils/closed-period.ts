// ─── Ejercicio cerrado: no se anula (2026-10-08) ──────────────────────────────
//
// Decisión del usuario: un documento cuyo ejercicio contable ya está cerrado no
// se anula; se corrige con una nota de crédito o un asiento en el ejercicio
// abierto. Las reglas lo impiden desde el cliente; generate-reversal-entry.ts
// lo vuelve a comprobar por si la anulación llega por otra vía (Admin SDK,
// scripts, reglas viejas): sin esto crearía una reversa dentro de un ejercicio
// cerrado y el cierre y la apertura del año siguiente dejarían de cuadrar.

export interface PeriodLike {
  status?: string;
  year?:   number | string;
}

/**
 * Si el ejercicio está cerrado, el mensaje que se deja en el documento
 * (`reversalError`); si no (abierto, bloqueado o inexistente), null.
 */
export function closedPeriodReversalError(
  period: PeriodLike | null | undefined,
  fallbackYear?: number | string,
): string | null {
  if (!period || period.status !== 'closed') return null;
  const year = period.year ?? fallbackYear;
  const nombre = year !== undefined && year !== null && `${year}` !== '' ? `El ejercicio ${year}` : 'El ejercicio';
  return `${nombre} está cerrado: no se generó la reversa del asiento. ` +
    'Corrige con una nota de crédito o un asiento en el ejercicio abierto.';
}
