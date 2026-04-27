# Plan de Implementación — Módulo de Planes de Suscripción
> SaasFacturacion · Actualizado: 2026-04-27 · Sesiones completas documentadas

---

## Índice

1. [Modelo de negocio definitivo — Pricing](#1-modelo-de-negocio-definitivo--pricing)
2. [Arquitectura de paquetes y planes](#2-arquitectura-de-paquetes-y-planes)
3. [Árbol de paquetes — seed actualizado](#3-árbol-de-paquetes--seed-actualizado)
4. [Schemas TypeScript definitivos](#4-schemas-typescript-definitivos)
5. [Schema Firestore — usage y totales](#5-schema-firestore--usage-y-totales)
6. [Valores concretos por plan](#6-valores-concretos-por-plan)
7. [Flujo de add-on manual](#7-flujo-de-add-on-manual)
8. [Mapa de enforcement](#8-mapa-de-enforcement)
9. [Árbol de dependencias entre fases](#9-árbol-de-dependencias-entre-fases)
10. [Fases de implementación](#10-fases-de-implementación)
11. [Tabla de archivos a crear / modificar](#11-tabla-de-archivos-a-crear--modificar)
12. [Decisiones de diseño críticas](#12-decisiones-de-diseño-críticas)
13. [Bugs activos detectados](#13-bugs-activos-detectados)

---

## 1. Modelo de negocio definitivo — Pricing

```
╔══════════════════════════════════════════════════════════════════════════╗
║  PLAN                          PAQUETE (add-on)                          ║
║  ─────────────────────────     ──────────────────────────────────────    ║
║  Precio fijo mensual/anual     Precio de referencia para cobro manual    ║
║  Lo elige el cliente           Lo activa el super_admin a pedido         ║
║  Incluye un bundle de          Es lo que el cliente agrega FUERA         ║
║  paquetes preconfigurados      del bundle de su plan                     ║
║                                                                          ║
║  Ejemplo: Plan PYME = $39/mes  Ejemplo: + pkg_accounting = +$29/mes      ║
║  (incluye pkg_sales + pkg_sri) (add-on activado por el super_admin)      ║
╚══════════════════════════════════════════════════════════════════════════╝
```

- `PluginPackage.price` = tarifa sugerida para cobro manual de add-ons. No hay cobro automático.
- Paquetes en `plan.includedPackages` = sin costo adicional, cubiertos por el precio del plan.
- `pkg_base` tiene `price: 0` e `isSystem: true` = siempre activo, no se puede desactivar.
- Self-service de add-ons con cobro automático = **Fase futura** (requiere Stripe).

---

## 2. Arquitectura de paquetes y planes

```
Plan (unidad comercial)
  └── includedPackages: string[]   ← códigos de paquetes incluidos en el plan
        └── PluginPackage
              └── modules: string[]  ← módulos que se activan en la empresa

Company
  ├── planId + planName + planLimits + planFeatures  ← desnormalizados
  ├── enabledPackages: string[]    ← paquetes activos (plan + add-ons)
  ├── enabledModules: string[]     ← módulos activos (derivados de paquetes)
  └── addonPackages: AddonPackage[] ← registro de add-ons con precio acordado
```

> **Regla fundamental:** Los módulos se derivan SIEMPRE de los paquetes. El plan define qué paquetes incluye. Nunca se hardcodean módulos directamente en el plan.

---

## 3. Árbol de paquetes — seed actualizado

```
pkg_base (isSystem, price: 0, siempre activo)
  ├── pkg_sales          → personas, products, invoices         ($29/mes)
  │     ├── pkg_stock    → stock                                ($19/mes)
  │     ├── pkg_sri      → sri, debitNotes, retentions          ($24/mes)
  │     │     └── pkg_accounting → accounting                   ($29/mes)
  │     ├── pkg_purchases → purchases                           ($19/mes)
  │     ├── pkg_sales_advanced → quotes, orders, proformas      ($19/mes)
  │     ├── pkg_pos       → pos                                 ($15/mes)
  │     ├── pkg_reports   → report_invoices, report_products... ($9/mes)
  │     └── pkg_marketplace → marketplace                       ($15/mes)
  └── pkg_team_mgmt    → teamManagement                         ($49/mes)
```

**IDs canónicos en Firestore** (`plugin-packages/{code}`):
`pkg_base`, `pkg_sales`, `pkg_stock`, `pkg_sri`, `pkg_accounting`, `pkg_purchases`, `pkg_sales_advanced`, `pkg_pos`, `pkg_reports`, `pkg_marketplace`, `pkg_team_mgmt`

---

## 4. Schemas TypeScript definitivos

### 4.1 `plan.interface.ts` — campos completos

```typescript
export interface PlanFeatureFlags {
  electronicInvoicing: boolean;    // false = solo borrador, no envía al SRI
  purchasesModule: boolean;
  accountingModule: boolean;
  stockModule: boolean;
  teamManagementModule: boolean;
  publicCatalogModule: boolean;
  publicApiModule: boolean;
  prioritySupport: boolean;
  betaAccess: boolean;
  multiCompanyMode: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  billingPeriod: BillingPeriod;
  trialDays: number;
  sortOrder: number;
  isActive: boolean;
  isPublic: boolean;
  badge?: string;
  badgeColor?: string;
  // Metadatos de presentación (Guía Comercial / pricing page)
  color?: string;        // CoreUI: 'success'|'primary'|'warning'|'danger'|'dark'
  audience?: string;     // Perfil del cliente objetivo
  highlights?: string[]; // Puntos clave de venta
  limits: { sri, masterData, users, multiCompany, operations, infra };
  features: PlanFeatureFlags;
  includedPackages: string[];  // códigos de PluginPackage — NO módulos
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 4.2 `company.interface.ts` — campos clave

```typescript
addonPackages?: Array<{
  packageCode: string;
  packageName: string;
  priceAtActivation: number;
  activatedAt: Timestamp;
  activatedBy: string;    // uid del super_admin
  notes?: string;
}>;
totalPersonasActive?: number;
totalProductsActive?: number;
totalUsersActive?: number;
// ...resto de totales acumulados
```

---

## 5. Schema Firestore — usage y totales

### Subcolección `/companies/{id}/usage/{YYYY-MM}`

```typescript
interface MonthlyUsage {
  period: string;                  // '2026-04'
  invoicesEmitted: number;
  creditNotesEmitted: number;
  debitNotesEmitted: number;
  retentionsEmitted: number;
  purchasesCreated: number;
  totalSriDocsEmitted: number;
  exportsGenerated: number;
  tasksCreated: number;
  apiCallsCount: number;
  storageUsedMb: number;
  updatedAt: Timestamp;
  createdAt: Timestamp;
}
```

### Convención de valores
```
-1  = ilimitado    →  siempre permitido
 0  = deshabilitado →  siempre bloqueado (usar feature flag)
>0  = límite concreto →  bloquear cuando current >= limit
```

---

## 6. Valores concretos por plan

### Plan 1 — Emprendedor · $15/mes · $12 anual
**Paquetes:** `pkg_base`, `pkg_sales`, `pkg_sri`, `pkg_marketplace`

| Límite | Valor |
|--------|-------|
| invoicesPerMonth | 50 |
| creditNotesPerMonth | 10 |
| debitNotesPerMonth | 0 |
| retentionsPerMonth | 0 |
| purchasesPerMonth | 20 |
| totalSriDocsPerMonth | 60 |
| personasTotal | 100 |
| productsTotal | 200 |
| warehousesTotal | 1 |
| employeesTotal | 0 |
| activeUsersPerCompany | 1 |
| customRolesPerCompany | 0 |
| companiesPerAccount | 1 |
| activeProjectsTotal | 0 |
| tasksPerMonth | 0 |
| exportsPerMonth | 20 |
| storageGb | 0.5 |
| documentHistoryMonths | 12 |

**Features:** electronicInvoicing ✓ · publicCatalogModule ✓ · resto ✗

---

### Plan 2 — PYME · $39/mes · $32 anual
**Paquetes:** `pkg_base`, `pkg_sales`, `pkg_stock`, `pkg_sri`, `pkg_purchases`, `pkg_marketplace`

| Límite | Valor |
|--------|-------|
| invoicesPerMonth | 300 |
| creditNotesPerMonth | 50 |
| debitNotesPerMonth | 50 |
| retentionsPerMonth | 100 |
| purchasesPerMonth | 100 |
| totalSriDocsPerMonth | 500 |
| personasTotal | 1000 |
| productsTotal | 2000 |
| warehousesTotal | 3 |
| employeesTotal | 10 |
| activeUsersPerCompany | 5 |
| customRolesPerCompany | 2 |
| companiesPerAccount | 1 |
| exportsPerMonth | 100 |
| storageGb | 2 |
| documentHistoryMonths | 24 |

**Features:** electronicInvoicing ✓ · purchasesModule ✓ · stockModule ✓ · publicCatalogModule ✓ · resto ✗

---

### Plan 3 — Profesional · $79/mes · $65 anual ★
**Paquetes:** todos excepto `pkg_pos`

| Límite | Valor |
|--------|-------|
| invoicesPerMonth | 1000 |
| retentionsPerMonth | 500 |
| totalSriDocsPerMonth | 2000 |
| personasTotal | -1 |
| productsTotal | -1 |
| warehousesTotal | 10 |
| employeesTotal | 50 |
| costCentersTotal | 20 |
| priceListsTotal | 5 |
| activeUsersPerCompany | 15 |
| customRolesPerCompany | 10 |
| companiesPerAccount | 5 |
| activeProjectsTotal | 10 |
| tasksPerMonth | 200 |
| exportsPerMonth | -1 |
| apiCallsPerMonth | 5000 |
| storageGb | 10 |
| documentHistoryMonths | 36 |

**Features:** todos ✓ incluyendo `multiCompanyMode` y `publicApiModule`

---

### Plan 4 — Empresarial · $149/mes · $120 anual
**Paquetes:** todos

| Límite | Valor |
|--------|-------|
| invoicesPerMonth | 5000 |
| totalSriDocsPerMonth | 10000 |
| personasTotal / productsTotal / etc. | -1 |
| employeesTotal | 200 |
| activeUsersPerCompany | 50 |
| companiesPerAccount | 25 |
| storageGb | 50 |
| documentHistoryMonths | 60 (5 años — ciclo fiscal SRI) |

**Features:** todos ✓ incluyendo `prioritySupport`

---

### Plan 5 — Ilimitado · $299/mes · $240 anual
**Paquetes:** todos

Todos los límites = **-1** (ilimitado). Todas las features = **true** incluyendo `betaAccess`.

---

## 7. Flujo de add-on manual

```
1. El admin de empresa necesita un paquete extra (ej. pkg_accounting)
2. Contacta al super_admin

3. super_admin → /super-admin/companies/{id}/plugins
4. Ve badge "Add-on · $29/mes" (no está en plan.includedPackages)
5. Click → modal de confirmación:
   - Precio de referencia pre-llenado (editable si hay descuento)
   - Campo de notas: 'cortesía', 'piloto 3 meses', etc.

6. Al confirmar → batch Firestore:
   company.enabledPackages  += 'pkg_accounting'
   company.enabledModules   += ['accounting']
   company.addonPackages    += { packageCode, packageName, priceAtActivation, activatedAt, activatedBy, notes }

7. super_admin factura manualmente al cliente
```

---

## 8. Mapa de enforcement

```
POR CONTADOR MENSUAL (usage/{YYYY-MM}):
  invoicesEmitted         → limits.sri.invoicesPerMonth
  retentionsEmitted       → limits.sri.retentionsPerMonth
  totalSriDocsEmitted     → limits.sri.totalSriDocsPerMonth
  exportsGenerated        → limits.operations.exportsPerMonth
  tasksCreated            → limits.operations.tasksPerMonth
  apiCallsCount           → limits.operations.apiCallsPerMonth

POR TOTAL ACUMULADO (campo en /companies/{id}):
  totalPersonasActive     → limits.masterData.personasTotal
  totalProductsActive     → limits.masterData.productsTotal
  totalWarehousesActive   → limits.masterData.warehousesTotal
  totalUsersActive        → limits.users.activeUsersPerCompany
  totalCustomRoles        → limits.users.customRolesPerCompany
  totalActiveProjects     → limits.operations.activeProjectsTotal

POR FEATURE FLAG (doble condición):
  electronicInvoicing     → on-invoice-emit.ts
  accountingModule        → featureFlagGuard + moduleGuard en /accounting/*
  stockModule             → featureFlagGuard + moduleGuard en /stock/*
  teamManagementModule    → featureFlagGuard + moduleGuard en /team-management/*
  publicCatalogModule     → featureFlagGuard + moduleGuard en /marketplace/*
  publicApiModule         → CF api-handler.ts
  multiCompanyMode        → ocultar selector empresa en header
```

---

## 9. Árbol de dependencias entre fases

```
Fase A (Schema TypeScript + Bug fixes)        ✅
  └── Fase B (Seed paquetes actualizado)      ✅
        └── Fase C (Cloud Functions)          ⏳ PENDIENTE
              ├── Fase D (UI admin planes)    ✅
              └── Fase E (UI empresa add-ons) ✅
                        └── Fase F (Guards)   ✅
                                  └── Fase G (Panel uso) ✅
                                              └── Fase H (Multi-empresa) ✅
```

---

## 10. Fases de implementación

### ✅ FASE A — Schemas TypeScript

- `plan.interface.ts`: 10 feature flags, `includedPackages`, display fields (`color`, `audience`, `highlights`, `badgeColor`)
- `company.interface.ts`: `addonPackages[]` tipado completo

---

### ✅ FASE B — Seed y sincronización

- `scripts/seed-plans.ts` — Node.js + Firebase Admin SDK. Escribe 5 planes y 11 paquetes con merge idempotente.
- `SuperAdminService.syncDefaultPlans()` — Callable desde la UI. Limpia docs con IDs auto-generados (duplicados) y escribe los canónicos.
- `SuperAdminService.getPlans()` — Deduplica por nombre, prefiere IDs canónicos.
- `SuperAdminService.getPluginPackages()` — Deduplica por `code`, prefiere `id === code`.
- Botón "Sincronizar planes" en `plans.component` con confirm dialog y notificación de duplicados eliminados.

**Ejecución del seed:**
```bash
npm run seed:plans           # producción (requiere serviceAccount.json)
npm run seed:plans:emulator  # emulador local (FIRESTORE_EMULATOR_HOST=localhost:8080)
```

---

### ✅ FASE D — UI admin planes

- `plan-form.component`: 10 feature flags, `includedPackages` con grid de tarjetas visuales (SCSS completo), convención `-1/0/>0` con badge de colores.
- `plans.component`: tabla con columna "Paquetes incluidos", badge de empresas usando el plan, botón "Sincronizar planes", botón "Guía comercial".
- `plan-guide.component`: guía interactiva 6 tabs carga desde Firestore (`getPlans()` + `getPluginPackages()`), spinner de carga.

---

### ✅ FASE E — UI empresa: asignación de plan y add-ons

- `company-plugins.component`: diferencia paquetes del plan (badge "Incluido en plan", bloqueados) vs. add-ons (badge "Add-on · $X/mes", activables).
- Modal de confirmación de add-on con precio editable y campo de notas.
- `SuperAdminService`: `activateAddonPackage()`, `deactivateAddonPackage()`, `assignPlanToCompany()` (frontend fallback con merge).
- `companies-list.component`: modal "Asignar Plan" con preview de límites del plan seleccionado.

---

### ✅ FASE F — Enforcement guards

- `featureFlagGuard` creado en `core/guards/feature-flag.guard.ts`.
- `PlanLimitsService.isFeatureEnabled()` implementado.
- `planLimitGuard` aplicado a rutas de creación (`invoices/new`, `personas/new`, etc.).
- `featureFlagGuard` aplicado a rutas de módulos (`accounting`, `stock`, `team-management`, `marketplace`).

---

### ✅ FASE G — Panel de uso

- `PlanUsageWidgetComponent` (3 archivos) integrado en dashboard.
- `subscription.component`: barras de progreso, sección "Add-ons activos" con lista de `addonPackages[]`.

---

### ✅ FASE H — Multi-empresa

- `TenantService`: `managedCompanies`, `multiCompanyEnabled`, `loadManagedCompanies()` (lazy, solo cuando el plan tiene `multiCompanyMode: true`).
- `AuthService`: `switchCompany()` → llama CF `switchActiveCompany` → `getIdToken(true)` → reinicia tenant.
- `DefaultHeaderComponent`: selector de empresa visible solo con `multiCompanyMode: true`.

---

### ⏳ FASE C — Cloud Functions (PENDIENTE)

**Todas las CFs están en el repositorio de functions, separado del frontend.**

#### CF `assignPlanToCompany` (callable, solo super_admin)
```typescript
// Payload: { companyId, planId, subscriptionEnd? }
// 1. Verifica role === 'super_admin'
// 2. Lee /plans/{planId} → valida isActive
// 3. Lee /companies/{companyId} → obtiene addonPackages actuales
// 4. Lee /plugin-packages filtrando por includedPackages
// 5. Resuelve módulos: unión de todos los modules[] del plan
// 6. Preserva módulos de addonPackages activos
// 7. Batch.set en empresa: planId, planName, planLimits, planFeatures,
//    enabledPackages, enabledModules, subscriptionStart, status: 'active'
// NOTA: addonPackages NO se toca — se preservan al cambiar de plan
```

#### CF `onPlanUpdated` (Firestore trigger)
```typescript
// Trigger: onDocumentUpdated('plans/{planId}')
// Si no cambiaron limits/features/includedPackages → no hacer nada
// Query /companies donde planId == planId
// Para cada empresa en batches de 400: actualizar planLimits, planFeatures,
// recalcular enabledPackages y enabledModules preservando addonPackages
```

#### CF `checkPlanLimit` (callable)
```typescript
// Payload: { companyId, limitType: 'invoices'|'personas'|'products'|... }
// Retorna: { allowed, current, limit, limitType }
```

#### CF `checkFeatureFlag` (callable)
```typescript
// Payload: { companyId, flag: keyof PlanFeatureFlags }
// Retorna: { enabled, flag }
// Lee planFeatures desnormalizado en empresa — sin GET adicional al plan
```

#### CF `switchActiveCompany` (callable, multi-empresa)
```typescript
// Payload: { targetCompanyId }
// 1. Verifica targetCompanyId en /account-companies/{uid}/companies
// 2. Lee rol del usuario en esa empresa
// 3. Actualiza custom claim: { companyId: targetCompanyId, role }
// 4. Retorna { success: true } — cliente hace getIdToken(true)
```

#### CF `setupCompany` — actualizar
```typescript
// Resolver módulos desde includedPackages (no includedModules):
const packageSnaps = await Promise.all(
  plan.includedPackages.map(code =>
    db.collection('plugin-packages').where('code', '==', code).limit(1).get()
  )
);
const enabledModules = [...new Set(
  packageSnaps.flatMap(snap => snap.docs[0]?.data()?.modules ?? [])
)];
// Inicializar: addonPackages: [], totalPersonasActive: 0, ... etc.
```

#### CFs de enforcement en emisión
| CF | Trigger | Acción |
|----|---------|--------|
| `on-invoice-emit.ts` | onWrite /invoices | Verificar `electronicInvoicing` flag + límite mensual, escribir `sriStatus: 'plan_limit_reached'` |
| `on-retention-emit.ts` | onWrite /retentions | Incrementar `retentionsEmitted` en usage |
| `on-debit-note-emit.ts` | onWrite /debitNotes | Incrementar `debitNotesEmitted` |
| `on-purchase-receive.ts` | onWrite /purchases | Incrementar `purchasesCreated` |

#### CFs de totales acumulados
| CF | Trigger | Campo |
|----|---------|-------|
| `on-persona-write.ts` | /companies/{id}/personas | `totalPersonasActive` |
| `on-customer-write.ts` | /companies/{id}/customers | `totalCustomersActive` |
| `on-product-write.ts` | /companies/{id}/products | `totalProductsActive` |
| `on-warehouse-write.ts` | /companies/{id}/warehouses | `totalWarehousesActive` |
| `on-role-write.ts` | /companies/{id}/roles | `totalCustomRoles` |
| `on-cost-center-write.ts` | /companies/{id}/cost_centers | `totalCostCenters` |
| `on-project-status.ts` | /companies/{id}/tm-projects | `totalActiveProjects` |

**Criterios de done — Fase C:**
- [ ] `assignPlanToCompany` resuelve módulos desde `includedPackages`
- [ ] `assignPlanToCompany` preserva `addonPackages` al cambiar de plan
- [ ] `onPlanUpdated` propaga cambios a todas las empresas afectadas en batches de 400
- [ ] `checkPlanLimit` con todos los `limitType`
- [ ] `checkFeatureFlag` implementada
- [ ] `setupCompany` inicializa `addonPackages: []` y resuelve módulos desde paquetes
- [ ] Triggers de emisión incrementan contadores en `usage/{YYYY-MM}`
- [ ] CFs de totales acumulados implementadas (7 triggers)
- [ ] `switchActiveCompany` implementada y probada
- [ ] Exportadas en `functions/src/index.ts`

---

## 11. Tabla de archivos a crear / modificar

### Frontend — Estado actual

| Fase | Archivo | Estado |
|------|---------|--------|
| A | `super-admin/models/plan.interface.ts` | ✅ 10 flags, `includedPackages`, display fields |
| A | `super-admin/models/company.interface.ts` | ✅ `addonPackages[]` tipado |
| B | `scripts/seed-plans.ts` | ✅ 5 planes + 11 paquetes, idempotente |
| B | `super-admin/services/super-admin.service.ts` | ✅ `syncDefaultPlans()`, `getPluginPackages()`, deduplicación en lecturas |
| D | `super-admin/pages/plans/plan-form.component.ts` | ✅ 10 flags, `includedPackages`, packages grid |
| D | `super-admin/pages/plans/plan-form.component.html` | ✅ Sección features completa, grid visual de paquetes |
| D | `super-admin/pages/plans/plan-form.component.scss` | ✅ `.packages-grid`, `.package-card`, `.pkg-icon-wrap` |
| D | `super-admin/pages/plans/plans.component.*` | ✅ Tabla + botón Sincronizar + botón Guía |
| D | `super-admin/pages/plans/plan-guide.component.ts` | ✅ Carga desde Firestore, transforma Plan→GuidePlan |
| D | `super-admin/pages/plans/plan-guide.component.html` | ✅ 6 tabs interactivos, spinner, loops desde signals |
| E | `super-admin/pages/companies/company-plugins.component.*` | ✅ Plan vs. add-ons, modal add-on con precio |
| E | `super-admin/pages/companies/companies-list.component.*` | ✅ Modal asignar plan, `safeDate()` helper |
| F | `core/guards/feature-flag.guard.ts` | ✅ Creado |
| F | `core/guards/index.ts` | ✅ Exporta `featureFlagGuard` |
| F | `core/services/plan-limits.service.ts` | ✅ `isFeatureEnabled()` |
| F | `app.routes.ts` | ✅ `planLimitGuard` + `featureFlagGuard` aplicados |
| G | `views/dashboard/widgets/plan-usage-widget/*` | ✅ 3 archivos creados e integrados |
| G | `features/settings/pages/subscription/subscription.component.*` | ✅ Add-ons activos, barras de progreso |
| H | `core/services/tenant.service.ts` | ✅ Multi-empresa, lazy load managedCompanies |
| H | `core/services/auth.service.ts` | ✅ `switchCompany()` |
| H | Layout `default-header.component.*` | ✅ Selector de empresa con spinner |

### Backend (Functions) — Todo pendiente

| CF | Archivo | Estado |
|----|---------|--------|
| `assignPlanToCompany` | `functions/src/tenants/assign-plan-to-company.ts` | ⏳ |
| `onPlanUpdated` | `functions/src/tenants/on-plan-updated.ts` | ⏳ |
| `checkPlanLimit` | `functions/src/tenants/check-plan-limit.ts` | ⏳ |
| `checkFeatureFlag` | `functions/src/tenants/check-feature-flag.ts` | ⏳ |
| `switchActiveCompany` | `functions/src/tenants/switch-active-company.ts` | ⏳ |
| `setupCompany` (update) | `functions/src/tenants/setup-company.ts` | ⏳ |
| `on-invoice-emit` (update) | `functions/src/invoices/on-invoice-emit.ts` | ⏳ |
| `on-retention-emit` | `functions/src/retentions/on-retention-emit.ts` | ⏳ |
| `on-debit-note-emit` | `functions/src/debit-notes/on-debit-note-emit.ts` | ⏳ |
| `on-purchase-receive` | `functions/src/purchases/on-purchase-receive.ts` | ⏳ |
| `on-persona-write` | `functions/src/personas/on-persona-write.ts` | ⏳ |
| `on-customer-write` | `functions/src/customers/on-customer-write.ts` | ⏳ |
| `on-product-write` | `functions/src/products/on-product-write.ts` | ⏳ |
| `on-warehouse-write` | `functions/src/warehouses/on-warehouse-write.ts` | ⏳ |
| `on-role-write` | `functions/src/roles/on-role-write.ts` | ⏳ |
| `on-cost-center-write` | `functions/src/cost-centers/on-cost-center-write.ts` | ⏳ |
| `on-project-status` | `functions/src/tm/on-project-status.ts` | ⏳ |
| Barrel export | `functions/src/index.ts` | ⏳ |

### Firestore Rules — Pendiente

| Regla | Estado |
|-------|--------|
| `/companies/{id}/usage/{period}` — solo lectura para empresa, escritura solo Admin SDK | ⏳ |
| Campos del plan en empresa (`planLimits`, `planFeatures`, `planId`, `addonPackages`, totales) — prohibir escritura directa desde cliente | ⏳ |
| `/account-companies/{uid}/companies/{companyId}` — solo lectura para `request.auth.uid == uid` | ⏳ |

---

## 12. Decisiones de diseño críticas

1. **Plan = bundle de paquetes, no de módulos.** `includedPackages: string[]` — módulos se derivan siempre de paquetes.
2. **`PluginPackage.price` = precio de referencia para add-ons manuales.** No hay cobro automático.
3. **`addonPackages[]` = registro del acuerdo comercial** con snapshot de precio para auditoría.
4. **Paquetes del plan no se desactivan individualmente** desde CompanyPlugins — solo cambiando el plan completo.
5. **Desnormalización de `planLimits` y `planFeatures` en empresa** — enforcement sin GET adicional al plan.
6. **Doble condición para módulos:** `features.[flag] === true` Y módulo en `enabledModules`.
7. **CF trigger no lanza errores de enforcement** — escribe `sriStatus: 'plan_limit_reached'` para evitar reintentos.
8. **Convención `-1 / 0 / >0`:** ilimitado / deshabilitado / límite concreto.
9. **Plan por empresa** — el contador tiene un plan que habilita `multiCompanyMode`, no paga los planes de sus clientes.
10. **IDs canónicos en Firestore** — planes: `emprendedor|pyme|profesional|empresarial|ilimitado`; paquetes: `pkg_*`. El sync limpia docs con IDs auto-generados.

---

## 13. Bugs resueltos / activos

### ✅ Bug #1 — `PlanFeatureFlags` incompleto (RESUELTO)
Solo tenía 3 flags. Ahora tiene los 10. Formulario actualizado.

### ✅ Bug #2 — `includedModules` vs `includedPackages` (RESUELTO)
Renombrado a `includedPackages`. Seed y formulario usan el nombre correcto.

### ✅ Bug #3 — `pkg_sales` incluía `stock` (RESUELTO)
`pkg_sales.modules = ['personas', 'products', 'invoices']`. `stock` está solo en `pkg_stock`.

### ✅ Bug #4 — `CompanyPluginsComponent` no registraba add-ons (RESUELTO)
Modal de confirmación implementado. `addonPackages[]` se escribe correctamente.

### ✅ Bug #5 — Duplicados en Firestore (RESUELTO)
Paquetes y planes existían con IDs auto-generados + IDs canónicos simultáneamente.
- `getPlans()` y `getPluginPackages()` deduuplican por nombre/code, prefieren IDs canónicos.
- `syncDefaultPlans()` elimina docs con IDs no canónicos antes de escribir.

### ⏳ Pendiente — `subscriptionEnd` en algunas empresas
Campo guardado como string o Timestamp mixto. `safeDate()` helper implementado en frontend como workaround. Fix definitivo: normalizar en CF `assignPlanToCompany`.
