import { Routes } from '@angular/router';

export const MARKETPLACE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./catalog/catalog-shell.component').then(m => m.CatalogShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./catalog/catalog-list.component').then(m => m.CatalogListComponent)
      },
      {
        path: 'p/:productId',
        loadComponent: () =>
          import('./catalog/catalog-detail.component').then(m => m.CatalogDetailComponent)
      }
    ]
  }
];
