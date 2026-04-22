# Plan: Sistema de Usuarios, Perfiles y Permisos
**SaasFacturacion — Angular + Firebase**
**Creado:** 2026-04-17 | **Actualizado:** 2026-04-22 (rev 2)

---

## Contexto y arquitectura actual

El sistema migró completamente de FeathersJS REST a Firebase/Firestore para usuarios y roles.
La "Capa 2" (REST API) ya no se usa para este módulo.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  CAPA 1: Firebase Auth                                                       │
│  Custom claims: { companyId, role }                                          │
│  AuthService.user() → { uid, email, displayName, companyId, role }           │
│  UserRole: 'admin' | 'seller' | 'cashier' | 'read_only' |                   │
│            'super_admin' | 'accountant'   ← DECISIÓN-01 (2026-04-22)         │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ sincronizado por Cloud Functions (Admin SDK)
                               │ SOLO la CF puede cambiar platformRole (DECISIÓN-02)
┌──────────────────────────────▼───────────────────────────────────────────────┐
│  CAPA 2: Firestore (multi-tenant por companyId)                              │
│  /roles                           — catálogo raíz (super_admin)              │
│  /permissions                     — catálogo raíz (super_admin)              │
│  companies/{cId}/company-users    — perfil de plataforma por UID             │
│  companies/{cId}/personas         — Person (clientes/prov/empleados)         │
│  companies/{cId}/tm-members       — miembros del equipo                      │
└──────────────────────────────────────────────────────────────────────────────┘

can(module, action) = roleTienePermiso(module, action)
                    AND planTieneModulo(module)   ← DECISIÓN-03 (2026-04-22)

❌ REST API (FeathersJS) — ya NO se usa para users/roles
```

---

## Mapa de equivalencias Legacy → SaaS

| Legacy (PHP) | SaaS Angular |
|-------------|--------------|
| `fs_pages` | `Module` en Firestore `/modules` |
| `fs_access` (permiso usuario-página) | Derivado en runtime de `role.permissions[]` |
| `fs_roles_access` (permiso rol-página) | `Role.permissions: PermissionString[]` en Firestore `/roles` |
| `fs_roles` | `Role` en Firestore `/roles` + `DEFAULT_SYSTEM_ROLES` en `roles.service.ts` |
| `fs_rol_user` | `CompanyUser.platformRole` (UserRole string en Firestore) |
| `fs_users.admin = true` | `role: 'super_admin'` en Firebase Auth custom claims |
| `fs_users.codagente` | `CompanyUser.personaId` → ref a `/companies/{cId}/personas/{id}` |
| _(no existe)_ | `PluginPackage` (bundles comerciales de módulos) |

---

## Roles del sistema

| Rol | Nivel | Tipo | Descripción | Asignable desde empresa |
|-----|-------|------|-------------|------------------------|
| `super_admin` | 0 | system | Administrador de la plataforma SaaS | ❌ Solo via Admin SDK |
| `admin` | 1 | system | Administrador de empresa | ✅ |
| `accountant` | 2 | system | Contador: fiscal, compras, contabilidad | ✅ ← NUEVO |
| `seller` | 2 | system | Vendedor: facturas, clientes, productos | ✅ |
| `cashier` | 3 | system | Cajero: POS, facturas básicas | ✅ |
| `read_only` | 4 | system | Solo lectura en todos los módulos | ✅ |

**Regla de asignación:** un usuario solo puede asignar roles con nivel mayor al suyo.
`admin` (nivel 1) puede asignar: `accountant`, `seller`, `cashier`, `read_only`.
`admin` **NO puede** asignar `admin` ni `super_admin`.

---

## Matriz de permisos por rol × módulo

| Módulo | super_admin | admin | accountant | seller | cashier | read_only |
|--------|-------------|-------|------------|--------|---------|-----------|
| customers | — | CRUD | R | CRU | R | R |
| suppliers | — | CRUD | R | CRU | — | R |
| products | — | CRUD | R | CRU | R | R |
| invoices | — | CRUD | R | CRU | RC | R |
| quotes | — | CRUD | — | CRU | — | R |
| orders | — | CRUD | — | CRU | — | R |
| purchases | — | CRUD | CRUD | CRU | — | R |
| stock | — | CRUD | R | CRU | R | R |
| pos | — | CRUD | — | — | RC | — |
| retentions | — | CRUD | CRUD | CRU | — | — |
| debit_notes | — | CRUD | CRUD | CRU | — | — |
| accounting | — | CRUD | CRU | — | — | — |
| sri | — | CRUD | R | R | — | R |
| personas | — | CRUD | — | CRU | — | — |
| team_management | — | CRUD | — | CRU | R | R |
| users | — | CRUD | — | — | — | — |
| settings | — | CRUD | R | R | R | R |
| companies | CRUD | — | — | — | — | — |
| plans | CRUD | — | — | — | — | — |

> Los permisos de módulo solo aplican si la empresa tiene ese módulo en su plan
> (`TenantService.hasModule()`). Un módulo no contratado devuelve `false` para cualquier rol.

---

## Estado por fases

| Fase | Descripción | Estado |
|------|-------------|--------|
| **1** | PermissionsService + MODULE_METADATA + RolesService | ✅ COMPLETADA |
| **2** | Módulo Usuarios completo (estructura + rutas + perfil propio) | ✅ COMPLETADA |
| **3A** | CompanyUser: interfaz + servicio + lista/estado | ✅ COMPLETADA |
| **3B** | Roles: migración REST→Firestore + seed super_admin | ✅ COMPLETADA |
| **3C** | UserFormComponent + UserDetailComponent + Cloud Functions | ✅ COMPLETADA |
| **3D** | Vinculación CompanyUser ↔ Persona (empleado) | ✅ COMPLETADA |
| **4** | Auditoría de seguridad + hardening de permisos | ✅ COMPLETADA |
| **5** | Deploy + fixes pendientes | ✅ COMPLETADA (2026-04-22) |
| **6** | RBAC guards en team-management | ✅ COMPLETADA (2026-04-22) |
| **6B** | Corrección rutas inconsistentes con ROLE_MATRIX | ✅ COMPLETADA (2026-04-22) |
| **7A** | Guards internos en child routes de features | 🔴 PENDIENTE |
| **7B** | `*hasPermission` en botones de módulos de negocio | 🔴 PENDIENTE |
| **7C** | Migración `UsersService` legacy (devices, organizations) | 🔴 PENDIENTE |
| **7D** | Índice Firestore para `getRolesAssignableTo()` | 🔴 PENDIENTE |
| **7E** | CF `deleteCompanyUser` + botón eliminar | ⬜ Opcional |
| **7F** | Mejoras arquitectura post-MVP | ⬜ Post-MVP |

---

## ✅ FASE 1 — PermissionsService + MODULE_METADATA

- [x] `MODULE_METADATA` exportado en `permission.interface.ts`
- [x] `RolesService` creado (originalmente REST, migrado a Firestore en Fase 3B)
- [x] `PermissionsService` reescrito con `ROLE_MATRIX`, computed signal `permissions`
- [x] `getRoles()`, `getAssignableRoles()`, `can()`, `canRead/Create/Update/Delete()`
- [x] `getPermissionsCatalog()`, `getAllPermissions()`, `getPermissionsGrouped()`
- [x] Fallback estático `_buildStaticPermissions()`
- [x] `HasPermissionDirective` funcional con `effect()` reactivo

---

## ✅ FASE 2 — Módulo Usuarios (estructura inicial)

- [x] Rutas `/users`, `/profiles`, `/profile` en `app.routes.ts`
- [x] `roleGuard` para `/users` y `/profiles`: roles `admin` + `super_admin`
- [x] Página `/profile` (perfil propio con Firebase Auth)
- [x] Items en sidebar layout default + super-admin

---

## ✅ FASE 3A — CompanyUser: interfaz + servicio + lista

- [x] `company-user.interface.ts` — `CompanyUser` + `CompanyUserFilters`
- [x] `company-users.service.ts` — `getCompanyUsers()`, `getCompanyUser()`,
      `upsertCompanyUser()`, `deactivateCompanyUser()`, `activateCompanyUser()`, `linkToPersona()`
- [x] `users.component.ts` — migrado a `CompanyUsersService`
- [x] Filtros client-side via computed signals (search, rol, estado)
- [x] `firestore.rules` — regla `company-users/{uid}`

---

## ✅ FASE 3B — Roles: migración REST → Firestore + seed

- [x] `roles.service.ts` — reescrito con Firestore, sin `ApiBaseService`
- [x] `DEFAULT_SYSTEM_ROLES` — 6 roles (incluyendo `accountant` desde Fase 4)
- [x] `seedDefaultRoles()` — idempotente (getDoc antes de setDoc)
- [x] Botón "Sembrar Roles" visible solo para `super_admin` en `/profiles`
- [x] `firestore.rules` — `/roles/{roleId}`: read=autenticado, write=admin/super_admin

---

## ✅ FASE 3C — UserFormComponent + UserDetailComponent + Cloud Functions

- [x] `functions/src/users/create-company-user.ts` — CF onCall, crea Auth + claims + Firestore
- [x] `functions/src/users/update-company-user.ts` — CF onCall, actualiza claims + Firestore
- [x] `UserManagementService` — `httpsCallable` a ambas CFs
- [x] `UserFormComponent` reescrito — formulario con `displayName`, `email`,
      `password/confirm`, `platformRole`, `isActive`
- [x] `UserDetailComponent` reescrito — lee de `CompanyUsersService` + card auditoría

---

## ✅ FASE 3D — Vinculación CompanyUser ↔ Persona (empleado)

**Decisión:** `displayName` (plataforma) y `Person.name` (empleado) son independientes — cada uno tiene su ciclo de vida. El `personaId` en `CompanyUser` es el puente.

- [x] Sección "Empleado Asociado" en `UserFormComponent` con 3 modos:
  - `none` — sin empleado
  - `existing` — select de empleados (`personas` con `roles: ['employee']`)
  - `new` — mini-form que crea `Person` y asigna `personaId` automáticamente
- [x] `linkedEmployee` signal carga la persona vinculada al editar
- [x] `onEmployeeSelected()` actualiza `linkedEmployee` en tiempo real
- [x] `upsertCompanyUser(uid, { personaId })` garantiza persistencia independiente del CF
- [x] `UserDetailComponent` — card "Empleado Asociado" visible si `personaId` existe

---

## ✅ FASE 4 — Auditoría de seguridad + hardening

Auditoría completa ejecutada el 2026-04-22. Ver decisiones a continuación.

### DECISIÓN-01: Rol `accountant` formalizado
**Problema:** `accountant` existía en `firestore.rules` y rutas pero no en `UserRole` ni `ASSIGNABLE_ROLES`. Nadie podía tenerlo. El módulo de contabilidad era inaccesible para roles no-admin.
**Solución:** Formalizar como rol real de nivel 2. Accede a documentos fiscales (compras, retenciones, notas de débito, contabilidad) sin ser administrador completo.
**Justificación en el contexto Ecuador:** Las empresas frecuentemente tienen un contador externo que necesita retenciones SRI y contabilidad. Sin este rol, la única alternativa era darle `admin` completo, un riesgo innecesario.
**Archivos:** `auth.service.ts`, `permissions.service.ts`, `roles.service.ts`, ambas CFs.
- [x] `UserRole` type incluye `'accountant'`
- [x] `ROLE_MATRIX` con permisos: purchases/retentions/debit_notes (CRUD), accounting (CRU), invoices/customers/suppliers/products/sri/settings (R)
- [x] `ROLE_LEVEL` — `accountant: 2`
- [x] `DEFAULT_SYSTEM_ROLES` — entrada `accountant` con `level: 2`, `color: '#6f42c1'`
- [x] `ASSIGNABLE_ROLES` en ambas CFs incluye `'accountant'`
- [x] `app.routes.ts` — rutas de retenciones y accounting usan `roles: ['admin', 'accountant']`

### DECISIÓN-02: `platformRole` solo escribible via Cloud Function
**Problema:** `CompanyUsersService.upsertCompanyUser()` podía escribir `platformRole` directamente desde el cliente, sin actualizar los Firebase Auth claims. Un `admin` podía escalar a `super_admin` en Firestore sin que los claims cambiaran.
**Solución:** Firestore Security Rules bloquean que el cliente modifique `platformRole` o `companyId` usando `affectedKeys().hasAny(['platformRole', 'companyId'])`. Solo el Admin SDK (Cloud Functions) puede cambiar esos campos.
**Justificación:** El cambio de rol tiene dos efectos atómicos: Firestore + claims. Si solo se actualiza uno, el sistema queda inconsistente. Centralizar en la CF garantiza atomicidad y rollback.
**Regla en `firestore.rules`:**
```
allow update: if isAuthenticated() && belongsToCompany(companyId)
              && (isSuperAdmin() || isAdmin() || request.auth.uid == uid)
              && !request.resource.data.diff(resource.data)
                   .affectedKeys().hasAny(['platformRole', 'companyId']);
