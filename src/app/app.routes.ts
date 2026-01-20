import { Routes } from '@angular/router';
import { authGuard, adminGuard, loginGuard } from './core/guards';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'monitor',
    pathMatch: 'full'
  },
  {
    path: '',
    loadComponent: () => import('./layout').then(m => m.DefaultLayoutComponent),
    data: {
      title: 'Home'
    },
    children: [
      // GPS Tracking Routes (Protected)
      {
        path: 'monitor',
        loadChildren: () => import('./features/gps-monitor/routes').then((m) => m.routes),
        canActivate: [authGuard],
        data: { title: 'Monitor GPS' }
      },
      {
        path: 'devices',
        loadChildren: () => import('./features/devices/routes').then((m) => m.routes),
        canActivate: [authGuard],
        data: { title: 'Dispositivos' }
      },
      {
        path: 'geofences',
        loadChildren: () => import('./features/geofences/routes').then((m) => m.routes),
        canActivate: [authGuard],
        data: { title: 'Geocercas' }
      },
      {
        path: 'alerts',
        loadChildren: () => import('./features/alerts/routes').then((m) => m.routes),
        canActivate: [authGuard],
        data: { title: 'Alertas' }
      },
      {
        path: 'routes',
        loadChildren: () => import('./features/routes/routes').then((m) => m.routes),
        canActivate: [authGuard],
        data: { title: 'Rutas' }
      },
      {
        path: 'users',
        loadChildren: () => import('./features/users/routes').then((m) => m.routes),
        canActivate: [adminGuard],
        data: { title: 'Usuarios' }
      },
      {
        path: 'organizations',
        loadChildren: () => import('./features/organizations/routes').then((m) => m.routes),
        canActivate: [adminGuard],
        data: { title: 'Organizaciones' }
      },
      // CoreUI Demo Routes
      {
        path: 'dashboard',
        loadChildren: () => import('./views/dashboard/routes').then((m) => m.routes)
      },
      {
        path: 'theme',
        loadChildren: () => import('./views/theme/routes').then((m) => m.routes)
      },
      {
        path: 'base',
        loadChildren: () => import('./views/base/routes').then((m) => m.routes)
      },
      {
        path: 'buttons',
        loadChildren: () => import('./views/buttons/routes').then((m) => m.routes)
      },
      {
        path: 'forms',
        loadChildren: () => import('./views/forms/routes').then((m) => m.routes)
      },
      {
        path: 'icons',
        loadChildren: () => import('./views/icons/routes').then((m) => m.routes)
      },
      {
        path: 'notifications',
        loadChildren: () => import('./views/notifications/routes').then((m) => m.routes)
      },
      {
        path: 'widgets',
        loadChildren: () => import('./views/widgets/routes').then((m) => m.routes)
      },
      {
        path: 'charts',
        loadChildren: () => import('./views/charts/routes').then((m) => m.routes)
      },
      {
        path: 'pages',
        loadChildren: () => import('./views/pages/routes').then((m) => m.routes)
      }
    ]
  },
  {
    path: '404',
    loadComponent: () => import('./views/pages/page404/page404.component').then(m => m.Page404Component),
    data: {
      title: 'Page 404'
    }
  },
  {
    path: '500',
    loadComponent: () => import('./views/pages/page500/page500.component').then(m => m.Page500Component),
    data: {
      title: 'Page 500'
    }
  },
  {
    path: 'login',
    loadComponent: () => import('./views/pages/login/login.component').then(m => m.LoginComponent),
    canActivate: [loginGuard],
    data: {
      title: 'Login Page'
    }
  },
  {
    path: 'register',
    loadComponent: () => import('./views/pages/register/register.component').then(m => m.RegisterComponent),
    data: {
      title: 'Register Page'
    }
  },
  { path: '**', redirectTo: 'dashboard' }
];
