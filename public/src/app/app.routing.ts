import { Routes } from '@angular/router';

import { AdminLayoutComponent } from './layouts/admin/admin-layout.component';
import { AuthLayoutComponent } from './layouts/auth/auth-layout.component';
import { IndexLayoutComponent } from './layouts/index-layout/index-layout.component';

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
        //     {
        //     path: '',
        //     loadChildren: './dashboard/dashboard.module#DashboardModule'
        // },
        // {
        //     path: 'components',
        //     loadChildren: './components/components.module#ComponentsModule'
        // }, {
        //     path: 'forms',
        //     loadChildren: './forms/forms.module#Forms'
        // }, {
        //     path: 'tables',
        //     loadChildren: './tables/tables.module#TablesModule'
        // }, {
        //     path: 'maps',
        //     loadChildren: './maps/maps.module#MapsModule'
        // }, {
        //     path: 'charts',
        //     loadChildren: './charts/charts.module#ChartsModule'
        // }, {
        //     path: 'calendar',
        //     loadChildren: './calendar/calendar.module#CalendarModule'
        // },
        // {
        //     path: '',
        //     loadChildren: './userpage/user.module#UserModule'
        // }, {
        //     path: '',
        //     loadChildren: './timeline/timeline.module#TimelineModule'
        // }, {
        //     path: '',
        //     loadChildren: './widgets/widgets.module#WidgetsModule'
        // },
        {
            path: 'imports-representative',
            loadChildren: './modules/imports/imports.module#ImportsModule'
        },
        {
            path: 'perfil',
            loadChildren: './modules/provider/provider.module#ProviderModule'
        },
        {
            path: 'inventory',
            loadChildren: './modules/inventory/inventory.module#InventoryModule'
        },
        {
            path: 'provider-administration',
            loadChildren: './modules/provider-administration/provider-administration.module#ProviderAdministrationModule'
        }, {
            path: 'school',
            loadChildren: './modules/school/school.module#SchoolModule'
        }, {
            path: 'representative-student',
            loadChildren: './modules/representative-student/representative-student.module#RepresentativeStudentModule'
        }, {
            path: 'users',
            loadChildren: './modules/users/users.module#UsersModule'
        }, {
            path: 'perfil-representative',
            loadChildren: './modules/perfil-representative/perfil-representative.module#PerfilRepresentativeModule'
        },
        {
            path: 'perfil-representative/childrens',
            loadChildren: './modules/perfil-representative/perfil-representative.module#PerfilRepresentativeModule'
        },
        {
            path: 'scanner',
            loadChildren: './modules/scanner/scanner.module#ScannerModule'
        },
        {
            path: 'supplie-reports',
            loadChildren: './modules/supplier-reports/supplier-reports.module#SupplierReportsModule'
        },
        {
            path: 'user-by-super-admin',
            loadChildren: './modules/user-by-super-admin/user-by-super-admin.module#UserBySuperAdminModule'
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
