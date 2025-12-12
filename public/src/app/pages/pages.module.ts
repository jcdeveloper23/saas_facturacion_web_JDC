import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { PagesRoutes } from './pages.routing';

import { RegisterComponent } from './register/register.component';
import { LockComponent } from './lock/lock.component';
import { LoginComponent } from './login/login.component';
import { RegisterProviderComponent } from './register-provider/register-provider.component';
import { RegisterRepresentativeComponent } from './register-representative/register-representative.component';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { HomeComponent } from './home/home.component';
import { NavBarHomeComponent } from './nav-bar-home/nav-bar-home.component';
import { TermsComponent } from './terms/terms.component';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { SharedModule } from "app/modules/shared/shared.module";
import { DownloadComponent } from './download/download.component';
import { AdvertisingComponent } from './advertising/advertising.component';
import { DriverTutorialComponent } from './driver-tutorial/driver-tutorial.component';

@NgModule({
    imports: [
        CommonModule,
        RouterModule.forChild(PagesRoutes),
        FormsModule,
        MatSelectModule,
        NgbModule,
        ReactiveFormsModule,
        MatSelectModule,
        MatCheckboxModule,
        SharedModule
    ],
    declarations: [
        LoginComponent,
        RegisterComponent,
        LockComponent,
        RegisterProviderComponent,
        RegisterRepresentativeComponent,
        HomeComponent,
        NavBarHomeComponent,
        TermsComponent,
        TermsComponent,
        DownloadComponent,
        AdvertisingComponent,
        DriverTutorialComponent
    ]
})

export class PagesModule { }
