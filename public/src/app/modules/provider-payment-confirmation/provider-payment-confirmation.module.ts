import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProviderPaymentConfirmationRoutingModule } from './provider-payment-confirmation-routing.module';
import { ProviderPaymentConfirmationComponent } from './provider-payment-confirmation/provider-payment-confirmation.component';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { SharedModule } from '../shared/shared.module';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSortModule } from '@angular/material/sort';
import { MatNativeDateModule } from '@angular/material/core';
import { NgQrScannerModule } from 'angular2-qrscanner';
import { NgxQRCodeModule } from '@techiediaries/ngx-qrcode';
import { MatTableExporterModule } from 'mat-table-exporter';


@NgModule({
  declarations: [ProviderPaymentConfirmationComponent],
  imports: [
    CommonModule,
    ProviderPaymentConfirmationRoutingModule,
    /// *** Usado para datatables ***
    MatPaginatorModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    /// *** Usado para datatables ***
    SharedModule,
    MatCheckboxModule,
    ReactiveFormsModule,
    FormsModule,
    MatDatepickerModule,
    MatSortModule,
    MatNativeDateModule,
    NgbModule,
    NgQrScannerModule,
    NgxQRCodeModule,
    MatTableExporterModule,
  ]
})
export class ProviderPaymentConfirmationModule { }
