import { Routes } from '@angular/router';

export const STOCK_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./stock-overview.component').then(m => m.StockOverviewComponent),
    data: { title: 'Inventario' }
  },
  {
    path: 'movements',
    loadComponent: () =>
      import('./stock-movements.component').then(m => m.StockMovementsComponent),
    data: { title: 'Movimientos de Stock' }
  }
];
