import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgmCoreModule } from '@agm/core';

import { DriverMonitorRoutingModule } from './driver-monitor-routing.module';
import { DriverMonitorComponent } from './driver-monitor/driver-monitor.component';


@NgModule({
  declarations: [DriverMonitorComponent],
  imports: [
    CommonModule,
    DriverMonitorRoutingModule,
    AgmCoreModule
  ]
})
export class DriverMonitorModule { }
