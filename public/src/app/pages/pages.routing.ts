import { Routes } from '@angular/router';

import { RegisterComponent } from './register/register.component';
import { LoginComponent } from './login/login.component';
import { HomeComponent } from './home/home.component';
import { TermsComponent } from './terms/terms.component';

export const PagesRoutes: Routes = [{
    path: '',
    children: [{
        path: '',
        component: HomeComponent
    }, {
        path: 'login',
        component: LoginComponent
    },
    {
        path: 'register',
        component: RegisterComponent
    },
    {
        path: 'terms',
        component: TermsComponent
    }
    ]
}];
