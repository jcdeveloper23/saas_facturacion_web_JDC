import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AdminPanelRoutingModule } from './admin-panel-routing.module';
import { AdminPanelComponent } from './admin-panel/admin-panel.component';


@NgModule({
  declarations: [
    AdminPanelComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    AdminPanelRoutingModule
  ]
})
export class AdminPanelModule { }
