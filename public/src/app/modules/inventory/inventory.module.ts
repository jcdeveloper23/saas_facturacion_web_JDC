import { NgModule  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InventoryRoutingModule } from './inventory-routing.module';
import { LinesComponent } from './lines/lines.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TagInputModule } from 'ngx-chips';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { GroupsComponent } from './groups/groups.component';
import { ProductsComponent } from './products/products.component';
import { UploadProductsComponent } from './upload-products/upload-products.component';
import { CouponsComponent } from './coupons/coupons.component';
import { FullCalendarModule } from '@fullcalendar/angular';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { HttpClientModule } from '@angular/common/http';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { AdminProductsComponent } from './admin-products/admin-products.component'; // a plugin!
import { SharedModule } from '../shared/shared.module';

FullCalendarModule.registerPlugins([ // register FullCalendar plugins
  dayGridPlugin,
  interactionPlugin
]);
@NgModule({
  declarations: [LinesComponent, GroupsComponent, ProductsComponent, UploadProductsComponent, CouponsComponent, AdminProductsComponent],
  imports: [
    CommonModule,
    InventoryRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    TagInputModule,
    JwBootstrapSwitchNg2Module,
    NgbModule,
    MatSortModule,
    MatPaginatorModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    FullCalendarModule,
    MatCheckboxModule,
    HttpClientModule,
    SharedModule
  ],


})
export class InventoryModule { }
