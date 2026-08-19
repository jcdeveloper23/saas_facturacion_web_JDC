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
    path: 'estado-resultados',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Estado de Resultados' },
    loadComponent: () =>
      import('./pages/estado-resultados-page/estado-resultados-page.component')
        .then(m => m.EstadoResultadosPageComponent)
  },
  {
    path: 'balance-general',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Balance General' },
    loadComponent: () =>
      import('./pages/balance-general-page/balance-general-page.component')
        .then(m => m.BalanceGeneralPageComponent)
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
  },
  {
    path: 'settings',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Configuración Contable' },
    loadComponent: () =>
      import('./pages/accounting-settings-page/accounting-settings-page.component')
        .then(m => m.AccountingSettingsPageComponent)
  },
  {
    path: 'formulario-104',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Formulario 104 — Declaración IVA' },
    loadComponent: () =>
      import('./pages/formulario104-page/formulario104-page.component')
        .then(m => m.Formulario104PageComponent)
  },
  {
    path: 'formulario-101',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Formulario 101 — Declaración IR' },
    loadComponent: () =>
      import('./pages/formulario101-page/formulario101-page.component')
        .then(m => m.Formulario101PageComponent)
  },
  {
    path: 'bank-accounts',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Cuentas Bancarias' },
    loadComponent: () =>
      import('./pages/bank-accounts-page/bank-accounts-page.component')
        .then(m => m.BankAccountsPageComponent)
  },
  {
    path: 'bank-reconciliation',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Conciliación Bancaria' },
    loadComponent: () =>
      import('./pages/bank-reconciliation-page/bank-reconciliation-page.component')
        .then(m => m.BankReconciliationPageComponent)
  },
  {
    path: 'budget',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Definir Presupuesto' },
    loadComponent: () =>
      import('./pages/budget-page/budget-page.component')
        .then(m => m.BudgetPageComponent)
  },
  {
    path: 'presupuesto-vs-real',
    canActivate: [moduleGuard],
    data: { module: 'accounting', title: 'Presupuesto vs Real' },
    loadComponent: () =>
      import('./pages/presupuesto-vs-real-page/presupuesto-vs-real-page.component')
        .then(m => m.PresupuestoVsRealPageComponent)
  }
];
