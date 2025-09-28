import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CitiesRoutes } from './cities.routing';
/* Components*/
import { CitiesComponent } from './cities/cities.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { JwBootstrapSwitchNg2Module } from 'jw-bootstrap-switch-ng2';
import { AgmCoreModule } from '@agm/core';
import { SharedModule } from '../shared/shared.module';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { LoadingComponent } from '../loading/loading.component';


@NgModule({
  declarations: [CitiesComponent],
  imports: [
    CommonModule,
    RouterModule.forChild(CitiesRoutes),
    FormsModule,
    ReactiveFormsModule,
    JwBootstrapSwitchNg2Module,
    AgmCoreModule.forRoot({ apiKey: 'AIzaSyABbbtwiiybWFt7e1ADeTGN6iGEQ0cRIe4' }),
    /// *** Usado para datatables ***
    MatPaginatorModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    /// *** Usado para datatables ***

    SharedModule
  ]
})
export class CitiesModule {
}
