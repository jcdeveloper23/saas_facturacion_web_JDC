# Plan de Mejoras — Módulo POS
> Fecha de creación: 2026-05-05  
> Referencia de análisis: CEO Agent — SaasFacturacion Orchestrador

---

## Contexto

El módulo POS tiene funcionalidad sólida pero su diseño y estructura no siguen los patrones CoreUI 5.x establecidos en el resto de la aplicación. Este plan prioriza primero la consistencia visual/estructural y luego la funcionalidad faltante.

**Componente de referencia correcto:** `pos-terminals` y `families` (settings)

---

## FASE 1 — Páginas administrativas: `pos-close` y `pos-history`

> **Objetivo:** Alinear las páginas administrativas del POS al patrón CoreUI del proyecto.  
> **Impacto:** Alto (las más visibles fuera de la pantalla de venta)

### 1.1 — `pos-close` (Cierre de caja y arqueo)

**Problemas actuales:**
- Sin ninguna primitiva CoreUI (todo CSS custom: `pc-root`, `pc-header`, `pc-content`, etc.)
- Botones custom en lugar de `cButton`
- Inputs sin directiva `cFormControl`
- Sin header `page-icon` del proyecto
- Grid de estadísticas artesanal en lugar de `stat-strip`

**Cambios a aplicar:**

- [x] Header con patrón `page-icon` + título + subtítulo
- [x] `stat-strip` para los totales del reporte (ventas, efectivo, tarjeta, etc.)
- [x] Sección "Resumen de ventas" → `c-card border-0 shadow-sm`
- [x] Sección "Movimientos de caja" → `c-card` separada con `c-card-header`
- [x] Formulario de cierre → `c-row` + `c-col` + `cFormControl` + `cFormLabel`
- [x] Textarea de notas → `cFormControl` con `rows`
- [x] Botones → `cButton color="danger"` (cerrar) + `cButton color="light" variant="outline"` (volver)
- [x] Footer de acciones → `c-card-footer class="d-flex justify-content-end gap-2"`
- [x] Eliminar todo el SCSS custom del componente (reemplazar con utilidades Bootstrap/CoreUI)

---

### 1.2 — `pos-history` (Historial de ventas de sesión)

**Problemas actuales:**
- Header custom (`ph-header`, `<h2>` suelto)
- Selector de sesión (`ph-session-select`) sin layout CoreUI
- Tarjetas de resumen (`.ph-sum-item`) artesanales en lugar de `stat-strip`
- Fila de detalle expandido (`.ph-detail-row`, `.ph-line-row`) completamente custom

**Cambios a aplicar:**

- [x] Header con patrón `page-icon` + título + botón "Volver al POS"
- [x] `stat-strip` para tickets completados, anulados y total de ventas
- [x] Selector de sesión → `c-row` + `c-col` + `cSelect` con `cFormLabel`
- [x] Tabla existente mantenerla (ya usa CoreUI correctamente)
- [x] Fila de detalle expandido → layout con `c-row/c-col` y separadores `<hr>`
- [x] Payment chips → `c-badge` en lugar de custom `.ph-pay-chip`
- [x] Empty state con icono (patrón pos-terminals)
- [x] Footer con conteo de tickets + hint de interacción
- [x] Eliminar SCSS artesanal del componente

---

## FASE 2 — Modales: migración a `c-modal` de CoreUI

> **Objetivo:** Unificar los 3 modales del POS con el sistema de modales CoreUI usado en el resto de la app.  
> **Impacto:** Alto (consistencia visual + accesibilidad + animaciones estándar)

**Problema actual:** Los 3 modales usan overlays `position:fixed` custom (`.pm-overlay`, `.pm-modal`) en lugar de `c-modal`.  
**Referencia:** `families.component.html` — usa `<c-modal>`, `<c-modal-header>`, `<c-modal-body>`, `<c-modal-footer>`

### 2.1 — `pos-payment-modal` (Cobro multi-método)