```
- [x] Regla aplicada en `company-users/{uid}` update

### DECISIÓN-03: `PermissionsService.can()` verifica el plan del tenant
**Problema:** `PermissionsService` y `TenantService` eran independientes. Un usuario con rol `admin` en un plan básico sin módulo `accounting` podía ver botones de contabilidad porque `can('accounting', 'create')` devolvía `true` basado solo en la matriz de roles.
**Solución:** `can(module, action)` verifica en 2 pasos: (1) la matriz de roles concede la acción, (2) `TenantService.hasModule()` confirma que el módulo está activo en el plan. Si alguno es false, devuelve false.
**Caso especial:** Los módulos de plataforma (`companies`, `plans`, `users`, `settings`) están en `PLATFORM_MODULES` y se excluyen de la verificación del tenant. `super_admin` los accede siempre.
**Normalización:** `ROLE_MATRIX` usa snake_case (`debit_notes`) pero `TenantService` usa camelCase (`debitNotes`). La constante `SNAKE_TO_CAMEL_MODULE` hace la traducción.
- [x] `can()` integra `TenantService.hasModule()`
- [x] `PLATFORM_MODULES` constante con módulos de plataforma excluidos
- [x] `SNAKE_TO_CAMEL_MODULE` constante de normalización

### DECISIÓN-04: `accounting` como módulo en `ROLE_MATRIX`
**Problema:** `accounting` existía como ruta pero no tenía entrada en `ROLE_MATRIX`. `can('accounting', 'read')` siempre devolvía `false`.
**Solución:** Entrada en `ROLE_MATRIX`: `admin` (CRUD), `accountant` (CRU).
- [x] `accounting` en `ROLE_MATRIX` para `admin` y `accountant`

### DECISIÓN-05: Cloud Functions atómicas con rollback
**Problema:** Orden original: (1) crear Auth, (2) claims, (3) Firestore. Si Firestore fallaba, el usuario existía con claims pero sin perfil.
**Solución:** Nuevo orden: (1) crear Auth, (2) **Firestore primero**, (3) claims. Si claims falla → rollback del doc Firestore. Firestore es la fuente de verdad de la app.
- [x] `create-company-user.ts` — escribe Firestore antes de claims; rollback con `docRef.delete()` si claims falla
- [x] `update-company-user.ts` — captura estado previo; rollback de `platformRole`/`updatedAt`/`updatedBy` si claims falla

### Correcciones adicionales de la auditoría
- [x] **MED-03**: `admin` solo puede crear/editar roles `type: 'custom'` en Firestore Rules
- [x] **MED-05**: `DisableIfNoPermissionDirective` implementada con `ElementRef` + `Renderer2` (aplica `disabled`, `aria-disabled`, clase `disabled`)
- [x] **MED-01**: Ruta `/unauthorized` creada en `app.routes.ts`
- [x] **LOW-01**: Rutas de desarrollo CoreUI protegidas con `roles: ['super_admin']`

---

## ✅ FASE 5 — Deploy + fixes (2026-04-22)

### Deploy realizado
```bash
firebase deploy --only functions:createCompanyUser,functions:updateCompanyUser
firebase deploy --only firestore:rules
```

### Fixes completados
- [x] `roleGuard` redirige a `/unauthorized` (antes redirigía a `/dashboard`)
- [x] `UserDetailComponent` — `createdBy`/`updatedBy` resuelven UID → `displayName` via `resolveAuditNames()`
- [x] Página `/unauthorized` — diseño completo: código 403, badge del rol actual, botones Inicio/Volver/Cerrar Sesión
- [x] `RolesService.getRolesAssignableTo(level)` — query Firestore con `where('level', '>', level)` en vez de filtro cliente
- [x] `PermissionsService.getAssignableRolesQuery()` — expone el método filtrado; `user-form` lo usa directamente
- [x] `users.component.ts` y `user-detail.component.ts` — `accountant` en `getRoleColor()` / `getRoleName()`

---

## ✅ FASE 6 — RBAC guards en team-management (2026-04-22)

- [x] Guards en rutas de escritura: `projects/new|edit`, `tasks/new|edit`, `requests/new|edit`, `members/new|edit` → `roles: ['admin', 'seller']`
- [x] Ruta `catalogs` → `roles: ['admin']` (configuración solo admin)
- [x] `*hasPermission="'team_management.create'"` en botones "Agregar Miembro" del members-list
- [x] `*hasPermission="'team_management.edit'"` en botón "Editar miembro" de cada card
- [x] Nav items de team-management visibles para `seller` (excepto Catálogos que sigue siendo `admin`-only)

---

## ✅ FASE 6B — Corrección de rutas inconsistentes con ROLE_MATRIX (2026-04-22)

Detectadas durante revisión del plan. Las rutas en `app.routes.ts` no coincidían con la matriz de permisos.

| Ruta | Antes | Después | Motivo |
|------|-------|---------|--------|
| `invoices` | `['admin','seller']` | `['admin','seller','cashier']` | cashier tiene RC en invoices |
| `debit-notes` | `['admin','seller']` | `['admin','accountant','seller']` | accountant tiene CRUD |
| `purchases` | `['admin']` | `['admin','accountant','seller']` | accountant CRUD, seller CRU |
| `stock` | `['admin']` | `['admin','seller']` | seller tiene CRU en stock |
| `team-management` (padre) | `['admin']` | `['admin','seller']` | padre bloqueaba a seller aunque hijas lo permitían |

- [x] `app.routes.ts` — 5 rutas corregidas
- [x] `_nav.ts` — nav items de `debit-notes`, `stock`, `purchases` actualizados para coincidir

---

## ⬜ FASE 7 — Gaps pendientes identificados

### 7A — Roles en rutas de features secundarias
- [ ] `invoices` child routes (`/new`, `/:id/edit`) — falta `roleGuard` interno para separar cashier (solo RC) de seller/admin (CRU)
- [ ] `purchases` child routes — separar permisos delete: accountant no puede borrar compras (solo admin)
- [ ] `stock` child routes — seller tiene CRU pero no delete; falta guard en `/new` y `/:id/edit`
- [ ] Rutas de `personas`, `products` — `cashier` y `read_only` tienen R pero las rutas `/new` y `/:id/edit` no están protegidas

### 7B — Cobertura de `*hasPermission` en módulos de negocio
Los botones de acción (Crear, Editar, Eliminar) en los siguientes módulos aún no usan `*hasPermission`:
- [ ] `invoices` — botones Crear/Editar/Eliminar factura
- [ ] `products` — botones CRUD de artículos
- [ ] `personas` — botones CRUD de clientes/proveedores/empleados
- [ ] `purchases` — botones CRUD de compras
- [ ] `stock` — botones de ajuste de inventario
- [ ] `settings` — secciones de configuración solo visibles para `admin`

### 7C — Migración legacy `UsersService` en otros módulos
Tres componentes aún llaman al REST API de FeathersJS (`localhost:3030`) para buscar usuarios:
- [ ] `device-form.component.ts` — usa `UsersService` para asignar usuario a dispositivo
- [ ] `organization-form.component.ts` — usa `UsersService` para seleccionar responsable
- [ ] `organization-details.component.ts` — usa `UsersService` para mostrar usuario responsable
Migrar a `CompanyUsersService` (Firestore) igual que se hizo con `UserDetailComponent`.

### 7D — Índice Firestore para `getRolesAssignableTo()`
`RolesService.getRolesAssignableTo(level)` usa `where('level', '>', level) + orderBy('level', 'asc')`.
Firestore requiere un índice compuesto para este query. Sin el índice fallará en producción.
- [ ] Crear índice compuesto en `firestore.indexes.json`: colección `/roles`, campos `level ASC`
- [ ] `firebase deploy --only firestore:indexes`

### 7E — Cloud Function para eliminar usuarios
No existe `deleteCompanyUser` CF. Actualmente solo se puede desactivar (isActive: false).
- [ ] CF `deleteCompanyUser` — elimina de Firebase Auth + doc Firestore + limpia referencias
- [ ] Botón "Eliminar usuario" en `UserDetailComponent` visible solo para `super_admin`

### 7F — Mejoras de arquitectura (post-MVP)
- [ ] Sincronización automática claims ↔ Firestore si divergen (Cloud Function trigger `onDocumentWritten`)
- [ ] Unificar `ROLE_MATRIX` y `DEFAULT_SYSTEM_ROLES` en una única fuente de verdad
- [ ] Sección "Acceso a la plataforma" en detalle de Persona empleado
- [ ] Perfil propio (`/profile`) — mostrar datos desde `CompanyUser` además de Firebase Auth (displayName, rol, empleado vinculado)

---

## Notas de arquitectura

| Decisión | Justificación |
|----------|---------------|
| `CompanyUser` doc ID = Firebase Auth UID | O(1) lookup por UID desde cualquier módulo Firestore |
| `displayName` (plataforma) ≠ `Person.name` (empleado) | Contextos diferentes: UI interna vs documentos legales. Independientes por diseño. |
| `seedDefaultRoles()` idempotente | Seguro para correr varias veces; no sobreescribe roles customizados |
| Crear usuario requiere CF (Admin SDK) | `createUserWithEmailAndPassword` del cliente loguea al nuevo usuario — efecto no deseado |
| `permissions` como computed signal | `HasPermissionDirective` reacciona a cambios de sesión con `effect()` |
| `canManageRoles()` vs `*hasPermission` en bootstrap | No se puede pedir permiso si los roles aún no existen en Firestore |
| CF atómica: Firestore antes que claims | Firestore es la fuente de verdad; el rollback revierte el doc si claims falla |
| `PLATFORM_MODULES` excluidos del plan | `super_admin` no pertenece a empresa; sus módulos no están en `enabledModules` |

---

## Estructura de archivos — estado actual

```
src/app/
├── core/
│   ├── interfaces/
│   │   ├── permission.interface.ts       ✅ Role, Permission, MODULE_METADATA
│   │   ├── company-user.interface.ts     ✅ CompanyUser, CompanyUserFilters (+ createdBy/updatedBy)
│   │   └── user.interface.ts             ⚠️  legacy, otros módulos
│   └── services/
│       ├── auth.service.ts               ✅ UserRole incluye 'accountant'
│       ├── permissions.service.ts        ✅ ROLE_MATRIX, can() + TenantService, accountant
│       ├── roles.service.ts              ✅ Firestore + DEFAULT_SYSTEM_ROLES (6 roles)
│       ├── company-users.service.ts      ✅ Firestore company-users
│       └── user-management.service.ts    ✅ httpsCallable a CFs
│
├── features/
│   ├── users/
│   │   ├── users.component.ts            ✅ CompanyUsersService
│   │   ├── components/user-form/         ✅ CF + Persona asociada
│   │   └── pages/user-detail/            ✅ CompanyUser + empleado + auditoría
│   └── profiles/
│       └── profiles.component.ts         ✅ seed button + canManageRoles
│
└── shared/directives/
    └── has-permission.directive.ts       ✅ HasPermission + DisableIfNoPermission (completa)

functions/src/users/
├── create-company-user.ts                ✅ atómica + rollback + accountant
└── update-company-user.ts                ✅ atómica + rollback + accountant

firestore.rules                           ✅ affectedKeys platformRole + roles type:system
src/app/app.routes.ts                     ✅ /unauthorized + CoreUI dev + roles corregidos (6B)
src/app/layout/default-layout/_nav.ts    ✅ nav corregido: seller/accountant en sus módulos
src/app/views/pages/unauthorized/         ✅ diseño completo 403 + badge rol + botones
src/app/core/guards/role.guard.ts         ✅ redirige a /unauthorized

⚠️ Deuda técnica pendiente:
src/app/features/devices/device-form/    ❌ usa UsersService legacy (Fase 7C)
src/app/features/organizations/          ❌ usa UsersService legacy (Fase 7C)
firestore.indexes.json                   ❌ índice para getRolesAssignableTo() (Fase 7D)
```
