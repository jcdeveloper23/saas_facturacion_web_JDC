import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards';

export const PURCHASES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./purchases-list.component').then(m => m.PurchasesListComponent),
    data: { title: 'Compras' }
  },
  {
    // Importación SRI y homologación — solo admin y accountant (operaciones avanzadas)
    path: 'import',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./purchase-import.component').then(m => m.PurchaseImportComponent),
    data: { roles: ['admin', 'accountant'], title: 'Importar Compras SRI' }
  },
  {
    path: 'mappings',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./purchases-mappings.component').then(m => m.PurchasesMappingsComponent),
    data: { roles: ['admin', 'accountant'], title: 'Homologación de Productos' }
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./purchase-form.component').then(m => m.PurchaseFormComponent),
    data: { title: 'Nueva Compra' }
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./purchase-form.component').then(m => m.PurchaseFormComponent),
    data: { title: 'Detalle Compra' }
  },
];
