# Plan de Implementación — SaaS ERP Ecuador
## FacturaScripts (PHP) → Angular 21 + Firebase

**Versión:** 3.0
**Última actualización:** 2026-03-31
**Stack:** Angular 21 · CoreUI 5.x · Firebase (Firestore, Auth, Functions, Storage) · Node.js 20
**Convención de nombres:** Inglés en todo el código
**Arquitectura:** Multi-tenant (`/companies/{companyId}/...`) + Plugin system

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
| **Plugin system** | **Firestore `/modules`** — activable por empresa | Igual a FacturaScripts fs_pages, sin hardcodear |
| **Módulos por empresa** | `company.enabledModules: string[]` | Toggle desde Super Admin sin deploy |

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

## Módulos del sistema

| # | Módulo | Fase | Estado | Ruta |
|---|--------|------|--------|------|
| — | Plugin Catalog (super-admin) | F2 | ✅ Completo | `/super-admin/catalog` |
| — | Company Plugin Management | F2 | ✅ Completo | `/super-admin/companies/:id/plugins` |
| 0 | Company & Tenant Management | F2 | ✅ Completo | `/super-admin/companies` |
| 1 | Authentication & Users | F1 | ✅ Completo | `/login` |
| 2 | Customers | F3 | ⬜ Pendiente | `/customers` |
| 3 | Suppliers | F3 | ⬜ Pendiente | `/suppliers` |
| 4 | Products | F3 | ⬜ Pendiente | `/products` |
| 5 | Product Families & Manufacturers | F3 | ⬜ Pendiente | — |
| 6 | Quotes | F6 | ⬜ Pendiente | `/quotes` |
| 7 | Orders | F6 | ⬜ Pendiente | `/orders` |
| 8 | Sales Invoices | F4 | ⬜ Pendiente | `/invoices` |
| 9 | Stock Management | F4 | ⬜ Pendiente | `/stock` |
| 10 | POS — Point of Sale | F6 | ⬜ Pendiente | `/pos` |
| 11 | Dashboard | F7 | ⬜ Pendiente | `/dashboard` |
| 12 | Settings | F3 | ✅ Completo | `/settings` |
| 13 | Electronic Invoicing (SRI) | F5 | ⬜ Pendiente | `/electronic-invoicing` |

---

## Fases de implementación

### Fase 1 — Infraestructura y Auth ✅
> Estado: **100% completo**

#### Firebase
- [x] Instalar `firebase` v12 y `@angular/fire` v20
- [x] Crear proyecto Firebase — `facturasproec`
- [x] `environment.ts` / `environment.prod.ts` configurados
- [x] `firestore.rules` — reglas multi-tenant completas
- [x] `storage.rules` — certificados privados, imágenes, documentos electrónicos
- [x] `firebase.json` — Firestore + Functions + Storage + Hosting
- [x] `.firebaserc` — apuntando a `facturasproec`
- [ ] **Pendiente deploy:** `firebase deploy --only firestore:rules,storage`

#### Core Services
- [x] `app.config.ts` — providers Firebase, APP_INITIALIZER con `waitForAuthReady()`
- [x] `AuthService` — Firebase Auth + custom claims `{ companyId, role }`
- [x] `TenantService` — companyId activo, `CompanyConfig`, **`activeModules` signal**, `hasModule()`
- [x] `FirestoreService` — multi-tenant genérico CRUD + batch/transaction + root-level methods
- [x] `PermissionsService` — matriz de roles desde custom claims (runtime, sin Firestore)

#### Guards & Interceptors
- [x] `auth.guard.ts` — bloquea no autenticados
- [x] `role.guard.ts` — verifica `data.roles` contra custom claims
- [x] `module.guard.ts` — **nuevo:** verifica `TenantService.hasModule(data.module)`
- [x] `moduleMatchGuard` — canMatch para lazy-loaded routes
- [x] `auth.interceptor.ts` — adjunta Firebase ID token a Cloud Functions
- [x] `loading.interceptor.ts` — spinner global

#### Rutas y Navegación
- [x] `app.routes.ts` — rutas GPS eliminadas, rutas billing por fase
- [x] `_nav.ts` — `filterNavByRole()`, menú billing (items comentados por fase)

#### Cloud Functions
- [x] `functions/` — TypeScript, Node 20, firebase-functions v5
- [x] `setUserCustomClaims` — asigna `companyId` + `role` al token
- [ ] **Pendiente deploy:** `firebase deploy --only functions`

