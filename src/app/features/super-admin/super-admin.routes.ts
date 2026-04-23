import { Routes } from '@angular/router';

export const SUPER_ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/super-admin-layout.component').then(m => m.SuperAdminLayoutComponent),
    children: [
      { path: '', redirectTo: 'companies', pathMatch: 'full' },
      {
        path: 'companies',
        loadComponent: () =>
          import('./pages/companies/companies-list.component').then(m => m.CompaniesListComponent),
        data: { title: 'Companies' }
      },
      {
        path: 'companies/new',
        loadComponent: () =>
          import('./pages/companies/company-form.component').then(m => m.CompanyFormComponent),
        data: { title: 'New Company' }
      },
      {
        path: 'companies/:id/edit',
        loadComponent: () =>
          import('./pages/companies/company-form.component').then(m => m.CompanyFormComponent),
        data: { title: 'Edit Company' }
      },
      {
        path: 'companies/:id/plugins',
        loadComponent: () =>
          import('./pages/companies/company-plugins.component').then(m => m.CompanyPluginsComponent),
        data: { title: 'Company Plugins' }
      },
      {
        path: 'companies/:id/form-config',
        loadComponent: () =>
          import('./pages/companies/company-form-config.component').then(m => m.CompanyFormConfigComponent),
        data: { title: 'Form Configuration' }
      },
      {
        path: 'catalog',
        loadComponent: () =>
          import('../../features/permissions/permissions.component').then(m => m.PermissionsComponent),
        data: { title: 'Catálogo de Módulos' }
      },
      {
        path: 'plugin-packages',
        loadComponent: () =>
          import('./pages/plugin-packages/plugin-packages.component').then(m => m.PluginPackagesComponent),
        data: { title: 'Paquetes de Plugins' }
      },
      {
        path: 'plans',
        loadComponent: () =>
          import('./pages/plans/plans.component').then(m => m.PlansComponent),
        data: { title: 'Plans' }
      },
      {
        path: 'plans/:id',
        loadComponent: () =>
          import('./pages/plans/plan-detail.component').then(m => m.PlanDetailComponent),
        data: { title: 'Detalle de Plan' }
      },
      {
        path: 'defaults',
        loadComponent: () =>
          import('./pages/defaults/platform-defaults.component').then(m => m.PlatformDefaultsComponent),
        data: { title: 'Default Data' }
      },
      {
        path: 'defaults/tax-rates',
        loadComponent: () =>
          import('./pages/defaults/tax-rates/platform-tax-rates.component').then(m => m.PlatformTaxRatesComponent),
        data: { title: 'Impuestos por Defecto' }
      },
      {
        path: 'defaults/payment-methods',
        loadComponent: () =>
          import('./pages/defaults/payment-methods/platform-payment-methods.component').then(m => m.PlatformPaymentMethodsComponent),
        data: { title: 'Métodos de Pago por Defecto' }
      },
      {
        path: 'defaults/document-series',
        loadComponent: () =>
          import('./pages/defaults/document-series/platform-document-series.component').then(m => m.PlatformDocumentSeriesComponent),
        data: { title: 'Series de Documentos por Defecto' }
      },
      {
        path: 'defaults/warehouses',
        loadComponent: () =>
          import('./pages/defaults/warehouses/platform-warehouses.component').then(m => m.PlatformWarehousesComponent),
        data: { title: 'Bodegas por Defecto' }
      },
      {
        path: 'defaults/currencies',
        loadComponent: () =>
          import('./pages/defaults/currencies/platform-currencies.component').then(m => m.PlatformCurrenciesComponent),
        data: { title: 'Divisas por Defecto' }
      },
      {
        path: 'defaults/countries',
        loadComponent: () =>
          import('./pages/defaults/countries/platform-countries.component').then(m => m.PlatformCountriesComponent),
        data: { title: 'Países por Defecto' }
      },
      {
        path: 'defaults/sri-config',
        loadComponent: () =>
          import('./pages/defaults/sri-config/platform-sri-config.component').then(m => m.PlatformSriConfigComponent),
        data: { title: 'Configuración SRI Ecuador' }
      },
      {
        path: 'defaults/smtp-config',
        loadComponent: () =>
          import('./pages/defaults/smtp-config/platform-smtp-config.component').then(m => m.PlatformSmtpConfigComponent),
        data: { title: 'Configuración SMTP' }
      },
      // Perfiles y Roles — dentro del super-admin layout para no perder el nav
      {
        path: 'profiles',
        loadComponent: () =>
          import('../profiles/profiles.component').then(m => m.ProfilesComponent),
        data: { title: 'Perfiles y Roles' }
      },
      {
        path: 'profiles/new',
        loadComponent: () =>
          import('../profiles/pages/profile-form/profile-form.component').then(m => m.ProfileFormComponent),
        data: { title: 'Nuevo Perfil' }
      },
      {
        path: 'profiles/:id/edit',
        loadComponent: () =>
          import('../profiles/pages/profile-form/profile-form.component').then(m => m.ProfileFormComponent),
        data: { title: 'Editar Perfil' }
      }
    ]
  }
];
