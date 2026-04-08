# Análisis de Facturación — Módulo `/invoices/new`
## CEO Agent · SaasFacturacion · Abril 2026

---

## 1. VISIÓN ESTRATÉGICA

> **Objetivo:** Ser el sistema de facturación #1 para PYMEs en Ecuador.
> El módulo de facturación es el corazón del producto — es donde el vendedor
> pasa el 80% del tiempo. Cada segundo ahorrado aquí se multiplica por
> cientos de facturas al mes. Un UX mediocre aquí es inaceptable.

---

## 2. REFERENCIA: PROCESO DE FACTURACIÓN CONTIFICO

Contifico es el ERP SaaS más usado en Ecuador. Analizando su proceso para superarlo:

### 2.1 Flujo de emisión en Contifico

```
1. Seleccionar tipo documento → Factura de Venta
2. Seleccionar cliente (search por código/RUC/nombre)
3. Datos cabecera: fecha, vencimiento, vendedor, forma de pago
4. Líneas de detalle:
   - Buscar producto por código/nombre
   - Cantidad (con flechas +/-)
   - Precio unitario (pre-cargado desde lista de precios)
   - % descuento por línea
   - IVA por línea (0%, 5%, 8%, 12%, 15%)
5. Descuento global (opcional)
6. Panel de totales en tiempo real
7. Botones: Guardar borrador / Emitir / Emitir + Imprimir
```

### 2.2 Campos del modelo Contifico vs nuestro modelo

| Campo DB Contifico  | Nuestro campo         | Estado     |
|---------------------|-----------------------|------------|
| `codserie`          | `seriesCode`          | ✅ Completo |
| `codejercicio`      | `fiscalYear`          | ✅ Completo |
| `fecha`             | `date`                | ✅ Completo |
| `vencimiento`       | `dueDate`             | ✅ Completo |
| `numero`            | `number` (autoincr.)  | ✅ Completo |
| `codfactura`        | `fullNumber`          | ✅ Completo |
| `codcliente`        | `customerCode`        | ✅ Completo |
| `nombrecliente`     | `customerName`        | ✅ Completo |
| `cifnif`            | `customerTaxId`       | ✅ Completo |
| `tipocifnif`        | `customerTaxIdType`   | ✅ Completo |
| `codalmacen`        | `warehouseCode`       | ✅ Completo |
| `codpago`           | `paymentTermCode`     | ✅ Completo |
| `coddivisa`         | `currency`            | ✅ Completo |
| `tasaconv`          | `exchangeRate`        | ✅ Completo |
| `neto`              | `netAmount`           | ✅ Completo |
| `totaliva`          | `vatAmount`           | ✅ Completo |
| `total`             | `total`               | ✅ Completo |
| `dtopor1`           | `globalDiscountPct`   | ✅ Completo |
| `pagada`            | `isPaid`              | ✅ Completo |
| `anulada`           | `isVoid`              | ✅ Completo |
| `observaciones`     | `notes`               | ✅ Completo |
| `formapago_detalle` | —                     | ❌ Faltante |
| `codvendedor`       | `agentCode`           | ⚠️ En form pero sin UI clara |
| `dircliente`        | `customerAddress`     | ✅ Snapshot |

### 2.3 Ventajas de Contifico que debemos superar

| Contifico (lo que tienen) | Nuestra ventaja potencial |
|---------------------------|---------------------------|
| UI densa, visual del 2015 | Angular moderno, components reutilizables |
| Sin dark mode             | CoreUI con dark mode nativo |
| Sin keyboard shortcuts    | Podemos tener Tab-to-next-line, Enter-to-add |
| Carga lenta (PHP + AJAX)  | Firestore realtime, instantáneo |
| Sin autoguardado          | Podemos implementar autoguardado de borrador |
| Búsqueda lenta de cliente | Búsqueda instantánea en memoria |

---

## 3. DIAGNÓSTICO UX ACTUAL — Problemas Identificados

### 🔴 Críticos (bloquean flujo)

