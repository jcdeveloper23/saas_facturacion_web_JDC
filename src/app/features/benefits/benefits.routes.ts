import { Routes } from '@angular/router';

export const BENEFITS_ROUTES: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./benefits-dashboard/benefits-dashboard.component')
        .then(m => m.BenefitsDashboardComponent),
    title: 'Beneficios — Dashboard'
  },
  {
    path: 'config',
    loadComponent: () =>
      import('./benefits-config/benefits-config.component')
        .then(m => m.BenefitsConfigComponent),
    title: 'Beneficios — Socios'
  },
  {
    path: 'history',
    loadComponent: () =>
      import('./benefits-history/benefits-history.component')
        .then(m => m.BenefitsHistoryComponent),
    title: 'Beneficios — Liquidaciones'
  }
];
