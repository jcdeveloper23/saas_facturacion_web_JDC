import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ProviderDashboardComponent } from './provider-dashboard/provider-dashboard.component';

const routes: Routes = [
  {
    path: '',
    component: ProviderDashboardComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProviderDashboardRoutingModule { }
