import { Routes } from '@angular/router';
import { moduleGuard } from '../../core/guards';

export const ACCOUNTING_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'chart-of-accounts',
    pathMatch: 'full'
  },
  {
    path: 'chart-of-accounts',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Plan de Cuentas' },
    loadComponent: () =>
      import('./pages/chart-of-accounts-page/chart-of-accounts-page.component')
        .then(m => m.ChartOfAccountsPageComponent)
  },
  {
    path: 'journal-entries',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Asientos Contables' },
    loadComponent: () =>
      import('./pages/journal-entries-page/journal-entries-page.component')
        .then(m => m.JournalEntriesPageComponent)
  },
  {
    path: 'journal-entries/new',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Nuevo Asiento Contable' },
    loadComponent: () =>
      import('./pages/journal-entries-page/journal-entry-form-page.component')
        .then(m => m.JournalEntryFormPageComponent)
  },
  {
    path: 'journal-entries/:id/edit',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Editar Asiento Contable' },
    loadComponent: () =>
      import('./pages/journal-entries-page/journal-entry-form-page.component')
        .then(m => m.JournalEntryFormPageComponent)
  },
  {
    path: 'libro-diario',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Libro Diario' },
    loadComponent: () =>
      import('./pages/libro-diario-page/libro-diario-page.component')
        .then(m => m.LibroDiarioPageComponent)
  },
  {
    path: 'libro-mayor',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Libro Mayor' },
    loadComponent: () =>
      import('./pages/libro-mayor-page/libro-mayor-page.component')
        .then(m => m.LibroMayorPageComponent)
  },
  {
    path: 'balance-comprobacion',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Balance de Comprobación' },
    loadComponent: () =>
      import('./pages/balance-comprobacion-page/balance-comprobacion-page.component')
        .then(m => m.BalanceComprobacionPageComponent)
  },
  {
    path: 'cost-centers',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Centros de Costo' },
    loadComponent: () =>
      import('./pages/cost-centers-page/cost-centers-page.component')
        .then(m => m.CostCentersPageComponent)
  },
  {
    path: 'periods',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Ejercicios Contables' },
    loadComponent: () =>
      import('./pages/accounting-periods-page/accounting-periods-page.component')
        .then(m => m.AccountingPeriodsPageComponent)
  }
];
