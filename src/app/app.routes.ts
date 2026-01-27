import { Routes } from '@angular/router';
import { authGuard, adminGuard, loginGuard, permissionGuard } from './core/guards';

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
      // GPS Tracking Routes (Protected by permissions)
      {
        path: 'monitor',
        loadChildren: () => import('./features/gps-monitor/routes').then((m) => m.routes),
        canActivate: [authGuard, permissionGuard],
        data: { title: 'Monitor GPS', permissions: ['monitor.view'] }
      },
      {
        path: 'devices',
        loadChildren: () => import('./features/devices/routes').then((m) => m.routes),
        canActivate: [authGuard, permissionGuard],
        data: { title: 'Dispositivos', permissions: ['devices.view'] }
      },
      {
        path: 'geofences',
        loadChildren: () => import('./features/geofences/routes').then((m) => m.routes),
        canActivate: [authGuard, permissionGuard],
        data: { title: 'Geocercas', permissions: ['geofences.view'] }
      },
      {
        path: 'alerts',
        loadChildren: () => import('./features/alerts/routes').then((m) => m.routes),
        canActivate: [authGuard, permissionGuard],
        data: { title: 'Alertas', permissions: ['alerts.view'] }
      },
      {
        path: 'routes',
        loadChildren: () => import('./features/routes/routes').then((m) => m.routes),
        canActivate: [authGuard, permissionGuard],
        data: { title: 'Rutas', permissions: ['routes.view'] }
      },
      // Administration Routes
      {
        path: 'profiles',
        loadChildren: () => import('./features/profiles/routes').then((m) => m.routes),
        canActivate: [authGuard, permissionGuard],
        data: { title: 'Perfiles', permissions: ['profiles.view'] }
      },
      {
        path: 'users',
        loadChildren: () => import('./features/users/routes').then((m) => m.routes),
        canActivate: [authGuard, permissionGuard],
        data: { title: 'Usuarios', permissions: ['users.view'] }
      },
      {
        path: 'permissions',
        loadChildren: () => import('./features/permissions/routes').then((m) => m.routes),
        canActivate: [authGuard, permissionGuard],
        data: { title: 'Permisos', permissions: ['permissions.view', 'permissions.manage'] }
      },
      {
        path: 'organizations',
        loadChildren: () => import('./features/organizations/routes').then((m) => m.routes),
        canActivate: [authGuard, permissionGuard],
        data: { title: 'Organizaciones', permissions: ['organizations.view'] }
      },
      {
        path: 'plans',
        loadChildren: () => import('./features/plans/routes').then((m) => m.default),
        canActivate: [authGuard, permissionGuard],
        data: { title: 'Planes', permissions: ['plans.view'] }
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
    path: 'unauthorized',
    loadComponent: () => import('./views/pages/unauthorized/unauthorized.component').then(m => m.UnauthorizedComponent),
    data: {
      title: 'Sin Autorización'
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
