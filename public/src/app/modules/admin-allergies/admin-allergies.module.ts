import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminAllergiesRoutingModule } from './admin-allergies-routing.module';
import { FormsModule } from '@angular/forms';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { LoadingComponent } from '../loading/loading.component';
import { SharedModule } from '../shared/shared.module';
import { AdminAllergiesComponent } from './admin-allergies/admin-allergies.component';


@NgModule({
  declarations: [AdminAllergiesComponent],
  imports: [
    CommonModule,
    AdminAllergiesRoutingModule,
    FormsModule,
    /// *** Usado para datatables ***
    MatPaginatorModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    /// *** Usado para datatables ***
    SharedModule
  ]
})
export class AdminAllergiesModule { }
