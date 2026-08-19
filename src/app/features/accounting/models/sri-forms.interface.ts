// ─── SRI Forms ────────────────────────────────────────────────────────────────
// Helpers for the declaracion-asistida generation.
// Values are pre-filled from journal entries; the accountant
// must still complete the official form at www.sri.gob.ec.

// Formulario 104 — Declaración IVA mensual
export interface Form104Data {
  c401: number;   // Ventas locales tarifa 15%
  c403: number;   // Ventas locales tarifa 0% (no CT)
  c404: number;   // Ventas locales tarifa 0% (con CT)
  c408: number;   // Total ventas (401+403+404)
  c411: number;   // IVA generado en ventas
  c500: number;   // IVA en compras tarifa 15%
  c601: number;   // IVA cobrado (=c411)
  c602: number;   // Crédito tributario aplicable (=min(c500, c601))
  c609: number;   // Impuesto a pagar (max(0, c601-c602))
  c699: number;   // Saldo a favor (max(0, c602-c601))
}

// Formulario 101 — Declaración IR anual
export interface Form101Data {
  c701:  number;  // Ingresos de actividad empresarial (grupo 4)
  c7102: number;  // Costo de ventas (5.1.x)
  c7199: number;  // Gastos operacionales otros (5.2.x+)
  c7999: number;  // Total costos y gastos
  c801:  number;  // Utilidad/pérdida antes IR
  c839:  number;  // IR causado (22% de c801 si positivo)
  c879:  number;  // Retenciones en la fuente a favor
  c899:  number;  // IR a pagar (max(0, c839-c879))
  c903:  number;  // Saldo a favor (max(0, c879-c839))
}
