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
                path: 'appVersions',
                loadChildren: './modules/app-versions/app-versions.module#AppVersionsModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'registerProcess',
                loadChildren: './modules/register-process/register-process.module#RegisterProcessModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'categories',
                loadChildren: './modules/categories/categories.module#CategoriesModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'cities',
                loadChildren: './modules/cities/cities.module#CitiesModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'help',
                loadChildren: './modules/help-categories/help-categories.module#HelpCategoriesModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'help-questions',
                loadChildren: './modules/help-questions/help-questions.module#HelpQuestionsModule',
                canActivate: [AuthGuard],
            },

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
                loadChildren: './modules/imports/imports.module#ImportsModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'dashboard',
                loadChildren: './modules/provider-dashboard/provider-dashboard.module#ProviderDashboardModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'deliverOrders',
                loadChildren: './modules/provider-deliver-orders/provider-deliver-orders.module#ProviderDeliverOrdersModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'paymentConfirmation',
                loadChildren: './modules/provider-payment-confirmation/provider-payment-confirmation.module#ProviderPaymentConfirmationModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'perfil',
                loadChildren: './modules/provider/provider.module#ProviderModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'inventory',
                loadChildren: './modules/inventory/inventory.module#InventoryModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'provider-administration',
                loadChildren: './modules/provider-administration/provider-administration.module#ProviderAdministrationModule',
                canActivate: [AuthGuard],
            }, {
                path: 'school',
                loadChildren: './modules/school/school.module#SchoolModule',
                canActivate: [AuthGuard],
            }, {
                path: 'representative-student',
                loadChildren: './modules/representative-student/representative-student.module#RepresentativeStudentModule',
                canActivate: [AuthGuard],
            }, {
                path: 'users',
                loadChildren: './modules/users/users.module#UsersModule',
                canActivate: [AuthGuard],
            }, {
                path: 'perfil-representative',
                loadChildren: './modules/perfil-representative/perfil-representative.module#PerfilRepresentativeModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'perfil-representative/childrens',
                loadChildren: './modules/perfil-representative/perfil-representative.module#PerfilRepresentativeModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'scanner',
                loadChildren: './modules/scanner/scanner.module#ScannerModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'supplie-reports',
                loadChildren: './modules/supplier-reports/supplier-reports.module#SupplierReportsModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'user-by-super-admin',
                loadChildren: './modules/user-by-super-admin/user-by-super-admin.module#UserBySuperAdminModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'countries',
                loadChildren: './modules/countries/countries.module#CountriesModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'allergies',
                loadChildren: './modules/admin-allergies/admin-allergies.module#AdminAllergiesModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'bcvRate',
                loadChildren: './modules/bcv-exchange-rate/bcv-exchange-rate.module#BcvExchangeRateModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'paymentMethod',
                loadChildren: './modules/payment-method/payment-method.module#PaymentMethodModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'recharges',
                loadChildren: './modules/recharges/recharges.module#RechargesModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'admin-panel',
                loadChildren: './modules/admin-panel/admin-panel.module#AdminPanelModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'admin-tutorial',
                loadChildren: './modules/admin-tutorial/admin-tutorial.module#AdminTutorialModule',
                canActivate: [AuthGuard],
            },
            {
                path: 'discount-coupons',
                loadChildren: './modules/discount-coupons/discount-coupons.module#DiscountCouponsModule',
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
