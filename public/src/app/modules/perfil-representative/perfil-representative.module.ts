import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PerfilRepresentativeRoutingModule } from './perfil-representative-routing.module';
import { ChildrenComponent } from './children/children.component';
import { ProviderCategoryListComponent } from './provider-category-list/provider-category-list.component';
import { TopBarComponent } from './top-bar/top-bar.component';
import { ProductsCategoryComponent } from './products-category/products-category.component';
import { ProductDetailModalComponent } from './product-detail-modal/product-detail-modal.component';
import { FormsModule } from '@angular/forms';
import { RepresentativeStudentComponent } from './representative-student/representative-student.component';
import { RepresentativeProfileComponent } from './representative-profile/representative-profile.component';
import { MatSortModule } from '@angular/material/sort';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldControl, MatFormFieldModule } from '@angular/material/form-field';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { CartDetailComponent } from './cart-detail/cart-detail.component';
import { MatSelectModule } from '@angular/material/select';
import { OrdersCalendarComponent } from './orders-calendar/orders-calendar.component';
import { FullCalendarModule } from '@fullcalendar/angular'; // must go before plugins
import dayGridPlugin from '@fullcalendar/daygrid';
import { OrdersByStudentComponent } from './orders-by-student/orders-by-student.component';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';
import { HttpClientModule } from '@angular/common/http';
import interactionPlugin from '@fullcalendar/interaction';
import { PaymentMethodsComponent } from './payment-methods/payment-methods.component'; // a plugin!

FullCalendarModule.registerPlugins([ // register FullCalendar plugins
  dayGridPlugin,
  interactionPlugin
]);
@NgModule({
  declarations: [
    ChildrenComponent,
    ProviderCategoryListComponent,
    TopBarComponent,
    ProductsCategoryComponent,
    ProductDetailModalComponent,
    RepresentativeStudentComponent,
    RepresentativeProfileComponent,
    CartDetailComponent,
    OrdersCalendarComponent,
    OrdersByStudentComponent,
    PaymentMethodsComponent
  ],
  imports: [
    CommonModule,
    PerfilRepresentativeRoutingModule,
    MatDatepickerModule,
    MatFormFieldModule,
    FormsModule,
    MatSortModule,
    MatNativeDateModule,
    MatInputModule,
    NgbModule,
    MatSelectModule,
    FullCalendarModule,
    MatCheckboxModule,
    JwBootstrapSwitchNg2Module,
    HttpClientModule
  ]
})
export class PerfilRepresentativeModule { }
