# Normas de Diseño UI — facturasEC

Documento basado en análisis real del código (2026-08-23), no en un template teórico. Todas las normas citan archivo:línea existente en este repo. Objetivo: usarlo como guía al mejorar vistas — tanto para saber qué **evitar** (anti-patrones ya presentes y extendidos) como qué **replicar** (el patrón más reciente y correcto, `accounting/chart-of-accounts-page`).

> Este documento reemplaza una versión anterior que describía componentes (`app-status-badge`, `app-data-table`, `.kpi-strip`) que **no existen en este proyecto** — parece que se copió de otro repo hermano. Ninguna norma de aquí abajo asume componentes que no estén confirmados en el código.

---

## Contexto técnico

- **Stack UI:** CoreUI 5.x (Angular) sobre Bootstrap 5, standalone components, Angular signals.
- **No hay librería de componentes propia.** `src/app/shared/components/` solo tiene tres piezas reales: `leaflet-map` (mapa Leaflet reutilizado por devices/geofences/routes/gps-monitor), `toast-container` (notificaciones globales) y `plan-limit-banner` (aviso de límites de plan SaaS). **No existen** badge/tabla/paginación compartidos — cada módulo repite su propia lógica de color y su propio `<table>`.
- **Tema oscuro:** se activa vía `[data-coreui-theme]`, gestionado desde `default-header`/`app.component.ts` con el `ColorModeService` de CoreUI. `src/scss/_theme.scss` es mínimo (solo ajusta `body`, alturas de header/sidebar y el `footer-bg` en dark mode) — no hay paleta custom, se corre sobre CoreUI stock + los overrides descritos abajo.

---

## Norma 0 — NUNCA usar `text-*-emphasis` / `--cui-*-emphasis` en código propio

**Esta es la norma más importante y la menos obvia — contradice el consejo estándar de Bootstrap/CoreUI de usar `bg-*-subtle` + `text-*-emphasis`.**

**Causa (`src/scss/_fixes.scss`):** CoreUI 5 genera los tokens `--cui-*-emphasis` / `--cui-*-text-emphasis` en modo oscuro aplicando `tint-color()` sobre el color base. Como el `primary` de CoreUI es violeta (`#321fdb`), ese tono contamina la mezcla y tiñe de violeta `warning`/`success`/`info` en dark mode. El proyecto ya tiene un fix a nivel `:root` que fuerza, en dark mode, `--cui-{color}-emphasis` = `--cui-{color}` (base) — pero el fix es un parche para librerías CoreUI que sí usan esos tokens internamente, **no una licencia para seguir usándolos en código propio**.

**Regla explícita en el comentario del propio código (`_fixes.scss:15-17`):**
> "NUNCA usar `--cui-*-emphasis` en componentes propios; usar `--cui-*` (base) directamente."

**Aplicación práctica — para texto sobre fondo `-subtle`, usar el color base, no `-emphasis`:**

```html
<!-- ❌ No usar -->
<span class="badge bg-success-subtle text-success-emphasis">Activo</span>

<!-- ✅ Correcto — ya es el patrón real usado en el módulo más nuevo -->
<span class="badge bg-success-subtle text-success border border-success-subtle">Activo</span>
```

Confirmado: en todo el proyecto no hay un solo uso de `text-{color}-emphasis` (grep vacío); el único `-emphasis` en uso es `text-medium-emphasis`, que es un token neutro de CoreUI (gris), no de color de marca — ese sí es seguro.

---

## Norma 1 — Badges de estado: `bg-{color}-subtle` + `text-{color}` + borde, no `c-badge [color]` sólido

**Problema:** `<c-badge [color]="...">` (componente CoreUI) pinta fondo sólido saturado. Es el patrón **más extendido del proyecto** — aparece en 90 archivos, prácticamente todos los módulos, incluido **todo `accounting`** (journal-entries, bank-accounts, budget, chart-of-accounts, cost-centers, accounting-periods, bank-reconciliation, libro-diario). No es necesariamente ilegible en dark mode (los colores de marca sí son variables de tema), pero produce ruido visual cuando hay varios badges por fila y no da tanto contraste/jerarquía como el patrón subtle.

