import { Routes } from '@angular/router';
import { moduleGuard } from '../../core/guards';
import { permissionGuard } from '../../core/guards/permission.guard';

export const PURCHASES_ROUTES: Routes = [
  {
    path: '',
    canActivate: [moduleGuard],
    data: { module: 'purchases', title: 'Compras' },
    loadComponent: () =>
      import('./purchases-list.component').then(m => m.PurchasesListComponent),
  },
  {
    // Importación SRI y homologación — requiere permiso de creación
    path: 'import',
    canActivate: [permissionGuard, moduleGuard],
    data: { permissions: ['purchases.create'], module: 'purchases', title: 'Importar Compras SRI' },
    loadComponent: () =>
      import('./purchase-import.component').then(m => m.PurchaseImportComponent),
  },
  {
    path: 'mappings',
    canActivate: [permissionGuard, moduleGuard],
    data: { permissions: ['purchases.create'], module: 'purchases', title: 'Homologación de Productos' },
    loadComponent: () =>
      import('./purchases-mappings.component').then(m => m.PurchasesMappingsComponent),
  },
  {
    path: 'new',
    canActivate: [permissionGuard, moduleGuard],
    data: { permissions: ['purchases.create'], module: 'purchases', title: 'Nueva Compra' },
    loadComponent: () =>
      import('./purchase-form.component').then(m => m.PurchaseFormComponent),
  },
  {
    path: ':id',
    canActivate: [moduleGuard],
    data: { module: 'purchases', title: 'Detalle Compra' },
    loadComponent: () =>
      import('./purchase-form.component').then(m => m.PurchaseFormComponent),
  },
];
