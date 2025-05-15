import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { from } from 'rxjs';
import { RepresentativeBySuperAdminComponent } from './representative-by-super-admin/representative-by-super-admin.component';
import { StudentsBySuperAdminComponent } from './students-by-super-admin/students-by-super-admin.component';



const routes: Routes = [
  {
    path: 'representative-by-super-admin',
    component: RepresentativeBySuperAdminComponent,
  }, {
    path: 'students-by-super-admin',
    component: StudentsBySuperAdminComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UserBySuperAdminRoutingModule { }