**No existe componente compartido para esto** (`app-status-badge` no existe). Cada componente resuelve su propio color con un método tipo `getStatusColor()` / `getEstadoColor()` y sigue usando `<c-badge [color]="...">`.

**Patrón recomendado — el mismo que ya usa el módulo más nuevo del proyecto** (`chart-of-accounts-page.component.html:5-14`):

```html
<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">
  {{ counts().total }} cuentas
</span>
<span class="badge bg-success-subtle text-success border border-success-subtle">
  {{ counts().active }} activas
</span>
<span class="badge bg-info-subtle text-info border border-info-subtle">
  {{ counts().movement }} de movimiento
</span>
```

- `bg-{color}-subtle` + `text-{color}` (color **base**, nunca `-emphasis`, ver Norma 0) + `border border-{color}-subtle` para dar borde sutil.
- No hace falta crear un componente compartido para adoptar esto — son solo clases Bootstrap ya disponibles vía CoreUI. Si en el futuro se repite 4+ veces el mismo bloque en un módulo, sí vale la pena extraer un pequeño componente `app-status-badge`, pero hoy no existe y no hay que asumir que existe.
- No hay que migrar en bloque los 90 archivos existentes — aplicar este patrón **al tocar un módulo**, no como refactor aislado.

---

## Norma 2 — `color="light"` en botones/badges/alerts es un anti-patrón de dark mode real y sin resolver

