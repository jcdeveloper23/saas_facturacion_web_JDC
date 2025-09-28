import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { RegisterProcessComponent } from './register-process/register-process.component';

const routes: Routes = [
  {
    path: '',
    component: RegisterProcessComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RegisterProcessRoutingModule { }
