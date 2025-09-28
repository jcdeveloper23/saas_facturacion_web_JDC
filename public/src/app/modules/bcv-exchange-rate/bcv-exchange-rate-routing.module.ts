import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { BcvExchangeRateComponent } from './bcv-exchange-rate/bcv-exchange-rate.component';

const routes: Routes = [
  {
    path: '',
    component: BcvExchangeRateComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class BcvExchangeRateRoutingModule { }
