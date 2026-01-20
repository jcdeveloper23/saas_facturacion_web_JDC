import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./organizations.component').then(m => m.OrganizationsComponent),
    data: { title: 'Gestión de Organizaciones' }
  }
];