#### Pendiente para cerrar F1
- [ ] Habilitar en Firebase Console: Auth (Email/Password), Firestore, Storage, Functions
- [ ] Desplegar reglas: `firebase deploy --only firestore:rules,storage,functions`
- [ ] Crear primer usuario super_admin en Firebase Console
- [ ] Asignar custom claims: `{ role: 'super_admin' }`
- [ ] Verificar login end-to-end en el navegador

---

### Fase 2 — Super Admin (Gestión de Tenants) ✅
> Estado: **100% completo** (pendiente deploy Cloud Functions)

#### Gestión de Empresas y Planes
- [x] `features/super-admin/` — layout propio con sidebar
- [x] Companies list — tabla con CRUD, botones Editar / Plugins / Suspender
- [x] Company form — nombre, RUC, plan, config SRI, campos Ecuador
- [x] Plans management — Basic / Professional / Enterprise con límites y módulos
- [x] `Company` interface → `enabledModules: string[]`, `disabledModules: string[]`
- [x] Cloud Function `setupCompany` — inicializa warehouses, tax rates, payment terms, series por defecto
- [x] Cloud Function `setUserCustomClaims` — bootstrap primer admin de empresa
- [x] Ruta `/super-admin` con `roleGuard → super_admin`

#### Sistema de Plugins (nuevo — 2026-03-31)
- [x] `permission.interface.ts` — `Module` con `dependencies: string[]`, IDs `string` (Firestore)
- [x] `ModulesService` — CRUD Firestore `/modules` (root), `getDependents()` para cascade
- [x] `ActionsService` — CRUD Firestore `/actions` (root)
- [x] `PermissionsCatalogService` — CRUD Firestore `/permissions` (root)
- [x] `features/permissions/` — UI admin del catálogo: tabs Módulos / Acciones / Permisos
- [x] Botón "Registrar datos por defecto" — seed idempotente de 24 módulos + 7 acciones
- [x] `core/seed/modules-seed.ts` — catálogo inicial derivado de `fs_pages` del sistema PHP
- [x] `CompanyPluginsComponent` — toggles por empresa con validación de dependencias y cascade
- [x] Ruta `/super-admin/catalog` — catálogo de plugins
- [x] Ruta `/super-admin/companies/:id/plugins` — plugins por empresa
- [x] Nav super-admin — enlaces a Catálogo de Plugins

#### Firestore Schema de Plugins
```
/modules/{moduleId}         ← Catálogo platform-level
  code, name, dependencies[], url, icon, showInMenu, order, state

/actions/{actionId}         ← Verbos: view, create, edit, delete, export...

/permissions/{permId}       ← module.code × action.code → 'customers.view'

/companies/{companyId}
  enabledModules: string[]  ← módulos activos para esta empresa
  disabledModules: string[] ← overrides manuales
```

#### Pendiente
- [ ] Deploy Cloud Functions: `firebase deploy --only functions`
- [ ] Ejecutar seed desde `/super-admin/catalog` → "Registrar datos por defecto"
- [ ] Asignar `enabledModules` a empresas desde `/super-admin/companies/:id/plugins`

---

### Fase 3 — Maestros
> Estado: **40%** (Settings completo — faltan Products, Customers, Suppliers)
> **Prerequisito:** F1 + F2 completos

> **Regla:** Antes de implementar cada módulo, solicitar al usuario la estructura
> de la tabla MySQL correspondiente. Ver `DB_ANALISIS_FIRESTORE.md` primero.

#### Settings ✅
- [x] `features/settings/` — company config, warehouses, document series, payment terms, tax rates
- [x] Ruta `/settings` (admin only)
- [x] Activado en `_nav.ts`

#### Customers ⬜
- [ ] Solicitar estructura tablas `clientes`, `dirclientes` del sistema PHP
- [ ] `features/customers/` — list, form con tabs, detail
- [ ] Interface `Customer` desde tabla real MySQL
- [ ] Tab: General, Direcciones, Datos Fiscales, Estadísticas
- [ ] Validador RUC / Cédula Ecuador
- [ ] `CustomersService` — Firestore `/companies/{id}/customers`
- [ ] Activar ruta `/customers` + nav item
- [ ] Activar `moduleGuard` con `data: { module: 'customers' }`

#### Suppliers ⬜
- [ ] Solicitar estructura tablas `proveedores`, `dirproveedores`
- [ ] `features/suppliers/` — similar a customers
- [ ] `SuppliersService` — Firestore `/companies/{id}/suppliers`
- [ ] Activar ruta `/suppliers` + nav item

