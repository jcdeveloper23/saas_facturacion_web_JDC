import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AdminAllergiesComponent } from './admin-allergies/admin-allergies.component';

const routes: Routes = [
  {
    path: '',
    component: AdminAllergiesComponent,
  }
];
@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminAllergiesRoutingModule { }
