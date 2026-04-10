import { Routes } from '@angular/router';

export const RETENTIONS_ROUTES: Routes = [
  {
    path: '',
    data: { title: 'Retenciones' },
    loadComponent: () =>
      import('./retentions-list.component').then(m => m.RetentionsListComponent)
  },
  {
    path: 'new',
    data: { title: 'Nueva Retención' },
    loadComponent: () =>
      import('./retention-form.component').then(m => m.RetentionFormComponent)
  },
  {
    path: ':id/edit',
    data: { title: 'Editar Retención' },
    loadComponent: () =>
      import('./retention-form.component').then(m => m.RetentionFormComponent)
  }
];
