import { Routes } from '@angular/router';

import { AdminLayoutComponent } from './layouts/admin/admin-layout.component';
import { AuthLayoutComponent } from './layouts/auth/auth-layout.component';
import { IndexLayoutComponent } from './layouts/index-layout/index-layout.component';
import { AuthGuard } from './services/authGuard/auth.guard';

export const AppRoutes: Routes = [
    {
        path: '',
        component: IndexLayoutComponent,
        children: [
            {
                path: "",
                loadChildren: "./pages/pages.module#PagesModule",
            },
        ],
    },
    // {
    //     path: 'perfil',
    //     redirectTo: 'perfil',
    //     pathMatch: 'full',
    // },
    // {
    //     path: 'register',
    //     loadChildren: './pages/pages.module#PagesModule',
    // }
    {
        path: '',
        component: AdminLayoutComponent,
        children: [

            {
                path: 'monitor',
                loadChildren: './modules/driver-monitor/driver-monitor.module#DriverMonitorModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'cities',
                loadChildren: './modules/cities/cities.module#CitiesModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'users',
                loadChildren: './modules/users/users.module#UsersModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'admin-panel',
                loadChildren: './modules/admin-panel/admin-panel.module#AdminPanelModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'notifications',
                loadChildren: './modules/notifications/notifications.module#NotificationsModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'countries',
                loadChildren: './modules/countries/countries.module#CountriesModule',
                canActivate: [AuthGuard],
            },
            /*{
                path: 'lective-year',
                loadChildren: './modules/lective-year-administration/lective-year.module#LectiveYearModule'
            },*/
            // {
            //     path: 'representative-profile',
            //     loadChildren: './modules/representative-profile/representative-profile.module#RepresentativeProfileModule'
            // },

        ]
    },
    //  {
    //      path: '',
    //      component: AuthLayoutComponent,
    //      children: [{
    //          path: 'pages',
    //          loadChildren: './pages/pages.module#PagesModule'
    //      }]
    //  },
];
