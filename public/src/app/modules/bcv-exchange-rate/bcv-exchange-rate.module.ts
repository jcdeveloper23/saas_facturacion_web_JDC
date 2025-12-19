import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';
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
    FormsModule
  ]
})
export class BcvExchangeRateModule { }
