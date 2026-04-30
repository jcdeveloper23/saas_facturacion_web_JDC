import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  OrderCustomer,
  CatalogPaymentMethod,
  PAYMENT_METHOD_LABELS,
} from '../models/catalog-order.interface';

@Component({
  selector: 'app-checkout-confirm',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './checkout-confirm.component.html',
  styleUrl: './checkout-confirm.component.scss',
})
export class CheckoutConfirmComponent {
  @Input({ required: true }) customerData!: OrderCustomer;
  @Input({ required: true }) paymentMethod!: CatalogPaymentMethod;
  @Input() proofFile: File | null = null;
  @Input() processing = false;
  @Input() errorMsg: string | null = null;

  @Output() back    = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  readonly paymentLabels = PAYMENT_METHOD_LABELS;

  getProofPreview(): string | null {
    if (!this.proofFile || this.proofFile.type === 'application/pdf') return null;
    return URL.createObjectURL(this.proofFile);
  }
}
