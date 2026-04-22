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
  }
];
