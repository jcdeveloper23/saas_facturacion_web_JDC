import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ProviderDeliverOrdersComponent } from './provider-deliver-orders/provider-deliver-orders.component';

const routes: Routes = [
  {
    path: '',
    component: ProviderDeliverOrdersComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProviderDeliverOrdersRoutingModule { }
