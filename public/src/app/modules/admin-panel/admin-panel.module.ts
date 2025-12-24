import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AdminPanelRoutingModule } from './admin-panel-routing.module';
import { AdminPanelComponent } from './admin-panel/admin-panel.component';
import { AdminTripsManageComponent } from './admin-trips-manage/admin-trips-manage.component';
import { AdminTripsStatsComponent } from './admin-trips-stats/admin-trips-stats.component';


@NgModule({
  declarations: [
    AdminPanelComponent,
    AdminTripsManageComponent,
    AdminTripsStatsComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    AdminPanelRoutingModule
  ]
})
export class AdminPanelModule { }
