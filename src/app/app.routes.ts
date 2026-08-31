import { Routes, CanMatchFn } from '@angular/router';
import { authGuard, loginGuard, roleGuard, moduleGuard, featureFlagGuard } from './core/guards';
import { permissionGuard } from './core/guards/permission.guard';

// Segmentos reservados de la app — el catálogo público (:slug) no debe
// interceptar estas rutas cuando el usuario navega dentro del ERP.
const APP_SEGMENTS = new Set([
  'login', '404', '500', 'unauthorized', 'super-admin',
  'dashboard', 'personas', 'customers', 'products', 'invoices',
  'retentions', 'debit-notes', 'stock', 'purchases', 'team-management',
  'pos', 'users', 'profiles', 'profile', 'accounting', 'settings',
  'benefits', 'school-bar', 'api-docs', 'test-data', 'reports',
  'base', 'forms', 'icons', 'notifications', 'charts', 'widgets', 'legal',
]);

const catalogSlugGuard: CanMatchFn = (_route, segments) =>
  !APP_SEGMENTS.has(segments[0]?.path ?? '');

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
  // roleGuard se mantiene aquí: super_admin es un rol de plataforma global,
  // no un rol de empresa. permissionGuard no aplica en este contexto.
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

      // Dashboard — accesible para cualquier usuario autenticado
      {
        path: 'dashboard',
        loadChildren: () => import('./views/dashboard/routes').then(m => m.routes),
        data: { title: 'Dashboard' }
      },

      // ── Personas (clientes, proveedores, empleados) ────────────────────
      {
        path: 'personas',
        canActivate: [permissionGuard],
        data: { permissions: ['personas.view'], title: 'Personas' },
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
        canActivate: [permissionGuard],
        data: { permissions: ['products.view'], title: 'Artículos' },
        loadChildren: () => import('./features/products/products.routes').then(m => m.PRODUCTS_ROUTES)
      },

      // ── Invoices ───────────────────────────────────────────────────────
      {
        path: 'invoices',
        canActivate: [permissionGuard],
        data: { permissions: ['invoices.view'], title: 'Facturas de Venta' },
        loadChildren: () => import('./features/invoices/invoices.routes').then(m => m.INVOICES_ROUTES)
      },

      // ── Retentions ─────────────────────────────────────────────────────
      {
        path: 'retentions',
        canActivate: [permissionGuard, moduleGuard],
        data: { permissions: ['retentions.view'], module: 'retentions', title: 'Retenciones' },
        loadChildren: () => import('./features/retentions/retentions.routes').then(m => m.RETENTIONS_ROUTES)
      },

      // ── Debit Notes ────────────────────────────────────────────────────
      {
        path: 'debit-notes',
        canActivate: [permissionGuard, moduleGuard],
        data: { permissions: ['debit_notes.view'], module: 'debitNotes', title: 'Notas de Débito' },
        loadChildren: () => import('./features/debit-notes/debit-notes.routes').then(m => m.DEBIT_NOTES_ROUTES)
      },

      // ── Stock ──────────────────────────────────────────────────────────
      {
        path: 'stock',
        canActivate: [permissionGuard, moduleGuard, featureFlagGuard],
        data: { permissions: ['stock.view'], module: 'stock', featureFlag: 'stockModule', title: 'Inventario' },
        loadChildren: () => import('./features/stock/stock.routes').then(m => m.STOCK_ROUTES)
      },

      // ── Purchases ──────────────────────────────────────────────────────
      {
        path: 'purchases',
        canActivate: [authGuard, permissionGuard, moduleGuard, featureFlagGuard],
        data: { permissions: ['purchases.view'], module: 'purchases', featureFlag: 'purchasesModule', title: 'Compras' },
        loadChildren: () => import('./features/purchases/purchases.routes').then(m => m.PURCHASES_ROUTES)
      },

      // ── Team Management ────────────────────────────────────────────────────
      {
        path: 'team-management',
        canActivate: [authGuard, permissionGuard, moduleGuard, featureFlagGuard],
        data: { permissions: ['team_management.view'], module: 'teamManagement', featureFlag: 'teamManagementModule', title: 'Gestión de Equipo' },
        loadChildren: () =>
          import('./features/team-management/team-management.routes')
            .then(m => m.TEAM_MANAGEMENT_ROUTES)
      },

      // ── POS ────────────────────────────────────────────────────────────
      {
        path: 'pos',
        canActivate: [permissionGuard, moduleGuard],
        data: { permissions: ['pos.view'], module: 'pos', title: 'Punto de Venta' },
        loadChildren: () => import('./features/pos/pos.routes').then(m => m.POS_ROUTES)
      },

      // ── Marketplace Orders ────────────────────────────────────────────
      {
        path: 'marketplace-orders',
        canActivate: [permissionGuard, moduleGuard],
        data: { permissions: ['invoices.view'], module: 'marketplace', title: 'Pedidos del Catálogo' },
        loadComponent: () =>
          import('./features/marketplace/admin/marketplace-orders.component')
            .then(m => m.MarketplaceOrdersComponent)
      },

      // ── Users ──────────────────────────────────────────────────────────
      {
        path: 'users',
        canActivate: [permissionGuard],
        data: { permissions: ['users.view'], title: 'Usuarios' },
        loadChildren: () => import('./features/users/routes').then(m => m.routes)
      },

      // ── Profiles & Roles ───────────────────────────────────────────────
      {
        path: 'profiles',
        canActivate: [permissionGuard],
        data: { permissions: ['users.view'], title: 'Perfiles y Roles' },
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
        canActivate: [permissionGuard, moduleGuard, featureFlagGuard],
        data: { permissions: ['accounting.view'], module: 'accounting', featureFlag: 'accountingModule', title: 'Contabilidad' },
        loadChildren: () =>
          import('./features/accounting/accounting.routes').then(m => m.ACCOUNTING_ROUTES)
      },

      // ── Reports ────────────────────────────────────────────────────────────
      {
        path: 'reports',
        canActivate: [permissionGuard],
        data: { permissions: ['invoices.view'], title: 'Reportes' },
        loadChildren: () =>
          import('./features/reports/reports.routes').then(m => m.REPORTS_ROUTES)
      },

      // ── Bar Escolar ────────────────────────────────────────────────────
      {
        path: 'school-bar',
        canActivate: [permissionGuard, moduleGuard],
        data: { permissions: ['pos.view'], module: 'school_setup', title: 'Bar Escolar' },
        loadChildren: () =>
          import('./features/school-bar/school-bar.routes')
            .then(m => m.SCHOOL_BAR_ROUTES)
      },

      // ── Benefits ───────────────────────────────────────────────────────
      {
        path: 'benefits',
        canActivate: [permissionGuard, moduleGuard],
        data: { permissions: ['invoices.view'], module: 'benefits', title: 'Beneficios' },
        loadChildren: () => import('./features/benefits/benefits.routes').then(m => m.BENEFITS_ROUTES)
      },

      // ── Settings ───────────────────────────────────────────────────────
      {
        path: 'settings',
        canActivate: [permissionGuard],
        data: { permissions: ['settings.view'], title: 'Settings' },
        loadChildren: () => import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES)
      },

      // ── API Docs (Swagger UI — referencia de Cloud Functions) ──────────────
      {
        path: 'api-docs',
        canActivate: [permissionGuard],
        data: { permissions: ['users.view'], title: 'API Docs' },
        loadComponent: () =>
          import('./features/api-docs/api-docs-page.component').then(m => m.ApiDocsPageComponent)
      },

      // ── Test Data Generator ────────────────────────────────────────────────
      {
        path: 'test-data',
        canActivate: [permissionGuard],
        data: { permissions: ['users.view'], title: 'Generador de Datos de Prueba' },
        loadChildren: () =>
          import('./features/test-data/test-data.routes').then(m => m.TEST_DATA_ROUTES)
      },

      // ── CoreUI component library (acceso restringido a super_admin en producción) ─
      // roleGuard se mantiene aquí: son rutas de desarrollo/plataforma, no de empresa.
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

  // ─── Public catalog ──────────────────────────────────────────────────────
  // IMPORTANTE: debe estar ANTES del layout autenticado (path:'') porque ese
  // route hace prefix-match en cualquier URL y, al pasar el authGuard,
  // Angular no reintenta rutas hermanas si ningún hijo coincide.
  // canMatch garantiza que :slug no intercepte rutas internas del ERP.
  {
    path: ':slug',
    canMatch: [catalogSlugGuard],
    loadChildren: () =>
      import('./features/marketplace/marketplace.routes')
        .then(m => m.MARKETPLACE_ROUTES)
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

  { path: '**', redirectTo: 'dashboard' }
];
