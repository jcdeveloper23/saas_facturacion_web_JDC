import { Routes } from '@angular/router';

export const PURCHASES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./purchases-list.component').then(m => m.PurchasesListComponent),
    data: { title: 'Compras' }
  },
  {
    path: 'import',
    loadComponent: () =>
      import('./purchase-import.component').then(m => m.PurchaseImportComponent),
    data: { title: 'Importar Compras SRI' }
  },
  {
    path: 'mappings',
    loadComponent: () =>
      import('./purchases-mappings.component').then(m => m.PurchasesMappingsComponent),
    data: { title: 'Homologación de Productos' }
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
