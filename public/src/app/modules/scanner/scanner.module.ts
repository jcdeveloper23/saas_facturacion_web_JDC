import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScannerComponent } from './scanner/scanner.component';
import { RouterModule, Routes } from '@angular/router';
import { NgQrScannerModule } from 'angular2-qrscanner';


const routes: Routes = [{
  path: '',
  component: ScannerComponent,
 }]; 
@NgModule({
  declarations: [ScannerComponent],
  imports: [
    CommonModule,
    RouterModule.forChild(routes),
    NgQrScannerModule
  ]
})
export class ScannerModule { }
