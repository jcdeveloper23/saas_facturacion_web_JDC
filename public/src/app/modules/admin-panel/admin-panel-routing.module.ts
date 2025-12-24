import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AdminPanelComponent } from './admin-panel/admin-panel.component';
import { AdminTripsManageComponent } from './admin-trips-manage/admin-trips-manage.component';
import { AdminTripsStatsComponent } from './admin-trips-stats/admin-trips-stats.component';

const routes: Routes = [
  { path: '', component: AdminPanelComponent },
  { path: 'admin-trips', component: AdminTripsManageComponent },
  { path: 'admin-trips-stats', component: AdminTripsStatsComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminPanelRoutingModule { }
