import { Routes } from '@angular/router';
import { moduleGuard } from '../../core/guards';

export const SCHOOL_BAR_ROUTES: Routes = [
  { path: '', redirectTo: 'setup', pathMatch: 'full' },

  // ── Setup & Configuración ────────────────────────────────────────────────
  {
    path: 'setup',
    canActivate: [moduleGuard],
    data: { module: 'school_setup' },
    loadComponent: () =>
      import('./school-setup/school-setup.component')
        .then(m => m.SchoolSetupComponent),
    title: 'Bar Escolar — Configuración'
  },

  // ── Menú del día ─────────────────────────────────────────────────────────
  {
    path: 'menus',
    canActivate: [moduleGuard],
    data: { module: 'school_menus' },
    loadComponent: () =>
      import('./school-menu/school-menu-editor.component')
        .then(m => m.SchoolMenuEditorComponent),
    title: 'Bar Escolar — Menú del Día'
  },

  // ── Órdenes (tablero de preparación) ─────────────────────────────────────
  {
    path: 'orders',
    canActivate: [moduleGuard],
    data: { module: 'school_orders' },
    loadComponent: () =>
      import('./school-orders/school-orders-board.component')
        .then(m => m.SchoolOrdersBoardComponent),
    title: 'Bar Escolar — Tablero de Órdenes'
  },

  // ── POS (cobro en barra) ──────────────────────────────────────────────────
  {
    path: 'pos',
    canActivate: [moduleGuard],
    data: { module: 'school_pos' },
    loadComponent: () =>
      import('./school-pos/school-pos.component')
        .then(m => m.SchoolPosComponent),
    title: 'Bar Escolar — Punto de Venta'
  },

  // ── Wallet & Recargas ────────────────────────────────────────────────────
  {
    path: 'wallet',
    canActivate: [moduleGuard],
    data: { module: 'school_wallet' },
    loadComponent: () =>
      import('./school-wallet/school-wallet-history.component')
        .then(m => m.SchoolWalletHistoryComponent),
    title: 'Bar Escolar — Wallet y Recargas'
  },

  // ── Accesorios NFC ───────────────────────────────────────────────────────
  {
    path: 'accessories',
    canActivate: [moduleGuard],
    data: { module: 'school_accessories' },
    loadComponent: () =>
      import('./school-accessories/school-accessories-list.component')
        .then(m => m.SchoolAccessoriesListComponent),
    title: 'Bar Escolar — Accesorios NFC'
  },
];
