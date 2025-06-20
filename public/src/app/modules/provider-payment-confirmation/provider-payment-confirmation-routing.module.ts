import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ProviderPaymentConfirmationComponent } from './provider-payment-confirmation/provider-payment-confirmation.component';

const routes: Routes = [
  {
    path: '',
    component: ProviderPaymentConfirmationComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProviderPaymentConfirmationRoutingModule { }
