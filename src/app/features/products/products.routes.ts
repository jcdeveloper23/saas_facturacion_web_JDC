import { Routes } from '@angular/router';
import { moduleGuard } from '../../core/guards';

export const PRODUCTS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [moduleGuard],
    data: { module: 'products', title: 'Artículos' },
    loadComponent: () =>
      import('./products-list.component').then(m => m.ProductsListComponent)
  },
  {
    path: 'new',
    canActivate: [moduleGuard],
    data: { module: 'products', title: 'Nuevo Artículo' },
    loadComponent: () =>
      import('./product-form.component').then(m => m.ProductFormComponent)
  },
  {
    path: ':id/edit',
    canActivate: [moduleGuard],
    data: { module: 'products', title: 'Editar Artículo' },
    loadComponent: () =>
      import('./product-form.component').then(m => m.ProductFormComponent)
  }
];
