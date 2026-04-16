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