**C1 — Tabla de líneas demasiado ancha (8 columnas + delete)**
- En pantallas < 1400px hay scroll horizontal
- El vendedor no ve el total de la línea sin scrollear
- Subtotal e IVA-importe son columnas "ruido" para el flujo principal
- **Fix:** Colapsar Subtotal e IVA-importe. Solo mostrar: # · Descripción · Cant · P.Unit · Dto% · Total · IVA% · ×

**C2 — Búsqueda de producto mezclada con campo Descripción**
- Al hacer focus en "Descripción" se abre el dropdown de productos
- Si el vendedor quiere escribir una descripción libre, el dropdown interfiere
- No hay forma de distinguir "buscar producto" vs "descripción manual"
- **Fix:** Botón de búsqueda explícito (lupa) al inicio de cada línea, separado del campo descripción

**C3 — Sin feedback visual de cliente seleccionado**
- La selección del cliente solo muestra texto secundario debajo del input
- No hay card/chip clara que indique "cliente seleccionado con éxito"
- No hay botón para cambiar/deseleccionar cliente
- **Fix:** Chip/card de cliente seleccionado con icono, nombre bold, RUC, botón ×

**C4 — Botones de acción duplicados sin jerarquía clara**
- "Emitir factura" aparece en el header Y en el panel sticky
- En el header están los mismos botones pero más pequeños y sin context
- **Fix:** Header solo tiene "Volver" + badge estado. Acciones principales solo en panel sticky

### 🟡 Importantes (fricción significativa)

**I1 — Campos Serie y Año fiscal ocupan espacio premium**
- Son campos que el vendedor raramente cambia (una vez al año o menos)
- Ocupan 2 de 4 slots en la primera fila
- **Fix:** Mover a un `<details>` / sección colapsable "Configuración avanzada"

**I2 — IVA% como select por cada línea es verboso**
- 90% de los productos tienen IVA 15%
- Cada línea fuerza al vendedor a ver/interactuar con un select que no necesita
- **Fix:** Default 15%, mostrar el select solo cuando el valor ≠ 15%, o como icono toggle

**I3 — Sin número de línea**
- En facturas con 10+ líneas, no hay referencia visual de posición
- **Fix:** Columna `#` numerada automáticamente

**I4 — Descuento global ubicado en "Datos del documento"**
- Conceptualmente el descuento global pertenece a los totales, no a los datos del documento
- El vendedor busca el descuento cerca del total, no en la cabecera
- **Fix:** Mover al panel de resumen/totales, inline con la fila "Base imponible"

**I5 — Sin indicador visual de campos requeridos**
- Almacén y Forma de pago son required pero no hay asterisco ni feedback hasta submit
- **Fix:** Añadir `*` en labels o validación inline `was-validated`

**I6 — Sin atajos de teclado**
- No hay forma de agregar línea con teclado (solo click en botón)
- El Tab desde el último campo de una línea no agrega nueva línea
- **Fix:** `(keydown.Tab)` en el último campo de la última línea → `addLine()`

**I7 — Totales muestran "Subtotal bruto" siempre, aunque no haya descuento**
- Cuando no hay descuento, mostrar "Subtotal bruto" y "Base imponible" con el mismo valor es redundante
- **Fix:** Cuando `globalDiscountPct === 0` y no hay descuentos de línea, mostrar solo "Subtotal"

### 🟢 Mejoras de polish (diferenciación premium)

**P1 — Sin SKU visible en la línea después de seleccionar producto**
- El vendedor no sabe si el producto seleccionado es el correcto
- **Fix:** Mostrar `[SKU]` como subtext debajo del nombre de descripción

**P2 — Sin stock disponible al seleccionar producto**
- El vendedor no sabe si hay stock antes de agregar la línea
- **Fix:** Mostrar `stockAvailable` como badge junto al resultado de búsqueda

**P3 — Sin indicador "cambios sin guardar"**
- El form muestra solo "Guardar borrador" pero no hay señal visual de que hay cambios pendientes
- **Fix:** Dirty flag + badge "Sin guardar" en header cuando `form.dirty`

