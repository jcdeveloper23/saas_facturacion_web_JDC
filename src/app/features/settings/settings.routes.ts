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
        path: 'families',
        loadComponent: () =>
          import('./pages/families/families.component').then(m => m.FamiliesComponent),
        data: { title: 'Familias de Productos' }
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
      },
      {
        path: 'form-config',
        loadComponent: () =>
          import('./pages/form-config/settings-form-config.component').then(m => m.SettingsFormConfigComponent),
        data: { title: 'Opciones de Formularios' }
      },
      {
        path: 'plugins',
        loadComponent: () =>
          import('./pages/plugins/company-plugins-view.component').then(m => m.CompanyPluginsViewComponent),
        data: { title: 'Mis Plugins' }
      },
      {
        path: 'marketplace',
        loadComponent: () =>
          import('./pages/marketplace/marketplace-settings.component').then(m => m.MarketplaceSettingsComponent),
        data: { title: 'Catálogo Público' }
      },
      {
        path: 'subscription',
        loadComponent: () =>
          import('./pages/subscription/subscription.component').then(m => m.SubscriptionComponent),
        data: { title: 'Mi Suscripción' }
      }
    ]
  }
];
