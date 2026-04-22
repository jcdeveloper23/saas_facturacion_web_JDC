import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards';

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
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./pages/projects/project-form.component').then(m => m.ProjectFormComponent),
    data: { roles: ['admin', 'seller'], title: 'Nuevo Proyecto' }
  },
  {
    path: 'projects/:id/edit',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./pages/projects/project-form.component').then(m => m.ProjectFormComponent),
    data: { roles: ['admin', 'seller'], title: 'Editar Proyecto' }
  },
  {
    path: 'tasks',
    loadComponent: () =>
      import('./pages/tasks/tasks-list.component').then(m => m.TasksListComponent),
    data: { title: 'Tareas' }
  },
  {
    path: 'tasks/new',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./pages/tasks/task-form.component').then(m => m.TaskFormComponent),
    data: { roles: ['admin', 'seller'], title: 'Nueva Tarea' }
  },
  {
    path: 'tasks/:id/edit',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./pages/tasks/task-form.component').then(m => m.TaskFormComponent),
    data: { roles: ['admin', 'seller'], title: 'Editar Tarea' }
  },
  {
    path: 'requests',
    loadComponent: () =>
      import('./pages/requests/requests-list.component').then(m => m.RequestsListComponent),
    data: { title: 'Solicitudes' }
  },
  {
    path: 'requests/new',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./pages/requests/request-form.component').then(m => m.RequestFormComponent),
    data: { roles: ['admin', 'seller'], title: 'Nueva Solicitud' }
  },
  {
    path: 'requests/:id/edit',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./pages/requests/request-form.component').then(m => m.RequestFormComponent),
    data: { roles: ['admin', 'seller'], title: 'Editar Solicitud' }
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
    path: 'members/new',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./pages/members/member-form.component').then(m => m.MemberFormComponent),
    data: { roles: ['admin', 'seller'], title: 'Nuevo Miembro' }
  },
  {
    path: 'members/:id/edit',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./pages/members/member-form.component').then(m => m.MemberFormComponent),
    data: { roles: ['admin', 'seller'], title: 'Editar Miembro' }
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./pages/reports/tm-reports.component').then(m => m.TmReportsComponent),
    data: { title: 'Reportes de Rendimiento' }
  },
  {
    path: 'catalogs',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./pages/catalogs/tm-catalogs.component').then(m => m.TmCatalogsComponent),
    data: { roles: ['admin'], title: 'Catálogos del Equipo' }
  },
];
