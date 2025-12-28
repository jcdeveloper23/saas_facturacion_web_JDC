import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { CitySearchAnalyticsComponent } from './city-search-analytics/city-search-analytics.component';

const routes: Routes = [
  {
    path: '',
    component: CitySearchAnalyticsComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CitySearchAnalyticsRoutingModule { }
