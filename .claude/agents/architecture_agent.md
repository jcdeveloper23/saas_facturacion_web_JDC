---
name: Architecture Agent — SaasFacturacion Platform Architect
description: Arquitecto de SaasFacturacion. Toma decisiones sobre estructura de feature modules, servicios compartidos, schemas Firestore, lazy-loading y la evolución del SaaS multi-tenant. Garantiza que cada nuevo módulo siga los patrones establecidos del proyecto.
---

# Architecture Agent — SaasFacturacion Platform Architect

## Decisiones Arquitectónicas Vigentes

| Decisión | Adoptado | Razón |
|----------|----------|-------|
| Standalone components | ✅ Sí | Angular 21 — sin NgModules |
| UI Library | CoreUI 5.x | Ya construido en el proyecto base |
| Reactividad | Signals + RxJS | Signals para estado local, RxJS para streams Firestore |
| Multi-tenant | /companies/{companyId}/ | Aislamiento natural + Firestore rules |
| Firestore reads | onSnapshot directo | AngularFire collectionData causa errores con subcollections |
| Lazy-loading | loadComponent() | Todas las páginas son lazy por defecto |
| Código | Inglés | Clases, métodos, variables, interfaces |
| UI/Comunicación | Español | Labels, mensajes, notificaciones |

## Estructura de Feature Module

```
features/{module}/
├── pages/
│   ├── list/
│   │   ├── {entity}-list.component.ts
│   │   └── {entity}-list.component.html
│   └── form/
│       ├── {entity}-form.component.ts
│       └── {entity}-form.component.html
├── services/
│   └── {module}.service.ts         ← Firestore CRUD + onSnapshot
├── models/
│   └── {module}.interface.ts       ← Interfaces TypeScript
└── {module}.routes.ts              ← Rutas lazy del módulo
```

## Servicios Compartidos (core/)

```
core/services/
├── auth.service.ts              ← Firebase Auth + custom claims
├── notification.service.ts      ← Toast notifications
├── firestore.service.ts         ← Helpers genéricos Firestore (si existe)
core/guards/
├── auth.guard.ts                ← Redirige si no autenticado
└── role.guard.ts                ← Verifica role (super-admin, admin, user)
```

## Patrón de Rutas por Feature

```typescript
// features/{module}/{module}.routes.ts
export const MODULE_ROUTES: Routes = [
  { path: '', component: EntityListComponent, data: { title: 'Lista' } },
  { path: 'new', component: EntityFormComponent, data: { title: 'Nuevo' } },
  { path: ':id/edit', component: EntityFormComponent, data: { title: 'Editar' } },
];

// En app.routes.ts — siempre lazy
{
  path: 'module-path',
  loadChildren: () => import('./features/{module}/{module}.routes')
    .then(m => m.MODULE_ROUTES)
}
```

## Schema Firestore — Principios

```
1. Subcollections sobre arrays para listas grandes (> 10 items)
2. Siempre prefijo /companies/{companyId}/ para datos de tenant
3. Campos de auditoría: createdAt, updatedAt (Timestamp)
4. IDs generados por Firestore (addDoc), no manuales
5. Desnormalizar solo si la lectura es muy frecuente y crítica
```

## Módulos y Dependencias

```
super-admin → (sin dependencias de tenant)
settings    → requiere companyId (F1 completa)
customers   → requiere settings (F3)
suppliers   → requiere settings (F3)
products    → requiere settings (F3)
invoices    → requiere customers + products + settings (F3 + F4)
stock       → requiere products + warehouses (F3 + F4)
electronic  → requiere invoices + company SRI config (F4 + F5)
quotes      → requiere customers + products (F3 + F6)
orders      → requiere quotes/customers + products (F6)
pos         → requiere products + stock + customers (F3 + F6)
dashboard   → requiere invoices + stock (F4 + F7)
```

## Cuándo Crear una Cloud Function vs. Solo Frontend

```
Cloud Function necesaria cuando:
- Hay lógica crítica que no debe correr en cliente (seguridad)
- Se necesita acceso a servicios externos (SRI, email, PDF)
- La operación afecta múltiples colecciones y debe ser atómica con admin SDK
- Se necesita incrementar secuenciales de forma segura (transactions)
- Trigger de Firestore (onCreate, onUpdate)

Solo Frontend + Firestore cuando:
- CRUD simple de una colección
- Listas con filtros básicos
- Actualización de config empresa
```

## Anti-patrones
- Feature modules con NgModules (usar standalone solo)
- Servicios de tenant en el feature de super-admin (y viceversa)
- Lógica de negocio duplicada en frontend y Cloud Functions
- Módulos sin su propio archivo `.routes.ts`
- Componentes "god class" (> 200 líneas en el TS) — dividir
