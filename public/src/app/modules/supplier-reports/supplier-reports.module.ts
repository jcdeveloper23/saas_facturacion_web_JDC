import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SupplierReportsRoutingModule } from './supplier-reports-routing.module';
import { OrdersProviderComponent } from './orders-provider/orders-provider.component';
import { ReportProviderComponent } from './report-provider/report-provider.component';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatSortModule } from '@angular/material/sort';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import {MatCheckboxModule} from '@angular/material/checkbox';
import { OrdersDeliveredComponent } from './orders-provider/orders-delivered/orders-delivered.component';
import { NgQrScannerModule } from 'angular2-qrscanner';
import { OrdersConfirmationPendingComponent } from './orders-provider/orders-confirmation-pending/orders-confirmation-pending.component';
import { NgxQRCodeModule } from '@techiediaries/ngx-qrcode';
import { MatTableExporterModule } from 'mat-table-exporter';
import html2canvas from 'html2canvas';


@NgModule({
  declarations: [OrdersProviderComponent, ReportProviderComponent, OrdersDeliveredComponent, OrdersConfirmationPendingComponent],
  imports: [
    CommonModule,
    SupplierReportsRoutingModule,
    MatDatepickerModule,
    MatFormFieldModule,
    FormsModule,
    MatSortModule,
    MatNativeDateModule,
    MatInputModule,
    NgbModule,
    MatSelectModule,
    MatPaginatorModule,
    MatTableModule,
    MatCheckboxModule,
    MatDatepickerModule,
    NgQrScannerModule,
    NgxQRCodeModule,
    MatTableExporterModule,

  ]
})
export class SupplierReportsModule { }
