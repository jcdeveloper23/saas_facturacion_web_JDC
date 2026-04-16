# PLAN DE IMPLEMENTACIÓN: Módulo team-management

> **Versión:** 1.3  
> **Fecha creación:** 2026-04-15  
> **Última actualización:** 2026-04-16  
> **Rama:** `feature/team-management`  
> **Paquete SaaS:** `pkg_team_mgmt`  
> **Código de módulo:** `teamManagement`

---

## Estado de avance

| Fase | Descripción | Estado |
|---|---|---|
| **1** | Estructura base, rutas y navegación | ✅ Completada |
| **Paquete SaaS** | Configuración `plugin-packages-seed.ts` | ✅ Completada |
| **2** | Modelos TypeScript | ✅ Completada |
| **3** | Servicios Firestore | ✅ Completada |
| **4** | Componentes y páginas (11 componentes) | ✅ Completada |
| **5** | Firestore: reglas e índices | ✅ Completada |
| **6** | Cloud Functions | ✅ Completada |
| **7** | Activación como paquete SaaS (seed) | ✅ Completada |
| **8** | Bugs críticos — datos incorrectos | ✅ Completada |
| **9** | UX daily flow — flujos rotos y gaps de navegación | ⏳ Pendiente |
| **10** | Features de diferenciación (subtareas, timer, health score) | ⏳ Pendiente |
| **11** | Competitividad Jira/ClickUp (epics, lead time, gráficas) | ⏳ Pendiente |

### Fixes aplicados post-Fase 4

| Error | Archivo | Corrección |
|---|---|---|
| `TS2532` — `specialties?.length` posiblemente `undefined` | `members-list.component.html:140` | Cambiado a `(m.specialties?.length ?? 0) > 0` |
| `TS2538` — `null` como índice de `Record` | `request-form.component.html:244` | Refactorizado con `@if (val; as statusVal)` |
| `NG8002` — `ngModel` no reconocido en `textarea` | `task-form.component.ts` | Agregado `FormsModule` a imports |
| `TS2353` — `loggedHours` no existe en `TaskCreateInput` | `task-form.component.ts:209` | Eliminado (lo inicializa el servicio) |

---

## Índice

