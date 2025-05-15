import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { OrdersProviderComponent } from './orders-provider/orders-provider.component';
import { ReportProviderComponent } from './report-provider/report-provider.component';

const routes: Routes = [
  {
    path : "orders" ,
    component : OrdersProviderComponent,
  },
  {
    path : "report" ,
    component : ReportProviderComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SupplierReportsRoutingModule { }
