import {
  Component, Input, Output, EventEmitter, OnInit, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { OrderCustomer } from '../models/catalog-order.interface';

@Component({
  selector: 'app-checkout-customer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './checkout-customer.component.html',
  styleUrl: './checkout-customer.component.scss',
})
export class CheckoutCustomerComponent implements OnInit {
  @Input() initialData: OrderCustomer | null = null;
  @Output() next = new EventEmitter<OrderCustomer>();

  private fb = new FormBuilder();

  form!: FormGroup;
  readonly submitted = signal(false);

  ngOnInit(): void {
    this.form = this.fb.group({
      name:    [this.initialData?.name    ?? '', [Validators.required, Validators.minLength(3)]],
      email:   [this.initialData?.email   ?? '', [Validators.required, Validators.email]],
      phone:   [this.initialData?.phone   ?? '', [Validators.required, Validators.pattern(/^[0-9+\s\-()]{7,15}$/)]],
      address: [this.initialData?.address ?? ''],
      notes:   [this.initialData?.notes   ?? ''],
    });
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!ctrl && ctrl.invalid && (ctrl.touched || this.submitted());
  }

  onSubmit(): void {
    this.submitted.set(true);
    if (this.form.invalid) return;
    this.next.emit(this.form.value as OrderCustomer);
  }
}
