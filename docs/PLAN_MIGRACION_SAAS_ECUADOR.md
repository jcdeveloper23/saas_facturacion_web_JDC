# Plan de Implementación — SaaS ERP Ecuador
## FacturaScripts (PHP) → Angular 21 + Firebase

**Versión:** 4.1
**Última actualización:** 2026-04-13
**Stack:** Angular 21 · CoreUI 5.x · Firebase (Firestore, Auth, Functions, Storage) · Node.js 20
**Convención de nombres:** Inglés en todo el código
**Arquitectura:** Multi-tenant (`/companies/{companyId}/...`) + Plugin Package system

---

## Decisiones arquitecturales (cerradas)

| Decisión | Elegido | Motivo |
|----------|---------|--------|
| UI library | **CoreUI 5.x** | Ya existe en el proyecto base, layout construido |
| Backend | **Firebase** (reemplaza Feathers + JWT) | Realtime, serverless, sin infra propia |
| Auth | **Firebase Auth + custom claims** `{ companyId, role }` | Sin API extra de permisos |
| Multi-tenant | **Sí** — subcollecciones bajo `/companies/{companyId}/` | Aislamiento natural en reglas Firestore |
| Facturación electrónica SRI | **En scope** | Obligatorio por ley en Ecuador |
| Código | **Inglés** en clases, métodos, interfaces, variables | Consistencia y estándar profesional |
| **Plugin system** | **Firestore `/modules` + `/plugin-packages`** — activable por empresa | Igual a FacturaScripts fs_pages, sin hardcodear |
| **Módulos por empresa** | `company.enabledModules: string[]` derivado de plugins activos | Toggle desde Super Admin sin deploy |
| **Plugin Packages** | Agrupaciones comerciales de módulos con precio | Permite cobro por separado y personalización de UI |

---

## Repositorio / Proyectos

| Carpeta | Descripción |
|---------|-------------|
| `coreui-facturasEC-front-web/` | Frontend Angular 21 (proyecto base GPS reconvertido) |
| `sistemadeventascompletoOptica/` | Sistema PHP legado (referencia funcional) |
| `sistemadeventascompletoOptica/ESPECIFICACIONES_MODULOS.md` | Specs funcionales de los 14 módulos |
| `sistemadeventascompletoOptica/GUIA_RAPIDA_DESARROLLO.md` | Guía técnica con patrones de código |
| `DB_ANALISIS_FIRESTORE.md` | 133+ tablas PHP mapeadas a Firestore |

---

## Plugin Packages — Arquitectura Comercial

### Concepto
Un **Plugin Package** es una agrupación comercial de módulos que se ofrece como una unidad. Una empresa activa paquetes, no módulos individuales. Los módulos habilitados se derivan automáticamente de los paquetes activos.

### Paquetes disponibles

| Código | Nombre | Módulos incluidos | Precio sugerido |
|--------|--------|-------------------|-----------------|
| `pkg_base` | Base | dashboard, settings, users | Incluido |
| `pkg_sales` | Facturación Base | personas, products, invoices, stock | $XX/mes |
| `pkg_sales_advanced` | Facturación Avanzada | quotes, orders, proformas, pos | $XX/mes |
| `pkg_sri` | Facturación Electrónica SRI | sri, debitNotes, retentions (+ credit notes) | $XX/mes |
| `pkg_purchases` | Módulo Compras | suppliers (personas), purchase_invoices, purchase_orders, purchase_proformas | $XX/mes |
| `pkg_reports` | Reportes e Informes | report_invoices, report_products, report_orders | $XX/mes |
| `pkg_marketplace` | Catálogo Público | marketplace | $XX/mes |

### Dependencias entre paquetes

```
pkg_base (siempre activo)
  └── pkg_sales        (requiere pkg_base)
        ├── pkg_sales_advanced  (requiere pkg_sales)
        ├── pkg_sri             (requiere pkg_sales)
        ├── pkg_marketplace     (requiere pkg_sales)
        └── pkg_purchases       (requiere pkg_sales)
              └── pkg_reports   (requiere pkg_sales)
```

### Firestore Schema — Plugin Packages

```
/plugin-packages/{packageId}        ← Catálogo platform-level
  code: string                      ← 'pkg_sri'
  name: string                      ← 'Facturación Electrónica SRI'
  description: string
  modules: string[]                 ← códigos de módulos que incluye
  dependencies: string[]            ← códigos de otros packages requeridos
  price: number                     ← precio mensual en USD
  currency: 'USD'
  billingPeriod: 'monthly' | 'yearly' | 'one_time'
  icon: string                      ← ícono CoreUI
  color: string                     ← color del badge/card
  isSystem: boolean                 ← pkg_base no se puede desactivar
  order: number
  state: boolean

/companies/{companyId}
  enabledPackages: string[]         ← NUEVO: paquetes activos ['pkg_base','pkg_sales','pkg_sri']
  enabledModules: string[]          ← EXISTENTE: derivado de packages + overrides manuales
  disabledModules: string[]         ← overrides manuales (caso edge)
```

### TenantService — Lógica de resolución

```typescript
// TenantService recalcula enabledModules cuando cambian los packages
private resolveModulesFromPackages(packages: string[], catalog: PluginPackage[]): string[] {
  const active = catalog.filter(p => packages.includes(p.code));
  return [...new Set(active.flatMap(p => p.modules))];
}
```

### Personalización de UI por paquete

- El **sidebar/nav** filtra ítems según `TenantService.hasModule(code)` — ya funciona
- Las **rutas** usan `moduleGuard` con `data.module` — ya funciona
- Los **tiles del Dashboard** son condicionales por módulo activo
- En la pantalla de **login/onboarding** se puede mostrar solo lo que la empresa tiene activo

### Pantalla "Mis Plugins" (empresa)

Una nueva ruta `/settings/plugins` (o `/plugins`) visible para el admin de empresa permite:
- Ver paquetes activos con fecha de activación
- Ver paquetes disponibles con descripción y precio
- Solicitar activación/desactivación (flujo de ventas, no auto-servicio por defecto)
- O modo auto-servicio con Stripe si se implementa pagos

---

## Módulos del sistema

| # | Módulo | Fase | Estado | Paquete | Ruta |
|---|--------|------|--------|---------|------|
| — | Plugin Package Catalog | F2b | ✅ Completo | — | `/super-admin/plugin-packages` |
| — | Plugin Catalog (módulos individuales) | F2 | ✅ Completo | — | `/super-admin/catalog` |
| — | Company Plugin Management | F2 | ✅ Completo | — | `/super-admin/companies/:id/plugins` |
| 0 | Company & Tenant Management | F2 | ✅ Completo | — | `/super-admin/companies` |
| 1 | Authentication & Users | F1 | ✅ Completo | pkg_base | `/login` |
| 2 | Personas (clientes, proveedores, empleados) | F3 | ✅ Completo | pkg_sales | `/personas` |
| 3 | Products | F3 | ✅ Completo | pkg_sales | `/products` |
| 4 | Settings | F3 | ✅ Completo | pkg_base | `/settings` |
| 5 | Sales Invoices | F4 | ✅ Completo | pkg_sales | `/invoices` |
| 6 | Debit Notes (SRI) | F5 | ✅ Completo | pkg_sri | `/debit-notes` |
| 7 | Retentions (SRI) | F5 | ✅ Completo | pkg_sri | `/retentions` |
| 8 | Credit Notes (SRI) | F5 | ✅ Completo | pkg_sri | (inline en facturas) |
| 9 | Electronic Invoicing UI | F5 | ✅ Completo | pkg_sri | `/electronic-invoicing` |
| 10 | Stock Management | F6 | ⬜ Pendiente | pkg_sales | `/stock` |
| 11 | Quotes | F6 | ⬜ Pendiente | pkg_sales_advanced | `/quotes` |
| 12 | Orders | F6 | ⬜ Pendiente | pkg_sales_advanced | `/orders` |
| 13 | Proformas | F6 | ⬜ Pendiente | pkg_sales_advanced | `/proformas` |
| 14 | POS — Point of Sale | F6 | ⬜ Pendiente | pkg_sales_advanced | `/pos` |
| 15 | Purchase Invoices | F6b | ⬜ Pendiente | pkg_purchases | `/purchase-invoices` |
| 16 | Purchase Orders | F6b | ⬜ Pendiente | pkg_purchases | `/purchase-orders` |
| 17 | Dashboard | F7 | ⬜ Pendiente | pkg_base | `/dashboard` |
| 18 | Plugin Packages UI (empresa) | F2b | ✅ Completo | pkg_base | `/settings/plugins` |
| 19 | Marketplace / Catálogo Público | F8 | ⬜ Pendiente | pkg_marketplace | `/{slug}` (público) + `/settings/marketplace` |

---

## Fases de implementación

### Fase 1 — Infraestructura y Auth ✅
> Estado: **100% completo**

