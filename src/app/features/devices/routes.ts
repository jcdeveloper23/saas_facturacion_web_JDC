import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./devices.component').then(m => m.DevicesComponent),
    data: { title: 'Dispositivos GPS' }
  }
];
