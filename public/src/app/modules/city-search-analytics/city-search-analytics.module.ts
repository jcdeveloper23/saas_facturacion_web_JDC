import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CitySearchAnalyticsRoutingModule } from './city-search-analytics-routing.module';
import { CitySearchAnalyticsComponent } from './city-search-analytics/city-search-analytics.component';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { SharedModule } from '../shared/shared.module';
import { AgmCoreModule } from '@agm/core';


@NgModule({
  declarations: [CitySearchAnalyticsComponent],
  imports: [
    CommonModule,
    CitySearchAnalyticsRoutingModule,
    FormsModule,
    MatPaginatorModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSortModule,
    SharedModule,
    AgmCoreModule
  ]
})
export class CitySearchAnalyticsModule { }
