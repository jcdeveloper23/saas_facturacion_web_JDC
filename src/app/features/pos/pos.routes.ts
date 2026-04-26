import { Routes } from '@angular/router';
import { authGuard, roleGuard } from '../../core/guards';

export const POS_ROUTES: Routes = [
  {
    // Selección de terminal / apertura de caja
    path: '',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'cashier', 'seller'], title: 'POS — Seleccionar Terminal' },
    loadComponent: () =>
      import('./pos-session-select/pos-session-select.component')
        .then(m => m.PosSessionSelectComponent)
  },
  {
    // Pantalla principal de venta (pantalla completa, sin sidebar)
    path: 'main',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'cashier', 'seller'], title: 'POS — Punto de Venta' },
    loadComponent: () =>
      import('./pos-main/pos-main.component')
        .then(m => m.PosMainComponent)
  },
  {
    path: 'close',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'cashier', 'seller'], title: 'POS — Cierre de Caja' },
    loadComponent: () =>
      import('./pos-close/pos-close.component')
        .then(m => m.PosCloseComponent)
  },
  {
    path: 'history',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin', 'cashier', 'seller'], title: 'POS — Historial de Ventas' },
    loadComponent: () =>
      import('./pos-history/pos-history.component')
        .then(m => m.PosHistoryComponent)
  },
  {
    path: 'terminals',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['admin'], title: 'POS — Terminales' },
    loadComponent: () =>
      import('./pos-terminals/pos-terminals.component')
        .then(m => m.PosTerminalsComponent)
  }
];
