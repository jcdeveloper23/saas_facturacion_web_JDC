import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { DiscountCouponsComponent } from './discount-coupons/discount-coupons.component';

const routes: Routes = [
  {
    path: '',
    component: DiscountCouponsComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DiscountCouponsRoutingModule { }