- [x] Firebase instalado y configurado
- [x] `firestore.rules` — reglas multi-tenant completas
- [x] `storage.rules` — certificados, imágenes, documentos
- [x] `AuthService` — Firebase Auth + custom claims `{ companyId, role }`
- [x] `TenantService` — `activeModules` signal, `hasModule()`
- [x] `FirestoreService` — CRUD multi-tenant
- [x] `PermissionsService`, guards, interceptors
- [ ] **Pendiente deploy:** `firebase deploy --only firestore:rules,storage,functions`

---

### Fase 2 — Super Admin (Gestión de Tenants) ✅
> Estado: **100% completo** (pendiente deploy CF + seed)

- [x] Companies CRUD con botones Editar / Plugins / Suspender
- [x] Plans management (Basic / Professional / Enterprise)
- [x] `ModulesService`, `ActionsService`, `PermissionsCatalogService`
- [x] `features/permissions/` — catálogo módulos/acciones/permisos
- [x] `CompanyPluginsComponent` — toggles por empresa con cascade
- [x] Cloud Function `setupCompany` + `setUserCustomClaims`
- [x] Seed de 24 módulos + 7 acciones

#### Fase 2b — Plugin Packages ✅
> Estado: **100% completo**

- [x] Interface `PluginPackage` en `permission.interface.ts`
- [x] `PluginPackagesService` — CRUD `/plugin-packages` (root)
- [x] Seed `PLUGIN_PACKAGES_SEED` con los 6 paquetes definidos
- [x] `features/super-admin/pages/plugin-packages/` — UI catálogo paquetes
  - Lista con cards (precio, módulos incluidos, dependencias, usage por empresa)
  - CRUD paquetes con panel lateral inline
  - Visual module picker agrupado por categoría (Ventas, SRI, Compras…)
  - Botón "Registrar faltantes" + "Sincronizar" vs seed
  - Árbol de dependencias visual
- [x] `CompanyPluginsComponent` — muestra packages primero con toggle cascade
  - Card por paquete con toggle (activa/desactiva + módulos derivados)
  - Dependencias faltantes bloqueantes antes de activar
  - Guarda `enabledPackages` + `enabledModules` en Firestore
- [x] `TenantService` — `activePackages` signal + `hasPackage()`
  - Nota: `resolveModulesFromPackages()` no vive en TenantService; la resolución
    ocurre en `CompanyPluginsComponent` al guardar (diseño equivalente, más explícito)
- [x] `features/settings/pages/plugins/` — `CompanyPluginsViewComponent`
  - Ruta `/settings/plugins`
  - Cards de paquetes activos (verde) / disponibles (gris + precio)
  - Modo lectura con botón "Solicitar activación" (deshabilitado, flujo ventas)
- [x] `firestore.rules` — regla `/plugin-packages/{packageId}` añadida
- [x] Entrada en sidebar empresa — `{ name: 'Mis Plugins', url: '/settings/plugins' }` bajo "Configuración"

---

### Fase 3 — Maestros ✅
> Estado: **100% completo**

- [x] Settings — almacenes, impuestos, series, config empresa, SMTP, SRI
- [x] Personas — clientes, proveedores, empleados (multi-rol)
- [x] Products — catálogo con stocks, familias, imágenes
- [x] Customers feature — lista, form con tabs, validador RUC/CI

---

### Fase 4 — Documentos de Venta ✅
> Estado: **100% completo**

- [x] `features/invoices/` — list, form, detail
- [x] Autocomplete cliente, tabla líneas inline, panel totales
- [x] IVA 15% Ecuador, series automáticas
- [x] Cloud Functions para emisión y estadísticas

---

### Fase 5 — Facturación Electrónica SRI ✅
> Estado: **100% completo**

- [x] Upload certificado `.p12` a Firebase Storage
- [x] CF `generateInvoiceXml` — XML factura v1.0.0 (codDoc=01)
- [x] CF `signXml` — firma XAdES-BES con `node-forge`
- [x] CF `sendToSri` — envío SOAP (recepción + autorización)
- [x] CF `checkSriStatus` — consulta estado autorización
- [x] CF `generatePdf` / `generateCreditNotePdf` / `generateDebitNotePdf` / `generateRetentionPdf`
- [x] CF `generateCreditNoteXml` — notas de crédito (codDoc=04)
- [x] CF `generateDebitNoteXml` — notas de débito (codDoc=05)
- [x] CF `generateRetentionXml` — retenciones (codDoc=07)
- [x] `onInvoiceEmit` / `onDebitNoteEmit` / `onRetentionEmit` — triggers Firestore
- [x] Email con RIDE adjunto (facturas, notas de crédito, débito, retenciones)
- [x] `features/invoices/` — estados SRI visualizados (PENDING→SIGNED→SENT→AUTHORIZED/REJECTED)
- [x] `features/debit-notes/` — list, form, integración SRI
- [x] `features/retentions/` — list, form, integración SRI
- [x] Ambientes pruebas y producción configurables

