import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./settings-shell/settings-shell.component').then(m => m.SettingsShellComponent),
    children: [
      { path: '', redirectTo: 'company', pathMatch: 'full' },
      {
        path: 'company',
        loadComponent: () =>
          import('./pages/company-settings/company-settings.component').then(m => m.CompanySettingsComponent),
        data: { title: 'Company Settings' }
      },
      {
        path: 'warehouses',
        loadComponent: () =>
          import('./pages/warehouses/warehouses.component').then(m => m.WarehousesComponent),
        data: { title: 'Warehouses' }
      },
      {
        path: 'document-series',
        loadComponent: () =>
          import('./pages/document-series/document-series.component').then(m => m.DocumentSeriesComponent),
        data: { title: 'Document Series' }
      },
      {
        path: 'payment-terms',
        loadComponent: () =>
          import('./pages/payment-terms/payment-terms.component').then(m => m.PaymentTermsComponent),
        data: { title: 'Payment Terms' }
      },
      {
        path: 'tax-rates',
        loadComponent: () =>
          import('./pages/tax-rates/tax-rates.component').then(m => m.TaxRatesComponent),
        data: { title: 'Tax Rates' }
      },
      {
        path: 'currencies',
        loadComponent: () =>
          import('./pages/currencies/currencies.component').then(m => m.CurrenciesComponent),
        data: { title: 'Divisas' }
      },
      {
        path: 'countries',
        loadComponent: () =>
          import('./pages/countries/countries.component').then(m => m.CountriesComponent),
        data: { title: 'Países' }
      }
    ]
  }
];
