import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SchoolComponent } from './school/school.component';
const routes: Routes = [{
  path: '',
  component: SchoolComponent,
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SchoolRoutingModule { }