---

### Fase 6 — Módulos Avanzados
> Estado: **0%**
> **Prerequisito:** F3 + F4 + F5 completas ✅

#### Stock Management ⬜
- [ ] `features/stock/` — consulta por producto / por almacén
- [ ] Ajustes de inventario con autorización
- [ ] Transferencias entre almacenes
- [ ] Log de movimientos (read-only)
- [ ] Activar ruta `/stock` con `moduleGuard: 'stock'`

#### Quotes (Presupuestos) ⬜
- [ ] `features/quotes/` — list, form, conversión a order/invoice
- [ ] CF `generateQuoteNumber`
- [ ] CF `markExpiredQuotes` (scheduled diario)
- [ ] Activar ruta `/quotes` con `moduleGuard: 'quotes'`

#### Orders (Pedidos de Cliente) ⬜
- [ ] `features/orders/` — list, form, picking checklist, conversión a invoice
- [ ] Reserva de stock opcional
- [ ] CF `generateOrderNumber`
- [ ] Activar ruta `/orders` con `moduleGuard: 'orders'`

#### Proformas ⬜
- [ ] `features/proformas/` — notas de entrega / albaranes
- [ ] Conversión a factura
- [ ] Activar ruta `/proformas` con `moduleGuard: 'proformas'`

#### POS — Point of Sale ⬜
- [ ] `features/pos/` — pantalla full-screen, barcode, carrito, cobro
- [ ] Apertura / cierre de caja
- [ ] Métodos de pago: efectivo (cambio), tarjeta, transferencia, mixto
- [ ] CF `validateCashSessionOpen`, `generateInvoiceFromPosSale`
- [ ] Atajos teclado F1–F5
- [ ] Activar ruta `/pos` con `moduleGuard: 'pos'` + `roleGuard: ['admin', 'cashier']`

#### Fase 6b — Compras ⬜
- [ ] `features/purchase-invoices/` — facturas recibidas de proveedores
- [ ] `features/purchase-orders/` — órdenes de compra
- [ ] CF `generatePurchaseInvoiceNumber`
- [ ] Activar rutas con `moduleGuard: 'purchase_invoices'` / `'purchase_orders'`

---

### Fase 7 — Dashboard y Estadísticas
> Estado: **0%**
> **Prerequisito:** F4 completa ✅ — puede arrancar

- [ ] KPI cards: ventas hoy, mes, facturas pendientes, stock bajo mínimo
- [ ] Gráfica ventas 7 días (Chart.js — ya instalado)
- [ ] Gráfica ventas por familia (pie)
- [ ] Top 10 productos más vendidos
- [ ] Últimas 10 facturas
- [ ] Alertas: stock bajo, facturas vencidas, certificado SRI por vencer (< 30 días)
- [ ] CF `updateDailyStats` (scheduled)
- [ ] Tiles condicionales según `TenantService.hasModule()`

---

### Fase 8 — Marketplace / Catálogo Público (`pkg_marketplace`)
> Estado: **0%**
> **Prerequisito:** F3 completa (Products + Families) ✅ — puede arrancar inmediatamente

#### Descripción del módulo

Cada empresa con `pkg_marketplace` activo expone un catálogo público de productos accesible
sin autenticación en la URL `facturasec.com/{slug}`. El catálogo muestra solo
productos activos con stock disponible, filtrables por familia. La empresa configura su
catálogo desde Settings.

**URL strategy decidida: raíz directa `/{slug}`**
- URL: `https://facturasec.com/{slug}` — limpia, sin prefijo `/catalogo/`
- Implementado sobre Firebase Hosting existente (rewrite `** → /index.html` ya activo)
- Sin infraestructura adicional
- Campo `catalogSlug` único por empresa, generado desde el nombre al activar el paquete
- **Slugs reservados** — validados al crear/editar, no permitidos como slug:
  `login`, `logout`, `register`, `settings`, `invoices`, `products`, `personas`,
  `debit-notes`, `retentions`, `stock`, `quotes`, `orders`, `proformas`, `pos`,
  `purchase-invoices`, `purchase-orders`, `super-admin`, `dashboard`, `permissions`,
  `catalogo`, `api`, `admin`, `app`
