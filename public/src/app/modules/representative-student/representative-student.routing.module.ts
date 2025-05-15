import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { RepresentativeStudentComponent } from './representative-student/representative-student.component';

 const routes: Routes = [{
//   path: '',
//   component: RepresentativeStudentComponent,
 }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RepresentativeStudentRoutingModule { }