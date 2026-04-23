import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./profiles.component').then(m => m.ProfilesComponent),
    canActivate: [roleGuard],
    data: {
      title: 'Perfiles y Roles',
      roles: ['admin', 'super_admin']
    }
  },
  {
    path: 'new',
    loadComponent: () => import('./pages/profile-form/profile-form.component').then(m => m.ProfileFormComponent),
    canActivate: [roleGuard],
    data: { title: 'Nuevo Perfil', roles: ['admin', 'super_admin'] }
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./pages/profile-form/profile-form.component').then(m => m.ProfileFormComponent),
    canActivate: [roleGuard],
    data: { title: 'Editar Perfil', roles: ['admin', 'super_admin'] }
  }
];
