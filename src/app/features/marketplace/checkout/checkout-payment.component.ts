import {
  Component, Input, Output, EventEmitter, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CatalogPaymentMethod } from '../models/catalog-order.interface';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

interface PaymentOption {
  method: CatalogPaymentMethod;
  label: string;
  description: string;
  icon: string;
  available: boolean;
  comingSoon: boolean;
}

@Component({
  selector: 'app-checkout-payment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './checkout-payment.component.html',
  styleUrl: './checkout-payment.component.scss',
})
export class CheckoutPaymentComponent {
  @Input() set paymentMethod(v: CatalogPaymentMethod) { this.selected.set(v); }
  @Input() set proofFile(v: File | null)              { this.file.set(v); }

  @Output() back = new EventEmitter<void>();
  @Output() next = new EventEmitter<{ method: CatalogPaymentMethod; file: File | null }>();

  readonly selected  = signal<CatalogPaymentMethod>('transfer');
  readonly file      = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);
  readonly dragOver  = signal(false);

  readonly options: PaymentOption[] = [
    {
      method:      'transfer',
      label:       'Transferencia bancaria',
      description: 'Realiza una transferencia y adjunta el comprobante.',
      icon:        'bank',
      available:   true,
      comingSoon:  false,
    },
    {
      method:      'cash_on_delivery',
      label:       'Pago contra entrega',
      description: 'Paga en efectivo al recibir tu pedido.',
      icon:        'package',
      available:   true,
      comingSoon:  false,
    },
    {
      method:      'card',
      label:       'Tarjeta de crédito/débito',
      description: 'Visa, Mastercard, Diners.',
      icon:        'card',
      available:   false,
      comingSoon:  true,
    },
  ];

  readonly needsProof = computed(() => this.selected() === 'transfer');

  readonly canContinue = computed(() => {
    if (this.selected() === 'transfer') return this.file() !== null;
    return true;
  });

  selectMethod(method: CatalogPaymentMethod, available: boolean): void {
    if (!available) return;
    this.selected.set(method);
    if (method !== 'transfer') {
      this.file.set(null);
      this.fileError.set(null);
    }
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.handleFile(f);
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const f = event.dataTransfer?.files?.[0] ?? null;
    this.handleFile(f);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(): void { this.dragOver.set(false); }

  removeFile(): void {
    this.file.set(null);
    this.fileError.set(null);
  }

  private handleFile(f: File | null): void {
    this.fileError.set(null);
    if (!f) return;

    if (!ACCEPTED_TYPES.includes(f.type)) {
      this.fileError.set('Solo se aceptan imágenes (JPG, PNG, WEBP) o PDF.');
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      this.fileError.set('El archivo no puede superar los 5 MB.');
      return;
    }
    this.file.set(f);
  }

  getPreviewUrl(): string | null {
    const f = this.file();
    if (!f || f.type === 'application/pdf') return null;
    return URL.createObjectURL(f);
  }

  onNext(): void {
    if (!this.canContinue()) return;
    this.next.emit({ method: this.selected(), file: this.file() });
  }
}
