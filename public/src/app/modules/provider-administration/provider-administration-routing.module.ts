import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ProviderAdministrationComponent } from './provider-administration/provider-administration.component';

const routes: Routes = [{
  path: '',
  component: ProviderAdministrationComponent,
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProviderAdministrationRoutingModule { }
