import { Routes } from '@angular/router';
import { authGuard, loginGuard, roleGuard } from './core/guards';

export const routes: Routes = [
  // ─── Public ──────────────────────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () => import('./views/pages/login/login.component').then(m => m.LoginComponent),
    canActivate: [loginGuard],
    data: { title: 'Login' }
  },
  {
    path: '404',
    loadComponent: () => import('./views/pages/page404/page404.component').then(m => m.Page404Component),
    data: { title: 'Page 404' }
  },
  {
    path: '500',
    loadComponent: () => import('./views/pages/page500/page500.component').then(m => m.Page500Component),
    data: { title: 'Page 500' }
  },

  // ─── Super Admin (no tenant context) ─────────────────────────────────────
  {
    path: 'super-admin',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['super_admin'] },
    loadChildren: () => import('./features/super-admin/super-admin.routes').then(m => m.SUPER_ADMIN_ROUTES)
  },

  // ─── Authenticated app (tenant context) ──────────────────────────────────
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/default-layout/default-layout.component').then(m => m.DefaultLayoutComponent),
    data: { title: 'Home' },
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      // Dashboard
      {
        path: 'dashboard',
        loadChildren: () => import('./views/dashboard/routes').then(m => m.routes),
        data: { title: 'Dashboard' }
      },

      // ── Customers ──────────────────────────────────────────────────────
      // TODO Phase 3: implement customers feature module
      // {
      //   path: 'customers',
      //   loadChildren: () => import('./features/customers/customers.routes').then(m => m.CUSTOMERS_ROUTES),
      //   data: { title: 'Customers' }
      // },

      // ── Suppliers ──────────────────────────────────────────────────────
      // {
      //   path: 'suppliers',
      //   loadChildren: () => import('./features/suppliers/suppliers.routes').then(m => m.SUPPLIERS_ROUTES),
      //   data: { title: 'Suppliers' }
      // },

      // ── Products ───────────────────────────────────────────────────────
      // {
      //   path: 'products',
      //   loadChildren: () => import('./features/products/products.routes').then(m => m.PRODUCTS_ROUTES),
      //   data: { title: 'Products' }
      // },

      // ── Invoices ───────────────────────────────────────────────────────
      // {
      //   path: 'invoices',
      //   loadChildren: () => import('./features/invoices/invoices.routes').then(m => m.INVOICES_ROUTES),
      //   data: { title: 'Invoices' }
      // },

      // ── Quotes ─────────────────────────────────────────────────────────
      // {
      //   path: 'quotes',
      //   loadChildren: () => import('./features/quotes/quotes.routes').then(m => m.QUOTES_ROUTES),
      //   data: { title: 'Quotes' }
      // },

      // ── Orders ─────────────────────────────────────────────────────────
      // {
      //   path: 'orders',
      //   loadChildren: () => import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES),
      //   data: { title: 'Orders' }
      // },

      // ── Stock ──────────────────────────────────────────────────────────
      // {
      //   path: 'stock',
      //   loadChildren: () => import('./features/stock/stock.routes').then(m => m.STOCK_ROUTES),
      //   data: { title: 'Stock' }
      // },

      // ── POS ────────────────────────────────────────────────────────────
      // {
      //   path: 'pos',
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin', 'cashier'], title: 'Point of Sale' },
      //   loadChildren: () => import('./features/pos/pos.routes').then(m => m.POS_ROUTES)
      // },

      // ── Electronic Invoicing (SRI) ─────────────────────────────────────
      // {
      //   path: 'electronic-invoicing',
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin'], title: 'Electronic Invoicing' },
      //   loadChildren: () => import('./features/electronic-invoicing/electronic-invoicing.routes').then(m => m.ELECTRONIC_INVOICING_ROUTES)
      // },

      // ── Settings ───────────────────────────────────────────────────────
      {
        path: 'settings',
        canActivate: [roleGuard],
        data: { roles: ['admin'], title: 'Settings' },
        loadChildren: () => import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES)
      },

      // ── CoreUI component library (keep for reference during development) ─
      {
        path: 'base',
        loadChildren: () => import('./views/base/routes').then(m => m.routes)
      },
      {
        path: 'forms',
        loadChildren: () => import('./views/forms/routes').then(m => m.routes)
      },
      {
        path: 'icons',
        loadChildren: () => import('./views/icons/routes').then(m => m.routes)
      },
      {
        path: 'notifications',
        loadChildren: () => import('./views/notifications/routes').then(m => m.routes)
      },
      {
        path: 'charts',
        loadChildren: () => import('./views/charts/routes').then(m => m.routes)
      },
      {
        path: 'widgets',
        loadChildren: () => import('./views/widgets/routes').then(m => m.routes)
      }
    ]
  },

  { path: '**', redirectTo: 'dashboard' }
];
