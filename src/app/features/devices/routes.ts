import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./devices.component').then(m => m.DevicesComponent),
    data: { title: 'Dispositivos GPS' }
  },
  {
    path: 'new',
    loadComponent: () => import('./components/device-form/device-form.component').then(m => m.DeviceFormComponent),
    data: { title: 'Nuevo Dispositivo' }
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/device-detail/device-detail.component').then(m => m.DeviceDetailComponent),
    data: { title: 'Detalles del Dispositivo' }
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./components/device-form/device-form.component').then(m => m.DeviceFormComponent),
    data: { title: 'Editar Dispositivo' }
  }
];