#### Products ⬜
- [ ] Solicitar estructura tablas `articulos`, `familias`, `fabricantes`, `stocks`
- [ ] `features/products/` — list (tabla + cards), form con tabs
- [ ] Tab: General, Precios, Stock, Imágenes, Proveedores
- [ ] Upload imágenes a Firebase Storage
- [ ] `ProductsService` — Firestore `/companies/{id}/products`
- [ ] Activar ruta `/products` + nav item

#### Product Families & Manufacturers ⬜
- [ ] Solicitar estructura tablas `familias`, `fabricantes`
- [ ] `features/product-families/` — árbol con CRUD inline
- [ ] Subcolección o colección raíz por empresa

---

### Fase 4 — Documentos de Venta
> Estado: **0%**
> **Prerequisito:** F3 completa

#### Sales Invoices
- [ ] Solicitar estructura tablas `facturascli`, `lineasfacturascli`
- [ ] `features/invoices/` — list, form, detail
- [ ] Autocomplete cliente con preview (deuda, límite crédito)
- [ ] Tabla de líneas inline editable (producto autocomplete)
- [ ] Panel totales sticky en tiempo real
- [ ] IVA 15% Ecuador por defecto
- [ ] CF `generateInvoiceNumber` — transacción sin gaps
- [ ] CF `updateStockOnInvoice`
- [ ] CF `updateCustomerStatsOnInvoice`
- [ ] CF `triggerElectronicInvoicing`
- [ ] Activar ruta `/invoices` con `moduleGuard: 'invoices'`

#### Stock Management
- [ ] Solicitar estructura tablas `stocks`, `movimientosstock`, `transferenciasstock`
- [ ] `features/stock/` — consulta por producto / por almacén
- [ ] Ajustes de inventario con autorización
- [ ] Transferencias entre almacenes
- [ ] Log de movimientos (read-only)
- [ ] CF `procesarRecepcionTransferencia`
- [ ] Activar ruta `/stock` con `moduleGuard: 'stock'`

---

### Fase 5 — Facturación Electrónica SRI
> Estado: **0%**
> **Prerequisito:** F4 completa

- [ ] Solicitar estructura tablas plugin ecuador
- [ ] `features/electronic-invoicing/` — lista comprobantes, detalle, reenvío
- [ ] Subida certificado `.p12` a Firebase Storage (path privado)
- [ ] Clave encriptada en Firebase Secret Manager
- [ ] CF: clave de acceso 49 dígitos + módulo 11
- [ ] CF: generación XML según XSD SRI (factura v1.0.0)
- [ ] CF: firma XAdES-BES (`node-forge`)
- [ ] CF: envío SOAP endpoint SRI recepción
- [ ] CF: consulta estado autorización SRI
- [ ] CF: generación RIDE PDF
- [ ] Estados: `PENDING → SIGNED → SENT → AUTHORIZED / REJECTED`
- [ ] Reenvío manual desde UI en caso de REJECTED
- [ ] Alerta certificado próximo a vencer (< 30 días)
- [ ] Ambientes: pruebas y producción
- [ ] Activar ruta `/electronic-invoicing` con `moduleGuard: 'sri'`

---

### Fase 6 — Módulos Avanzados
> Estado: **0%**
> **Prerequisito:** F4 + F5 completas

#### Quotes
- [ ] Solicitar tablas `presupuestoscli`, `lineaspresupuestoscli`
- [ ] `features/quotes/` — list, form, conversión a order/invoice
- [ ] CF `generateQuoteNumber`
- [ ] CF `markExpiredQuotes` (scheduled diario)
- [ ] Activar ruta `/quotes` con `moduleGuard: 'quotes'`

#### Orders
- [ ] Solicitar tablas `pedidoscli`, `lineaspedidoscli`
- [ ] `features/orders/` — list, form, picking checklist, conversión a invoice
- [ ] Reserva de stock opcional
- [ ] CF `generateOrderNumber`
- [ ] Activar ruta `/orders` con `moduleGuard: 'orders'`

#### POS — Point of Sale
- [ ] Solicitar tablas `cajastpv`, `lineastpv`
- [ ] `features/pos/` — pantalla full-screen, barcode, carrito, cobro
- [ ] Apertura / cierre de caja
- [ ] Métodos de pago: efectivo (cambio), tarjeta, transferencia, mixto
- [ ] CF `validateCashSessionOpen`
- [ ] CF `generateInvoiceFromPosSale`
- [ ] Atajos teclado F1–F5
- [ ] Activar ruta `/pos` con `moduleGuard: 'pos'` + `roleGuard: ['admin', 'cashier']`

---

### Fase 7 — Dashboard y Estadísticas
> Estado: **0%**
> **Prerequisito:** F4 completa mínimo

