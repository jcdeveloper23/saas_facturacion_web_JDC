import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { DiscountCouponsRoutingModule } from './discount-coupons-routing.module';
import { DiscountCouponsComponent } from './discount-coupons/discount-coupons.component';

@NgModule({
    declarations: [
        DiscountCouponsComponent
    ],
    imports: [
        CommonModule,
        DiscountCouponsRoutingModule,
        FormsModule,
        ReactiveFormsModule,
        MatSortModule,
        MatPaginatorModule,
        MatTableModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatCheckboxModule,
        MatChipsModule,
        MatIconModule
    ]
})
export class DiscountCouponsModule { }
