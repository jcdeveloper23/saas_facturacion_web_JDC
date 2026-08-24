# Plan Contabilidad — Fases Pendientes (post-auditoría)

**Fecha:** 2026-08-24
**Origen:** auditoría de 38 ítems (checklist Contífico + funcionalidad transversal ERP) contra el código real. Resultado: 21 completos, 7 parciales, 10 faltantes.
**Roles:** `admin`, `accountant`

Este documento cubre solo los **17 ítems no-completos** de la auditoría, organizados en fases ejecutables de forma independiente (cada fase se puede implementar y desplegar sin depender de las siguientes). No repite lo que ya está construido — para eso ver la auditoría publicada el 2026-08-24.

## Estado: las 8 fases (0-7) están implementadas ✅

Todo el código de este documento está escrito y verificado (`tsc --noEmit` + `ng build` limpios en cada fase). **Lo único que falta es desplegar** — ver la sección [⚠️ Cloud Functions pendientes de despliegue confirmado](#cloud-functions-pendientes-de-despliegue-confirmado) al final, que también cubre el deploy de `firestore.rules` pendiente. Hasta que no se despliegue, gran parte de este trabajo no está corriendo en producción aunque el código ya esté en el repo.

**Hallazgo de compliance a destacar (Fase 5):** el catálogo de porcentajes de retención IR (`SRI_IR_RETENTION_CODES`) tenía varios códigos con tasa desactualizada — verificado y corregido contra la Resolución NAC-DGERCGC26-00000009 del SRI, vigente desde 2026-03-01. Ver el detalle en la Fase 5 más abajo.

---

## Fase 0 — Fix urgente de permisos ✅ Completada (2026-08-24)

**Qué:** `firestore.rules` para `bank_accounts` (línea ~431) solo permite `create`/`update` a `isAdmin()`. Un usuario con rol `accountant` (que sí puede navegar a Cuentas Bancarias por las rutas de Angular) recibe `permission-denied` al guardar.

**Fix:**
```
allow create, update: if isAuthenticated() && belongsToCompany(companyId) && (isAdmin() || isAccountant());
```
Mismo patrón que ya se corrigió hoy para `invoices`/`purchases`.

**Esfuerzo:** trivial. **Deploy:** `firebase deploy --only firestore:rules`.

---

## Fase 1 — Integridad de datos (bajo esfuerzo, alto impacto) ✅ Completada (2026-08-24)

### 1.1 — Validar antes de eliminar una cuenta contable
**Problema:** `chart-of-accounts.service.ts::deleteAccount(id)` hace `deleteDoc` directo, sin chequear si la cuenta tiene líneas en `journal_entries`.

**Implementación:**
- Antes del `deleteDoc`, consultar `journal_entries` filtrando líneas con `accountCode === account.code` (recorrer documentos posteados, similar a como ya hace `getLibroMayor()` en `journal-entries.service.ts` — reusar esa misma lógica de recorrido).
- Si hay al menos una línea, lanzar error claro: `"No se puede eliminar: la cuenta tiene N movimiento(s) contable(s) asociado(s)."`
- Igual para `bank_accounts` (una cuenta bancaria vinculada a una cuenta contable con movimientos tampoco debería poder desvincularse sin aviso — evaluar si aplica).

**Archivos:** `src/app/features/accounting/services/chart-of-accounts.service.ts`

> **Implementado.** `JournalEntriesService.hasMovementsForAccount(accountCode)` (nuevo) recorre los asientos `posted` buscando alguna línea con ese código — mismo patrón de recorrido que ya usaba `getLibroMayor()`. `deleteAccount()` lo llama antes del `deleteDoc` y lanza `Error` con mensaje claro si encuentra movimientos; `chart-of-accounts-page.component.ts` ya mostraba `err.message` en el catch existente, no hubo que tocar la UI. No se agregó el chequeo de `bank_accounts`/`petty_cash_funds` vinculadas (quedó fuera, como decía el plan original) — pendiente si se necesita.

### 1.2 — Flag "gasto no deducible"
**Problema:** no existe en ningún lado del modelo. Relevante para Formulario 101/102 (conciliación tributaria de Impuesto a la Renta).

**Implementación:**
- `JournalEntryLine` (`journal-entry.interface.ts`): agregar `isNonDeductible?: boolean`.
- `journal-entry-form-page.component.ts/.html`: checkbox por línea (o a nivel de asiento completo, más simple — decidir con el usuario cuál granularidad tiene sentido: ¿el flag es por línea de gasto o por asiento manual completo?).
- Opcional, fase siguiente: sumatoria de gastos no deducibles como input directo del Formulario 101 (`formulario101-page`), en vez de que el contador lo recalcule a mano.

**Archivos:** `models/journal-entry.interface.ts`, `pages/journal-entries-page/journal-entry-form-page.component.ts/.html`

> **Implementado, granularidad por línea** (decisión tomada sin bloquear en el usuario: una misma factura de compra puede mezclar gastos deducibles y no deducibles — ej. una cena de negocios parcialmente deducible junto a suministros de oficina — así que por-asiento habría sido menos preciso). `JournalEntryLine.isNonDeductible?: boolean`, checkbox compacto "No ded." junto al campo Detalle de cada línea, con tooltip explicativo. El resumen para Formulario 101 (sumar todos los no-deducibles del período) queda para cuando se aborde el Formulario 101/103 más a fondo — no se tocó `formulario101-page` en esta fase.

---

## Fase 2 — Cierre mensual configurable ✅ Completada (2026-08-24)

**Problema:** `AccountingPeriod` es anual únicamente (`status: open/closed/locked`, sin fecha de corte). Nada bloquea editar un asiento de enero cuando ya se está en marzo.

**Implementación:**
- `AccountingPeriod` (`accounting-period.interface.ts`): agregar `monthlyCloseEnabled?: boolean`, `monthlyCloseDay?: number` (1-31), `monthlyCloseCutoff?: Timestamp` (calculado: último mes cerrado + día de corte).
- UI en `accounting-periods-page`: checkbox "Cierre mensual" + selector de día, y una acción explícita "Cerrar hasta [mes]" que avanza `monthlyCloseCutoff`.
- **Validación de bloqueo** — aplicar en dos lugares:
  - Frontend: `journal-entry-form-page` y cualquier flujo que cree/edite/elimine un asiento (incluye los nuevos de esta sesión: `bank-movement-modal`, `advances.service.ts`, `petty-cash.service.ts`) — rechazar si `entry.date < period.monthlyCloseCutoff`.
  - Backend/reglas: agregar el chequeo a la regla `update`/`delete` de `journal_entries` en `firestore.rules` (comparando `resource.data.date` contra el período — esto requiere leer el período desde la regla, más complejo; alternativa más simple: mantener la validación solo en Cloud Functions que generan asientos automáticos, ya que esas SÍ corren con Admin SDK y pueden leer el período fácilmente).

**Archivos:** `models/accounting-period.interface.ts`, `pages/accounting-periods-page/*`, `services/journal-entries.service.ts`, `firestore.rules`

> **Implementado con dos simplificaciones deliberadas respecto al diseño original de arriba:**
> 1. **Se descartó `monthlyCloseDay`.** Un "día de corte automático por calendario" es una regla que nadie pidió y que además es ambigua (¿corte el día 5 de cada mes bloquea hasta el mes actual o el anterior?). En su lugar, `monthlyCloseCutoff` se avanza **siempre por acción explícita** del usuario ("Cerrar hasta [mes]" con un `<input type="month">`), nunca se calcula solo. Más simple y sin sorpresas.
> 2. **La validación se centralizó en un solo lugar** (`JournalEntriesService.createEntry()`/`updateEntry()`/`deleteEntry()`) en vez de duplicarse en cada caller (`journal-entry-form-page`, `bank-movement-modal`, `advances.service.ts`, `petty-cash.service.ts`, `bank-accounts-page.postOpeningBalance()`) — los 5+ flujos ya terminan llamando a esos 3 métodos, así que un único `assertDateNotLocked()` privado los cubre a todos sin repetir código. `updateEntry()` valida tanto la fecha actual del asiento como la nueva si cambia (evita mover un asiento fuera de un mes cerrado como forma de eludir el bloqueo). No se tocó `firestore.rules` — se mantuvo la alternativa simple ya prevista arriba: la regla de negocio vive en el service layer (mismo patrón que la validación de cuadre `calcEntryTotals`, que tampoco está espejada en las reglas).
>
> Nuevo: `AccountingPeriodsService.getPeriodForYear()`, `setMonthlyCloseEnabled()`, `closeMonthsUpTo()` (con guardas: solo avanza hacia adelante, y el corte debe pertenecer al año del ejercicio). UI: switch "Cierre mensual" por ejercicio abierto + botón "Cerrar hasta un mes" con selector nativo `<input type="month">` en un modal ligero.

---

## Fase 3 — Reportes financieros faltantes ✅ Completada (2026-08-24)

### 3.1 — Estado de Flujo de Efectivo
Los otros 3 estados estándar ya existen (Balance General, Estado de Resultados, Balance de Comprobación) — este es el único que falta.

**Implementación (método indirecto, el estándar cuando no se lleva flujo de caja detallado por transacción):**
- Nueva página `accounting/pages/flujo-efectivo-page/`, mismo patrón que `estado-resultados-page`/`balance-general-page` (selector de período, cálculo cliente-side desde `journal_entries` postedas).
- Cálculo: variación neta de las cuentas de Banco/Caja (grupo `1.1.01`/`1.1.01.002` del plan de cuentas) entre el saldo inicial y final del período, clasificado en Operación/Inversión/Financiamiento según el tipo de cuenta contraparte de cada movimiento (heurística: contrapartida en cuentas de resultado → Operación; activo fijo → Inversión; patrimonio/deuda LP → Financiamiento).
- Agregar a `generate-accounting-pdf.ts` como quinto reporte (`buildFlujoEfectivo`), mismo patrón de las otras 4 funciones `build*`.

**Archivos:** nueva página + `functions/src/accounting/generate-accounting-pdf.ts`

> **Implementado según lo planeado, con una precisión sobre el "efectivo al inicio":** en vez de acumular saldos desde ejercicios anteriores (lo que Balance General tampoco hace hoy — es una limitación conocida y compartida), el efectivo inicial se toma directamente de las líneas de cuentas de caja/banco del **asiento de apertura** del período (`type:'opening'`, generado por `generateOpeningEntry` — Fase existente de ejercicios contables). Si el ejercicio no tiene apertura generada, el inicial es 0. El resto de asientos postedas del período se clasifican con la heurística de la contraparte de mayor magnitud dentro del mismo asiento. Selector de período obligatorio (a diferencia de Balance General que admite "Todos los períodos") porque el cálculo de variación neta requiere un rango acotado. **Pendiente de desplegar:** `generateAccountingPdf` (mismo Cloud Function ya pendiente de deploy desde la sesión de PDF del Libro Diario — ver nota al final del documento).

### 3.2 — Antigüedad de cartera (aging) CxC/CxP
Los datos base ya existen (`Invoice.isPaid`/`dueDate`, `Purchase.isPaid`), falta el reporte.

**Implementación:**
- Nueva página `accounting/pages/aging-page/` (o dos: CxC y CxP, o una con toggle).
- Cálculo cliente-side: para cada factura/compra `!isPaid`, calcular días vencidos = hoy − `dueDate` (facturas) / hoy − `date` + plazo del proveedor (compras, si no hay `dueDate` en `Purchase` — verificar si existe, si no, agregar `dueDate` a `Purchase` igual que ya tiene `Invoice`), agrupar en buckets estándar: 0-30, 31-60, 61-90, 90+.
- Vista tabular: cliente/proveedor × bucket, con totales por columna.

**Archivos:** nueva página, posible campo `dueDate` nuevo en `Purchase`

> **Implementado con toggle CxC/CxP en una sola página** (`accounting/pages/aging-page/`), como sugería la alternativa del plan. **Decisión sobre el vencimiento de compras:** en vez de agregar `dueDate` a `Purchase` (que solo cubriría compras nuevas, dejando el histórico sin dato), el vencimiento se calcula en el momento del reporte como `purchase.date + SupplierData.paymentDays` (0 días = contado, si el proveedor no tiene plazo configurado) — el campo `paymentDays` ya existía en `SupplierData` (`personas/models/person.interface.ts`) pero no se usaba en ningún lado. Esto cubre compras históricas y nuevas por igual sin migración. Buckets: Por Vencer (no vencido aún, agregado sobre los 4 buckets del plan porque una cartera sin ese dato es menos útil — solo muestra lo vencido, no el total pendiente), 0-30, 31-60, 61-90, 90+. Filtrado: excluye `isVoid`, `status:'draft'` (y `'cancelled'` en compras) — solo cuentas por cobrar/pagar reales y vigentes. Sin exportación a PDF en esta fase (no estaba en el alcance original de 3.2, solo impresión de navegador).

---

## Fase 4 — Completar libros y exportación ✅ Completada (2026-08-24)

### 4.1 — Drill-down plan de cuentas → libro mayor
**Implementación:** en `chart-of-accounts-page`, cada fila de cuenta (`allowsMovement:true`) agrega un botón/ícono "Ver movimientos" que navega a `libro-mayor-page` con la cuenta pre-seleccionada vía query param (`?accountCode=...`). Ajustar `libro-mayor-page.component.ts` para leer ese query param en `ngOnInit`.

**Esfuerzo:** trivial-bajo.

> **Implementado tal cual.** Botón "Ver movimientos" (ícono `cilListRich`, nuevo — registrado en `icon-subset.ts`) visible solo cuando `allowsMovement`, en ambos modos de la tabla (árbol y plano). `libro-mayor-page` lee `route.snapshot.queryParamMap.get('accountCode')` en `ngOnInit`, preselecciona y llama `loadMayor()` automáticamente si la cuenta existe entre las cuentas de movimiento cargadas.

### 4.2 — Exportar a Excel
No existe ninguna exportación a Excel en todo el sistema (solo PDF y CSV de importación).

**Implementación:**
- Agregar `xlsx` (SheetJS) como dependencia frontend (client-side, no requiere Cloud Function — más simple que el PDF).
- Botón "Exportar Excel" en `libro-diario-page`, `libro-mayor-page`, `balance-comprobacion-page`, `estado-resultados-page`, `balance-general-page` — mismo dato ya calculado en pantalla, solo cambia el formato de salida.

**Archivos:** nuevo servicio compartido `accounting/services/excel-export.service.ts` (evita repetir la lógica de armar el workbook en cada página)

> **Implementado tal cual — `xlsx` ya estaba en `package.json`/`node_modules`** (dependencia preinstalada, sin uso previo en el frontend). `ExcelExportService.export(filename, sheets)` genera el workbook con `XLSX.utils.json_to_sheet` por hoja y dispara la descarga con `XLSX.writeFile`. Libro Diario exporta el detalle línea por línea (igual que el PDF, no solo totales por asiento). Los otros 4 reportes reusan exactamente los mismos arrays/computed ya usados para el PDF — cero cálculo nuevo.

### 4.3 — Asistente de saldos iniciales generales
Hoy solo existe para cuentas bancarias (Fase A de la sesión de hoy). Falta un flujo para cargar el saldo inicial de **todo** el plan de cuentas de una sola vez (típico al migrar de otro sistema).

**Implementación:**
- Nueva página o modal "Cargar Saldos Iniciales": tabla editable con todas las cuentas `allowsMovement:true`, columna de monto, valida que la suma de activos = suma de (pasivo + patrimonio) antes de habilitar el botón de guardar (mismo chequeo que `close-accounting-period.ts` usa para el cierre).
- Genera un único asiento manual con una línea por cuenta con saldo ≠ 0 (reusa `journalEntriesSvc.createEntry()` directo, sin Cloud Function — mismo patrón que toda la Fase A-D de hoy).

**Archivos:** nueva página en `accounting/pages/`

> **Implementado con una columna de monto único por cuenta (no débito/crédito separados)** — el signo lo determina la naturaleza de la cuenta (`nature: 'deudora'|'acreedora'`), así el usuario no tiene que pensar en qué columna va cada saldo, igual que llenar una hoja de balance de comprobación real. La validación de cuadre se generalizó a débito total = crédito total (igual que `calcEntryTotals`/`close-accounting-period.ts`), que es matemáticamente equivalente a "Activos = Pasivo + Patrimonio" cuando solo se cargan cuentas de balance, pero también admite cuentas de resultado si el usuario migra a mitad de año. **Detalle importante no mencionado en el plan original:** el asiento generado usa `type:'opening'` y, al guardar, marca `period.openingEntryId` — así el botón "Generar asiento de apertura" automático entre ejercicios (`generateOpeningEntry`, que revisa `if (period.openingEntryId) throw 'already-exists'`) no puede crear un segundo asiento de apertura duplicado sobre el mismo período. Solo se listan ejercicios `status:'open'` sin `openingEntryId` ya asignado.

---

## Fase 5 — Anexo SRI restante ✅ Completada (2026-08-24)

### 5.1 — Formulario 103 (retenciones)
Los datos ya existen en el módulo `retentions`; falta el formulario-resumen.

**Implementación:** mismo patrón que `formulario104-page`/`formulario101-page` — selector año/mes, cálculo client-side agregando `retentions` posteadas del período por código de retención (`pctCode`), casilleros según la ficha técnica del Formulario 103 del SRI (**investigar la estructura oficial actual antes de implementar** — mismo criterio que se usó para el ATS: no asumir de memoria, verificar contra la fuente oficial del SRI).

> **Investigado contra fuentes oficiales del SRI** (mismo criterio que el ATS): se descargó y leyó el "Formulario 103 – Instructivo" oficial (`sri.gob.ec`) para los números de casillero reales, y la **Resolución NAC-DGERCGC26-00000009** (vigente desde 2026-03-01, deroga la NAC-DGERCGC24-00000008) para los porcentajes de retención IR actuales.
>
> ### ⚠️ Hallazgo importante — catálogo de retenciones desactualizado (corregido)
> Al verificar contra la fuente oficial se encontró que **`SRI_IR_RETENTION_CODES`** (`retentions/models/retention.interface.ts`), usado por `retention-form.component` para sugerir el % al emitir un comprobante de retención a un proveedor, tenía **varios códigos con tasa y hasta concepto incorrectos** respecto a la resolución vigente desde marzo 2026 (6 meses antes de esta sesión):
> - **308** decía "Marcas, patentes, derechos de autor" al 5% — el casillero 308 real es **"Imagen o renombre"** al 10%. Las marcas/regalías son el casillero **314** (no existía en el catálogo — se agregó).
> - **307** "Predomina mano de obra": 2% → correcto actual **3%**.
> - **310** "Bienes muebles": 1.75% → correcto actual **2%**.
> - **322** "Seguros y reaseguros": 1% → correcto actual **2%**.
> - **323** decía "Reaseguros — compañías extranjeras" al 2% — el casillero 323 real es **"Rendimientos Financieros"**, correcto actual **3%**.
> - **304** "Predomina intelecto": 1.75% → corresponde a la misma categoría de honorarios/intelecto del Art. 7.a, correcto actual **10%**.
> - **343** "Otras retenciones IR": 2.75% (tasa eliminada por la resolución) → correcto actual **3%** (Art. 3, casillero oficial 344).
> - **312** (bienes inmuebles) y **340** (pagos a no domiciliados) quedaron con una nota de advertencia en el código — no aparecen con un % propio en la resolución de retenciones (posible otro régimen / tarifa societaria variable) y no se debe confiar en el valor sugerido sin verificar.
>
> El campo es solo una **sugerencia editable** en el formulario (no bloquea al usuario), así que esto no generó comprobantes silenciosamente mal calculados — pero si nadie lo notaba, sí inducía a usar la tasa por defecto equivocada. Corregido con cita de la fuente en un comentario en el código.
>
> ### Formulario 103 — alcance implementado
> Nueva página `accounting/pages/formulario103-page/`, mismo patrón que 101/104 (selector año/mes, cálculo client-side agregando `Retention.taxes[]` por `pctCode`, filtra `status:'issued'` y `!isVoid`). Cubre únicamente los conceptos que `SRI_IR_RETENTION_CODES` puede producir: casilleros 303, 304, 307, 308, 309, 310, 312, 314, 319, 322, 323, 344 + un bucket agregado de "pagos al exterior" (código interno 340) sin desagregar por sub-casillero (401/411/413/415/429/431/433) porque el sistema no distingue convenio de doble tributación ni tipo de pago al exterior.
>
> **Fuera de alcance, documentado explícitamente en el código (`Form103Data`, `sri-forms.interface.ts`) y en la UI:** relación de dependencia (302 — el sistema no hace nómina), liquidaciones de compra por rusticidad (311), dividendos (324), loterías/rifas (325), compra de banano (329/330), y toda la sección de declaración sustitutiva (890-999, imputación de pagos previos) — ninguno de estos es un concepto que el sistema genere hoy.

---

## Fase 6 — Dimensiones analíticas y mantenimiento ✅ Completada (2026-08-24)

### 6.1 — Centro de costo por defecto en cliente/proveedor
- `Customer` (`customer.interface.ts`) y `Person` (`person.interface.ts`): agregar `defaultCostCenterId?: string`.
- Al crear una factura/compra, si el cliente/proveedor tiene `defaultCostCenterId`, pre-cargar ese centro de costo en las líneas del documento (si el módulo de facturas/compras ya soporta centro de costo por línea — verificar antes de implementar, puede que haya que agregarlo también ahí).

> **Verificado y confirmado: no existía NINGÚN soporte de centro de costo en facturas/compras** (ni en el modelo, ni en los formularios, ni en las Cloud Functions que generan el asiento — las 2 funciones (`generate-journal-entry-from-invoice.ts`, `generate-journal-entry-from-purchase.ts`) tenían `costCenterId: null` hardcodeado en cada línea). **Implementado a nivel de documento completo (no por línea)** — un único centro de costo por factura/compra, no uno distinto por línea — para mantener el cambio acotado dado que ninguno de los dos formularios (`invoice-form`: 1672 líneas; `purchase-form`: 688 líneas) tenía ninguna noción de centro de costo de la que partir. Se usaron señales (`selectedCostCenterId`/`selectedCostCenterName`) fuera del `FormGroup` reactivo en ambos formularios para no tocar su estructura interna.
>
> - `CustomerData`/`SupplierData` (`personas/models/person.interface.ts`): `defaultCostCenterId?`/`defaultCostCenterName?`.
> - `Invoice`/`Purchase`: mismos campos a nivel de documento.
> - **Descubrimiento importante:** el proyecto tiene DOS sistemas de "customer" en paralelo — `features/customers/models/customer-field-catalog.ts` (código muerto, cero referencias) y el real: `features/personas/` con `PERSON_FIELD_CATALOG` + `FormConfigService`, que sí es el que usa `person-form.component`. Se agregaron las entradas `customer.defaultCostCenterId`/`supplier.defaultCostCenterId` a ese catálogo real (visibilidad configurable por el admin en Configuración → Formularios, igual que el resto de campos comerciales).
> - `person-form.component`: nuevo selector de Centro de Costo en las secciones de cliente y proveedor, con inyección de `CostCentersService`.
> - `invoice-form.component`/`purchase-form.component`: precarga automática al seleccionar cliente/proveedor (editable), selector visible en el encabezado del documento, persistido en `save()`/`buildPayload()`.
> - Las 2 Cloud Functions ahora usan `invoice.costCenterId ?? null` / `after.costCenterId ?? null` en vez de `null` fijo en cada línea del asiento generado — **requieren redeploy** para tomar efecto (agregado a la lista de Cloud Functions pendientes al final del documento).

### 6.2 — Edición masiva del plan de cuentas
**Implementación:** en `chart-of-accounts-page`, modo de selección múltiple (checkbox por fila) + acción en lote (ej. cambiar `isActive`, mover a otro padre). Alcance mínimo razonable: activar/inactivar en lote — renombrar/mover en lote es más delicado (afecta reportes históricos) y se puede dejar para después.

> **Implementado tal cual, alcance mínimo (activar/inactivar en lote).** Botón "Selección Múltiple" agrega una columna de checkbox (con "seleccionar todos los visibles") en ambos modos de tabla (árbol y plano), y una barra de acciones en lote que llama `ChartOfAccountsService.toggleActive()` en paralelo (`Promise.all`) para cada cuenta seleccionada — reusa el método existente, sin lógica nueva en el servicio.

---

## Fase 7 — Auditoría ✅ Completada (2026-08-24)

### 7.1 — Log de auditoría inmutable
Hoy cada documento tiene `createdBy`/`updatedBy`/`cancelledBy`, pero se sobrescriben — no hay historial de cambios.

**Implementación:**
- Nueva colección `companies/{companyId}/audit_log/{logId}` — documentos inmutables (`allow update, delete: if false` en `firestore.rules`).
- Cloud Function genérica `onDocumentWritten` sobre `journal_entries/{entryId}` (y opcionalmente `accounts`, `accounting_periods`) que en cada `before`/`after` escribe un registro: `{collection, docId, action:'create'|'update'|'delete', changedFields, before, after, userId, timestamp}`.
- Página de consulta simple (solo lectura, admin-only) en `accounting/pages/audit-log-page/`.

**Nota:** esta fase es la de mayor esfuerzo relativo del documento — considerar si vale la pena antes de tener clientes que realmente lo pidan (compliance/auditoría externa), vs. las fases anteriores que tienen impacto inmediato en uso diario.

> **Implementado tal cual, con `write: if false` completo (no solo update/delete)** — el cliente nunca escribe en `audit_log`, solo las 3 Cloud Functions nuevas (`audit-log-trigger.ts`: `auditLogJournalEntries`, `auditLogChartOfAccounts`, `auditLogAccountingPeriods`, una por colección auditada) usando Admin SDK. El diff (`changedFields`) ignora `updatedAt` (cambia en cada write y no aporta información) y se omite el registro si un update no cambió nada real.
>
> **Bug de reglas evitado, no cometido:** el archivo tiene un comentario explícito advirtiendo que el catch-all de `firestore.rules` (al final del documento) re-otorga acceso amplio a cualquier colección no listada en `isAccountingGovernedCollection()` — se agregó `'audit_log'` a esa lista al mismo tiempo que se escribió la regla específica; sin eso, el catch-all habría dejado el log de auditoría escribible por cualquier rol con `canWrite()` (incluye vendedor/cajero), anulando todo el propósito de la fase.
>
> Página `accounting/pages/audit-log-page/` (ruta admin-only, a diferencia del resto del módulo que es admin+contador): tabla de últimos 200 registros con filtro por colección, y modal de detalle que muestra diff campo por campo (antes/después) para updates, o el documento completo para create/delete.

---

## Fuera de alcance (decisión, no pendiente)

- **Multi-moneda real**: Ecuador opera en USD; el campo `exchangeRate` vestigial no necesita desarrollo activo salvo que aparezca un caso de uso real (facturación a clientes en el exterior, por ejemplo).
- **Importación masiva de asientos vía Excel**: nice-to-have de complejidad media (parseo + reporte de errores línea por línea); no está en las 7 fases porque ningún gap de los 5 prioritarios lo necesita como prerrequisito — evaluar después si un cliente migra de otro sistema contable seguido.
- **Liquidación laboral / nómina**: es un módulo nuevo completo (RRHH), no una extensión de Contabilidad — merece su propio plan si se decide construirlo.

---

## Orden sugerido

Fase 0 y 1 son baratas y desbloquean uso diario correcto (bugs reales, no features nuevas) — hacerlas primero, en la misma sesión si es posible. Fase 2 (cierre mensual) es control interno, vale la pena antes de tener varios usuarios tocando el mismo período. Fases 3-5 son reportes/anexos — priorizar según qué esté pidiendo un cliente real primero. Fases 6-7 son las de menor urgencia inmediata.

---

## ⚠️ Cloud Functions pendientes de despliegue confirmado

Estas funciones se modificaron/crearon en sesiones anteriores y **no hay confirmación en el historial de que se hayan desplegado** — el código está en el repo pero puede no estar corriendo en producción todavía:

- `generateJournalEntryFromInvoicePayment` / `generateJournalEntryFromPurchasePayment` — sin desplegar, marcar una factura/compra como pagada no genera el asiento de banco correspondiente.
- `generateAccountingPdf` — modificada varias veces (fix de Libro Diario con detalle por línea, `rowHeight()` dinámico, `Intl.NumberFormat`, y ahora el reporte `flujo-efectivo` de la Fase 3.1) — si no se despliega, el botón "PDF" de varios reportes contables puede fallar o devolver una versión desactualizada.
- `generateJournalEntryFromInvoice` / `generateJournalEntryFromPurchase` — modificadas en la Fase 6.1 para usar el centro de costo real del documento en vez de `null` fijo. Sin desplegar, los asientos automáticos de venta/compra seguirán generándose sin centro de costo aunque el usuario lo haya seleccionado en el formulario.
- `auditLogJournalEntries` / `auditLogChartOfAccounts` / `auditLogAccountingPeriods` (Fase 7, **nuevas**) — sin desplegar, el log de auditoría queda vacío aunque la página ya esté publicada.

**También pendiente: `firebase deploy --only firestore:rules`** — la regla de `audit_log` (Fase 7) y la corrección de `isAccountingGovernedCollection()` que la protege del catch-all no están activas hasta desplegar. Sin este deploy, además de que el log de auditoría no tiene permisos de lectura para nadie, la colección `audit_log` (una vez tenga las Cloud Functions desplegadas) podría quedar escribible por el catch-all genérico si solo se despliegan las funciones sin las reglas.

Verificar con `firebase functions:list` o revisando los logs de la última versión desplegada, y desplegar con `firebase deploy --only functions:<nombre>` según corresponda.