- [x] Eliminar `.pm-overlay` y `.pm-modal` custom
- [x] Migrar a `c-modal [visible]="true" (visibleChange)="onVisibleChange($event)" alignment="center" backdrop="static"`
- [x] Header → `c-modal-header` con título+total y `cButtonClose`
- [x] Cuerpo → `c-modal-body class="p-0"` con métodos, slots y resumen
- [x] Footer → `c-modal-footer` con `cButton` confirm (color reactivo success/secondary)
- [x] Método `onVisibleChange` en TS que emite `cancelled`
- [x] Eliminar SCSS de overlay/modal-container/header (conservar estilos interiores)

### 2.2 — `pos-customer-search` (Búsqueda de cliente)

- [x] Eliminar overlay custom
- [x] Migrar a `c-modal` scrollable con `cButtonClose`
- [x] Input de búsqueda → `cFormControl`
- [x] Lista de clientes con estilos `.pcs-item` conservados
- [x] Método `onVisibleChange` en TS que emite `cancelled`
- [x] Eliminar SCSS de overlay/modal-container/header

### 2.3 — `pos-discount-modal` (Descuento global)

- [x] Eliminar overlay custom
- [x] Migrar a `c-modal size="sm" alignment="center" backdrop="static"`
- [x] Input de porcentaje grande conservado (`.pdm-input`)
- [x] Quick chips conservados (`.pdm-chip`)
- [x] Footer → `cButton color="primary"` (aplicar) + `cButton color="light" variant="outline"` (quitar)
- [x] Método `onVisibleChange` en TS que emite `cancelled`
- [x] Eliminar SCSS de overlay/modal-container/header/actions

---

## FASE 3 — Pantalla de venta: `pos-main`

> **Objetivo:** Mejorar la pantalla principal de venta usando primitivas CoreUI donde es posible, sin romper la experiencia táctil de pantalla completa.  
> **Impacto:** Medio (la pantalla tiene justificación de ser diferente, pero hay mejoras puntuales)

### 3.1 — Botones de acción del ticket

- [x] Botones táctiles `.ta-btn` conservados (layout vertical icono+label justificado para POS táctil)
- [x] Hover semántico ya existente: warning/primary/danger por tipo de acción

### 3.2 — Header del POS

- [x] Corregir fallback hardcodeado: `var(--cui-sidebar-bg, #1e2637)` → `var(--cui-sidebar-bg, var(--cui-dark, #1e2637))`
- [x] Agregar botón "Movimientos de caja" (cilDollar) entre Historial y Cerrar caja

### 3.3 — Modal de movimientos de caja (funcionalidad FALTANTE implementada)

- [x] Botón en header del POS abre `showCashMovModal`
- [x] `c-modal size="sm" alignment="center" backdrop="static"` con `cButtonClose`
- [x] Tipo → `cSelect` (Ingreso / Egreso)
- [x] Monto → `cFormControl type="number"`
- [x] Razón → `cFormControl type="text"`
- [x] Footer con botón color reactivo: `success` para ingreso, `danger` para egreso
- [x] `savingCashMov` signal + método `saveCashMovement()` en TS
- [x] Inyección de `PosCashService` en `PosMainComponent`
- [x] Reset del formulario y cierre del modal tras éxito

---

## FASE 4 — `pos-session-select` y `pos-terminals`

> **Objetivo:** Ajustes finales de consistencia y layout.  
> **Impacto:** Bajo-Medio

### 4.1 — `pos-session-select`

- [x] `min-height: 100vh` → `min-height: 100%` para respetar el shell del layout y evitar doble scroll
- [x] `padding: max(2.5rem, 8vh)` → `padding: 2.5rem` estático (el `8vh` era innecesario dentro del shell)
- [x] `.back-btn` custom → `cButton color="light" variant="outline" size="sm"` + estilos eliminados
- [x] `.pos-link-btn` custom → `cButton color="primary" variant="outline" size="sm"` + estilos eliminados
- [x] Sombras `rgba(0,0,0,*)` → `rgba(var(--cui-dark-rgb, 0,0,0), *)` para adaptación al tema
- [x] `.terminal-card` conservadas (layout táctil de selección justificado)

### 4.2 — `pos-terminals` (ajuste menor)

- [x] Verificado — ya está correctamente alineado con CoreUI (referencia canónica del módulo)

