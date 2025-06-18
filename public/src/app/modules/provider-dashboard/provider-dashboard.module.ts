import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProviderDashboardRoutingModule } from './provider-dashboard-routing.module';
import { ProviderDashboardComponent } from './provider-dashboard/provider-dashboard.component';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TagInputModule } from 'ngx-chips';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FullCalendarModule } from '@fullcalendar/angular';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { HttpClientModule } from '@angular/common/http';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  declarations: [ProviderDashboardComponent],
  imports: [
    CommonModule,
    ProviderDashboardRoutingModule,
    ReactiveFormsModule,
        FormsModule,
        TagInputModule,
        JwBootstrapSwitchNg2Module,
        NgbModule,
        MatSortModule,
        MatPaginatorModule,
        MatTableModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        FullCalendarModule,
        MatCheckboxModule,
        HttpClientModule,
        SharedModule
  ]
})
export class ProviderDashboardModule { } 