**Extensión real:** 31 archivos usan `color="light"` — módulos viejos y nuevos por igual (`customers-list.component.html:124,132`, `customer-form.component.html` (7 veces), `product-form.component.html` (10+ veces), `products-list.component.html`, todo `pos/*` (6 archivos: pos-terminals, pos-history, pos-session-select, pos-main, pos-close, pos-discount-modal), `invoice-form.component.html:613,622` (como `c-badge`), settings, users, devices, gps-monitor, routes, team-management, super-admin.

**Por qué es un problema real (no solo estético):** `color="light"` en CoreUI es un valor SCSS fijo (`$light-dark: $light !default`), no una variable `--cui-*` que cambie con el tema. En dark mode el botón/badge se queda blanco/claro, fuera de lugar.

**Reemplazo:**

| Antes | Después |
|---|---|
| `<button cButton color="light" size="sm">` | `<button cButton color="secondary" variant="outline" size="sm">` |
| `<c-badge color="light">Sin procesar</c-badge>` | `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">Sin procesar</span>` |
| `<span class="form-control bg-light">` (campo readonly) | `<span class="form-control bg-body-tertiary">` |

**Al tocar un módulo nuevo:** buscar `color="light"` en el HTML del módulo y migrar. No aplica a `color="primary"`, `color="danger"`, etc. — esos sí son variables de tema y se adaptan bien.

---

## Norma 3 — `color="outline-*"` y `color="ghost"` en `cButton` son valores inválidos, no un problema de tema

**Este es un bug de API real, activo y extendido — 49 ocurrencias de `color="outline-*"` y 22 de `color="ghost"`, repartidas por igual entre módulos viejos y activamente mantenidos hoy** (`customer-form.component.html:319,436`, `product-form.component.html:1114,1293,1349`, `personas/person-form.component.html:735,851`, `settings/pages/form-config/settings-form-config.component.html:14,159`, `settings/pages/company-settings/company-settings.component.html:253,531,656,692` — settings/super-admin concentra buena parte del bug de `ghost`).

**Causa:** `cButton` de CoreUI Angular separa el color del estilo en dos inputs distintos: `color` (`primary`, `secondary`, `danger`...) y `variant` (`'outline' | 'ghost'`). Un string como `"outline-primary"` o `"ghost"` **no es un valor válido de `color`** — el componente lo ignora y el botón se renderiza sin el estilo esperado (se ve "roto", sin color ni contorno), no como el outline/ghost que el autor quiso.

**Forma correcta — ya usada correctamente en 75 archivos, incluido el módulo más nuevo del proyecto** (`chart-of-accounts-page.component.html:19-20,60-61,63-64`):

```html
<!-- ❌ Inválido -->
<button cButton color="outline-primary" size="sm">Agregar</button>
<button cButton color="ghost" size="sm">...</button>

<!-- ✅ Correcto -->
<button cButton color="secondary" variant="outline" size="sm">Agregar</button>
<button cButton color="secondary" variant="ghost" size="sm">...</button>
```

**Al tocar un módulo nuevo:** buscar `color="outline-` y `color="ghost"` en el HTML del módulo y separar en `color="{color}"` + `variant="outline"`/`variant="ghost"`.

---

## Norma 4 — Tablas HTML crudas: evitar `table-light` / `table-*` contextual, y considerar si hace falta un wrapper

**Problema:** 5 archivos con `<table class="table...">` cruda usan `table-light` (`retentions/retention-form.component.html:184`, `purchases/purchases-list.component.html:135`, `purchases/purchase-import.component.html:125,227`, `marketplace/admin/marketplace-orders.component.html`). Igual que `color="light"`, es un color SCSS fijo — el header se queda blanco/claro en dark mode.

**No hay wrapper de tabla compartido en el proyecto** (`app-data-table` no existe) — cada módulo usa `<table cTable>` o `<table class="table">` a mano. No hace falta crear uno para resolver esto puntualmente: basta con evitar `table-light`/`table-warning`/`table-danger` como clase de fila/head y usar en su lugar:

```scss
// En vez de <thead class="table-light">
thead {
  background-color: var(--cui-tertiary-bg);
}
// En vez de <tr class="table-warning">
tr.is-warning {
  background-color: rgba(var(--cui-warning-rgb), .12);
}
```

Si en el futuro aparecen 3+ tablas ad-hoc más con la misma necesidad (selección, orden, paginación), ahí sí conviene evaluar extraer un componente compartido — hoy no es necesario.

---

## Norma 5 — Cards de resumen: evitar 4 `c-card` sólidas de color (`bg-primary`/`bg-success`/`bg-info`/`bg-danger` + `text-white`)

**Dónde aparece:** patrón heredado del template original de CoreUI, sin adaptar — `organizations.component.html:4-53`, `plans.component.html:4-53`, `users.component.html:4-30`. Son 23 ocurrencias en total. A diferencia de `color="light"`, estos SÍ son colores de marca (`--cui-primary`, etc.) y se adaptan razonablemente en dark mode — el problema no es que se rompan, es que 4 bloques saturados uno al lado del otro compiten visualmente y ocupan mucho alto de página para info secundaria (contadores).

**Señal para identificar estos módulos sin tocar:** además de las KPI cards sólidas, suelen usar íconos en **kebab-case** (`cil-building`, `cil-check-circle`) en vez de camelCase (`cilBuilding`) — 166 usos kebab-case en el proyecto, concentrados justamente en estas páginas de template sin modificar (878 usos camelCase en el resto). Es una forma rápida de detectar "código de template original" vs "código propio del equipo".

**Reemplazo recomendado** (mismo espíritu que Norma 1 — subtle, no sólido):

```html
<c-card>
  <c-card-body class="pb-0 d-flex justify-content-between align-items-start">
    <div>
      <div class="fs-4 fw-semibold">{{ summary().total }}</div>
      <div class="text-muted small">Total Organizaciones</div>
    </div>
    <div class="bg-primary-subtle p-3 rounded">
      <svg cIcon name="cilBuilding" size="xl" class="text-primary"></svg>
    </div>
  </c-card-body>
</c-card>
```

No es urgente migrar los 3 módulos existentes solo por esto — aplicar al tocar `organizations`, `plans` o `users` por otra razón.

---

## Norma 6 — Header de página de listado: dos variantes válidas, ambas correctas hoy

El proyecto no tiene un único patrón de header, pero sí dos variantes consistentes y "dark-mode-safe" que conviven. Usar la que mejor encaje según si el módulo necesita contadores en vivo o no — no inventar una tercera.

**Variante A — ícono + título + subtítulo** (`customers-list.component.html:1-14`, la más usada para listados simples):

```html
<div class="d-flex justify-content-between align-items-center mb-1">
  <div class="d-flex align-items-center gap-2">
    <div class="bg-primary bg-opacity-10 p-2 rounded">
      <svg cIcon name="cilPeople" size="xl" class="text-primary"></svg>
    </div>
    <div>
      <h3 class="mb-0 fw-semibold">Clientes</h3>
      <p class="text-muted small mb-0">Gestión de clientes, fichas fiscales y condiciones comerciales</p>
    </div>
  </div>
  <button cButton color="primary" size="sm" (click)="openNew()" class="px-3 shadow-sm">
    <svg cIcon name="cilPlus" class="me-1"></svg> Nuevo Cliente
  </button>
</div>
```

Nota: `bg-primary bg-opacity-10` (no `bg-primary-subtle`) también es válido — usa opacidad relativa, no un valor fijo, así que se adapta igual de bien al tema.

**Variante B — título + badges de conteo + grupo de acciones** (`chart-of-accounts-page.component.html:1-31`, el patrón más nuevo, preferible cuando hay contadores en vivo que mostrar):

```html
<div class="d-flex justify-content-between align-items-start mb-3">
  <div>
    <h4 class="mb-1">Plan de Cuentas</h4>
    <div class="d-flex gap-2 flex-wrap">
      <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">
        {{ counts().total }} cuentas
      </span>
      <!-- ...un badge por conteo, ver Norma 1 -->
    </div>
  </div>
  <div class="d-flex gap-2">
    <button cButton color="secondary" variant="outline" size="sm">Acción secundaria</button>
    <button cButton color="primary" size="sm">Acción primaria</button>
  </div>
</div>
```

**Callouts informativos** (avisos de negocio dentro de un listado, ej. "Consumidor Final no puede eliminarse" en `customers-list.component.html:17-27`):

```html
<c-callout color="primary" class="bg-body border-start-4 shadow-sm mb-4">
  <div class="d-flex gap-3 align-items-start">
    <svg cIcon name="cilInfo" size="lg" class="text-primary mt-1"></svg>
    <div>
      <p class="mb-1 fw-bold">Título del aviso</p>
      <p class="mb-0 text-muted small">Texto explicativo.</p>
    </div>
  </div>
</c-callout>
```

Clave: `bg-body` (no `bg-white`/`bg-light`) — se adapta al tema.

**Filtros** (patrón repetido en customers-list y chart-of-accounts-page): card `class="mb-3"` con `c-card-body class="py-2 px-3"` conteniendo `c-input-group` de búsqueda + filtros tipo "pills" con `[class.btn-primary]`/`[class.btn-outline-secondary]` condicional.

**Paginación:** el proyecto no usa `c-pagination` en los listados revisados (customers, products, invoices) — el filtrado es client-side sobre el array completo, coherente con el patrón Firestore + signals (`onSnapshot` trae todo el dataset del tenant, ya acotado por `organization_id`/`companyId`). No introducir paginación server-side salvo que un listado concreto lo justifique por volumen.

---

## Norma 7 — Formularios reactivos: validación y campos async dependientes de tenant

**Validación de campo:** cada formulario define su propio helper `hasError(fg: FormGroup, field: string): boolean` (ej. `customer-form.component.ts:383`) — no hay un validador/mixin base compartido. Mensajes de error en cascada según tipo de error específico:

```html
@if (hasError(form, 'taxId')) {
  <div class="invalid-feedback d-block">
    @if (form.get('taxId')?.errors?.['required']) {
      RUC/Cédula es requerido
    } @else if (form.get('taxId')?.errors?.['invalidRuc']) {
      RUC/Cédula inválido
    }
  </div>
}
```

con `[class.is-invalid]` en el input correspondiente.

**Campo async dependiente del tenant (`companyId`) — patrón `effect()` + guard `_patched`:**

**Síntoma que este patrón evita:** el documento de la empresa (`TenantService.company`) se puebla asíncronamente vía `onSnapshot`. Si el formulario intenta leer `tenant.company` directamente en el constructor o en `ngOnInit`, llega `undefined` porque Firestore aún no respondió — el form queda sin parchear.

**Solución confirmada en el código** (`settings/pages/marketplace/marketplace-settings.component.ts:107-119`):

```ts
private tenant = inject(TenantService);
private _patched = false;

constructor() {
  // El company signal se puebla asíncronamente vía onSnapshot.
  // effect() reacciona cuando llega el dato y parchea el form una sola vez.
  effect(() => {
    const company = this.tenant.company; // tracked
    if (company && !this._patched) {
      this._patched = true;
      untracked(() => this.patchFromTenant());
    }
  });
}
```

- `effect()` en el constructor de un componente standalone corre dentro del contexto de inyección — no hace falta pasar `injector` explícito.
- El guard `_patched` evita re-parchear el form cada vez que `company` cambie por otro motivo (ej. el usuario edita el nombre de la empresa en otra pestaña) — el form solo se inicializa una vez con los datos del tenant.
- `untracked()` alrededor de `patchFromTenant()` evita que las lecturas de signals dentro del patch (si las hay) se registren como nuevas dependencias del `effect`.

**Vista previa en vivo con `computed()` leyendo un `FormControl`:** si además necesitas que un `computed()` reaccione a cambios de un campo del form (ej. preview de URL, cálculo derivado), recordar que `computed()` solo trackea signals — `FormControl.value` no lo es. Exponer el campo con `toSignal(control.valueChanges, { initialValue: control.value })` y leer ese signal dentro del `computed`, no `.value` directamente. Ver `catalogUrl` en el mismo archivo (`marketplace-settings.component.ts`, computed sobre `slugValue` signal, no sobre `form.get('slug')?.value`).

---

## Norma 8 — Íconos: registro central obligatorio + convención camelCase

**Registro:** `src/app/icons/icon-subset.ts` (461 líneas) importa explícitamente cada ícono usado de `@coreui/icons` (ej. `cilAccountLogout`, `cilBasket`, `cibFacebook`, `cifUs`). **No hay auto-discovery** — si un módulo nuevo necesita un ícono que el set no incluye, hay que agregarlo a este archivo o no se renderiza.

**Convención de nombre:** usar camelCase (`cilPlus`, `cilSearch` — 878 usos) en código nuevo, no kebab-case (`cil-building`, `cil-check-circle` — 166 usos, ver Norma 5, señal de código de template sin tocar). Ambas formas funcionan, pero camelCase es la convención dominante y consistente con el nombre de export de `@coreui/icons`.

---

## Norma 9 — Feedback al usuario: `NotificationService` + `app-toast-container`, no `alert()` ni notificaciones ad-hoc

**Ya existe un mecanismo centralizado y correcto** — `src/app/shared/components/toast-container/toast-container.component.ts` escucha `NotificationService.notifications` (signal) y renderiza `<c-toast>` con color/ícono según tipo:

```ts
const colors = { success: 'success', error: 'danger', warning: 'warning', info: 'info' };
const icons = { success: 'cilCheckCircle', error: 'cilXCircle', warning: 'cilWarning', info: 'cilInfo' };
```

**Uso desde cualquier componente:** inyectar `NotificationService` y llamar `.success(...)`, `.error(...)`, `.warning(...)`, `.info(...)` — no usar `alert()`/`confirm()` nativos ni montar un `c-toast` propio por componente.

**Avisos de límite de plan SaaS:** `<app-plan-limit-banner [resource]="...">` (`shared/components/plan-limit-banner/`) ya resuelve el patrón "estás cerca/al límite de tu plan" con `c-alert [color]="over() ? 'danger' : 'warning'"` — reutilizar en vez de crear un banner ad-hoc si un módulo nuevo necesita avisar límites de recursos (facturas, usuarios, productos, etc.).

---

## Norma 10 — `<select>`: la directiva real es `cSelect`, no `cFormSelect`

**Bug confirmado, corregido en las 25 vistas que lo tenían (2026-08-23).** `cFormControl` (input/textarea) sí existe (`input[cFormControl], textarea[cFormControl]`), lo que hacía fácil asumir por analogía que el select seguía el mismo patrón `cForm*` — pero en `@coreui/angular` 5.6.7 la directiva de select tiene selector `select[cSelect]` (aplica la clase `form-select` de Bootstrap + variables de tema). `cFormSelect` **no es un atributo reconocido por ninguna directiva** — Angular no lo marca como error porque es un atributo plano, no un binding, así que el `<select>` se renderiza nativo del navegador: sin `.form-select`, sin variables `--cui-*`, sin adaptarse a modo oscuro. Se ve "crudo", desalineado con el resto del formulario.

```html
<!-- ❌ No existe esta directiva -->
<select cFormSelect formControlName="type">...</select>

<!-- ✅ Correcto -->
<select cSelect formControlName="type">...</select>
```

**Al ver un `<select>` que "no se ve bien" o parece sin estilizar:** lo primero a revisar es si usa `cFormSelect` en vez de `cSelect` — es la causa más probable y ya se confirmó una vez en `chart-of-accounts-page`.

---

## Checklist al tocar un módulo/vista

- [ ] ¿Hay `text-{color}-emphasis` en algún lado? → eliminar, usar `text-{color}` base (Norma 0).
- [ ] ¿Hay `c-badge [color]="...">` para estado/categoría? → considerar migrar a `bg-{color}-subtle text-{color} border border-{color}-subtle` (Norma 1) — no es obligatorio en cada toque, pero sí si el módulo ya tiene varios badges compitiendo visualmente.
- [ ] ¿Hay `color="light"` en botones, badges o `bg-light` en algún contenedor? → `color="secondary" variant="outline"` / `bg-body-tertiary` (Norma 2).
- [ ] ¿Hay `color="outline-*"` o `color="ghost"` como valor de `color` en `cButton`? → bug de API, separar en `color="{color}"` + `variant="outline"`/`"ghost"` (Norma 3).
- [ ] ¿Hay `table-light`/`table-warning`/`table-danger` en una tabla cruda? → reemplazar por `var(--cui-tertiary-bg)` / `rgba(var(--cui-{color}-rgb), .12)` (Norma 4).
- [ ] ¿Hay 3-4 `c-card` con `bg-{color}` sólido + `text-white` como resumen? → evaluar convertir a cards con `bg-{color}-subtle` en el ícono, no en toda la card (Norma 5).
- [ ] ¿El header de la página no sigue ninguna de las dos variantes conocidas (Norma 6)? → usar Variante A (ícono+título) para listados simples, Variante B (título+badges de conteo) si hay contadores en vivo.
- [ ] ¿El form lee `tenant.company` (u otro dato async por tenant) directamente sin `effect()` + guard? → aplicar el patrón de Norma 7 antes de que aparezca el bug de "el form no se llena".
- [ ] ¿El componente usa `alert()`, un toast propio, o un banner de límite ad-hoc? → `NotificationService` / `app-toast-container` / `app-plan-limit-banner` (Norma 9).
- [ ] ¿Usaste un ícono nuevo? → agregarlo a `src/app/icons/icon-subset.ts` en camelCase (Norma 8).
- [ ] ¿Hay un `<select>` que se ve sin estilizar? → revisar si usa `cFormSelect` en vez de `cSelect` (Norma 10).
- [ ] Verificar visualmente en modo claro **y** oscuro antes de dar por terminado.

---

## Estado real de cobertura (no asumir que está resuelto)

Ninguna de estas normas está aplicada de forma sistemática todavía — son extracciones de los mejores patrones ya presentes en el código, no un refactor ya hecho. En particular:

- `color="light"` (31 archivos), `color="outline-*"`/`color="ghost"` inválidos (71 ocurrencias combinadas) y `c-badge [color]` sólido (90 archivos) están **repartidos parejo entre módulos viejos y módulos activamente mantenidos hoy** (incluye `accounting`, `settings`, `super-admin`) — no son deuda técnica aislada a limpiar de una vez, sino hábitos a corregir módulo por módulo al tocarlos.
- El módulo con el patrón más limpio y más reciente es `src/app/features/accounting/pages/chart-of-accounts-page/` — usarlo como referencia de "cómo se debería ver" cuando haya dudas entre dos formas de resolver algo.
- Los módulos con KPI cards sólidas + íconos kebab-case sin tocar (`organizations`, `plans`, `users`) son candidatos naturales para la próxima ronda de mejoras de vistas, ya que concentran varios anti-patrones a la vez (Norma 5 + posiblemente Norma 2/3 en sus formularios).
