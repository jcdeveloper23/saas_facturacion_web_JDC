import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';
import { SharedModule } from '../shared/shared.module';

import { HelpQuestionsRoutingModule } from './help-questions-routing.module';
import { HelpQuestionsComponent } from './help-questions/help-questions.component';

@NgModule({
  declarations: [HelpQuestionsComponent],
  imports: [
    CommonModule,
    HelpQuestionsRoutingModule,
    FormsModule,
    ReactiveFormsModule,
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
    MatChipsModule,
    MatAutocompleteModule,
    // Other modules
    JwBootstrapSwitchNg2Module,
    SharedModule
  ]
})
export class HelpQuestionsModule { }
