import { Routes } from '@angular/router';
import { moduleGuard } from '../../core/guards';

export const RETENTIONS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [moduleGuard],
    data: { module: 'retentions', title: 'Retenciones' },
    loadComponent: () =>
      import('./retentions-list.component').then(m => m.RetentionsListComponent)
  },
  {
    path: 'new',
    canActivate: [moduleGuard],
    data: { module: 'retentions', title: 'Nueva Retención' },
    loadComponent: () =>
      import('./retention-form.component').then(m => m.RetentionFormComponent)
  },
  {
    path: ':id/edit',
    canActivate: [moduleGuard],
    data: { module: 'retentions', title: 'Editar Retención' },
    loadComponent: () =>
      import('./retention-form.component').then(m => m.RetentionFormComponent)
  }
];
