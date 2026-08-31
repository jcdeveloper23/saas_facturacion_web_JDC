import { Routes } from '@angular/router';
import { moduleGuard, planLimitGuard } from '../../core/guards';
import { permissionGuard } from '../../core/guards/permission.guard';

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
    canActivate: [permissionGuard, moduleGuard, planLimitGuard],
    data: { permissions: ['invoices.create'], module: 'invoices', limitResource: 'invoices', title: 'Nueva Factura' },
    loadComponent: () =>
      import('./invoice-form.component').then(m => m.InvoiceFormComponent)
  },
  {
    path: ':id/edit',
    canActivate: [permissionGuard, moduleGuard],
    data: { permissions: ['invoices.edit'], module: 'invoices', title: 'Editar Factura' },
    loadComponent: () =>
      import('./invoice-form.component').then(m => m.InvoiceFormComponent)
  }
];
