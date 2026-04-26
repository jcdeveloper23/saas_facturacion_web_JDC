import { Routes } from '@angular/router';
import { authGuard, loginGuard, roleGuard, moduleGuard } from './core/guards';

export const routes: Routes = [
  // ─── Landing Page (public root) ─────────────────────────────────────────
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./views/landing/landing.component').then(m => m.LandingComponent),
    data: { title: 'FacturaSec — ERP para Ecuador' }
  },

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
  {
    path: 'unauthorized',
    loadComponent: () =>
      import('./views/pages/unauthorized/unauthorized.component').then(m => m.UnauthorizedComponent),
    data: { title: 'Acceso No Autorizado' }
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

      // ── Personas (clientes, proveedores, empleados) ────────────────────
      {
        path: 'personas',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'seller'], title: 'Personas' },
        loadChildren: () => import('./features/personas/personas.routes').then(m => m.PERSONAS_ROUTES)
      },
      {
        path: 'customers',
        redirectTo: '/personas?role=customer',
        pathMatch: 'prefix'
      },

      // ── Products ───────────────────────────────────────────────────────
      {
        path: 'products',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'seller'], title: 'Artículos' },
        loadChildren: () => import('./features/products/products.routes').then(m => m.PRODUCTS_ROUTES)
      },

      // ── Invoices ───────────────────────────────────────────────────────
      {
        path: 'invoices',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'seller', 'cashier'], title: 'Facturas de Venta' },
        loadChildren: () => import('./features/invoices/invoices.routes').then(m => m.INVOICES_ROUTES)
      },

      // ── Retentions ─────────────────────────────────────────────────────
      {
        path: 'retentions',
        canActivate: [roleGuard, moduleGuard],
        data: { roles: ['admin', 'accountant'], module: 'retentions', title: 'Retenciones' },
        loadChildren: () => import('./features/retentions/retentions.routes').then(m => m.RETENTIONS_ROUTES)
      },

      // ── Debit Notes ────────────────────────────────────────────────────
      {
        path: 'debit-notes',
        canActivate: [roleGuard, moduleGuard],
        data: { roles: ['admin', 'accountant', 'seller'], module: 'debitNotes', title: 'Notas de Débito' },
        loadChildren: () => import('./features/debit-notes/debit-notes.routes').then(m => m.DEBIT_NOTES_ROUTES)
      },

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
      {
        path: 'stock',
        canActivate: [roleGuard, moduleGuard],
        data: { roles: ['admin', 'seller'], module: 'stock', title: 'Inventario' },
        loadChildren: () => import('./features/stock/stock.routes').then(m => m.STOCK_ROUTES)
      },

      // ── Purchases ──────────────────────────────────────────────────────
      {
        path: 'purchases',
        canActivate: [authGuard, roleGuard, moduleGuard],
        data: { roles: ['admin', 'accountant', 'seller'], module: 'purchases', title: 'Compras' },
        loadChildren: () => import('./features/purchases/purchases.routes').then(m => m.PURCHASES_ROUTES)
      },

      // ── Team Management ────────────────────────────────────────────────────
      {
        path: 'team-management',
        canActivate: [authGuard, roleGuard, moduleGuard],
        data: { roles: ['admin', 'seller'], module: 'teamManagement', title: 'Gestión de Equipo' },
        loadChildren: () =>
          import('./features/team-management/team-management.routes')
            .then(m => m.TEAM_MANAGEMENT_ROUTES)
      },

      // ── POS ────────────────────────────────────────────────────────────
      {
        path: 'pos',
        canActivate: [roleGuard, moduleGuard],
        data: { roles: ['admin', 'cashier', 'seller'], module: 'pos', title: 'Punto de Venta' },
        loadChildren: () => import('./features/pos/pos.routes').then(m => m.POS_ROUTES)
      },

      // ── Electronic Invoicing (SRI) ─────────────────────────────────────
      // {
      //   path: 'electronic-invoicing',
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin'], title: 'Electronic Invoicing' },
      //   loadChildren: () => import('./features/electronic-invoicing/electronic-invoicing.routes').then(m => m.ELECTRONIC_INVOICING_ROUTES)
      // },

      // ── Users ──────────────────────────────────────────────────────────
      {
        path: 'users',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'super_admin'], title: 'Usuarios' },
        loadChildren: () => import('./features/users/routes').then(m => m.routes)
      },

      // ── Profiles & Roles ───────────────────────────────────────────────
      {
        path: 'profiles',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'super_admin'], title: 'Perfiles y Roles' },
        loadChildren: () => import('./features/profiles/routes').then(m => m.routes)
      },

      // ── My Profile ─────────────────────────────────────────────────────
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
        data: { title: 'Mi Perfil' }
      },

      // ── Accounting ────────────────────────────────────────────────────────
      {
        path: 'accounting',
        canActivate: [roleGuard, moduleGuard],
        data: { roles: ['admin', 'accountant'], module: 'accounting', title: 'Contabilidad' },
        loadChildren: () =>
          import('./features/accounting/accounting.routes').then(m => m.ACCOUNTING_ROUTES)
      },

      // ── Settings ───────────────────────────────────────────────────────
      {
        path: 'settings',
        canActivate: [roleGuard],
        data: { roles: ['admin'], title: 'Settings' },
        loadChildren: () => import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES)
      },


      // ── CoreUI component library (acceso restringido a super_admin en producción) ─
      {
        path: 'base',
        canActivate: [authGuard, roleGuard],
        data: { roles: ['super_admin'] },
        loadChildren: () => import('./views/base/routes').then(m => m.routes)
      },
      {
        path: 'forms',
        canActivate: [authGuard, roleGuard],
        data: { roles: ['super_admin'] },
        loadChildren: () => import('./views/forms/routes').then(m => m.routes)
      },
      {
        path: 'icons',
        canActivate: [authGuard, roleGuard],
        data: { roles: ['super_admin'] },
        loadChildren: () => import('./views/icons/routes').then(m => m.routes)
      },
      {
        path: 'notifications',
        canActivate: [authGuard, roleGuard],
        data: { roles: ['super_admin'] },
        loadChildren: () => import('./views/notifications/routes').then(m => m.routes)
      },
      {
        path: 'charts',
        canActivate: [authGuard, roleGuard],
        data: { roles: ['super_admin'] },
        loadChildren: () => import('./views/charts/routes').then(m => m.routes)
      },
      {
        path: 'widgets',
        canActivate: [authGuard, roleGuard],
        data: { roles: ['super_admin'] },
        loadChildren: () => import('./views/widgets/routes').then(m => m.routes)
      }
    ]
  },

  // ─── Legal pages (public) ────────────────────────────────────────────────
  {
    path: 'legal/terminos',
    loadComponent: () =>
      import('./views/legal/terminos/terminos.component').then(m => m.TerminosComponent),
    data: { title: 'Términos de Uso — FacturaSec' }
  },
  {
    path: 'legal/privacidad',
    loadComponent: () =>
      import('./views/legal/privacidad/privacidad.component').then(m => m.PrivacidadComponent),
    data: { title: 'Política de Privacidad — FacturaSec' }
  },
  {
    path: 'legal/aviso',
    loadComponent: () =>
      import('./views/legal/aviso/aviso.component').then(m => m.AvisoComponent),
    data: { title: 'Aviso Legal — FacturaSec' }
  },

  // ─── Public catalog (must be last before wildcard) ───────────────────────
  {
    path: ':slug',
    loadChildren: () =>
      import('./features/marketplace/marketplace.routes')
        .then(m => m.MARKETPLACE_ROUTES)
  },

  { path: '**', redirectTo: 'dashboard' }
];
