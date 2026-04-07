import { Routes } from '@angular/router';
import { moduleGuard } from '../../core/guards';

export const CUSTOMERS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [moduleGuard],
    data: { module: 'customers', title: 'Clientes' },
    loadComponent: () =>
      import('./customers-list.component').then(m => m.CustomersListComponent)
  },
  {
    path: 'new',
    canActivate: [moduleGuard],
    data: { module: 'customers', title: 'Nuevo Cliente' },
    loadComponent: () =>
      import('./customer-form.component').then(m => m.CustomerFormComponent)
  },
  {
    path: ':id/edit',
    canActivate: [moduleGuard],
    data: { module: 'customers', title: 'Editar Cliente' },
    loadComponent: () =>
      import('./customer-form.component').then(m => m.CustomerFormComponent)
  }
];
