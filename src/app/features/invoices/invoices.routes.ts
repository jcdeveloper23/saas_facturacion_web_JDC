import { Routes } from '@angular/router';
import { moduleGuard, roleGuard, planLimitGuard } from '../../core/guards';

export const INVOICES_ROUTES: Routes = [
  {
    path: '',
    canActivate: [moduleGuard],
    data: { module: 'invoices', title: 'Facturas de Venta' },
    loadComponent: () =>
      import('./invoices-list.component').then(m => m.InvoicesListComponent)
  },
  {
    path: 'new',
    canActivate: [moduleGuard, planLimitGuard],
    data: { module: 'invoices', limitResource: 'invoices', title: 'Nueva Factura' },
    loadComponent: () =>
      import('./invoice-form.component').then(m => m.InvoiceFormComponent)
  },
  {
    // cashier tiene solo RC (no update) — requiere admin o seller para editar
    path: ':id/edit',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'invoices', roles: ['admin', 'seller'], title: 'Editar Factura' },
    loadComponent: () =>
      import('./invoice-form.component').then(m => m.InvoiceFormComponent)
  }
];
