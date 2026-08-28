// ─── SRI Forms ────────────────────────────────────────────────────────────────
// Helpers for the declaracion-asistida generation.
// Values are pre-filled from journal entries; the accountant
// must still complete the official form at www.sri.gob.ec.

// Formulario 104 — Declaración IVA mensual
// Casilleros verificados contra la estructura oficial del Formulario 104 del SRI
// (versión con IVA 5% incorporado). Los casilleros editables (565, 624, 625) se
// ingresan manualmente porque dependen de decisiones tributarias del contribuyente
// (proporcionalidad de crédito, cargos al gasto) que el sistema no puede calcular
// automáticamente sin información adicional.
//
// Sección Ventas y otras operaciones:
//   401  Ventas locales tarifa 15% (excluye activos fijos)
//   425  Ventas locales tarifa 5%  (excluye activos fijos)  ← nuevo IVA 5%
//   403  Ventas locales tarifa 0% que NO dan CT
//   404  Ventas locales tarifa 0% que SÍ dan CT
//   408  Total ventas (401+425+403+404)
//
// Notas de crédito en ventas:
//   431  NC en ventas tarifa 15%
//   435  NC en ventas tarifa 5%   ← nuevo IVA 5%
//   433  NC en ventas tarifa 0%
//
// IVA generado en ventas:
//   411  IVA 15% generado en ventas
//   445  IVA 5%  generado en ventas  ← nuevo IVA 5%
//   421  IVA en exportaciones de bienes (suele ser 0 en operaciones locales)
//   429  Total IVA generado (411+445+421)
//
// Adquisiciones:
//   500  Adquisiciones locales tarifa 15% con CT (excluye AF)
//   540  Adquisiciones locales tarifa 5%  con CT (excluye AF)  ← nuevo IVA 5%
//   550  NC en adquisiciones tarifa 5%    ← nuevo IVA 5%
//   560  IVA 5% en adquisiciones con CT   ← nuevo IVA 5%
//   510  NC en adquisiciones tarifa 15% (resta del crédito)
//
// Crédito tributario total:
//   529  Total crédito tributario IVA: c500+c540-c510-c550 (aprox, con signo correcto)
//
// Liquidación:
//   601  IVA cobrado en ventas (=429)
//   602  Crédito tributario aplicable
//   565  IVA no considerado como CT por proporcionalidad (editable; sugerido: max(0, c564-c529))
//   609  Impuesto a liquidar (IVA a pagar)
//   699  Saldo a favor
//
// Ajustes manuales editables:
//   624  IVA pagado y no compensado que se carga al gasto de IR (editable)
//   625  Ajuste del CT IVA superior a cinco años (editable)
export interface Form104Data {
  // Ventas
  c401: number;   // Ventas locales tarifa 15%
  c425: number;   // Ventas locales tarifa 5%
  c403: number;   // Ventas locales tarifa 0% (no CT)
  c404: number;   // Ventas locales tarifa 0% (con CT)
  c408: number;   // Total ventas (401+425+403+404)
  // Notas de crédito en ventas
  c431: number;   // NC ventas tarifa 15%
  c435: number;   // Ventas locales netas tarifa 5% (425 menos NC emitidas con 5%)
  c433: number;   // NC ventas tarifa 0%
  // IVA generado en ventas
  c411: number;   // IVA 15% en ventas
  c445: number;   // IVA 5%  en ventas
  c429: number;   // Total IVA generado (411+445)
  // Adquisiciones con CT
  c500: number;   // Adquisiciones tarifa 15% con CT
  c510: number;   // NC en adquisiciones tarifa 15%
  c540: number;   // Adquisiciones tarifa 5%  con CT — valor bruto
  c550: number;   // Adquisiciones locales netas tarifa 5% con CT (540 menos NC recibidas con 5%)
  c560: number;   // IVA 5% en adquisiciones con CT
  // Crédito tributario calculado
  c529: number;   // Total CT IVA disponible (500+560-510-550)
  // Liquidación
  c601: number;       // IVA cobrado en ventas (=c429)
  c602: number;       // Crédito tributario aplicable en el período
  c565Sugerido: number; // Sugerido calculado = max(0, c602 − c529); nunca se modifica tras generación
  c565: number;       // IVA no CT por proporcionalidad — valor editable final (empieza = c565Sugerido)
  c609: number;       // Impuesto a pagar base (max(0, c601-c602)); se recalcula con c565 en liquidacionActualizada
  c699: number;       // Saldo a favor base (max(0, c602-c601)); se recalcula con c565 en liquidacionActualizada
  // Ajustes manuales
  c624: number;   // IVA pagado no compensado cargado al gasto IR (editable)
  c625: number;   // Ajuste CT IVA >5 años (editable)
  // Meta-campos del formulario (no son casilleros SRI)
  periodoTipo:        'mensual' | 'semestral';    // tipo de período seleccionado
  declaracionTipo:    'original' | 'sustitutiva'; // tipo de declaración
  mes?:               number;                      // 1-12 si mensual
  semestreNumero?:    1 | 2;                       // si semestral
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
  // ── Casilleros existentes (valor retenido) ───────────────────────────────
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

  // ── Nuevos pares base/retenido — Resolución NAC-DGERCGC24-00000008 (abril 2024) ──
  // Convención: c{N} = casillero N en el formulario oficial del SRI.
  // Para cada par, el primer número es la base imponible y el segundo el valor retenido.
  c3030: number;     // 3030 — Base imponible: servicios profesionales de sociedades residentes
  c3530: number;     // 3530 — Valor retenido
  c3121: number;     // 3121 — Base imponible: comercializador bienes agrícolas/avícola/pecuario/etc.
  c3621: number;     // 3621 — Valor retenido
  c3430: number;     // 3430 — Base imponible: construcción de obra material inmueble
  c3450: number;     // 3450 — Valor retenido
  c3140: number;     // 3140 — Base imponible: comisiones pagadas a sociedades nacionales/extranjeras residentes
  c3640: number;     // 3640 — Valor retenido
  c3230: number;     // 3230 — Base imponible: otros rendimientos financieros tarifa 0% (sin valor retenido)
  c3481: number;     // 3481 — Base imponible: autorretenciones Grandes Contribuyentes
  c3981: number;     // 3981 — Valor retenido
  c3370: number;     // 3370 — Base imponible: comercialización de productos forestales
  c3870: number;     // 3870 — Valor retenido

  // ── Pronósticos deportivos (julio 2024) ──────────────────────────────────
  // 3483 y 3484 son editables manualmente (sin pctCode en el catálogo aún).
  // 3480 = base desde pctCode '3480' + c3483 - c3484 (verificar si el código existe).
  // 3980 = retainedAmount desde pctCode '3480' (o 3480 × 15% si no hay comprobantes).
  c3483: number;     // Comisiones derivadas de pronósticos deportivos (editable)
  c3484: number;     // Premios pagados de pronósticos deportivos (editable; resta en fórmula de 3480)
  c3480: number;     // 3480 — Base imponible IR único operadores pronósticos deportivos
  c3980: number;     // 3980 — Valor retenido (15% de c3480)
  c3480Raw: number;  // Base imponible acumulada desde pctCode '3480' (antes de sumar 3483/restar 3484)

  // ── Total y meta ─────────────────────────────────────────────────────────
  total: number;     // Total retenido en el período (suma de todos los valores retenidos)
  declaracionTipo:    'original' | 'sustitutiva';
  formNumeroSustituye?: string;  // N° de formulario que sustituye (solo si sustitutiva)
  mes: number;       // 1-12
  anio: number;      // año fiscal
}
