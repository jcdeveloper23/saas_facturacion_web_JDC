import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { DriverMonitorComponent } from './driver-monitor/driver-monitor.component';

const routes: Routes = [
  {
    path: '',
    component: DriverMonitorComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DriverMonitorRoutingModule { }