**P4 — La tabla no tiene alternating rows**
- En facturas largas es difícil seguir la línea de izquierda a derecha
- **Fix:** `table-striped` o border-left de color por cada fila

**P5 — Sin total acumulado mientras se edita**
- El total se muestra solo en el panel sticky (col-lg-4), que en mobile queda abajo
- **Fix:** En mobile, mostrar el total flotante en la parte inferior de la pantalla (sticky bottom bar)

**P6 — Sin campo de referencia del cliente (PO número)**
- Muchas empresas necesitan referenciar el número de orden de compra del cliente
- **Fix:** Campo opcional `customerReference` en cabecera

**P7 — Emitir desde un borrador navega a edit, no muestra confirmación clara**
- Al emitir, se navega a la misma página pero con status cambiado
- No hay un "momento celebratorio" o resumen de lo emitido
- **Fix:** Toast de éxito más informativo con número de factura generado

---

## 4. ANÁLISIS DE IMPACTO / ESFUERZO

```
         ALTO IMPACTO
              │
    C3 ───────┼──── C1
    I4        │     C2
    I6   ─────┼──── I1
    P3        │     I2
              │
BAJO ─────────┼───────────── ALTO
ESFUERZO      │              ESFUERZO
              │
    P7   ─────┼──── P2
    I7        │     P5
    I5   ─────┼──── P6
    P1, P4    │
              │
         BAJO IMPACTO
```

---

## 5. PLAN DE IMPLEMENTACIÓN — FASES

### FASE 1 — Quick Wins (< 2h) · Sprint actual
*Objetivo: eliminar fricción obvia, sin cambios arquitecturales*

| ID | Cambio | Archivos afectados |
|----|--------|--------------------|
| F1.1 | Mover descuento global al panel de totales | `invoice-form.component.html` |
| F1.2 | Card de cliente seleccionado (chip con × para limpiar) | `invoice-form.component.html/.ts` |
| F1.3 | Ocultar campos Serie/Año en sección colapsable | `invoice-form.component.html` |
| F1.4 | Añadir columna # a líneas | `invoice-form.component.html` |
| F1.5 | Colapsar columnas Subtotal e IVA-importe (solo Total visible, Subtotal en tooltip) | `invoice-form.component.html` |
| F1.6 | Mostrar SKU + stock bajo descripción de línea | `invoice-form.component.html` |
| F1.7 | `form.dirty` badge "Sin guardar" en header | `invoice-form.component.html` |
| F1.8 | Botones de acción SOLO en panel sticky (quitar del header) | `invoice-form.component.html` |
| F1.9 | Separar búsqueda de producto (botón lupa) del campo descripción | `invoice-form.component.html/.ts` |
| F1.10 | Toast más informativo al emitir (con número SRI) | `invoice-form.component.ts` |

### FASE 2 — UX Estructural (< 4h) · Sprint siguiente
*Objetivo: experiencia fluida para power users y móvil*

