import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { CartDetailComponent } from './cart-detail/cart-detail.component';
import { ChildrenComponent } from './children/children.component';
import { OrdersByStudentComponent } from './orders-by-student/orders-by-student.component';
import { OrdersCalendarComponent } from './orders-calendar/orders-calendar.component';
import { ProductsCategoryComponent } from './products-category/products-category.component';
import { ProviderCategoryListComponent } from './provider-category-list/provider-category-list.component';
import { RepresentativeProfileComponent } from './representative-profile/representative-profile.component';
import { RepresentativeStudentComponent } from './representative-student/representative-student.component';
import { PaymentMethodsComponent } from './payment-methods/payment-methods.component';

const routes: Routes = [
  {
    path: "",
    component: RepresentativeProfileComponent,
  },
  {
    path: "perfil",
    component: RepresentativeProfileComponent,
  }
  ,
  {
    path: "childrens",
    component: RepresentativeStudentComponent
  },
  {
    path: "paymentMethods",
    component: PaymentMethodsComponent
  },
  {
    path: "listProvider/:student_id",
    component: ChildrenComponent
  },
  {
    path: "student/:student_id/providers/:provider_id",
    component: ProviderCategoryListComponent
  },
  {
    path: "student/:student_id/provider/:provider_id/:category_id",
    component: ProductsCategoryComponent
  },
  {
    path: "student/:student_id/cart-detail",
    component: CartDetailComponent,
  },
  {
    path: "student/:student_id/calendar",
    component: OrdersCalendarComponent,
  },
  {
    path: "listOrders/:student_id",
    component: OrdersByStudentComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PerfilRepresentativeRoutingModule { }
