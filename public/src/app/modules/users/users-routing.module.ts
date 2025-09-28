import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { NewRequestStudentsComponent } from './new-request-students/new-request-students.component';
import { RepresentativeComponent } from './representative/representative.component';
import { StudentsComponent } from './students/students.component';
import { UsersComponent } from './users/users.component';

const routes: Routes = [
  {
    path: 'representative',
    component: RepresentativeComponent,
  },
  {
    path: 'students',
    component: StudentsComponent,
  },
  {
    path: 'requestStudents',
    component: NewRequestStudentsComponent,
  },
  {
    path: '',
    component: UsersComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UsersRoutingModule { }
