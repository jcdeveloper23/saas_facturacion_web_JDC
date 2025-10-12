import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HelpQuestionsComponent } from './help-questions/help-questions.component';

const routes: Routes = [
  {
    path: '',
    component: HelpQuestionsComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HelpQuestionsRoutingModule { }