1. [Arquitectura detectada del proyecto](#1-arquitectura-detectada-del-proyecto)
2. [Contexto de negocio](#2-contexto-de-negocio)
3. [Estructura de archivos a crear](#3-estructura-de-archivos-a-crear)
4. [Fase 1 — Estructura base, rutas y navegación](#fase-1--estructura-base-rutas-y-navegación)
5. [Fase 2 — Modelos TypeScript](#fase-2--modelos-typescript)
6. [Fase 3 — Servicios Firestore](#fase-3--servicios-firestore)
7. [Fase 4 — Componentes y páginas](#fase-4--componentes-y-páginas)
8. [Fase 5 — Firestore: reglas e índices](#fase-5--firestore-reglas-e-índices)
9. [Fase 6 — Cloud Functions](#fase-6--cloud-functions)
10. [Fase 7 — Activación como paquete SaaS](#fase-7--activación-como-paquete-saas)
11. [Dependencias entre fases](#dependencias-entre-fases)
12. [Asignación de agentes](#asignación-de-agentes)
13. [Reglas obligatorias del proyecto](#reglas-obligatorias-del-proyecto)
14. [Diagnóstico arquitectónico — 2026-04-16](#diagnóstico-arquitectónico--2026-04-16)
15. [Fase 8 — Bugs críticos](#fase-8--bugs-críticos)
16. [Fase 9 — UX daily flow](#fase-9--ux-daily-flow)
17. [Fase 10 — Features de diferenciación](#fase-10--features-de-diferenciación)
18. [Fase 11 — Competitividad Jira/ClickUp](#fase-11--competitividad-jiraclickup)

---

## 1. Arquitectura detectada del proyecto

### Stack confirmado

| Aspecto | Valor |
|---|---|
| Angular | 21.1 — **standalone components obligatorios** (sin NgModules) |
| Firebase | 12.x + `@angular/fire` v20 |
| UI | CoreUI 5.6 — imports individuales por módulo |
| Estado reactivo | `signal()` + `computed()` — patrón dominante |
| Inyección de dependencias | `inject()` en propiedades de clase, **nunca** constructor injection |
| Multi-tenant | `companies/{companyId}/{colección}/{docId}` |
| Activación de paquetes | `company.enabledModules[]` + `moduleGuard` + `filterNav()` |
| RxJS | 7.8 con `takeUntil(destroy$)` para subscriptions |
| TypeScript | 5.9 |

### Estructura de carpetas del proyecto

```
src/app/
├── app.config.ts           ← providers globales
├── app.routes.ts           ← rutas raíz lazy-loaded
├── core/
│   ├── guards/             ← authGuard, loginGuard, roleGuard, moduleGuard
│   ├── interceptors/       ← authInterceptor, loadingInterceptor
│   ├── interfaces/         ← BaseDocument, permission, user, etc.
│   └── services/           ← FirestoreService, TenantService, AuthService
├── features/               ← un directorio por vertical de negocio
│   ├── personas/
│   ├── invoices/
│   ├── purchases/
│   ├── stock/
│   ├── settings/
│   └── super-admin/
├── layout/
│   └── default-layout/
│       └── _nav.ts         ← sidebar con filterNav()
└── shared/
    └── components/
```
 
### Cómo funciona el multi-tenant

1. Firebase Auth tiene custom claims: `{ companyId: string, role: UserRole }`
2. `AuthService` lee claims al login → llama `TenantService.setCompanyId(companyId)`
3. `TenantService` hace `onSnapshot` a `/companies/{companyId}` → mantiene `CompanyConfig` en signal
4. `CompanyConfig` tiene `enabledPackages: string[]` y `enabledModules: string[]`
5. `TenantService.hasModule(code)` es el check que usan guards y nav
6. Todos los datos van en `/companies/{companyId}/{colección}/{docId}`

### Cómo se activa un paquete SaaS

1. Super admin crea `PluginPackage` en `/plugin-packages/{id}` con `modules: string[]`
2. Para activar: super admin actualiza `company.enabledModules` y `company.enabledPackages`
3. `moduleGuard` lee `TenantService.hasModule(route.data.module)` — si no está activo, redirige a `/dashboard`
4. `filterNav()` oculta items cuyo `attributes.module` no está en `activeModules`

### Guards disponibles

| Guard | Descripción |
|---|---|
| `authGuard` | Requiere usuario autenticado |
| `loginGuard` | Redirige usuarios ya logueados fuera de `/login` |
| `roleGuard` | Verifica `data.roles: string[]` contra `user.role` |
| `moduleGuard` | Verifica `data.module: string` contra `tenantService.hasModule(code)` |

---

## 2. Contexto de negocio

**Empresa con:**
- 24 desarrolladores + QA + Soporte
- 15 clientes activos
- Múltiples proyectos simultáneos

**Problemas a resolver:**
- Desarrolladores con 80h extras sin control
- Sin gestión de solicitudes de clientes
- Cambios de alcance no documentados
- Tareas mezcladas sin prioridades claras
- Retrasos en entregas sin visibilidad

**UI objetivo:** Estilo Jira / Linear / ClickUp

---

## 3. Estructura de archivos a crear

```
src/app/features/team-management/
├── models/
│   ├── project.interface.ts
│   ├── task.interface.ts
│   ├── request.interface.ts
│   ├── timesheet.interface.ts
│   └── team-member.interface.ts
│
├── services/
│   ├── projects.service.ts
│   ├── tasks.service.ts
│   ├── requests.service.ts
│   ├── timesheets.service.ts
│   └── team-members.service.ts
│
├── pages/
│   ├── dashboard/
│   │   ├── tm-dashboard.component.ts
│   │   └── tm-dashboard.component.html
│   ├── kanban/
│   │   ├── tm-kanban.component.ts
│   │   └── tm-kanban.component.html
│   ├── projects/
│   │   ├── projects-list.component.ts
│   │   ├── projects-list.component.html
│   │   ├── project-form.component.ts
│   │   └── project-form.component.html
│   ├── tasks/
│   │   ├── tasks-list.component.ts
│   │   ├── tasks-list.component.html
│   │   ├── task-form.component.ts
│   │   └── task-form.component.html
│   ├── requests/
│   │   ├── requests-list.component.ts
│   │   ├── requests-list.component.html
│   │   ├── request-form.component.ts
│   │   └── request-form.component.html
│   ├── timesheets/
│   │   ├── timesheets-list.component.ts
│   │   └── timesheets-list.component.html
│   ├── members/
│   │   ├── members-list.component.ts
│   │   └── members-list.component.html
│   └── reports/
│       ├── tm-reports.component.ts
│       └── tm-reports.component.html
│
└── team-management.routes.ts
```

**Archivos existentes a modificar:**

| Archivo | Cambio |
|---|---|
| `src/app/app.routes.ts` | Agregar ruta `/team-management` con guards |
| `src/app/layout/default-layout/_nav.ts` | Agregar sección "Equipo" en sidebar |
| `firestore.rules` | Agregar reglas para colecciones `tm-*` |
| `firestore.indexes.json` | Agregar índices compuestos |

---

## Fase 1 — Estructura base, rutas y navegación

> **Agente:** Angular Agent  
> **Estado:** [x] Completada — 2026-04-15

### 1.1 Crear archivo de rutas del módulo

**Archivo:** `src/app/features/team-management/team-management.routes.ts`

```typescript
import { Routes } from '@angular/router';

export const TEAM_MANAGEMENT_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/tm-dashboard.component').then(m => m.TmDashboardComponent),
    data: { title: 'Team Dashboard' }
  },
  {
    path: 'kanban',
    loadComponent: () =>
      import('./pages/kanban/tm-kanban.component').then(m => m.TmKanbanComponent),
    data: { title: 'Kanban' }
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./pages/projects/projects-list.component').then(m => m.ProjectsListComponent),
    data: { title: 'Proyectos' }
  },
  {
    path: 'projects/new',
    loadComponent: () =>
      import('./pages/projects/project-form.component').then(m => m.ProjectFormComponent),
    data: { title: 'Nuevo Proyecto' }
  },
  {
    path: 'projects/:id/edit',
    loadComponent: () =>
      import('./pages/projects/project-form.component').then(m => m.ProjectFormComponent),
    data: { title: 'Editar Proyecto' }
  },
  {
    path: 'tasks',
    loadComponent: () =>
      import('./pages/tasks/tasks-list.component').then(m => m.TasksListComponent),
    data: { title: 'Tareas' }
  },
  {
    path: 'tasks/new',
    loadComponent: () =>
      import('./pages/tasks/task-form.component').then(m => m.TaskFormComponent),
    data: { title: 'Nueva Tarea' }
  },
  {
    path: 'tasks/:id/edit',
    loadComponent: () =>
      import('./pages/tasks/task-form.component').then(m => m.TaskFormComponent),
    data: { title: 'Editar Tarea' }
  },
  {
    path: 'requests',
    loadComponent: () =>
      import('./pages/requests/requests-list.component').then(m => m.RequestsListComponent),
    data: { title: 'Solicitudes' }
  },
  {
    path: 'requests/new',
    loadComponent: () =>
      import('./pages/requests/request-form.component').then(m => m.RequestFormComponent),
    data: { title: 'Nueva Solicitud' }
  },
  {
    path: 'requests/:id/edit',
    loadComponent: () =>
      import('./pages/requests/request-form.component').then(m => m.RequestFormComponent),
    data: { title: 'Editar Solicitud' }
  },
  {
    path: 'timesheets',
    loadComponent: () =>
      import('./pages/timesheets/timesheets-list.component').then(m => m.TimesheetsListComponent),
    data: { title: 'Control de Tiempos' }
  },
  {
    path: 'members',
    loadComponent: () =>
      import('./pages/members/members-list.component').then(m => m.MembersListComponent),
    data: { title: 'Equipo' }
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./pages/reports/tm-reports.component').then(m => m.TmReportsComponent),
    data: { title: 'Reportes de Rendimiento' }
  }
];
```

### 1.2 Modificar `app.routes.ts`

Agregar dentro del bloque con `canActivate: [authGuard]`:

```typescript
// ── Team Management ────────────────────────────────────────────────
{
  path: 'team-management',
  canActivate: [authGuard, roleGuard, moduleGuard],
  data: { roles: ['admin'], module: 'teamManagement', title: 'Gestión de Equipo' },
  loadChildren: () =>
    import('./features/team-management/team-management.routes')
      .then(m => m.TEAM_MANAGEMENT_ROUTES)
},
```

### 1.3 Modificar `_nav.ts`

Agregar nueva sección antes del bloque de Administración:

```typescript
// ─── Team Management ──────────────────────────────────────────────
{
  title: true,
  name: 'Equipo'
},
{
  name: 'Team Dashboard',
  url: '/team-management/dashboard',
  iconComponent: { name: 'cil-speedometer' },
  attributes: { module: 'teamManagement', roles: ['admin'] }
},
{
  name: 'Kanban',
  url: '/team-management/kanban',
  iconComponent: { name: 'cil-columns' },
  attributes: { module: 'teamManagement', roles: ['admin'] }
},
{
  name: 'Proyectos',
  url: '/team-management/projects',
  iconComponent: { name: 'cil-folder' },
  attributes: { module: 'teamManagement', roles: ['admin'] }
},
{
  name: 'Tareas',
  url: '/team-management/tasks',
  iconComponent: { name: 'cil-task' },
  attributes: { module: 'teamManagement', roles: ['admin'] }
},
{
  name: 'Solicitudes',
  url: '/team-management/requests',
  iconComponent: { name: 'cil-inbox' },
  attributes: { module: 'teamManagement', roles: ['admin'] }
},
{
  name: 'Tiempos',
  url: '/team-management/timesheets',
  iconComponent: { name: 'cil-clock' },
  attributes: { module: 'teamManagement', roles: ['admin'] }
},
{
  name: 'Equipo',
  url: '/team-management/members',
  iconComponent: { name: 'cil-people' },
  attributes: { module: 'teamManagement', roles: ['admin'] }
},
{
  name: 'Reportes',
  url: '/team-management/reports',
  iconComponent: { name: 'cil-chart-line' },
  attributes: { module: 'teamManagement', roles: ['admin'] }
},
```

### 1.4 Crear placeholders vacíos de los componentes

Crear un componente mínimo por cada página para que el routing compile sin errores antes de implementar el contenido real. Esto permite verificar que toda la estructura de rutas funciona.

---

## Fase 2 — Modelos TypeScript

> **Agente:** Angular Agent  
> **Estado:** [x] Completada — 2026-04-15  
> **Requiere:** Fase 1 completa

### 2.1 `models/project.interface.ts`

```typescript
import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// Stored at: /companies/{companyId}/tm-projects/{projectId}

export type ProjectStatus   = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning:  'Planificación',
  active:    'Activo',
  on_hold:   'En Espera',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  planning:  'secondary',
  active:    'primary',
  on_hold:   'warning',
  completed: 'success',
  cancelled: 'danger',
};

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low:      'Baja',
  medium:   'Media',
  high:     'Alta',
  critical: 'Crítica',
};

export const PROJECT_PRIORITY_COLORS: Record<ProjectPriority, string> = {
  low:      'secondary',
  medium:   'info',
  high:     'warning',
  critical: 'danger',
};

export interface ProjectMilestone {
  id: string;
  name: string;
  dueDate: Timestamp;
  completed: boolean;
  completedAt?: Timestamp;
}

export interface Project extends BaseDocument {
  name: string;
  description?: string;
  clientId?: string;          // ref a /companies/{companyId}/personas/{id}
  clientName?: string;        // snapshot del nombre
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate: Timestamp;
  dueDate: Timestamp;
  completedAt?: Timestamp;
  memberIds: string[];        // uids de Firebase Auth
  leadId?: string;            // uid del responsable principal
  milestones: ProjectMilestone[];
  tags: string[];
  estimatedHours: number;
  loggedHours: number;        // actualizado por Cloud Function
  completionPct: number;      // 0-100, calculado por Cloud Function
}

export type ProjectCreateInput = Omit<Project,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isActive' | 'loggedHours' | 'completionPct'
>;
```

### 2.2 `models/task.interface.ts`

```typescript
import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// Stored at: /companies/{companyId}/tm-tasks/{taskId}

export type TaskStatus   = 'backlog' | 'pending' | 'in_progress' | 'in_qa' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskType     = 'feature' | 'bug' | 'improvement' | 'research' | 'maintenance';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog:     'Backlog',
  pending:     'Pendiente',
  in_progress: 'En Desarrollo',
  in_qa:       'En QA',
  blocked:     'Bloqueado',
  done:        'Finalizado',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  backlog:     'secondary',
  pending:     'light',
  in_progress: 'primary',
  in_qa:       'info',
  blocked:     'danger',
  done:        'success',
};

// Orden de columnas para el tablero Kanban
export const TASK_KANBAN_COLUMNS: TaskStatus[] = [
  'backlog', 'pending', 'in_progress', 'in_qa', 'blocked', 'done'
];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low:      'Baja',
  medium:   'Media',
  high:     'Alta',
  critical: 'Crítica',
};

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  low:      'secondary',
  medium:   'info',
  high:     'warning',
  critical: 'danger',
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  feature:     'Funcionalidad',
  bug:         'Bug',
  improvement: 'Mejora',
  research:    'Investigación',
  maintenance: 'Mantenimiento',
};

export interface TaskComment {
  id: string;
  authorId: string;        // uid Firebase Auth
  authorName: string;      // snapshot
  content: string;
  createdAt: Timestamp;
}

export interface Task extends BaseDocument {
  projectId: string;
  projectName: string;     // snapshot para queries sin join
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeIds: string[];   // uids Firebase Auth
  reporterId: string;
  dueDate?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  estimatedHours: number;
  loggedHours: number;     // suma de timesheets vinculados (Cloud Function)
  tags: string[];
  requestId?: string;      // si vino de una solicitud de cliente
  blockedReason?: string;  // solo cuando status === 'blocked'
  comments: TaskComment[];
}

export type TaskCreateInput = Omit<Task,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isActive' | 'loggedHours'
>;
```

### 2.3 `models/request.interface.ts`

```typescript
import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// Stored at: /companies/{companyId}/tm-requests/{requestId}

export type RequestType    = 'bug' | 'feature' | 'change' | 'support' | 'consulting';
export type RequestStatus  = 'new' | 'triaged' | 'in_progress' | 'resolved' | 'rejected' | 'on_hold';
export type RequestUrgency = 'low' | 'medium' | 'high' | 'critical';

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new:         'Nueva',
  triaged:     'Evaluada',
  in_progress: 'En Proceso',
  resolved:    'Resuelta',
  rejected:    'Rechazada',
  on_hold:     'En Espera',
};

export const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  new:         'info',
  triaged:     'warning',
  in_progress: 'primary',
  resolved:    'success',
  rejected:    'danger',
  on_hold:     'secondary',
};

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  bug:        'Bug / Error',
  feature:    'Nueva Funcionalidad',
  change:     'Cambio / Mejora',
  support:    'Soporte',
  consulting: 'Consultoría',
};

export const REQUEST_URGENCY_COLORS: Record<RequestUrgency, string> = {
  low:      'secondary',
  medium:   'info',
  high:     'warning',
  critical: 'danger',
};

export interface RequestStatusChange {
  fromStatus: RequestStatus;
  toStatus: RequestStatus;
  changedBy: string;
  changedByName: string;
  changedAt: Timestamp;
  notes?: string;
}

export interface ClientRequest extends BaseDocument {
  title: string;
  description: string;
  type: RequestType;
  urgency: RequestUrgency;
  status: RequestStatus;
  clientId: string;
  clientName: string;      // snapshot
  projectId?: string;
  projectName?: string;
  taskId?: string;         // tarea derivada de esta solicitud
  assignedToId?: string;
  assignedToName?: string;
  estimatedHours?: number;
  agreedDate?: Timestamp;  // fecha comprometida con el cliente
  resolvedAt?: Timestamp;
  rejectedReason?: string;
  statusHistory: RequestStatusChange[];
  attachments: string[];   // Storage URLs
}

export type RequestCreateInput = Omit<ClientRequest,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isActive' | 'statusHistory' | 'resolvedAt'
>;
```

### 2.4 `models/timesheet.interface.ts`

```typescript
import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// Stored at: /companies/{companyId}/tm-timesheets/{timesheetId}
// IMPORTANTE: Los documentos de timesheet son inmutables (audit trail).
// Solo el admin puede actualizar el campo approved/approvedBy.

export type TimesheetEntryType = 'regular' | 'overtime' | 'support' | 'meeting' | 'training';

export const TIMESHEET_TYPE_LABELS: Record<TimesheetEntryType, string> = {
  regular:   'Regular',
  overtime:  'Hora Extra',
  support:   'Soporte',
  meeting:   'Reunión',
  training:  'Capacitación',
};

export const TIMESHEET_TYPE_COLORS: Record<TimesheetEntryType, string> = {
  regular:   'primary',
  overtime:  'warning',
  support:   'info',
  meeting:   'secondary',
  training:  'success',
};

export interface TimesheetEntry extends BaseDocument {
  taskId: string;
  taskTitle: string;         // snapshot
  projectId: string;
  projectName: string;       // snapshot
  userId: string;            // uid Firebase Auth
  userName: string;          // snapshot
  date: Timestamp;           // fecha del trabajo (no createdAt)
  hours: number;             // mínimo 0.5, múltiplos de 0.5
  type: TimesheetEntryType;
  description?: string;
  approved: boolean;
  approvedBy?: string;       // uid admin que aprobó
  approvedAt?: Timestamp;
}

export type TimesheetCreateInput = Omit<TimesheetEntry,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isActive' | 'approved' | 'approvedBy' | 'approvedAt'
>;

// ─── Helpers puros ────────────────────────────────────────────────────────────

export function roundHours(h: number): number {
  return Math.round(h * 2) / 2;
}

export function isOvertimeWeek(totalHoursInWeek: number): boolean {
  return totalHoursInWeek > 40;
}
```

### 2.5 `models/team-member.interface.ts`

```typescript
import { Timestamp } from '@angular/fire/firestore';
import { BaseDocument } from '../../../core/interfaces/common.interface';

// Stored at: /companies/{companyId}/tm-members/{memberId}
// Vincula un uid de Firebase Auth con metadata del equipo.

export type MemberRole   = 'developer' | 'qa' | 'support' | 'designer' | 'devops' | 'pm' | 'analyst';
export type MemberStatus = 'active' | 'on_leave' | 'inactive';

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  developer: 'Desarrollador',
  qa:        'QA / Testing',
  support:   'Soporte',
  designer:  'Diseñador',
  devops:    'DevOps',
  pm:        'Project Manager',
  analyst:   'Analista',
};

export const MEMBER_ROLE_COLORS: Record<MemberRole, string> = {
  developer: 'primary',
  qa:        'info',
  support:   'success',
  designer:  'warning',
  devops:    'secondary',
  pm:        'dark',
  analyst:   'light',
};

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active:   'Activo',
  on_leave: 'Con Permiso',
  inactive: 'Inactivo',
};

export interface TeamMember extends BaseDocument {
  userId: string;                 // uid Firebase Auth — campo único
  displayName: string;
  email: string;
  role: MemberRole;
  specialties: string[];          // ['Angular', 'Firebase', 'Node.js']
  status: MemberStatus;
  weeklyCapacityHours: number;    // horas disponibles por semana (default 40)
  activeProjectIds: string[];     // proyectos activos asignados
  avatarUrl?: string;
  phone?: string;
  hireDate?: Timestamp;
}

export type TeamMemberCreateInput = Omit<TeamMember,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isActive'
>;
```

---

## Fase 3 — Servicios Firestore

> **Agente:** Firebase Agent  
> **Estado:** [x] Completada — 2026-04-15  
> **Requiere:** Fase 2 completa

Todos los servicios siguen el **mismo patrón exacto** de `purchases.service.ts`:
- Inyectan `Firestore` directamente (no `FirestoreService` wrapper)
- Construyen el `colPath` usando `TenantService.companyId`
- Usan `onSnapshot` con `Observable` manual
- `create()` añade `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `isActive` automáticamente
- `update()` siempre actualiza `updatedAt` y `updatedBy`

### 3.1 `services/projects.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, query, orderBy, where, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { TenantService }    from '../../../core/services/tenant.service';
import { AuthService }      from '../../../core/services/auth.service';
import { Project, ProjectCreateInput, ProjectStatus } from '../models/project.interface';

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/tm-projects`; }

  getAll(): Observable<Project[]> {
    return new Observable<Project[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('createdAt', 'desc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Project)),
        error: err  => observer.error(err),
      });
    });
  }

  getActive(): Observable<Project[]> {
    return new Observable<Project[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('status', '==', 'active'), orderBy('dueDate', 'asc')), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Project)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getById(id: string): Observable<Project | undefined> {
    return new Observable<Project | undefined>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as Project : undefined),
        error: err  => observer.error(err),
      });
    });
  }

  async create(input: ProjectCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();
    const payload: Omit<Project, 'id'> = {
      ...input,
      loggedHours:   0,
      completionPct: 0,
      createdBy:  userId,
      updatedBy:  userId,
      createdAt:  now,
      updatedAt:  now,
      isActive:   true,
    };
    const ref = await addDoc(collection(this.firestore, this.colPath), payload);
    return ref.id;
  }

  async update(id: string, changes: Partial<Omit<Project, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, { ...changes, updatedAt: Timestamp.now(), updatedBy: userId } as any);
  }

  async changeStatus(id: string, status: ProjectStatus): Promise<void> {
    const changes: Partial<Project> = { status };
    if (status === 'completed') changes.completedAt = Timestamp.now();
    await this.update(id, changes);
  }

  async softDelete(id: string): Promise<void> {
    await this.update(id, { isActive: false } as any);
  }
}
```

### 3.2 `services/tasks.service.ts`

Mismo patrón. Métodos adicionales específicos:

```typescript
// colPath: `companies/${this.companyId}/tm-tasks`

getByProject(projectId: string): Observable<Task[]>
// query: where('projectId', '==', projectId), orderBy('priority', 'desc')

getByStatus(status: TaskStatus): Observable<Task[]>
// query: where('status', '==', status), orderBy('dueDate', 'asc')

getByAssignee(userId: string): Observable<Task[]>
// query: where('assigneeIds', 'array-contains', userId), orderBy('dueDate', 'asc')

async changeStatus(id: string, status: TaskStatus): Promise<void>
// Si status === 'done': también actualiza completedAt = Timestamp.now()
// Si status === 'in_progress': también actualiza startedAt = Timestamp.now()

async addComment(taskId: string, comment: Omit<TaskComment, 'id' | 'createdAt'>): Promise<void>
// arrayUnion en el campo comments con id uuid y createdAt = Timestamp.now()
```

### 3.3 `services/requests.service.ts`

```typescript
// colPath: `companies/${this.companyId}/tm-requests`

getAll(): Observable<ClientRequest[]>
getByStatus(status: RequestStatus): Observable<ClientRequest[]>
getByClient(clientId: string): Observable<ClientRequest[]>

async create(input: RequestCreateInput): Promise<string>
// Inicializa statusHistory: [{ fromStatus: 'new', toStatus: 'new', ... }]

async changeStatus(id: string, toStatus: RequestStatus, notes?: string): Promise<void>
// Agrega entrada a statusHistory via arrayUnion
// Si toStatus === 'resolved': también actualiza resolvedAt

async linkToTask(requestId: string, taskId: string): Promise<void>
// Actualiza: { taskId, status: 'in_progress' }
```

### 3.4 `services/timesheets.service.ts`

```typescript
// colPath: `companies/${this.companyId}/tm-timesheets`

getByUser(userId: string): Observable<TimesheetEntry[]>
// query: where('userId', '==', userId), orderBy('date', 'desc')

getByProject(projectId: string): Observable<TimesheetEntry[]>
// query: where('projectId', '==', projectId), orderBy('date', 'desc')

getByWeek(userId: string, weekStart: Timestamp, weekEnd: Timestamp): Observable<TimesheetEntry[]>
// query: where('userId', '==', userId), where('date', '>=', weekStart), where('date', '<=', weekEnd)

async create(input: TimesheetCreateInput): Promise<string>
// Inicializa: approved = false

async approve(id: string): Promise<void>
// Actualiza: { approved: true, approvedBy: userId, approvedAt: Timestamp.now() }

// NOTA: No hay método delete (audit trail inmutable)
```

### 3.5 `services/team-members.service.ts`

```typescript
// colPath: `companies/${this.companyId}/tm-members`

getAll(): Observable<TeamMember[]>
getActive(): Observable<TeamMember[]>
// query: where('status', '==', 'active')

getByUserId(userId: string): Observable<TeamMember | undefined>
// query: where('userId', '==', userId), limit(1)

async create(input: TeamMemberCreateInput): Promise<string>
async update(id: string, changes: Partial<TeamMember>): Promise<void>

async updateWorkload(memberId: string, projectIds: string[]): Promise<void>
// Actualiza: { activeProjectIds: projectIds }
```

---

## Fase 4 — Componentes y páginas

> **Agente:** Angular Agent  
> **Estado:** [x] Completada — 2026-04-15 (con 4 fixes post-implementación)  
> **Requiere:** Fase 3 completa

### Patrón base obligatorio para todos los componentes

```typescript
@Component({
  selector: 'app-nombre',
  standalone: true,
  templateUrl: './nombre.component.html',
  imports: [
    CommonModule,
    // CoreUI modules individuales: CardModule, BadgeModule, ButtonModule...
    // Angular: FormsModule, ReactiveFormsModule, RouterLink...
  ],
})
export class NombreComponent implements OnInit, OnDestroy {
  // 1. inject()
  readonly router  = inject(Router);
  private svc      = inject(NombreService);
  private destroy$ = new Subject<void>();

  // 2. Signals
  loading  = signal(true);
  all      = signal<Entidad[]>([]);

  // 3. Computed
  filtered = computed(() => { ... });

  // 4. Lifecycle
  ngOnInit(): void {
    this.svc.getAll().pipe(takeUntil(this.destroy$)).subscribe({
      next:  data => { this.all.set(data); this.loading.set(false); },
      error: err  => { /* handle */ this.loading.set(false); },
    });
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
```

### 4.1 `pages/dashboard/tm-dashboard.component`

**Responsabilidades:**
- KPIs globales del equipo (cards de métricas)
- Lista de proyectos activos con % de completitud
- Tareas vencidas o bloqueadas (alertas)
- Carga actual por miembro (barras de progreso)
- Solicitudes nuevas sin atender

**Signals:**
```typescript
projects = signal<Project[]>([]);
tasks    = signal<Task[]>([]);
members  = signal<TeamMember[]>([]);
loading  = signal(true);

// Computed KPIs
activeProjects  = computed(() => this.projects().filter(p => p.status === 'active'));
overdueTasks    = computed(() => this.tasks().filter(t => t.dueDate && t.dueDate.toDate() < new Date() && t.status !== 'done'));
blockedTasks    = computed(() => this.tasks().filter(t => t.status === 'blocked'));
pendingRequests = computed(() => /* requests con status 'new' */);

memberWorkload  = computed(() =>
  this.members().map(m => ({
    ...m,
    weeklyUsed: /* sumar horas del timesheet de la semana */,
    pct: Math.round((weeklyUsed / m.weeklyCapacityHours) * 100),
  }))
);
```

**UI (CoreUI):** `CardModule`, `ProgressModule`, `BadgeModule`, `GridModule`, `TableModule`

---

### 4.2 `pages/kanban/tm-kanban.component`

**Responsabilidades:**
- Tablero Kanban con 6 columnas: Backlog → Pendiente → En Desarrollo → En QA → Bloqueado → Finalizado
- Drag & drop entre columnas (`@angular/cdk/drag-drop`)
- Filtro por proyecto
- Cards de tarea con: título, prioridad (badge), asignados (avatares), fecha límite

**Signals:**
```typescript
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';

tasks              = signal<Task[]>([]);
selectedProjectId  = signal<string>('all');
loading            = signal(true);

tasksByColumn = computed(() => {
  const filtered = this.selectedProjectId() === 'all'
    ? this.tasks()
    : this.tasks().filter(t => t.projectId === this.selectedProjectId());

  return TASK_KANBAN_COLUMNS.reduce((acc, col) => {
    acc[col] = filtered.filter(t => t.status === col);
    return acc;
  }, {} as Record<TaskStatus, Task[]>);
});
```

**Método drop:**
```typescript
async onDrop(event: CdkDragDrop<Task[]>, newStatus: TaskStatus): Promise<void> {
  if (event.previousContainer === event.container) {
    moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
  } else {
    transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    const task = event.container.data[event.currentIndex];
    await this.tasksService.changeStatus(task.id, newStatus);
  }
}
```

**Imports:** `DragDropModule` de `@angular/cdk/drag-drop`, `CardModule`, `BadgeModule`

---

### 4.3 `pages/projects/projects-list.component`

```typescript
all        = signal<Project[]>([]);
loading    = signal(true);
statusFilter = signal<ProjectStatus | 'all'>('all');
searchTerm = signal('');

filtered = computed(() => {
  let list = this.all();
  if (this.statusFilter() !== 'all') list = list.filter(p => p.status === this.statusFilter());
  const q = this.searchTerm().toLowerCase();
  if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.clientName?.toLowerCase().includes(q));
  return list;
});

stats = computed(() => ({
  total:     this.all().length,
  active:    this.all().filter(p => p.status === 'active').length,
  completed: this.all().filter(p => p.status === 'completed').length,
  overdue:   this.all().filter(p => p.dueDate.toDate() < new Date() && p.status !== 'completed').length,
}));
```

**Acciones:** crear nuevo, editar, cambiar status, ver tareas (deep-link `?projectId=xxx`), soft-delete

---

### 4.4 `pages/projects/project-form.component`

**Formulario ReactiveFormsModule:**
```typescript
form = new FormGroup({
  name:           new FormControl('', [Validators.required, Validators.minLength(3)]),
  description:    new FormControl(''),
  clientId:       new FormControl(''),
  priority:       new FormControl<ProjectPriority>('medium', Validators.required),
  status:         new FormControl<ProjectStatus>('planning', Validators.required),
  startDate:      new FormControl('', Validators.required),  // string ISO → convert a Timestamp
  dueDate:        new FormControl('', Validators.required),
  estimatedHours: new FormControl(0, [Validators.required, Validators.min(0)]),
  memberIds:      new FormControl<string[]>([]),
  leadId:         new FormControl(''),
  tags:           new FormControl<string[]>([]),
});
```

**Modo edición:** detectar `route.params.id`, si existe → `getById(id)` → patchValue  
**Submit:** crear o actualizar según modo, luego `router.navigate(['/team-management/projects'])`

---

### 4.5 `pages/tasks/tasks-list.component`

```typescript
all            = signal<Task[]>([]);
loading        = signal(true);
statusFilter   = signal<TaskStatus | 'all'>('all');
projectFilter  = signal<string>('all');
assigneeFilter = signal<string>('all');

filtered = computed(() => {
  let list = this.all();
  if (this.statusFilter() !== 'all')   list = list.filter(t => t.status === this.statusFilter());
  if (this.projectFilter() !== 'all')  list = list.filter(t => t.projectId === this.projectFilter());
  if (this.assigneeFilter() !== 'all') list = list.filter(t => t.assigneeIds.includes(this.assigneeFilter()));
  return list;
});
```

---

### 4.6 `pages/tasks/task-form.component`

**Formulario:**
```typescript
form = new FormGroup({
  projectId:      new FormControl('', Validators.required),
  title:          new FormControl('', [Validators.required, Validators.minLength(5)]),
  description:    new FormControl(''),
  type:           new FormControl<TaskType>('feature', Validators.required),
  priority:       new FormControl<TaskPriority>('medium', Validators.required),
  status:         new FormControl<TaskStatus>('backlog', Validators.required),
  assigneeIds:    new FormControl<string[]>([]),
  estimatedHours: new FormControl(0, [Validators.required, Validators.min(0)]),
  dueDate:        new FormControl(''),
  blockedReason:  new FormControl(''),   // visible solo cuando status === 'blocked'
  requestId:      new FormControl(''),   // opcional, enlace a solicitud
  tags:           new FormControl<string[]>([]),
});
```

**Sección de comentarios:** lista de `task.comments` + textarea para agregar nuevo comentario. Llama `tasksService.addComment(taskId, comment)`.

---

### 4.7 `pages/requests/requests-list.component`

```typescript
all            = signal<ClientRequest[]>([]);
loading        = signal(true);
statusFilter   = signal<RequestStatus | 'all'>('all');
typeFilter     = signal<RequestType | 'all'>('all');

filtered   = computed(() => { /* filtros combinados */ });
newRequests = computed(() => this.all().filter(r => r.status === 'new').length);
```

**Acción especial:** botón "Crear tarea" que abre modal → llama `tasksService.create()` + `requestsService.linkToTask()`

---

### 4.8 `pages/timesheets/timesheets-list.component`

```typescript
all           = signal<TimesheetEntry[]>([]);
loading       = signal(true);
userFilter    = signal<string>('mine');   // 'mine' | 'all' | userId
weekStart     = signal<Date>(getMonday(new Date()));

weeklyTotal   = computed(() => this.all().reduce((s, t) => s + t.hours, 0));
overtimeHours = computed(() => Math.max(0, this.weeklyTotal() - 40));
isOvertime    = computed(() => this.overtimeHours() > 0);
```

**UI:** tabla con columnas: fecha, proyecto, tarea, usuario, horas, tipo, estado (aprobado/pendiente). Badge danger si hay horas extra.

---

### 4.9 `pages/members/members-list.component`

```typescript
members = signal<TeamMember[]>([]);
loading = signal(true);

// Enriquecer con carga actual (de timesheets de la semana)
membersWithLoad = computed(() =>
  this.members().map(m => ({
    ...m,
    currentLoadPct: /* calcular de timesheets signal */,
    isOverloaded: /* currentLoadPct > 100 */,
  }))
);
```

**UI:** cards por miembro con: nombre, rol (badge), especialidades (chips), barra de progreso de carga, proyectos activos.

---

### 4.10 `pages/reports/tm-reports.component`

```typescript
period      = signal<'week' | 'month' | 'custom'>('month');
reportData  = signal<ReportRow[]>([]);
loading     = signal(true);

totalHours     = computed(() => this.reportData().reduce((s, r) => s + r.hours, 0));
totalOvertime  = computed(() => this.reportData().reduce((s, r) => s + r.overtimeHours, 0));
```

**Tabla de rendimiento por usuario:**
| Usuario | Horas regulares | Horas extra | Tareas completadas | Tareas retrasadas | Eficiencia |
|---|---|---|---|---|---|

**Gráfica:** `@coreui/angular-chartjs` (ya en dependencias) — barras apiladas de horas por usuario.

---

## Fase 5 — Firestore: reglas e índices

> **Agentes:** Security Agent (reglas) + Firebase Agent (índices)  
> **Estado:** [x] Completada — 2026-04-16

### 5.1 Índices compuestos — `firestore.indexes.json`

Agregar al array `indexes`:

```json
{
  "collectionGroup": "tm-tasks",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "projectId", "order": "ASCENDING" },
    { "fieldPath": "status",    "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "tm-tasks",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "assigneeIds", "arrayConfig": "CONTAINS" },
    { "fieldPath": "dueDate",     "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "tm-tasks",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status",  "order": "ASCENDING" },
    { "fieldPath": "dueDate", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "tm-timesheets",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "date",   "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "tm-timesheets",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "projectId", "order": "ASCENDING" },
    { "fieldPath": "date",      "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "tm-timesheets",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "date",   "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "tm-requests",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status",    "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "tm-requests",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "clientId",  "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### 5.2 Reglas Firestore — `firestore.rules`

Agregar dentro del bloque `match /companies/{companyId}/{document=**}`:

```javascript
// ─── Team Management ──────────────────────────────────────────────────────────

match /tm-projects/{id} {
  allow read:   if isAuthenticated() && belongsToCompany(companyId);
  allow create, update: if isAuthenticated() && belongsToCompany(companyId) && isAdmin();
  allow delete: if isAuthenticated() && belongsToCompany(companyId) && isAdmin()
                && resource.data.status == 'planning';
}

match /tm-tasks/{id} {
  allow read:          if isAuthenticated() && belongsToCompany(companyId);
  allow create, update: if isAuthenticated() && belongsToCompany(companyId);
  allow delete:         if isAuthenticated() && belongsToCompany(companyId) && isAdmin();
}

match /tm-requests/{id} {
  allow read:          if isAuthenticated() && belongsToCompany(companyId);
  allow create, update: if isAuthenticated() && belongsToCompany(companyId);
  allow delete:         if isAuthenticated() && belongsToCompany(companyId) && isAdmin();
}

match /tm-timesheets/{id} {
  allow read:   if isAuthenticated() && belongsToCompany(companyId);
  allow create: if isAuthenticated() && belongsToCompany(companyId);
  allow update: if isAuthenticated() && belongsToCompany(companyId) && isAdmin();
  allow delete: if false;  // audit trail inmutable
}

match /tm-members/{id} {
  allow read:  if isAuthenticated() && belongsToCompany(companyId);
  allow write: if isAuthenticated() && belongsToCompany(companyId) && isAdmin();
}
```

---

## Fase 6 — Cloud Functions

> **Agente:** Cloud Functions Agent  
> **Estado:** [x] Completada — 2026-04-16  
> **Requiere:** Fase 5 completada

### 6.1 `onTimesheetCreated` — Trigger `onCreate` en `tm-timesheets`

**Propósito:** Al registrar un timesheet, actualizar `loggedHours` en la tarea y el proyecto.

```typescript
// functions/src/team-management/on-timesheet-created.ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const onTimesheetCreated = onDocumentCreated(
  'companies/{companyId}/tm-timesheets/{timesheetId}',
  async (event) => {
    const db        = getFirestore();
    const data      = event.data?.data();
    const companyId = event.params.companyId;
    if (!data) return;

    const batch = db.batch();

    // Actualizar loggedHours en la tarea
    const taskRef = db.doc(`companies/${companyId}/tm-tasks/${data.taskId}`);
    batch.update(taskRef, { loggedHours: FieldValue.increment(data.hours) });

    // Actualizar loggedHours en el proyecto
    const projectRef = db.doc(`companies/${companyId}/tm-projects/${data.projectId}`);
    batch.update(projectRef, { loggedHours: FieldValue.increment(data.hours) });

    await batch.commit();
  }
);
```

### 6.2 `onTimesheetDeleted` — Trigger `onDelete` en `tm-timesheets`

```typescript
// Descuenta horas en tarea y proyecto al eliminar (aunque las reglas lo impiden, es una salvaguarda)
export const onTimesheetDeleted = onDocumentDeleted(
  'companies/{companyId}/tm-timesheets/{timesheetId}',
  async (event) => {
    const db        = getFirestore();
    const data      = event.data?.data();
    const companyId = event.params.companyId;
    if (!data) return;

    const batch = db.batch();
    const taskRef    = db.doc(`companies/${companyId}/tm-tasks/${data.taskId}`);
    const projectRef = db.doc(`companies/${companyId}/tm-projects/${data.projectId}`);
    batch.update(taskRef,    { loggedHours: FieldValue.increment(-data.hours) });
    batch.update(projectRef, { loggedHours: FieldValue.increment(-data.hours) });
    await batch.commit();
  }
);
```

### 6.3 `onTaskStatusChanged` — Trigger `onUpdate` en `tm-tasks`

**Propósito:** Cuando una tarea cambia a `done`, recalcular `completionPct` del proyecto.

```typescript
export const onTaskStatusChanged = onDocumentUpdated(
  'companies/{companyId}/tm-tasks/{taskId}',
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === after.status) return;    // no cambió de status

    const db        = getFirestore();
    const companyId = event.params.companyId;
    const projectId = after.projectId;

    // Recalcular completionPct
    const tasksSnap = await db
      .collection(`companies/${companyId}/tm-tasks`)
      .where('projectId', '==', projectId)
      .where('isActive', '==', true)
      .get();

    const total    = tasksSnap.size;
    const done     = tasksSnap.docs.filter(d => d.data().status === 'done').length;
    const pct      = total > 0 ? Math.round((done / total) * 100) : 0;

    await db.doc(`companies/${companyId}/tm-projects/${projectId}`)
      .update({ completionPct: pct });
  }
);
```

### 6.4 `detectOverdueTasksScheduled` — Scheduler diario 8:00am

**Propósito:** Detectar tareas vencidas y crear notificaciones.

```typescript
import { onSchedule } from 'firebase-functions/v2/scheduler';

export const detectOverdueTasksScheduled = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Guayaquil' },
  async () => {
    const db   = getFirestore();
    const now  = new Date();
    const nowTs = Timestamp.fromDate(now);

    // Iterar todas las empresas activas
    const companiesSnap = await db.collection('companies').where('isActive', '==', true).get();

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;
      const overdueSnap = await db
        .collection(`companies/${companyId}/tm-tasks`)
        .where('dueDate', '<', nowTs)
        .where('isActive', '==', true)
        .get();

      const batch = db.batch();
      overdueSnap.docs
        .filter(d => !['done', 'cancelled'].includes(d.data().status))
        .forEach(taskDoc => {
          const notifRef = db.collection(`companies/${companyId}/notifications`).doc();
          batch.set(notifRef, {
            type:      'task_overdue',
            taskId:    taskDoc.id,
            taskTitle: taskDoc.data().title,
            projectId: taskDoc.data().projectId,
            targetIds: taskDoc.data().assigneeIds,
            createdAt: nowTs,
            read:      false,
          });
        });

      await batch.commit();
    }
  }
);
```

### 6.5 `generateWeeklyReport` — Scheduler lunes 7:00am

**Propósito:** Generar reporte semanal de horas por usuario con detección de horas extra.

```typescript
export const generateWeeklyReport = onSchedule(
  { schedule: '0 7 * * 1', timeZone: 'America/Guayaquil' },
  async () => {
    const db       = getFirestore();
    const now      = new Date();
    const weekEnd  = getLastSunday(now);
    const weekStart = new Date(weekEnd); weekStart.setDate(weekEnd.getDate() - 6);
    const weekKey  = `${weekStart.getFullYear()}-W${getWeekNumber(weekStart)}`;

    const companiesSnap = await db.collection('companies').where('isActive', '==', true).get();

    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;

      const timesheetsSnap = await db
        .collection(`companies/${companyId}/tm-timesheets`)
        .where('date', '>=', Timestamp.fromDate(weekStart))
        .where('date', '<=', Timestamp.fromDate(weekEnd))
        .get();

      // Agrupar por userId
      const byUser: Record<string, { hours: number; overtime: number; tasks: Set<string> }> = {};
      timesheetsSnap.docs.forEach(d => {
        const data = d.data();
        if (!byUser[data.userId]) byUser[data.userId] = { hours: 0, overtime: 0, tasks: new Set() };
        byUser[data.userId].hours += data.hours;
        if (data.type === 'overtime') byUser[data.userId].overtime += data.hours;
        byUser[data.userId].tasks.add(data.taskId);
      });

      const rows = Object.entries(byUser).map(([userId, stats]) => ({
        userId,
        totalHours:    stats.hours,
        overtimeHours: stats.overtime,
        regularHours:  stats.hours - stats.overtime,
        taskCount:     stats.tasks.size,
        isOvertime:    stats.hours > 40,
      }));

      await db.doc(`companies/${companyId}/tm-reports/${weekKey}`).set({
        weekKey,
        weekStart: Timestamp.fromDate(weekStart),
        weekEnd:   Timestamp.fromDate(weekEnd),
        rows,
        generatedAt: Timestamp.now(),
      });
    }
  }
);
```

---

## Fase 7 — Activación como paquete SaaS

> **Agente:** Firebase Agent  
> **Estado:** [x] Completada — 2026-04-15  
> **Nota:** `plugin-packages-seed.ts` actualizado. Sincronizar desde `/super-admin/plugin-packages`

### 7.1 Documento del paquete en Firestore

Crear documento en `/plugin-packages/pkg_team_mgmt`:

```typescript
// Ejecutar desde super-admin o script de seed
const pkgTeamMgmt = {
  code:          'pkg_team_mgmt',
  name:          'Gestión de Equipo',
  description:   'Proyectos, tareas Kanban, control de tiempos y solicitudes de clientes. Ideal para equipos de desarrollo y soporte.',
  modules:       ['teamManagement'],
  dependencies:  ['pkg_base'],
  price:         49,
  currency:      'USD',
  billingPeriod: 'monthly',
  icon:          'cil-people',
  color:         'primary',
  isSystem:      false,
  order:         5,
  state:         true,
  createdAt:     Timestamp.now(),
  updatedAt:     Timestamp.now(),
};
```

### 7.2 Flujo de activación para un cliente

1. Super admin abre `/super-admin/companies/:id/plugins`
2. Selecciona `pkg_team_mgmt` → `PluginPackagesService.resolveModules(['pkg_team_mgmt'], catalog)`
3. Resultado `['teamManagement']` se agrega a `company.enabledModules`
4. `TenantService` detecta cambio via `onSnapshot` → signal `activeModules` se actualiza
5. `moduleGuard` en `/team-management` ahora permite acceso
6. `filterNav()` muestra la sección "Equipo" en el sidebar

### 7.3 Verificación condicional en componentes

Si algún componente necesita mostrar/ocultar secciones según el módulo:

```typescript
private tenantService = inject(TenantService);
readonly hasTeamMgmt  = computed(() => this.tenantService.hasModule('teamManagement'));
```

---

## Dependencias entre fases

```
Fase 1 — Estructura base
  └── Sin dependencias. Puede iniciar inmediatamente.

Fase 2 — Modelos TypeScript
  └── Requiere Fase 1 (carpetas creadas).

Fase 3 — Servicios Firestore
  └── Requiere Fase 2 (interfaces deben existir).

Fase 4 — Componentes
  └── Requiere Fase 3 (servicios deben existir).
  └── Subtareas paralelizables:
        • Angular A: dashboard + kanban
        • Angular B: projects (list + form)
        • Angular C: tasks (list + form)
        • Angular D: requests + timesheets + members + reports

Fase 5 — Firestore rules + índices
  └── Paralelo a Fase 4 (solo requiere paths definidos en Fase 2).

Fase 6 — Cloud Functions
  └── Requiere Fase 2 (paths Firestore definidos).
  └── Paralelo a Fase 4.

Fase 7 — Activación SaaS
  └── Requiere Fase 1 (ruta debe existir con moduleGuard).
  └── Puede ejecutarse antes de que Fase 4 esté completa (activar el paquete sin todos los componentes listos).
```

---

## Asignación de agentes

| Fase | Trabajo | Agente |
|---|---|---|
| 1 | Carpetas, routes, modificar `app.routes.ts` y `_nav.ts` | Angular Agent |
| 2 | 5 interfaces TypeScript en `/models` | Angular Agent |
| 3 | 5 servicios Firestore en `/services` | Firebase Agent |
| 4-A | `tm-dashboard.component` + `tm-kanban.component` | Angular Agent |
| 4-B | `projects-list` + `project-form` | Angular Agent |
| 4-C | `tasks-list` + `task-form` | Angular Agent |
| 4-D | `requests` + `timesheets` + `members` + `reports` | Angular Agent |
| 5 | `firestore.rules` (colecciones `tm-*`) | Security Agent |
| 5 | `firestore.indexes.json` | Firebase Agent |
| 6 | 5 Cloud Functions (triggers + schedulers) | Cloud Functions Agent |
| 7 | Documento `/plugin-packages/pkg_team_mgmt` | Firebase Agent |

---

## Reglas obligatorias del proyecto

> Estos son los patrones que DEBEN seguirse. No inventar alternativas.

1. **Standalone components obligatorios** — sin NgModules. Cada componente declara sus propios `imports: []`.

2. **Archivos separados obligatorios** — `.ts` y `.html` siempre en archivos independientes. No usar `template: \`...\`` inline para HTML no trivial.

3. **`inject()` en propiedades** — nunca constructor injection.

4. **`signal()` + `computed()`** — para estado local. Solo usar `subscribe()` con `takeUntil(destroy$)` para streams de Firestore.

5. **`Timestamp` de Firebase** — en interfaces persistidas. Nunca `Date` de JavaScript en documentos Firestore.

6. **`BaseDocument`** — todas las interfaces de entidades extienden `BaseDocument` de `src/app/core/interfaces/common.interface.ts`.

7. **Orden de propiedades en clase:**
   1. `inject()` calls (readonly/private)
   2. `destroy$` Subject
   3. Constants
   4. `signal()` declarations
   5. `computed()` declarations
   6. Lifecycle hooks
   7. Private methods
   8. Public methods / event handlers

8. **CoreUI imports individuales** — no existe `CoreUIModule`. Importar: `CardModule`, `BadgeModule`, `ButtonModule`, `GridModule`, `TableModule`, etc. individualmente.

9. **Paths Firestore multi-tenant** — siempre `companies/${this.companyId}/tm-{colección}`.

10. **`trackById`** — obligatorio en todos los `*ngFor` sobre colecciones de documentos.

11. **Naming de exports de rutas** — `FEATURE_NAME_ROUTES` en screaming snake case.

12. **SCSS solo cuando es necesario** — crear `.scss` separado solo si hay estilos complejos. Evitar `styles: []` inline.

---

## Diagnóstico arquitectónico — 2026-04-16

> Análisis realizado por SaaS Team Management Architect mediante lectura directa de los 11 componentes,  
> 5 servicios y modelos del módulo. Identifica bugs con datos incorrectos, gaps de UX y features de valor.

### Resumen de hallazgos

| Categoría | Cantidad | Impacto |
|---|---|---|
| 🔴 Bugs críticos — datos incorrectos | 3 | Decisiones de gestión basadas en datos falsos |
| 🟠 Gaps UX graves — flujos rotos | 5 | El equipo no puede usar el módulo fluidamente |
| 🟡 Features parcialmente listas | 4 | Alto valor, mínimo esfuerzo para activar |
| 🔵 Features nuevas de alto valor | 8 | Diferenciación competitiva vs Jira/ClickUp |

### Bugs críticos encontrados

| ID | Bug | Archivo | Línea |
|---|---|---|---|
| B-1 | Workload % usa `activeProjectIds.length / 3`, no horas reales | `members-list.component.ts` / `tm-dashboard.component.ts` | 59 / 76 |
| B-2 | Iniciales de asignados muestran chars del UID de Firebase, no el nombre | `tm-kanban.component.ts` / `tm-dashboard.component.ts` | 129 / 122 |
| B-3 | Selector de período en Reportes no filtra — datos siempre iguales | `tm-reports.component.ts` | 44, 96–109 |

### Gaps UX graves encontrados

| ID | Gap | Archivo | Impacto |
|---|---|---|---|
| U-1 | No hay link/botón para abrir tarea desde card Kanban | `tm-kanban.component.html` | Flujo de trabajo diario roto |
| U-2 | Timesheets carga TODO el historial sin filtro de semana | `timesheets-list.component.ts:72` | WeeklyTotal incorrecto |
| U-3 | Dashboard no muestra solicitudes pendientes (RequestsService no inyectado) | `tm-dashboard.component.ts:33` | KPI de negocio ausente |
| U-4 | Kanban sin filtro por asignado — inutilizable en equipos > 8 personas | `tm-kanban.component.ts:56` | Adopción bloqueada |
| U-5 | Task-form no lee `queryParams` de requests — vínculo solicitud→tarea roto | `task-form.component.ts` | Flujo principal de requests roto |

---

## Fase 8 — Bugs críticos

> **Agente:** Angular Agent  
> **Estado:** ⏳ Pendiente  
> **Prioridad:** 🔴 Crítica — implementar antes de cualquier otra fase  
> **Requiere:** ninguna (son correcciones sobre lo implementado)

### 8.1 Fix B-1 — Workload real con horas de timesheets

**Problema:**
```typescript
// members-list.component.ts:59 y tm-dashboard.component.ts:76
loadPct: Math.round((m.activeProjectIds.length / 3) * 100)
// → Falso: proyectos ≠ horas trabajadas
```

**Solución:** inyectar `TimesheetsService` en `MembersListComponent` y `TmDashboardComponent`. Cargar timesheets de la semana actual (lunes a hoy) y cruzar con `member.userId` para calcular la suma de horas.

**Lógica del fix:**
```typescript
// Calcular lunes de la semana actual
private getWeekStart(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// En computed memberWorkload:
memberWorkload = computed(() =>
  this.members().filter(m => m.status === 'active').map(m => {
    const hoursThisWeek = this.timesheets()
      .filter(t => t.userId === m.userId)
      .reduce((sum, t) => sum + t.hours, 0);
    const pct = Math.round((hoursThisWeek / m.weeklyCapacityHours) * 100);
    return {
      ...m,
      hoursThisWeek,
      pct: Math.min(120, pct),
      isOverloaded: pct > 100,
    };
  })
);
```

**Archivos a modificar:**
- `pages/dashboard/tm-dashboard.component.ts` — inyectar `TimesheetsService`, cargar timesheets de la semana, recalcular `memberWorkload`
- `pages/dashboard/tm-dashboard.component.html` — mostrar horas reales (ej: `38h / 40h`) junto al porcentaje
- `pages/members/members-list.component.ts` — mismo fix en `membersWithLoad`
- `pages/members/members-list.component.html` — mostrar `Xh / 40h` en lugar de solo el %

**Nuevo índice Firestore necesario:** ya existe `userId ASC + date ASC` en `tm-timesheets`.

---

### 8.2 Fix B-2 — Iniciales con displayName del miembro

**Problema:**
```typescript
// tm-kanban.component.ts:129 y tm-dashboard.component.ts:122
assigneeInitials(assigneeIds: string[]): string[] {
  return assigneeIds.slice(0, 3).map(id => id.substring(0, 2).toUpperCase());
  // → Firebase UID "3fGhK2..." produce "3F" — ilegible
}
```

**Solución:** cargar los `TeamMember[]` activos en los componentes que muestran asignados. Crear un `Map<userId, displayName>` para resolver iniciales por nombre.

**Lógica del fix:**
```typescript
// En componentes con asignados:
private membersSvc = inject(TeamMembersService);
membersMap = signal<Map<string, string>>(new Map()); // userId → displayName

// En ngOnInit:
this.membersSvc.getActive().pipe(take(1)).subscribe(list => {
  this.membersMap.set(new Map(list.map(m => [m.userId, m.displayName])));
});

// Nuevo método helper:
getInitials(userId: string): string {
  const name = this.membersMap().get(userId) ?? userId;
  return name.split(' ').slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
}

getMemberName(userId: string): string {
  return this.membersMap().get(userId) ?? 'Desconocido';
}
```

**Archivos a modificar:**
- `pages/kanban/tm-kanban.component.ts` — inyectar `TeamMembersService`, cargar `membersMap`, reemplazar `assigneeInitials()`
- `pages/kanban/tm-kanban.component.html` — agregar `title="getMemberName(uid)"` en cada avatar para tooltip
- `pages/dashboard/tm-dashboard.component.ts` — mismo fix en `assigneeInitials()`

---

### 8.3 Fix B-3 — Período en Reportes filtra datos reales

**Problema:**
```typescript
// tm-reports.component.ts:96–109
// Datos cargados UNA vez con take(1), period signal no tiene efecto
forkJoin({
  timesheets: this.timesheetsSvc.getAll().pipe(take(1)),
})
// → Seleccionar "semana" o "mes" no cambia nada
```

**Solución:** agregar `weekStart` / `monthStart` calculados y refiltrar `timesheets` por `date` en el computed `reportRows`. La query de Firestore ya tiene el índice `userId + date`.

**Lógica del fix:**
```typescript
// Agregar al componente:
private getStartDate(period: 'week' | 'month'): Date {
  const now = new Date();
  if (period === 'week') {
    const day = now.getDay();
    now.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    now.setHours(0, 0, 0, 0);
  } else {
    now.setDate(1); now.setHours(0, 0, 0, 0);
  }
  return now;
}

// En computed reportRows — agregar filtro por fecha al inicio:
reportRows = computed((): ReportRow[] => {
  const startDate = this.getStartDate(this.period());
  const filtered  = this.timesheets().filter(t =>
    t.date && t.date.toDate() >= startDate
  );
  // ... resto de la lógica con `filtered` en lugar de `this.timesheets()`
});
```

**Archivos a modificar:**
- `pages/reports/tm-reports.component.ts` — agregar filtro de fecha en `reportRows` computed, mostrar rango de fechas activo
- `pages/reports/tm-reports.component.html` — mostrar rango del período seleccionado (ej: "1 Abr – 16 Abr")

---

## Fase 9 — UX daily flow

> **Agente:** Angular Agent  
> **Estado:** ⏳ Pendiente  
> **Prioridad:** 🟠 Alta — sin estos flujos el módulo no tiene adopción diaria  
> **Requiere:** Fase 8 completada

### 9.1 Fix U-1 — Navegación desde card Kanban a detalle de tarea

**Problema:** la card del Kanban tiene drag-drop pero ningún acceso al detalle de la tarea.

**Solución A — Enlace directo (mínimo esfuerzo):**
Agregar `RouterLink` a la card. El título de la tarea se convierte en link. El drag-drop sigue funcionando en el resto de la card.

```html
<!-- tm-kanban.component.html — dentro de la card -->
<a [routerLink]="['/team-management/tasks', task.id, 'edit']"
   [queryParams]="{back: 'kanban'}"
   class="fw-semibold mb-1 lh-sm text-decoration-none text-body"
   style="font-size:.82rem; word-break:break-word; display:block"
   (click)="$event.stopPropagation()">
  {{ task.title }}
</a>
```

**Solución B — Side panel (experiencia premium, mayor esfuerzo):**
Panel lateral deslizable con el detalle completo de la tarea, sin salir del Kanban. Para la Fase 11.

**Implementar en Fase 9:** Solución A.

**Archivos a modificar:**
- `pages/kanban/tm-kanban.component.ts` — importar `RouterLink`
- `pages/kanban/tm-kanban.component.html` — reemplazar `div` del título por `<a [routerLink]>`
- `pages/tasks/task-form.component.ts` — leer `queryParams.back` y en `goBack()` navegar a `/team-management/kanban` si `back === 'kanban'`

---

### 9.2 Fix U-2 — Timesheets con selector de semana y filtro real

**Problema:** se cargan todos los timesheets ever. `weeklyTotal` calculado sobre todos los registros.

**Solución:**
1. Agregar selector de semana (flechas ← semana anterior / semana siguiente →)
2. Cambiar la query al servicio para filtrar por rango de fechas de la semana seleccionada
3. Recalcular `weeklyTotal` solo sobre la semana activa

```typescript
// Agregar signals de navegación de semana:
selectedWeekStart = signal<Date>(this.getMonday(new Date()));

selectedWeekEnd = computed(() => {
  const end = new Date(this.selectedWeekStart());
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
});

weekLabel = computed(() => {
  const s = this.selectedWeekStart();
  const e = this.selectedWeekEnd();
  return `${s.getDate()} ${s.toLocaleString('es', {month:'short'})} – ${e.getDate()} ${e.toLocaleString('es', {month:'short'})}`;
});

prevWeek(): void { this.selectedWeekStart.update(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); }
nextWeek(): void { this.selectedWeekStart.update(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); }
```

**Servicio:** `timesheets.service.ts` ya tiene `getByWeek(userId, weekStart, weekEnd)`. Usarlo.

**Archivos a modificar:**
- `pages/timesheets/timesheets-list.component.ts` — agregar navegación de semana, cambiar a `getAll()` con filtro o `getByWeek()`
- `pages/timesheets/timesheets-list.component.html` — agregar controles `← semana → ` con `weekLabel`

---

### 9.3 Fix U-3 — Solicitudes pendientes en Dashboard

**Problema:** `RequestsService` no está inyectado en el dashboard. El KPI de solicitudes no existe.

**Solución:** agregar un 5to KPI card "Solicitudes sin atender" con el count de requests `status === 'new'`.

```typescript
// tm-dashboard.component.ts — agregar:
private requestsSvc = inject(RequestsService);
requests = signal<ClientRequest[]>([]);
pendingRequests = computed(() => this.requests().filter(r => r.status === 'new'));
urgentRequests  = computed(() =>
  this.requests().filter(r => r.urgency === 'critical' && r.status !== 'resolved')
);
```

**Impacto en el template:** reestructurar los KPI cards de 4 a 5 (o crear una fila separada de alertas). El KPI de solicitudes debe ser visualmente llamativo cuando hay requests críticas sin atender.

**Archivos a modificar:**
- `pages/dashboard/tm-dashboard.component.ts` — inyectar `RequestsService`, cargar en `ngOnInit`, agregar computeds
- `pages/dashboard/tm-dashboard.component.html` — agregar KPI card de solicitudes + sección de requests urgentes

---

### 9.4 Fix U-4 — Filtro por asignado en Kanban

**Problema:** con 50+ tareas y 10 devs, cada persona necesita ver solo sus tareas.

**Solución:** agregar selector "Mis tareas / Todas" junto al selector de proyecto. Usar `AuthService` para obtener el uid del usuario actual.

```typescript
// tm-kanban.component.ts — agregar:
private authSvc = inject(AuthService);
assigneeFilter = signal<string>('all'); // 'all' | 'mine' | userId

currentUserId = computed(() => this.authSvc.user()?.uid ?? '');

tasksByColumn = computed(() => {
  const pid = this.selectedProjectId();
  const aid = this.assigneeFilter();

  let filtered = this.tasks();
  if (pid !== 'all') filtered = filtered.filter(t => t.projectId === pid);
  if (aid === 'mine') filtered = filtered.filter(t => t.assigneeIds.includes(this.currentUserId()));
  else if (aid !== 'all') filtered = filtered.filter(t => t.assigneeIds.includes(aid));

  return TASK_KANBAN_COLUMNS.reduce((acc, col) => {
    acc[col] = filtered.filter(t => t.status === col);
    return acc;
  }, {} as Record<TaskStatus, Task[]>);
});
```

**UI:** agregar junto al selector de proyecto:
```
[Proyecto: ▼ Todos] [Asignado: ▼ Mis tareas | Todos | [miembro]]
```

**Archivos a modificar:**
- `pages/kanban/tm-kanban.component.ts` — inyectar `AuthService` + `TeamMembersService`, agregar `assigneeFilter`, actualizar `tasksByColumn`
- `pages/kanban/tm-kanban.component.html` — agregar selector de asignado

---

### 9.5 Fix U-5 — Task-form recibe queryParams de requests

**Problema:** `requests-list.component.ts:115` navega a `/tasks/new` con `queryParams: { requestId, requestTitle, projectId }` pero `task-form.component.ts` nunca lee esos parámetros.

**Solución:** leer `queryParams` en `ngOnInit` de `TaskFormComponent` y pre-poblar el form.

```typescript
// task-form.component.ts — en ngOnInit, ANTES de loadReferenceData:
const params = this.route.snapshot.queryParamMap;
const requestId    = params.get('requestId');
const requestTitle = params.get('requestTitle');
const projectId    = params.get('projectId');

if (requestId) {
  this.form.patchValue({
    title:     requestTitle ? `[Solicitud] ${requestTitle}` : '',
    projectId: projectId ?? '',
  });
  // Guardar el requestId para incluirlo en el payload
  this.prefilledRequestId.set(requestId);
}
```

**Agregar al modelo:**
```typescript
// task-form.component.ts — nuevo signal:
prefilledRequestId = signal<string | null>(null);

// En buildPayload():
requestId: this.prefilledRequestId() ?? undefined,
```

**Archivos a modificar:**
- `pages/tasks/task-form.component.ts` — leer queryParams, agregar `prefilledRequestId` signal, incluir en payload
- `pages/tasks/task-form.component.html` — mostrar banner "Creando tarea desde solicitud: [título]" cuando hay requestId

---

## Fase 10 — Features de diferenciación

> **Agente:** Angular Agent + Firebase Agent  
> **Estado:** ⏳ Pendiente  
> **Prioridad:** 🟡 Media-Alta  
> **Requiere:** Fase 9 completada

### 10.1 Mini-formulario de timesheet dentro de task-form

**Descripción:** botón "+ Registrar tiempo" en el formulario de tarea que abre un panel inline (sin navegar) para crear un `TimesheetEntry` vinculado a esa tarea.

**UI:**
```
[+ Registrar tiempo]
  ┌─────────────────────────────────────┐
  │ Horas: [2.5]  Tipo: [Regular ▼]    │
  │ Descripción: [implementación...]    │
  │                     [Registrar]     │
  └─────────────────────────────────────┘
  Historial de tiempo en esta tarea:
  ┌──────────────┬──────────┬──────────┐
  │ 2026-04-15   │ 3h reg.  │ Juan G.  │
  │ 2026-04-14   │ 2h extra │ Ana L.   │
  └──────────────┴──────────┴──────────┘
  Total: 5h / 16h estimadas
```

**Nuevos signals en `task-form`:**
```typescript
showTimerPanel   = signal(false);
taskTimesheets   = signal<TimesheetEntry[]>([]);
totalLoggedHours = computed(() => this.taskTimesheets().reduce((s, t) => s + t.hours, 0));
timesheetForm = new FormGroup({
  hours:       new FormControl<number>(1, [Validators.required, Validators.min(0.5)]),
  type:        new FormControl<TimesheetEntryType>('regular', Validators.required),
  description: new FormControl(''),
  date:        new FormControl(new Date().toISOString().substring(0, 10)),
});
```

**Archivos a crear/modificar:**
- `pages/tasks/task-form.component.ts` — inyectar `TimesheetsService` + `AuthService`, agregar form y signals de timesheet
- `pages/tasks/task-form.component.html` — agregar sección de timesheet debajo de comentarios

**Índice Firestore necesario:** `taskId + date` en `tm-timesheets` → agregar a `firestore.indexes.json`.

---

### 10.2 Subtareas (array dentro de Task)

**Descripción:** lista de checklist de subtareas dentro de una tarea. Almacenadas como array en el documento Task (no subcolección, máx. 20 por tarea).

**Cambio en modelo `task.interface.ts`:**
```typescript
// Agregar interfaz:
export interface Subtask {
  id:           string;
  title:        string;
  completed:    boolean;
  completedAt?: Timestamp;
  completedBy?: string;
  createdAt:    Timestamp;
  createdBy:    string;
}

// Agregar a Task:
subtasks: Subtask[];  // default []

// Agregar a TaskCreateInput: incluir subtasks en el Omit si no se pasa, o inicializar como []
```

**Método nuevo en `tasks.service.ts`:**
```typescript
async addSubtask(taskId: string, title: string): Promise<void>
// arrayUnion con subtask nueva (id = crypto.randomUUID())

async toggleSubtask(taskId: string, subtaskId: string, completed: boolean): Promise<void>
// Leer task, modificar el subtask específico en el array, actualizar el doc entero
// (arrayUnion no permite actualizar items — requiere update del array completo)
```

**Regla de negocio:** una tarea con subtareas no puede marcarse `done` si hay subtareas sin completar. Validar en `changeStatus()` del servicio.

**UI en `task-form.component.html`:**
```
── Subtareas (3/5) ──────────────────────────
☑ Diseñar maqueta           Juan G. · hace 2d
☑ Revisar con cliente       Ana L.  · hace 1d
☐ Implementar componente
☐ Escribir tests
☐ PR review
[+ Agregar subtarea]  [input inline + Enter]
```

**Archivos a modificar:**
- `models/task.interface.ts` — agregar `Subtask` + campo `subtasks: Subtask[]`
- `services/tasks.service.ts` — agregar `addSubtask()` + `toggleSubtask()`
- `pages/tasks/task-form.component.ts` — lógica de subtareas
- `pages/tasks/task-form.component.html` — sección de subtareas con checklist inline

---

### 10.3 Quick-create tarea desde columna Kanban

**Descripción:** botón `+` en el header de cada columna que abre un input inline para crear una tarea con título mínimo directamente en esa columna (status pre-asignado).

**UI:**
```
[En Desarrollo] (4)  [+]
  ┌─────────────────────┐
  │ Título de la tarea  │
  │ Proyecto: [▼]  [✓]  │
  └─────────────────────┘
```

**Lógica:**
```typescript
// tm-kanban.component.ts — nuevo state:
creatingInColumn = signal<TaskStatus | null>(null);
quickTitle       = signal('');
quickProjectId   = signal('');

async quickCreate(status: TaskStatus): Promise<void> {
  if (!this.quickTitle().trim() || !this.quickProjectId()) return;
  const project = this.projects().find(p => p.id === this.quickProjectId());
  await this.tasksSvc.create({
    title:          this.quickTitle().trim(),
    projectId:      this.quickProjectId(),
    projectName:    project?.name ?? '',
    type:           'feature',
    status,
    priority:       'medium',
    assigneeIds:    [],
    reporterId:     this.authSvc.user()?.uid ?? '',
    estimatedHours: 0,
    tags:           [],
    comments:       [],
  });
  this.creatingInColumn.set(null);
  this.quickTitle.set('');
}
```

**Archivos a modificar:**
- `pages/kanban/tm-kanban.component.ts` — inyectar `AuthService`, agregar signals y método `quickCreate()`
- `pages/kanban/tm-kanban.component.html` — agregar botón `+` en header de columna + formulario inline condicional

---

### 10.4 Project Health Score en Dashboard y lista de proyectos

**Descripción:** puntuación compuesta (0–100) visible en cada proyecto para detectar riesgo a golpe de vista.

**Fórmula:**
```typescript
function calcHealthScore(project: Project, taskStats: { total: number; done: number; overdue: number }): number {
  const completionScore  = project.completionPct * 0.4;
  const overdueRatio     = taskStats.total > 0 ? (taskStats.overdue / taskStats.total) : 0;
  const overdueScore     = (1 - overdueRatio) * 100 * 0.3;
  const daysLeft         = Math.ceil((project.dueDate.toDate().getTime() - Date.now()) / 86400000);
  const scheduleScore    = daysLeft > 0 ? 30 : 0;
  return Math.round(completionScore + overdueScore + scheduleScore);
}

// Colores:
// 80–100 → 'success'
// 50–79  → 'warning'
// 0–49   → 'danger'
```

**Calculado en frontend** (no CF — es dato derivado de información ya disponible).

**UI en `projects-list`:**
```
CRM Cliente A  [████████░░  78%]  🟡 Saludable
Portal Web B   [████░░░░░░  38%]  🔴 En riesgo  ← riesgo de entrega 3 días
App Móvil C    [██████████  95%]  🟢 Excelente
```

**Archivos a modificar:**
- `models/project.interface.ts` — agregar función helper `calcHealthScore()` y tipo `ProjectHealth`
- `pages/projects/projects-list.component.ts` — cruzar tareas del proyecto para calcular `taskStats`, agregar `healthScore` al computed
- `pages/projects/projects-list.component.html` — mostrar indicador de salud
- `pages/dashboard/tm-dashboard.component.ts` — agregar `healthScore` a proyectos activos
- `pages/dashboard/tm-dashboard.component.html` — mostrar health badge en tabla de proyectos

---

## Fase 11 — Competitividad Jira/ClickUp

> **Agentes:** TM Product Agent (diseño) → Angular Agent + Firebase Agent + Cloud Functions Agent (implementación)  
> **Estado:** ⏳ Pendiente  
> **Prioridad:** 🔵 Estratégica — diferenciación de mercado  
> **Requiere:** Fase 10 completada

### 11.1 Epics — agrupador temático de tareas

**Descripción:** Epic = conjunto de tareas relacionadas dentro de un proyecto. Permite organizar grandes iniciativas sin contaminar el backlog principal.

**Nuevo modelo:** `/companies/{companyId}/tm-epics/{epicId}`
```typescript
interface Epic extends BaseDocument {
  projectId:     string;
  projectName:   string;        // snapshot
  title:         string;
  description?:  string;
  status:        'open' | 'in_progress' | 'done' | 'cancelled';
  priority:      ProjectPriority;
  startDate?:    Timestamp;
  targetDate?:   Timestamp;
  completedAt?:  Timestamp;
  taskIds:       string[];
  completionPct: number;        // calculado por CF onTaskStatusChanged (extensión)
  color?:        string;        // franja de color en Kanban cards
}
```

**Cambio en `Task`:** agregar `epicId?: string` y `epicName?: string`.

**Nuevo servicio:** `services/epics.service.ts`

**Nuevo componente:** panel lateral en Kanban con lista de Epics del proyecto activo. Al hacer clic en Epic → filtra tareas por ese epic.

**UI — Kanban con Epics:**
```
[Proyecto: CRM] [Epic: ▼ Módulo Login] [Asignado: ▼ Mis tareas]
                 └─ Epic 1: Módulo Login  (8/12 tareas) ████░  67%
                 └─ Epic 2: Reportes      (2/6  tareas) ██░░░  33%
                 └─ Sin epic
```

**Nuevas reglas Firestore:** bloque `tm-epics` en `firestore.rules`.

**Nuevo índice:** `projectId ASC + status ASC` en `tm-epics`.

**Archivos a crear:**
- `models/epic.interface.ts`
- `services/epics.service.ts`
- `pages/epics/epics-list.component.{ts,html}`

**Archivos a modificar:**
- `models/task.interface.ts` — agregar `epicId?`, `epicName?`
- `pages/kanban/tm-kanban.component.ts` — panel de epics + filtro
- `team-management.routes.ts` — agregar ruta `/epics`
- `firestore.rules` — agregar `tm-epics`
- `firestore.indexes.json` — agregar índice

---

### 11.2 Timer en vivo

**Descripción:** timer activo que el dev inicia desde una tarea. Crea automáticamente el `TimesheetEntry` al detener. Persiste en Firestore para sobrevivir recargas de página.

**Nuevo modelo:** `/companies/{companyId}/tm-active-timers/{userId}`
```typescript
interface ActiveTimer {
  userId:        string;
  taskId:        string;
  taskTitle:     string;     // snapshot
  projectId:     string;
  projectName:   string;     // snapshot
  startedAt:     Timestamp;
  pausedAt?:     Timestamp;
  totalPausedMs: number;     // acumulado de pausas
  status:        'running' | 'paused';
}
```

**Flujo:**
1. `▶ Iniciar` → crea/sobreescribe `/tm-active-timers/{userId}`
2. Componente hace `onSnapshot` → muestra timer en vivo `00:01:23`
3. `⏸ Pausar` → `pausedAt = Timestamp.now()`, `status = 'paused'`
4. `▶ Reanudar` → `totalPausedMs += now - pausedAt`, `pausedAt = null`, `status = 'running'`
5. `⏹ Detener` → calcula `hours netos = (now - startedAt - totalPausedMs) / 3600000` → crea `TimesheetEntry` → elimina doc timer

**Mínimo de registro:** 15 minutos. Si `hours < 0.25` → warning y descarta.

**Nuevo servicio:** `services/active-timer.service.ts`

**Integración:** el timer aparece como widget flotante persistente en el layout mientras está activo.

**Archivos a crear:**
- `models/active-timer.interface.ts`
- `services/active-timer.service.ts`
- `pages/timer/tm-timer-widget.component.{ts,html}` — widget flotante bottom-right

**Archivos a modificar:**
- `pages/tasks/task-form.component.html` — botón `▶ Iniciar timer` en lugar del mini-form manual
- Layout principal — incluir `TmTimerWidgetComponent`

---

### 11.3 Lead Time y Cycle Time calculados por Cloud Function

**Descripción:** al cerrar una tarea (`status → 'done'`), la CF `onTaskStatusChanged` calcula y persiste métricas de tiempo directamente en el documento.

**Extensión de `functions/src/team-management/on-task-status-changed.ts`:**
```typescript
// Agregar al bloque donde status → 'done':
if (after.status === 'done') {
  const leadTimeDays = after.completedAt && after.createdAt
    ? (after.completedAt.seconds - after.createdAt.seconds) / 86400
    : null;

  const cycleTimeDays = after.completedAt && after.startedAt
    ? (after.completedAt.seconds - after.startedAt.seconds) / 86400
    : null;

  await taskRef.update({ leadTimeDays, cycleTimeDays });
}
```

**Cambio en `task.interface.ts`:**
```typescript
// Agregar campos opcionales a Task:
leadTimeDays?:  number;   // completedAt - createdAt en días
cycleTimeDays?: number;   // completedAt - startedAt en días
```

**Impacto en reportes:** `tm-reports.component` puede mostrar `avgCycleTimeDays` promedio por usuario.

**Archivos a modificar:**
- `models/task.interface.ts` — agregar `leadTimeDays?`, `cycleTimeDays?`
- `functions/src/team-management/on-task-status-changed.ts` — agregar cálculo al cerrar tarea
- `pages/reports/tm-reports.component.ts` — agregar `avgCycleTimeDays` a `ReportRow`
- `pages/reports/tm-reports.component.html` — nueva columna en tabla de reportes

---

### 11.4 Reportes con gráficas (chartjs)

**Descripción:** reemplazar la tabla plana de reportes por visualizaciones reales. `@coreui/angular-chartjs` ya está en las dependencias del proyecto.

**Gráficas a implementar:**

**G1 — Horas por usuario (barras apiladas):**
```
Juan G.  ████████░░  38h reg + 2h extra
Ana L.   ██████████  40h reg + 8h extra
Carlos   ██████░░░░  30h reg + 0h extra
         ───────────────────────────────
         0    10    20    30    40    50h
```

**G2 — Distribución de tiempo por tipo (dona):**
```
      Regular  64% ████
      Overtime 18% ███
      Soporte  12% ██
      Reuniones 6% █
```

**G3 — Burndown del proyecto (línea):**
```
Tareas  │\
rest.   │ \  ideal
        │  ·· real
        │     ···
        └─────────── días del período
```

**Implementación:**
```typescript
// tm-reports.component.ts — agregar:
import { ChartjsComponent } from '@coreui/angular-chartjs';

barChartData = computed((): ChartData => ({
  labels: this.reportRows().map(r => r.userName),
  datasets: [
    { label: 'Regular', data: this.reportRows().map(r => r.regularHours), backgroundColor: '#0d6efd' },
    { label: 'Extra',   data: this.reportRows().map(r => r.overtimeHours), backgroundColor: '#dc3545' },
  ]
}));
```

**Archivos a modificar:**
- `pages/reports/tm-reports.component.ts` — importar `ChartjsComponent`, agregar computeds de datasets
- `pages/reports/tm-reports.component.html` — reemplazar/complementar tabla con gráficas

---

### 11.5 Sprint Planning básico

**Descripción:** contenedor temporal de tareas con fecha inicio/fin y cálculo de velocity al cierre.

**Nuevo modelo:** `/companies/{companyId}/tm-sprints/{sprintId}`
```typescript
interface Sprint extends BaseDocument {
  projectId:   string;
  projectName: string;
  name:        string;       // "Sprint 1 — Abril W1"
  goal?:       string;       // objetivo del sprint
  startDate:   Timestamp;
  endDate:     Timestamp;
  status:      'planning' | 'active' | 'completed' | 'cancelled';
  taskIds:     string[];     // tareas comprometidas
  velocity?:   number;       // story points done al cierre (CF)
  completedAt?: Timestamp;
}
```

**Cambio en `Task`:** agregar `sprintId?: string`, `sprintName?: string`, `storyPoints?: number`.

**Regla de negocio:** solo 1 sprint `active` por proyecto. Al cerrar: tareas no-done → backlog (sprintId = null).

**Nueva Cloud Function:** `onSprintClosed` — calcula velocity y mueve tareas no-done al backlog.

**Nueva pantalla:** `pages/sprints/sprints-list.component` — vista de sprints del proyecto con burndown mini.

---

## Asignación de agentes — Fases 8–11

| Fase | Tarea | Agente |
|---|---|---|
| **8.1** | Fix workload real | Angular Agent |
| **8.2** | Fix iniciales con nombre | Angular Agent |
| **8.3** | Fix período en reportes | Angular Agent |
| **9.1** | Link Kanban → tarea | Angular Agent |
| **9.2** | Timesheets con selector de semana | Angular Agent |
| **9.3** | Solicitudes en Dashboard | Angular Agent |
| **9.4** | Filtro asignado en Kanban | Angular Agent |
| **9.5** | QueryParams requests → task-form | Angular Agent |
| **10.1** | Mini-timesheet en task-form | Angular Agent |
| **10.2** | Subtareas (modelo + servicio + UI) | Firebase Agent → Angular Agent |
| **10.3** | Quick-create desde Kanban | Angular Agent |
| **10.4** | Health Score proyectos | Angular Agent |
| **11.1** | Epics (modelo + servicio + UI + CF) | TM Product Agent → Firebase Agent → Angular Agent → CF Agent |
| **11.2** | Timer en vivo | Firebase Agent → Angular Agent |
| **11.3** | Lead time / Cycle time en CF | Cloud Functions Agent |
| **11.4** | Gráficas en Reportes | Angular Agent |
| **11.5** | Sprint Planning | TM Product Agent → Firebase Agent → Angular Agent → CF Agent |
