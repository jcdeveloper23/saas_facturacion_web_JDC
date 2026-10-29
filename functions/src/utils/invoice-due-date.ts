/**
 * invoice-due-date.ts — plazo de pago de la factura (2026-10-29).
 *
 * Antes `createAndEmitInvoice` guardaba siempre `dueDate` = fecha de la
 * factura: toda factura vencía el día que se emitía y la cartera la pasaba a
 * vencida al día siguiente. Ahora el vencimiento sale del plazo más largo de
 * sus formas de pago (`paymentMethods[].deadline` + `timeUnit`), el mismo que
 * va en `<pagos><plazo>` del XML. Sin plazo, sigue siendo de contado.
 */

/** Tope del plazo: diez años en días. */
export const MAX_PAYMENT_DEADLINE_DAYS = 3650;

const DAYS_PER_UNIT: Record<string, number> = {
  dias: 1,
  semanas: 7,
  meses: 30,
  anios: 365,
  anos: 365, // «años» sin la tilde de la ñ
};

/** Unidad del SRI normalizada (minúsculas, sin tildes). */
export function normalizeTimeUnit(unit: unknown): string {
  return `${unit ?? 'dias'}`.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') || 'dias';
}

/** Mensaje de error del plazo, o null si está bien. */
export function paymentDeadlineProblem(deadline: unknown, timeUnit: unknown): string | null {
  if (deadline === undefined || deadline === null) return null;
  const n = Number(deadline);
  if (!Number.isInteger(n) || n < 0) return 'el plazo debe ser un número entero de 0 o más.';
  const unidad = normalizeTimeUnit(timeUnit);
  const porUnidad = DAYS_PER_UNIT[unidad];
  if (!porUnidad) return `unidad de tiempo desconocida: ${timeUnit}. Use dias, semanas, meses o anios.`;
  if (n * porUnidad > MAX_PAYMENT_DEADLINE_DAYS) return `el plazo no puede pasar de ${MAX_PAYMENT_DEADLINE_DAYS} días.`;
  return null;
}

/** Días del plazo más largo de las formas de pago (0 = de contado). */
export function paymentDeadlineDays(
  methods: Array<{ deadline?: number | null; timeUnit?: string | null }>,
): number {
  let dias = 0;
  for (const pm of methods) {
    const n = Number(pm.deadline ?? 0);
    const porUnidad = DAYS_PER_UNIT[normalizeTimeUnit(pm.timeUnit)] ?? 1;
    if (Number.isFinite(n) && n > 0) dias = Math.max(dias, Math.round(n) * porUnidad);
  }
  return dias;
}

/** Fecha de vencimiento: la de la factura + el plazo, en días de calendario. */
export function invoiceDueDate(
  invoiceDate: Date,
  methods: Array<{ deadline?: number | null; timeUnit?: string | null }>,
): Date {
  return new Date(invoiceDate.getTime() + paymentDeadlineDays(methods) * 86_400_000);
}
