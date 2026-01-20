import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./gps-monitor.component').then(m => m.GpsMonitorComponent),
    data: {
      title: 'Monitor GPS'
    }
  }
];
