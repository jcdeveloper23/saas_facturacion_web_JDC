import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AppVersionsComponent } from './app-versions/app-versions.component';

const routes: Routes = [
  {
    path: '',
    component: AppVersionsComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AppVersionsRoutingModule { }
