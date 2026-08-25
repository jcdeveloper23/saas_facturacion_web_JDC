import { Routes } from '@angular/router';

export const TEST_DATA_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./test-data-page.component').then(m => m.TestDataPageComponent),
    data: { title: 'Generador de Datos de Prueba' },
  },
];