- Nota: subdominios dinámicos (`empresa.facturasec.com`) requieren proxy externo —
  posible en Fase 9 si hay demanda comercial, no en scope ahora

---

#### 8.1 — Plugin Package `pkg_marketplace`

**Agente: Firebase Agent + Architecture Agent**

- [ ] Agregar `pkg_marketplace` al seed `PLUGIN_PACKAGES_SEED`:
  ```
  code: 'pkg_marketplace'
  name: 'Catálogo Público'
  modules: ['marketplace']
  dependencies: ['pkg_sales']   // requiere Products + Families
  price: XX
  ```
- [ ] Registrar módulo `marketplace` en `modules-seed.ts`
- [ ] Ejecutar "Registrar faltantes" desde Super Admin > Plugin Packages (o seed script)
- [ ] Actualizar tabla de módulos en este documento

---

#### 8.2 — Schema Firestore

**Agente: Firebase Agent**

**Campos nuevos en `/companies/{companyId}`** (extender `Company` interface):

```typescript
marketplace?: {
  enabled: boolean;              // catálogo activo/inactivo
  slug: string;                  // URL-safe, único — 'optica-vision-2020'
  welcomeMessage?: string;       // texto de bienvenida en el header
  primaryColor?: string;         // hex — color principal del catálogo '#1a73e8'
  showPrices: boolean;           // mostrar precios o solo disponibilidad
  showOutOfStock: boolean;       // mostrar productos sin stock (con badge 'Agotado')
  allowedFamilyIds?: string[];   // familias visibles (vacío = todas)
  updatedAt: Timestamp;
}
```

**Colección pública desnormalizada (preferida sobre query directa a companies):**
```
/public-catalogs/{slug}           // escrita por CF trigger, nunca expone datos internos
  companyId: string
  companyName: string
  logoUrl?: string
  primaryColor?: string
  welcomeMessage?: string
  showPrices: boolean
  showOutOfStock: boolean
  allowedFamilyIds: string[]
  updatedAt: Timestamp

/public-catalogs/{slug}/products/{productId}   // proyección mínima de producto
  id: string
  name: string
  shortName?: string
  notes?: string
  imageUrl?: string
  familyId?: string
  familyName?: string
  salePrice: number
  taxRate?: number
  stockAvailable: number
  noStock: boolean
  isPublic: boolean
  isActive: boolean
```

Esta colección evita que lectores anónimos accedan a `costPrice`, `averageCost`,
`purchaseAccountCode` y datos fiscales de la empresa.

---

#### 8.3 — Firestore Rules

**Agente: Security Agent**

- [ ] Permitir lectura pública de `/public-catalogs/{slug}` y su subcolección `products`:
  ```
  match /public-catalogs/{slug} {
    allow read: if true;
    allow write: if false;   // solo Cloud Functions
  }
  match /public-catalogs/{slug}/products/{productId} {
    allow read: if true;
    allow write: if false;
  }
  ```
- [ ] Las reglas existentes de `/companies/{companyId}/products` no cambian —
      la lectura anónima va solo a `/public-catalogs`, nunca a la colección interna
- [ ] Agregar índice compuesto en `firestore.indexes.json` para `/public-catalogs/{slug}/products`:
  ```json
  {
    "collectionGroup": "products",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "isActive", "order": "ASCENDING" },
      { "fieldPath": "familyId", "order": "ASCENDING" },
      { "fieldPath": "name",     "order": "ASCENDING" }
    ]
  }
  ```

---

#### 8.4 — Cloud Functions: sincronización del catálogo público

**Agente: Cloud Functions Agent**

**CF 1: `onMarketplaceSettingsChange`**
Trigger: `onDocumentWritten('/companies/{companyId}')`

- [ ] Detectar cambio en `company.marketplace.*`
- [ ] Si `enabled === true`: escribir/actualizar `/public-catalogs/{slug}` con datos desnormalizados
- [ ] Si `enabled === false`: borrar `/public-catalogs/{slug}` y su subcolección `products`
- [ ] Si cambia el slug: borrar el slug anterior, crear el nuevo
- [ ] Validar unicidad del slug antes de escribir

```
functions/src/marketplace/on-marketplace-settings-change.ts
```

**CF 2: `onProductPublicSync`**
Trigger: `onDocumentWritten('/companies/{companyId}/products/{productId}')`

- [ ] Si producto `isPublic === true` y empresa tiene `marketplace.enabled === true`:
      escribir proyección mínima en `/public-catalogs/{slug}/products/{productId}`
- [ ] Si `isPublic === false` o producto eliminado: borrar de `/public-catalogs/{slug}/products`

