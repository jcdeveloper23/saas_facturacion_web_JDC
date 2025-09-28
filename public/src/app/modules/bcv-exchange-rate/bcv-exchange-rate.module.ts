import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { BcvExchangeRateRoutingModule } from './bcv-exchange-rate-routing.module';
import { BcvExchangeRateComponent } from './bcv-exchange-rate/bcv-exchange-rate.component';
import { SharedModule } from '../shared/shared.module';
import { HttpClientModule } from '@angular/common/http';


@NgModule({
  declarations: [BcvExchangeRateComponent],
  imports: [
    CommonModule,
    BcvExchangeRateRoutingModule,
    SharedModule,
    HttpClientModule,
  ]
})
export class BcvExchangeRateModule { }
