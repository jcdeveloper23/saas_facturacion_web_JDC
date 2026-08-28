import { Routes } from '@angular/router';
import { moduleGuard, roleGuard } from '../../core/guards';

const REPORT_ROLES = ['admin', 'accountant', 'seller'];

export const REPORTS_ROUTES: Routes = [
  { path: '', redirectTo: 'invoices', pathMatch: 'full' },
  {
    path: 'invoices',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'report_invoices', roles: REPORT_ROLES, title: 'Reporte de Ventas' },
    loadComponent: () =>
      import('./pages/invoices-report-page/invoices-report-page.component')
        .then(m => m.InvoicesReportPageComponent)
  },
  {
    path: 'purchases',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'report_purchases', roles: ['admin', 'accountant'], title: 'Reporte de Compras' },
    loadComponent: () =>
      import('./pages/purchases-report-page/purchases-report-page.component')
        .then(m => m.PurchasesReportPageComponent)
  },
  {
    path: 'products',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'report_products', roles: ['admin', 'accountant'], title: 'Reporte de Productos' },
    loadComponent: () =>
      import('./pages/products-report-page/products-report-page.component')
        .then(m => m.ProductsReportPageComponent)
  }
];