```
functions/src/marketplace/on-product-public-sync.ts
```

---

#### 8.5 — Vista pública del catálogo (Angular — sin auth)

**Agente: Angular Agent**

Ruta pública: `:slug` — fuera del `DefaultLayoutComponent`, sin `authGuard`. Debe ir **al final** de `app.routes.ts` para no shadear rutas de la app.

**Estructura de archivos:**
```
src/app/features/marketplace/
  catalog/
    catalog-shell.component.ts        // layout público: header empresa, footer
    catalog-shell.component.html
    catalog-list.component.ts         // grid de productos con filtros
    catalog-list.component.html
    catalog-detail.component.ts       // vista detalle producto
    catalog-detail.component.html
  services/
    public-catalog.service.ts         // queries públicas a /public-catalogs
  models/
    catalog.interface.ts              // PublicCatalog, PublicProduct
  marketplace.routes.ts
```

**Ruta en `app.routes.ts`** (pública, sin guards — debe ser la última entrada):
```typescript
// IMPORTANTE: al final del array de rutas para no shadear rutas de la app
{
  path: ':slug',
  loadChildren: () =>
    import('./features/marketplace/marketplace.routes')
    .then(m => m.MARKETPLACE_ROUTES)
}
```

**`PublicCatalogService`:**
```typescript
getCatalogBySlug(slug: string): Observable<PublicCatalog | null>
  // lee /public-catalogs/{slug}

getPublicProducts(slug: string, familyId?: string): Observable<PublicProduct[]>
  // /public-catalogs/{slug}/products
  // where isActive == true
  // orderBy name — limit 100

getFamiliesFromProducts(products: PublicProduct[]): string[]
  // extrae familyIds únicos para construir filtro en cliente
```

**Diseño del catálogo (NO CoreUI admin — CSS propio):**
- Header: logo empresa, nombre, color primario via CSS custom property `--catalog-primary`
- Grid de cards: imagen (placeholder si sin imagen), nombre, precio (si `showPrices`),
  badge Disponible / Agotado / Servicio
- Sidebar filtros: familias como checkboxes, búsqueda en tiempo real (filtra en cliente)
- Vista detalle: imagen ampliada, descripción, precio con y sin IVA, familia,
  botón "Compartir" (URL con `?p={productId}`)
- Estados: catálogo no encontrado, catálogo desactivado, sin productos
- Responsive — mobile-first

---

#### 8.6 — Panel de configuración en Settings

**Agente: Angular Agent**

Nueva ruta: `/settings/marketplace`

```
src/app/features/settings/pages/marketplace/
  marketplace-settings.component.ts
  marketplace-settings.component.html
```

- [ ] Agregar ruta en `settings.routes.ts`:
  ```typescript
  {
    path: 'marketplace',
    loadComponent: () =>
      import('./pages/marketplace/marketplace-settings.component')
      .then(m => m.MarketplaceSettingsComponent),
    data: { title: 'Catálogo Público' }
  }
  ```
- [ ] Agregar en sidebar `_nav.ts` bajo "Configuración", condicional a `hasModule('marketplace')`:
  ```typescript
  { name: 'Catálogo Público', url: '/settings/marketplace', icon: 'cilCart' }
  ```

**Controles del panel:**
- Toggle "Activar catálogo público"
- Campo slug con validación (solo `[a-z0-9-]`) + preview URL en tiempo real
- Botón "Abrir catálogo" (nueva pestaña)
- Toggle "Mostrar precios"
- Toggle "Mostrar productos agotados"
- Textarea "Mensaje de bienvenida" (max 200 chars)
- Input color "Color principal" + preview del header
- Multi-select "Familias visibles" (vacío = todas)
- Botón "Guardar" — actualiza `company.marketplace` en Firestore
- Si `pkg_marketplace` no activo: card "Activa el paquete Catálogo Público" + botón
  "Solicitar activación" (deshabilitado, flujo ventas)

---

#### 8.7 — Módulo `marketplace` en seed

**Agente: Architecture Agent**

Agregar en `src/app/core/seed/modules-seed.ts`:
```typescript
{
  code: 'marketplace',
  name: 'Catálogo Público',
  description: 'Catálogo de productos público accesible sin login',
  package: 'pkg_marketplace',
  route: '/settings/marketplace',
  icon: 'cilCart',
  order: 20,
  state: true
}
```

---

#### 8.8 — Deploy

**Agente: DevOps Agent**

