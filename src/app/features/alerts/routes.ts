import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./alerts.component').then(m => m.AlertsComponent),
    data: { title: 'Alertas' }
  }
];
