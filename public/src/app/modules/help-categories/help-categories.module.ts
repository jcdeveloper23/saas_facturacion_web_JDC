import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';
import { SharedModule } from '../shared/shared.module';

import { HelpCategoriesRoutingModule } from './help-categories-routing.module';
import { HelpCategoriesComponent } from './help-categories/help-categories.component';

@NgModule({
  declarations: [HelpCategoriesComponent],
  imports: [
    CommonModule,
    HelpCategoriesRoutingModule,
    FormsModule,
    // Material Design Modules
    MatPaginatorModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSortModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    // Other modules
    JwBootstrapSwitchNg2Module,
    SharedModule
  ]
})
export class HelpCategoriesModule { }