- [ ] Agregar índices en `firestore.indexes.json` (ver 8.3)
- [ ] Build: `ng build`
- [ ] Deploy: `firebase deploy --only firestore:indexes,firestore:rules,functions,hosting`
- [ ] Smoke test: crear empresa de prueba con slug, activar `pkg_marketplace`,
      acceder a `http://localhost:4200/catalogo/{slug}` con emulador

---

#### Checklist de tareas — Fase 8

| Tarea | Agente | Estado |
|-------|--------|--------|
| 8.1 Seed `pkg_marketplace` + módulo `marketplace` | Firebase Agent | ⬜ |
| 8.2 Extender `Company` interface con `marketplace?` | Firebase Agent | ⬜ |
| 8.2 Interfaces `PublicCatalog`, `PublicProduct` | Firebase Agent | ⬜ |
| 8.3 Reglas Firestore `public-catalogs` | Security Agent | ⬜ |
| 8.3 Índice compuesto `public-catalogs/products` | Security Agent | ⬜ |
| 8.4 CF `onMarketplaceSettingsChange` | Cloud Functions Agent | ⬜ |
| 8.4 CF `onProductPublicSync` | Cloud Functions Agent | ⬜ |
| 8.5 `features/marketplace/` — estructura completa | Angular Agent | ⬜ |
| 8.5 `PublicCatalogService` | Angular Agent | ⬜ |
| 8.5 `CatalogShellComponent` — layout público | Angular Agent | ⬜ |
| 8.5 `CatalogListComponent` — grid + filtros | Angular Agent | ⬜ |
| 8.5 `CatalogDetailComponent` — detalle producto | Angular Agent | ⬜ |
| 8.5 Ruta pública `catalogo/:slug` en `app.routes.ts` | Angular Agent | ⬜ |
| 8.6 `MarketplaceSettingsComponent` | Angular Agent | ⬜ |
| 8.6 Ruta `/settings/marketplace` | Angular Agent | ⬜ |
| 8.6 Entrada sidebar `_nav.ts` | Angular Agent | ⬜ |
| 8.7 Módulo `marketplace` en `modules-seed.ts` | Architecture Agent | ⬜ |
| 8.8 Deploy indexes + rules + functions + hosting | DevOps Agent | ⬜ |

#### Archivos a crear

| Archivo | Agente |
|---------|--------|
| `src/app/features/marketplace/marketplace.routes.ts` | Angular |
| `src/app/features/marketplace/catalog/catalog-shell.component.ts` | Angular |
| `src/app/features/marketplace/catalog/catalog-list.component.ts` | Angular |
| `src/app/features/marketplace/catalog/catalog-detail.component.ts` | Angular |
| `src/app/features/marketplace/services/public-catalog.service.ts` | Angular |
| `src/app/features/marketplace/models/catalog.interface.ts` | Firebase |
| `src/app/features/settings/pages/marketplace/marketplace-settings.component.ts` | Angular |
| `functions/src/marketplace/on-marketplace-settings-change.ts` | Cloud Functions |
| `functions/src/marketplace/on-product-public-sync.ts` | Cloud Functions |

#### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/app/app.routes.ts` | Ruta pública `catalogo/:slug` |
| `src/app/features/settings/settings.routes.ts` | Ruta `marketplace` |
| `src/app/features/super-admin/layout/_nav.ts` | Entrada sidebar settings |
| `src/app/features/super-admin/models/company.interface.ts` | Campo `marketplace?` |
| `src/app/core/seed/modules-seed.ts` | Módulo `marketplace` |
| `firestore.rules` | Reglas `public-catalogs` |
| `firestore.indexes.json` | Índices productos públicos |
| `functions/src/index.ts` | Exportar CFs del marketplace |

---

## Progreso general

```
F1 Infraestructura    ███████████████ 100% ✅
F2 Super Admin        ███████████████ 100% ✅ (pendiente deploy CF)
F2b Plugin Packages   ███████████████ 100% ✅
F3 Maestros           ███████████████ 100% ✅
F4 Documentos Venta   ███████████████ 100% ✅
F5 SRI Electrónico    ███████████████ 100% ✅
F6 Avanzado           ░░░░░░░░░░░░░░░   0%
F6b Compras           ░░░░░░░░░░░░░░░   0%
F7 Dashboard          ░░░░░░░░░░░░░░░   0%
F8 Marketplace        ░░░░░░░░░░░░░░░   0%
```

---

## Archivos clave — Estado actual

