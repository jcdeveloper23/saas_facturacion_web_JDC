import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./geofences.component').then(m => m.GeofencesComponent),
    data: { title: 'Geocercas' }
  }
];
