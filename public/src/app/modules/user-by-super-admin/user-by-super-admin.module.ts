import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RepresentativeBySuperAdminComponent } from './representative-by-super-admin/representative-by-super-admin.component';

import { StudentsBySuperAdminComponent } from './students-by-super-admin/students-by-super-admin.component';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';
import { UsersRoutingModule } from '../users/users-routing.module';
import { UserBySuperAdminRoutingModule } from './user-by-super-admin-routing.module';



@NgModule({
  declarations: [RepresentativeBySuperAdminComponent, StudentsBySuperAdminComponent],
  imports: [
    CommonModule,
    UserBySuperAdminRoutingModule,
    UsersRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    JwBootstrapSwitchNg2Module,
    MatSortModule,
    MatPaginatorModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ]
})
export class UserBySuperAdminModule { }
