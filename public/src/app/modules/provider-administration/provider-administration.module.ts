import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProviderAdministrationComponent } from './provider-administration/provider-administration.component';
import { ProviderAdministrationRoutingModule } from './provider-administration-routing.module';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';


@NgModule({
  declarations: [ProviderAdministrationComponent],
  imports: [
    CommonModule,
    ProviderAdministrationRoutingModule,
    MatSortModule,
    FormsModule,

    /// *** Usado para datatables ***
    MatPaginatorModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
    /// *** Usado para datatables ***

  ]
})
export class ProviderAdministrationModule { }
