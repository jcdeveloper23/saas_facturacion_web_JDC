import { Routes } from '@angular/router';
import { moduleGuard } from '../../core/guards';

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
    canActivate: [moduleGuard],
    data: { module: 'invoices', title: 'Nueva Factura' },
    loadComponent: () =>
      import('./invoice-form.component').then(m => m.InvoiceFormComponent)
  },
  {
    path: ':id/edit',
    canActivate: [moduleGuard],
    data: { module: 'invoices', title: 'Editar Factura' },
    loadComponent: () =>
      import('./invoice-form.component').then(m => m.InvoiceFormComponent)
  }
];
