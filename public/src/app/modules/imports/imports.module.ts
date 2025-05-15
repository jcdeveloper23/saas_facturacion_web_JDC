import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImportsRepresentativesComponent } from './imports-representatives/imports-representatives.component';
import { ImportRoutingModule } from './imports-routing.module';



@NgModule({
  declarations: [ImportsRepresentativesComponent],
  imports: [
    CommonModule,
    ImportRoutingModule
  ]
})
export class ImportsModule { }
