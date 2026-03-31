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
        path: 'plans',
        loadComponent: () =>
          import('./pages/plans/plans.component').then(m => m.PlansComponent),
        data: { title: 'Plans' }
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
      }
    ]
  }
];
