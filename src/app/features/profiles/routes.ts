import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./profiles.component').then(m => m.ProfilesComponent),
    canActivate: [permissionGuard],
    data: {
      title: 'Perfiles y Roles',
      permissions: ['profiles.view']
    }
  }
];
