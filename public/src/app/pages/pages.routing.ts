import { Routes } from '@angular/router';

import { RegisterComponent } from './register/register.component';
import { LockComponent } from './lock/lock.component';
import { LoginComponent } from './login/login.component';
import { RegisterProviderComponent } from './register-provider/register-provider.component';
import { RegisterRepresentativeComponent } from './register-representative/register-representative.component';
import { HomeComponent } from './home/home.component';
import { TermsComponent } from './terms/terms.component';
import { DownloadComponent } from './download/download.component';

export const PagesRoutes: Routes = [{
    path: '',
    children: [ {
        path: '',
        component: HomeComponent
    },{
        path: 'login',
        component: LoginComponent
    },
    {
        path: 'register',
        component: RegisterComponent
    },
    {
        path: 'register-provider',
        component: RegisterProviderComponent
    },
    {
        path: 'register/:school_id/:representative_id',
        component: RegisterRepresentativeComponent
    },
    {
        path: 'terms',
        component: TermsComponent
    },
    {
        path: 'download',
        component: DownloadComponent
    },
    {
        path: 'register/:school_id',
        component: RegisterRepresentativeComponent
    },
]
}];