### Core
| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `src/app/app.config.ts` | ✅ | Providers Firebase, APP_INITIALIZER |
| `src/app/app.routes.ts` | ✅ | Rutas activas: settings, super-admin, permissions, invoices, debit-notes, retentions |
| `src/app/core/services/auth.service.ts` | ✅ | Firebase Auth + custom claims |
| `src/app/core/services/tenant.service.ts` | ✅ | `activeModules` signal, `hasModule()` |
| `src/app/core/services/firestore.service.ts` | ✅ | CRUD multi-tenant + root-level |
| `src/app/core/services/permissions.service.ts` | ✅ | Matriz de roles (runtime) |
| `src/app/core/services/modules.service.ts` | ✅ | CRUD `/modules` Firestore |
| `src/app/core/guards/module.guard.ts` | ✅ | Verifica módulo activo en empresa |
| `src/app/core/seed/modules-seed.ts` | ✅ | 24 módulos + 7 acciones |

### Features completadas
| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `features/super-admin/` | ✅ | Companies, Plans, Defaults, Plugins, Plugin Packages CRUD |
| `features/settings/pages/plugins/` | ✅ | Vista empresa "Mis Plugins" — paquetes activos/disponibles |
| `features/permissions/` | ✅ | Catálogo módulos/acciones/permisos |
| `features/settings/` | ✅ | Config empresa, almacenes, series, impuestos, SMTP, SRI |
| `features/personas/` | ✅ | Clientes, proveedores, empleados multi-rol |
| `features/products/` | ✅ | Catálogo con stocks, familias, imágenes |
| `features/invoices/` | ✅ | Facturas de venta con estados SRI |
| `features/debit-notes/` | ✅ | Notas de débito SRI (codDoc=05) |
| `features/retentions/` | ✅ | Retenciones SRI (codDoc=07) |

### Cloud Functions completadas
| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `functions/src/invoices/generate-invoice-xml.ts` | ✅ | XML factura v1.0.0 |
| `functions/src/invoices/sign-xml.ts` | ✅ | Firma XAdES-BES |
| `functions/src/invoices/send-to-sri.ts` | ✅ | SOAP recepción + autorización |
| `functions/src/invoices/check-sri-status.ts` | ✅ | Consulta estado SRI |
| `functions/src/invoices/generate-pdf.ts` | ✅ | RIDE factura |
| `functions/src/invoices/generate-credit-note-xml.ts` | ✅ | XML nota de crédito |
| `functions/src/invoices/generate-credit-note-pdf.ts` | ✅ | RIDE nota de crédito |
| `functions/src/invoices/on-invoice-emit.ts` | ✅ | Trigger emisión factura |
| `functions/src/debit-notes/generate-debit-note-xml.ts` | ✅ | XML nota de débito |
| `functions/src/debit-notes/generate-debit-note-pdf.ts` | ✅ | RIDE nota de débito |
| `functions/src/debit-notes/on-debit-note-emit.ts` | ✅ | Trigger emisión nota débito |
| `functions/src/retentions/generate-retention-xml.ts` | ✅ | XML retención |
| `functions/src/retentions/generate-retention-pdf.ts` | ✅ | RIDE retención |
| `functions/src/retentions/on-retention-emit.ts` | ✅ | Trigger emisión retención |
| `functions/src/utils/sign-xml-helper.ts` | ✅ | Helper firma XML compartido |
| `functions/src/utils/smtp-helper.ts` | ✅ | Helper envío email |

---

## Reglas de desarrollo (para agentes)

1. **Solicitar tablas MySQL** antes de implementar cualquier módulo. Ver `DB_ANALISIS_FIRESTORE.md` primero.
2. **No hardcodear** — módulos, paquetes y permisos viven en Firestore.
3. **Cada módulo nuevo** requiere: interface → service → routes → `moduleGuard` → nav item.
4. **Convención de nombres:** inglés en todo el código.
5. **Plugin guard:** toda ruta de feature lleva `canActivate: [moduleGuard], data: { module: 'code' }`.
6. **Packages vs Modules:** super-admin gestiona packages; los módulos se derivan automáticamente.

---

## Próximos pasos inmediatos

### 1. Deploy infraestructura
```bash
firebase deploy --only firestore:rules,storage,functions
```
- Crear primer usuario `super_admin` en Firebase Console
- Login → `/super-admin/catalog` → "Registrar datos por defecto"
- Login → `/super-admin/plugin-packages` → "Registrar paquetes por defecto"
- Asignar paquetes a empresa desde `/super-admin/companies/:id/plugins`

### 3. Arrancar F7 — Dashboard
- Ya puede arrancar: F4 + F5 completas
- KPI cards con datos reales de Firestore
- Tiles condicionales según módulos activos de la empresa
