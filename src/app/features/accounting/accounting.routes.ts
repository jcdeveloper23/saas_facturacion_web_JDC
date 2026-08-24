import { Routes } from '@angular/router';
import { moduleGuard, roleGuard } from '../../core/guards';

// Todas las rutas de contabilidad son admin/accountant-only — mismo criterio
// que firestore.rules ("Read: admin and accountant only (sellers/cashiers
// have no accounting access)"). moduleGuard solo valida el plan de la
// empresa, no el rol de quien navega — sin roleGuard, un vendedor o cajero
// puede entrar tecleando la URL directamente.
const ACCOUNTING_ROLES = ['admin', 'accountant'];
const ADMIN_ONLY_ROLES = ['admin'];

export const ACCOUNTING_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'chart-of-accounts',
    pathMatch: 'full'
  },
  {
    path: 'chart-of-accounts',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Plan de Cuentas' },
    loadComponent: () =>
      import('./pages/chart-of-accounts-page/chart-of-accounts-page.component')
        .then(m => m.ChartOfAccountsPageComponent)
  },
  {
    path: 'journal-entries',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Asientos Contables' },
    loadComponent: () =>
      import('./pages/journal-entries-page/journal-entries-page.component')
        .then(m => m.JournalEntriesPageComponent)
  },
  {
    path: 'journal-entries/new',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Nuevo Asiento Contable' },
    loadComponent: () =>
      import('./pages/journal-entries-page/journal-entry-form-page.component')
        .then(m => m.JournalEntryFormPageComponent)
  },
  {
    path: 'journal-entries/:id/edit',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Editar Asiento Contable' },
    loadComponent: () =>
      import('./pages/journal-entries-page/journal-entry-form-page.component')
        .then(m => m.JournalEntryFormPageComponent)
  },
  {
    path: 'libro-diario',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Libro Diario' },
    loadComponent: () =>
      import('./pages/libro-diario-page/libro-diario-page.component')
        .then(m => m.LibroDiarioPageComponent)
  },
  {
    path: 'libro-mayor',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Libro Mayor' },
    loadComponent: () =>
      import('./pages/libro-mayor-page/libro-mayor-page.component')
        .then(m => m.LibroMayorPageComponent)
  },
  {
    path: 'balance-comprobacion',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Balance de Comprobación' },
    loadComponent: () =>
      import('./pages/balance-comprobacion-page/balance-comprobacion-page.component')
        .then(m => m.BalanceComprobacionPageComponent)
  },
  {
    path: 'estado-resultados',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Estado de Resultados' },
    loadComponent: () =>
      import('./pages/estado-resultados-page/estado-resultados-page.component')
        .then(m => m.EstadoResultadosPageComponent)
  },
  {
    path: 'balance-general',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Balance General' },
    loadComponent: () =>
      import('./pages/balance-general-page/balance-general-page.component')
        .then(m => m.BalanceGeneralPageComponent)
  },
  {
    path: 'flujo-efectivo',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Flujo de Efectivo' },
    loadComponent: () =>
      import('./pages/flujo-efectivo-page/flujo-efectivo-page.component')
        .then(m => m.FlujoEfectivoPageComponent)
  },
  {
    path: 'aging',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Antigüedad de Cartera' },
    loadComponent: () =>
      import('./pages/aging-page/aging-page.component')
        .then(m => m.AgingPageComponent)
  },
  {
    path: 'saldos-iniciales',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Saldos Iniciales' },
    loadComponent: () =>
      import('./pages/saldos-iniciales-page/saldos-iniciales-page.component')
        .then(m => m.SaldosInicialesPageComponent)
  },
  {
    path: 'audit-log',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ADMIN_ONLY_ROLES, title: 'Log de Auditoría' },
    loadComponent: () =>
      import('./pages/audit-log-page/audit-log-page.component')
        .then(m => m.AuditLogPageComponent)
  },
  {
    path: 'cost-centers',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Centros de Costo' },
    loadComponent: () =>
      import('./pages/cost-centers-page/cost-centers-page.component')
        .then(m => m.CostCentersPageComponent)
  },
  {
    path: 'periods',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Ejercicios Contables' },
    loadComponent: () =>
      import('./pages/accounting-periods-page/accounting-periods-page.component')
        .then(m => m.AccountingPeriodsPageComponent)
  },
  {
    path: 'settings',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Configuración Contable' },
    loadComponent: () =>
      import('./pages/accounting-settings-page/accounting-settings-page.component')
        .then(m => m.AccountingSettingsPageComponent)
  },
  {
    path: 'formulario-104',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Formulario 104 — Declaración IVA' },
    loadComponent: () =>
      import('./pages/formulario104-page/formulario104-page.component')
        .then(m => m.Formulario104PageComponent)
  },
  {
    path: 'formulario-101',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Formulario 101 — Declaración IR' },
    loadComponent: () =>
      import('./pages/formulario101-page/formulario101-page.component')
        .then(m => m.Formulario101PageComponent)
  },
  {
    path: 'formulario-103',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Formulario 103 — Retenciones en la Fuente' },
    loadComponent: () =>
      import('./pages/formulario103-page/formulario103-page.component')
        .then(m => m.Formulario103PageComponent)
  },
  {
    path: 'ats',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'ATS — Anexo Transaccional Simplificado' },
    loadComponent: () =>
      import('./pages/ats-page/ats-page.component')
        .then(m => m.AtsPageComponent)
  },
  {
    path: 'petty-cash',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Caja Chica' },
    loadComponent: () =>
      import('./pages/petty-cash-page/petty-cash-page.component')
        .then(m => m.PettyCashPageComponent)
  },
  {
    path: 'advances',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Anticipos' },
    loadComponent: () =>
      import('./pages/advances-page/advances-page.component')
        .then(m => m.AdvancesPageComponent)
  },
  {
    path: 'bank-accounts',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Cuentas Bancarias' },
    loadComponent: () =>
      import('./pages/bank-accounts-page/bank-accounts-page.component')
        .then(m => m.BankAccountsPageComponent)
  },
  {
    path: 'bank-reconciliation',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Conciliación Bancaria' },
    loadComponent: () =>
      import('./pages/bank-reconciliation-page/bank-reconciliation-page.component')
        .then(m => m.BankReconciliationPageComponent)
  },
  {
    path: 'budget',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Definir Presupuesto' },
    loadComponent: () =>
      import('./pages/budget-page/budget-page.component')
        .then(m => m.BudgetPageComponent)
  },
  {
    path: 'presupuesto-vs-real',
    canActivate: [moduleGuard, roleGuard],
    data: { module: 'accounting', roles: ACCOUNTING_ROLES, title: 'Presupuesto vs Real' },
    loadComponent: () =>
      import('./pages/presupuesto-vs-real-page/presupuesto-vs-real-page.component')
        .then(m => m.PresupuestoVsRealPageComponent)
  }
];
