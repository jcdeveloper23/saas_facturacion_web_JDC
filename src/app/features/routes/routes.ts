import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./routes-history.component').then(m => m.RoutesHistoryComponent),
    data: { title: 'Historial de Rutas' }
  }
];
