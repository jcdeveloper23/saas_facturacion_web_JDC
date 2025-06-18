import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { CouponsComponent } from './coupons/coupons.component';
import { GroupsComponent } from './groups/groups.component';
import { LinesComponent } from './lines/lines.component';
import { ProductsComponent } from './products/products.component';
import { UploadProductsComponent } from './upload-products/upload-products.component';
import { AdminProductsComponent } from './admin-products/admin-products.component';

const routes: Routes = [{
  path:'lines',
  component : LinesComponent,
}, {
  path:'groups',
  component : GroupsComponent,
} , {
  path:'admin-products',
  component : AdminProductsComponent,
} , {
  path:'upload',
  component : UploadProductsComponent,
},{
  path:'coupons',
  component : CouponsComponent,
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class InventoryRoutingModule { }
