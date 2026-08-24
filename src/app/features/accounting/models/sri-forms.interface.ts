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

// Formulario 103 — Declaración mensual de Retenciones en la Fuente del IR.
// Casilleros verificados contra el "Formulario 103 – Instructivo" oficial del
// SRI y la Resolución NAC-DGERCGC26-00000009 (vigente desde 2026-03-01).
// Cobertura: solo los conceptos que el catálogo interno (SRI_IR_RETENTION_CODES,
// retention.interface.ts) puede generar. Fuera de alcance — el sistema nunca
// produce estos códigos, así que no tienen casillero propio aquí: relación de
// dependencia (302), liquidaciones de compra por rusticidad (311), dividendos
// (324), loterías/rifas (325), compra de banano (329/330). Los pagos al
// exterior (pctCode 340) se reportan agregados sin desagregar por sub-concepto
// (401/411/413/415/429/431/433) porque el sistema no distingue convenios de
// doble tributación ni tipo de pago al exterior — verificar manualmente antes
// de declarar si hay montos aquí. Tampoco cubre la sección de declaración
// sustitutiva (casilleros 890-999).
export interface Form103Data {
  c303: number;      // Honorarios profesionales
  c304: number;      // Predomina intelecto
  c307: number;      // Predomina mano de obra
  c308: number;      // Imagen o renombre
  c309: number;      // Transporte privado de pasajeros
  c310: number;      // Bienes muebles corporales
  c312: number;      // Bienes inmuebles (tasa sin verificar contra la resolución vigente)
  c314: number;      // Regalías, derechos de autor, marcas y patentes
  c319: number;      // Arrendamiento de bienes inmuebles
  c322: number;      // Seguros y reaseguros
  c323: number;      // Rendimientos financieros
  c344: number;      // Otras retenciones sin % específico (código interno 343)
  exterior: number;  // Pagos a no domiciliados/exterior — agregado, verificar casillero exacto
  total: number;     // Total retenido en el período
}
