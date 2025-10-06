import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AppVersionsRoutingModule } from './app-versions-routing.module';
import { AppVersionsComponent } from './app-versions/app-versions.component';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule } from '@angular/material/paginator';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';
import { SharedModule } from '../shared/shared.module';


@NgModule({
  declarations: [AppVersionsComponent],
  imports: [
    CommonModule,
    AppVersionsRoutingModule,
    FormsModule,

    /// *** Usado para datatables ***
    MatPaginatorModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    /// *** Usado para datatables ***

    JwBootstrapSwitchNg2Module,
    SharedModule
  ]
})
export class AppVersionsModule { }
