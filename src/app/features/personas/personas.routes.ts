import { Routes } from '@angular/router';
import { moduleGuard, planLimitGuard } from '../../core/guards';

export const PERSONAS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [moduleGuard],
    data: { module: 'personas', title: 'Personas' },
    loadComponent: () =>
      import('./personas-list.component').then(m => m.PersonasListComponent)
  },
  {
    path: 'new',
    canActivate: [moduleGuard, planLimitGuard],
    data: { module: 'personas', limitResource: 'personas', title: 'Nueva Persona' },
    loadComponent: () =>
      import('./person-form.component').then(m => m.PersonFormComponent)
  },
  {
    path: ':id/edit',
    canActivate: [moduleGuard],
    data: { module: 'personas', title: 'Editar Persona' },
    loadComponent: () =>
      import('./person-form.component').then(m => m.PersonFormComponent)
  }
];
