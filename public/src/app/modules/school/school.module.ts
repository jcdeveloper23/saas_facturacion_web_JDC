import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SchoolComponent } from './school/school.component';
import { Routes } from '@angular/router';
import { SchoolRoutingModule } from './school.routing.module';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';
import { LectiveYearComponent } from './lective-year/lective-year.component';

const routes: Routes = [{
  path: '',
  component: SchoolComponent,
}];

@NgModule({

  declarations: [SchoolComponent, LectiveYearComponent],
  imports: [
    CommonModule,
    SchoolRoutingModule,
    MatSortModule,
    FormsModule,

    /// *** Usado para datatables ***
    MatPaginatorModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    /// *** Usado para datatables ***

    JwBootstrapSwitchNg2Module
  ]
})
export class SchoolModule { }