### 4.3 — Auditoría de colores hardcodeados (todo el módulo POS)

- [x] `#fc8181` / `#feb2b2` en `.hdr-btn-danger` → `rgba(var(--cui-danger-rgb), .9/.85)` — adapta al tema
- [x] `#16a34a` en `.btn-cobrar:hover` → `var(--cui-success-text-emphasis)` — semántico y adaptable
- [x] `rgba(22, 163, 74, .35)` shadow en `.btn-cobrar` → `rgba(var(--cui-success-rgb), .35)` — usa variable CoreUI
- [x] `box-shadow rgba(0,0,0,*)` en header y ticket-success → `rgba(var(--cui-dark-rgb, 0,0,0), *)` — adapta al tema
- [x] `rgba(255,255,255,*)` en header POS — CORRECTOS (header siempre oscuro, contexto justificado)
- [x] `color: #fff` en fondos de color (danger/success/primary) — CORRECTOS (contraste garantizado)

---

## FASE 5 — Funcionalidad adicional

> **Objetivo:** Completar funcionalidades de valor que faltan o están incompletas.

### 5.1 — Filtros en `pos-history`

- [x] Filtro por estado: chips `cButton` "Todos / Completados / Anulados" en barra superior de la tabla
- [x] Búsqueda por número de ticket o nombre de cliente con `cFormControl` + icono + clear button
- [x] `stat-strip` actualizado con conteos filtrados + ratio filtrados/total
- [x] Botón "Limpiar filtros" contextual (aparece solo cuando hay filtro activo)
- [x] `resetFilters()` limpia estado, query y página al cambiar de sesión

### 5.2 — Paginación en `pos-history`

- [x] `PAGE_SIZE = 50` tickets por página
- [x] `filteredSales` computed → `paginatedSales` computed (slice por página)
- [x] Controles de paginación con `cButton` (anterior / página N / siguiente)
- [x] Paginación desaparece automáticamente cuando hay una sola página
- [x] `selected` se resetea al cambiar de página

### 5.3 — Reimpresión de ticket desde historial

- [x] Botón "Reimprimir" en el detalle expandido de cada fila
- [x] `printing` signal para loading state
- [x] `reprintTicket()`: construye HTML con `buildTicketHtml()` + llama a `printTicket()`
- [x] Usa `TenantService` para datos de empresa + terminal activo si existe
- [x] Fallback a impresión del navegador si no hay ESC/POS conectado

### 5.4 — Anulación de venta desde historial

- [x] `confirm()` nativo reemplazado por `c-modal` de confirmación
- [x] Modal muestra ticket #, cliente y total antes de confirmar
- [x] `c-alert color="warning"` con advertencia de irreversibilidad
- [x] `openVoidModal()` / `confirmVoid()` / `cancelVoid()` en TS
- [x] `saleToVoid` signal para pasar datos al modal

---

## Resumen de fases

| Fase | Alcance | Archivos afectados | Prioridad |
|---|---|---|---|
| 1 | `pos-close` + `pos-history` | 4 archivos (HTML + SCSS x2) | CRÍTICA |
| 2 | 3 modales → `c-modal` | 6 archivos (HTML + SCSS x3) | CRÍTICA |
| 3 | `pos-main` botones + modal caja | 2 archivos (HTML + SCSS) | ALTA |
| 4 | `pos-session-select` + `pos-terminals` | 4 archivos | MEDIA |
| 5 | Funcionalidad adicional | Múltiples + servicios | MEDIA |

---

## Notas de implementación

- **No romper la funcionalidad existente**: Cada fase se puede implementar y probar independientemente.
- **Referencia de estilos compartidos**: `_pos-shared.scss` ya tiene `.page-icon`, `.stat-strip`, `.stat-item`, `.stat-sep`, `.stat-label`, `.stat-value` — usar siempre estos en lugar de crear nuevas clases custom.
- **Referencia de modales**: `families.component.html` es el ejemplo canónico de `c-modal` en este proyecto.
- **Referencia de página**: `pos-terminals.component.html` es el ejemplo canónico de página administrativa en este módulo.
