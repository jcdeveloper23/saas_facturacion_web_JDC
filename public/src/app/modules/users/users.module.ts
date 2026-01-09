import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UsersRoutingModule } from './users-routing.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { UsersComponent } from './users/users.component';
import { DocumentLightboxComponent } from './shared/document-lightbox/document-lightbox.component';
import { DocumentUploadComponent } from './shared/document-upload/document-upload.component';
import { NotificationModalComponent } from './shared/notification-modal/notification-modal.component';


@NgModule({
  declarations: [
    UsersComponent,
    DocumentLightboxComponent,
    DocumentUploadComponent,
    NotificationModalComponent
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
