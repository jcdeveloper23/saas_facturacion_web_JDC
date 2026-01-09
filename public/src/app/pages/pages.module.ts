import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { PagesRoutes } from './pages.routing';

import { RegisterComponent } from './register/register.component';
import { LoginComponent } from './login/login.component';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { HomeComponent } from './home/home.component';
import { NavBarHomeComponent } from './nav-bar-home/nav-bar-home.component';
import { TermsComponent } from './terms/terms.component';

@NgModule({
    imports: [
        CommonModule,
        RouterModule.forChild(PagesRoutes),
        FormsModule,
        NgbModule,
        ReactiveFormsModule
    ],
    declarations: [
        LoginComponent,
        RegisterComponent,
        HomeComponent,
        NavBarHomeComponent,
        TermsComponent
    ]
})

export class PagesModule { }
