import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HelpCategoriesComponent } from './help-categories/help-categories.component';

const routes: Routes = [
  {
    path: '',
    component: HelpCategoriesComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HelpCategoriesRoutingModule { }
