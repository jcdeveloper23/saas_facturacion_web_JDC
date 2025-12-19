import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UsersRoutingModule } from './users-routing.module';
import { RepresentativeComponent } from './representative/representative.component';
import { StudentsComponent } from './students/students.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NewRequestStudentsComponent } from './new-request-students/new-request-students.component';
import { UsersComponent } from './users/users.component';
import { UserDetailComponent } from './user-detail/user-detail.component';
import { DocumentLightboxComponent } from './shared/document-lightbox/document-lightbox.component';
import { CommissionEditorComponent } from './shared/commission-editor/commission-editor.component';


@NgModule({
  declarations: [
    RepresentativeComponent,
    StudentsComponent,
    NewRequestStudentsComponent,
    UsersComponent,
    UserDetailComponent,
    DocumentLightboxComponent,
    CommissionEditorComponent
  ],
  imports: [
    CommonModule,
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
export class UsersModule { }
