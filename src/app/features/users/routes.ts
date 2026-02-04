import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./users.component').then(m => m.UsersComponent),
    data: { title: 'Gestion de Usuarios' }
  },
  {
    path: 'new',
    loadComponent: () => import('./components/user-form/user-form.component').then(m => m.UserFormComponent),
    data: { title: 'Nuevo Usuario' }
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/user-detail/user-detail.component').then(m => m.UserDetailComponent),
    data: { title: 'Detalles del Usuario' }
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./components/user-form/user-form.component').then(m => m.UserFormComponent),
    data: { title: 'Editar Usuario' }
  }
];