- [ ] KPI cards: ventas hoy, mes, facturas pendientes, stock bajo mínimo
- [ ] Gráfica ventas 7 días (Chart.js — ya instalado)
- [ ] Gráfica ventas por familia (pie)
- [ ] Top 10 productos más vendidos
- [ ] Últimas 10 facturas
- [ ] Alertas: stock bajo, facturas vencidas, certificado SRI por vencer
- [ ] CF `updateDailyStats` (scheduled)
- [ ] Activar `moduleGuard: 'dashboard'`

---

## Progreso general

```
F1 Infraestructura    ███████████████ 100% ✅
F2 Super Admin        ███████████████ 100% ✅ (pendiente deploy CF)
F3 Maestros           ██████░░░░░░░░░  40%  (Settings ✅ — Customers/Products/Suppliers ⬜)
F4 Documentos         ░░░░░░░░░░░░░░░   0%
F5 SRI                ░░░░░░░░░░░░░░░   0%
F6 Avanzado           ░░░░░░░░░░░░░░░   0%
F7 Dashboard          ░░░░░░░░░░░░░░░   0%
```

---

## Archivos clave — Estado actual

### Core
| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `src/app/app.config.ts` | ✅ | Providers Firebase, APP_INITIALIZER |
| `src/app/app.routes.ts` | ✅ | Rutas activas: settings, super-admin, permissions |
| `src/app/core/services/auth.service.ts` | ✅ | Firebase Auth + custom claims |
| `src/app/core/services/tenant.service.ts` | ✅ | `activeModules` signal, `hasModule()` |
| `src/app/core/services/firestore.service.ts` | ✅ | CRUD multi-tenant + root-level |
| `src/app/core/services/permissions.service.ts` | ✅ | Matriz de roles (runtime) |
| `src/app/core/services/modules.service.ts` | ✅ | CRUD `/modules` Firestore, `getDependents()` |
| `src/app/core/services/actions.service.ts` | ✅ | CRUD `/actions` Firestore |
| `src/app/core/services/permissions-catalog.service.ts` | ✅ | CRUD `/permissions` Firestore |
| `src/app/core/guards/auth.guard.ts` | ✅ | Bloquea no autenticados |
| `src/app/core/guards/role.guard.ts` | ✅ | Verifica rol de usuario |
| `src/app/core/guards/module.guard.ts` | ✅ | Verifica módulo activo en empresa |
| `src/app/core/interfaces/permission.interface.ts` | ✅ | Module/Action/Permission (string IDs) |
| `src/app/core/seed/modules-seed.ts` | ✅ | 24 módulos + 7 acciones (de fs_pages PHP) |

### Features
| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `features/super-admin/` | ✅ | Companies, Plans, Defaults, Plugins |
| `features/super-admin/pages/companies/company-plugins.component` | ✅ | Toggle plugins por empresa |
| `features/permissions/` | ✅ | Catálogo módulos/acciones/permisos |
| `features/settings/` | ✅ | Config empresa, almacenes, series, impuestos |

### Firebase
| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `firestore.rules` | ✅ | Reglas multi-tenant con roles |
| `storage.rules` | ✅ | Certificados, imágenes, documentos |
| `functions/src/auth/set-custom-claims.ts` | ✅ | Asigna companyId + role |
| `functions/src/tenants/setup-company.ts` | ✅ | Inicializa defaults de empresa |

---

## Reglas de desarrollo (para agentes)

1. **Solicitar tablas MySQL** antes de implementar cualquier módulo. Ver `DB_ANALISIS_FIRESTORE.md` primero; si no está la tabla, pedirla al usuario.
2. **No hardcodear** — módulos, acciones y permisos viven en Firestore `/modules`, `/actions`, `/permissions`.
3. **Cada módulo nuevo** requiere: interface desde tabla real → service → routes → `moduleGuard` → nav item comentado.
4. **Convención de nombres:** inglés en todo el código (clases, métodos, interfaces, variables).
5. **Plugin guard:** toda ruta de feature lleva `canMatch: [moduleMatchGuard], data: { module: 'code' }`.

---

## Próximos pasos inmediatos

### 1. Cerrar infraestructura (F1 + F2)
```bash
cd coreui-facturasEC-front-web
firebase deploy --only firestore:rules,storage,functions
```
- Crear primer usuario `super_admin` en Firebase Console
- Login → `/super-admin/catalog` → **"Registrar datos por defecto"**
- Asignar módulos a empresa desde `/super-admin/companies/:id/plugins`

### 2. Arrancar F3 — Customers
- Solicitar estructura tablas `clientes` + `dirclientes` del sistema PHP
- Implementar `features/customers/` siguiendo el patrón de `features/settings/`