| ID | Cambio | Archivos afectados |
|----|--------|--------------------|
| F2.1 | Keyboard shortcut: Tab en último campo → addLine() | `.ts` |
| F2.2 | IVA default 15%, mostrar selector solo si cambia | `.html/.ts` |
| F2.3 | Mobile: sticky bottom bar con total | `.html`, `_custom.scss` |
| F2.4 | Stock disponible en dropdown de búsqueda de producto | `.html` |
| F2.5 | Campo `customerReference` (referencia del cliente / # PO) | `.ts`, `invoice.interface.ts` |
| F2.6 | Alternating rows / border-left de color en líneas | `.html`, `_custom.scss` |
| F2.7 | Indicador visual de required fields | `.html`, `_custom.scss` |

### FASE 3 — Features Premium (> 1 día) · Backlog
*Objetivo: diferenciarnos de Contifico*

| ID | Cambio |
|----|--------|
| F3.1 | Autoguardado de borrador cada 30s (con debounce) |
| F3.2 | Formato de pago detallado (SRI Ecuador: efectivo, tarjeta, transferencia...) |
| F3.3 | Creación rápida de cliente desde el formulario (modal inline) |
| F3.4 | Drag & drop para reordenar líneas |
| F3.5 | Copiar factura (duplicar como borrador nuevo) |
| F3.6 | Vista previa RIDE antes de emitir |
| F3.7 | Búsqueda por código de barras (cámara / scanner USB) |

---

## 6. ESPECIFICACIONES DE DISEÑO PARA FASE 1

### 6.1 Nuevo layout de líneas (reducido a 7 columnas visibles)

```
# | Descripción          | Cant | P.Unit | Dto% | IVA% | Total | ×
──┼──────────────────────┼──────┼────────┼──────┼──────┼───────┼──
1 | [🔍] Producto A      |   2  |  10.00 |  0%  |  15% | 20.00 | ×
  |   [SKU: ABC001]      |
```

**Columnas eliminadas del flujo principal:** Subtotal, IVA-importe
- Subtotal visible en tooltip sobre "Total" o como fila expandible
- IVA-importe en panel de totales (desglose por tasa)

### 6.2 Customer chip

```
┌─────────────────────────────────────────────────────────┐
│ 👤  Empresa ABC S.A.                              [× Cambiar] │
│     RUC: 1791234567001  ·  Cód: 000042  ·  Contado      │
│     📧 empresa@abc.com  ·  📞 022-345-678               │
└─────────────────────────────────────────────────────────┘
```

### 6.3 Header simplificado

```
[📄] Nueva Factura                    [● Sin guardar]   [Volver]
     Nueva factura de venta
     ▸ Configuración avanzada (Serie A · 2026)   ← collapsible
```

### 6.4 Panel de totales con descuento integrado

```
┌──────────────────────────────┐
│ RESUMEN                      │
│                              │
│ Subtotal               50.00 │
│ Dto global  [__0__]%  − 0.00 │ ← input aquí
│ Base imponible         50.00 │
│ IVA 15% s/50.00         7.50 │
│ ──────────────────────────── │
│ TOTAL USD              57.50 │
│                              │
│ [  Emitir factura  ]         │
│ [  Guardar borrador ]        │
└──────────────────────────────┘
```

---

## 7. ORCHESTRACIÓN DE AGENTES — ORDEN DE EJECUCIÓN

### Tarea: Implementar FASE 1 (Quick Wins)

```
┌─────────────────────────────────────────────────────────────────┐
│                     CEO Agent (este doc)                         │
│            Análisis, plan, especificaciones                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐
  │ Business    │ │ Angular     │ │ Security        │
  │ Agent       │ │ Agent       │ │ Agent           │
  │             │ │             │ │                 │
  │ Valida:     │ │ Implementa: │ │ Revisa:         │
  │ - Campos    │ │ - HTML      │ │ - XSS en search │
  │   SRI req.  │ │ - TS        │ │ - Sanitización  │
  │ - IVA rates │ │ - SCSS      │ │ - Permisos      │
  │ - Formato   │ │   Fase 1    │ │   de emisión    │
  │   RIDE      │ │             │ │                 │
  └─────────────┘ └──────┬──────┘ └─────────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │  DevOps     │
                  │  Agent      │
                  │             │
                  │  Build +    │
                  │  Verify     │
                  │  ng build   │
                  └─────────────┘
```

### Secuencia de ejecución recomendada:

**Paso 1** — Business Agent (paralelo con Angular Agent)
- Confirmar que las tasas IVA actuales `[0, 5, 8, 15]` son correctas para SRI 2024-2025
- Confirmar que el campo `customerReference` no rompe el XML SRI
- Confirmar campos mínimos del RIDE que deben estar visibles en el form

**Paso 2** — Angular Agent (el más importante)
- Implementar todos los cambios de Fase 1 listados arriba
- Archivo principal: `invoice-form.component.html` (355 líneas → ~320 líneas)
- Archivo TS: solo agregar `clearCustomer()`, `isDirty` computed, `lastAddedLineIdx` signal
- Sin cambios a interfaces ni servicios en Fase 1

**Paso 3** — Security Agent (post-implementación)
- Verificar que el campo `customerReference` no tenga XSS
- Verificar que el chip de cliente no exponga datos sensibles
- Confirmar que el botón "Emitir" tiene la guard correcta

**Paso 4** — DevOps Agent (validación final)
- `ng build --configuration production` → 0 errores
- Confirmar bundle size no aumentó > 5%

---

## 8. MÉTRICAS DE ÉXITO

| Métrica | Actual | Objetivo Fase 1 | Objetivo Fase 3 |
|---------|--------|-----------------|-----------------|
| Tiempo para emitir factura simple (1 línea) | ~45s | < 25s | < 15s |
| Columnas visibles en tabla de líneas | 8 | 7 | 7 (adaptativas) |
| Clicks para agregar línea de producto | 3 | 2 | 1 (Tab) |
| Feedback visual al emitir | Solo toast | Toast + número SRI | Toast + preview RIDE |
| Mobile usable sin scroll horizontal | ❌ | ✅ (líneas colapsadas) | ✅ (layout adaptativo) |

---

## 9. NOTAS TÉCNICAS PARA EL ANGULAR AGENT

### Archivos a modificar en Fase 1:
1. `src/app/features/invoices/invoice-form.component.html` — mayor cambio
2. `src/app/features/invoices/invoice-form.component.ts` — agregar helpers menores
3. `src/scss/_custom.scss` — agregar estilos de customer-chip y dirty-badge

### Constraints:
- NO cambiar `invoice.interface.ts` ni `invoices.service.ts` en Fase 1
- NO cambiar rutas ni módulo de settings
- Mantener `@coreui/angular` como única librería de UI (no agregar ng-bootstrap ni material)
- Todos los estilos en el array `styles: []` del componente O en `_custom.scss` — nunca en archivos .css separados
- Usar `signal()` y `computed()` para nuevo estado — no `BehaviorSubject`
- Formulario sigue siendo `ReactiveFormsModule` — no template-driven

### Patrón de customer chip:
```typescript
// En el TS:
clearCustomer(): void {
  this.selectedCustomer.set(null);
  this.customerSearch.set('');
  this.showCustomerDrop.set(false);
}
```

### Patrón dirty badge:
```typescript
// En el TS — computed basado en form:
isDirty = computed(() => this.form?.dirty ?? false);
```
```html
<!-- En el template: -->
@if (isDirty() && !saving()) {
  <span class="badge bg-warning-subtle text-warning-emphasis ms-2" style="font-size:.68rem">
    Sin guardar
  </span>
}
```

### IVA toggle pattern (F2.2, Fase 2 preview):
```html
<!-- Mostrar select solo si vatPct ≠ 15 -->
<td class="cell-num cell-vat">
  @if (lineCtrl($index, 'vatPct').value !== 15) {
    <select cFormSelect formControlName="vatPct" [disabled]="!isEditable()">
      @for (r of vatOptions; track r) { <option [value]="r">{{ r }}%</option> }
    </select>
  } @else {
    <span class="vat-badge" (click)="isEditable() && toggleVatSelect($index)">15%</span>
  }
</td>
```

---

## 10. REFERENCIA VISUAL — BENCHMARKS

| Sistema | Fortaleza en invoice | Debilidad |
|---------|---------------------|-----------|
| **Contifico** (EC) | Conocido por vendedores locales | UI vieja, lento, sin dark mode |
| **Alegra** (LAT) | Muy limpio, onboarding fácil | Poca customización, caro |
| **Siigo** (COL) | Robusto, confiable | Complejo, curva alta |
| **QuickBooks** (US) | UX pulido, shortcuts | No adaptado a SRI Ecuador |
| **Nuestra meta** | SRI-native + UX moderno + velocidad | — |

---

*Documento creado por CEO Agent · SaasFacturacion · 2026-04-07*
*Próxima revisión: post-implementación Fase 1*
