import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RepresentativeStudentRoutingModule } from './representative-student.routing.module';

import { MatSelectModule } from '@angular/material/select';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RepresentativeStudentRoutingModule,
    MatSelectModule,
    JwBootstrapSwitchNg2Module,
  ]
})
export class RepresentativeStudentModule { }
