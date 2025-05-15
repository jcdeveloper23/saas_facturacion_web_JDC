import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ImportsRepresentativesComponent } from './imports-representatives/imports-representatives.component';

const routes: Routes = [
  {
  path:'',
  component : ImportsRepresentativesComponent,
} ];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ImportRoutingModule { }
