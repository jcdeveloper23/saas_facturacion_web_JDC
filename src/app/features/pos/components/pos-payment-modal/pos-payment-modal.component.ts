import {
  Component, Input, Output, EventEmitter, signal, computed, OnInit, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalModule, ButtonModule } from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { PosPayment, PosPaymentMethod, POS_PAYMENT_METHODS } from '../../models/pos.interface';

interface PaymentSlot {
  method: PosPaymentMethod;
  label: string;
  icon: string;
  amount: number;
  reference: string;
}

@Component({
  selector: 'app-pos-payment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalModule, ButtonModule, IconModule],
  templateUrl: './pos-payment-modal.component.html',
  styleUrl: './pos-payment-modal.component.scss'
})
export class PosPaymentModalComponent implements OnInit, OnChanges {
  @Input() visible = false;
  @Input({ required: true }) total = 0;
  @Output() confirmed = new EventEmitter<PosPayment[]>();
  @Output() cancelled = new EventEmitter<void>();

  readonly methods = POS_PAYMENT_METHODS;

  // Slots de pago (pago mixto)
  readonly slots = signal<PaymentSlot[]>([
    { method: 'cash', label: 'Efectivo', icon: 'cilCash', amount: 0, reference: '' }
  ]);

  // Para cálculo rápido de efectivo
  readonly quickAmounts = [1, 5, 10, 20, 50, 100];

  readonly totalPaid = computed(() =>
    this.slots().reduce((s, p) => s + (p.amount || 0), 0)
  );

  readonly remaining = computed(() =>
    Math.max(0, Math.round((this.total - this.totalPaid()) * 100) / 100)
  );

  readonly change = computed(() =>
    Math.max(0, Math.round((this.totalPaid() - this.total) * 100) / 100)
  );

  readonly canConfirm = computed(() =>
    this.totalPaid() >= this.total && this.slots().every(s => s.amount > 0)
  );

  ngOnInit(): void {
    this.resetSlots();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Resetear slots cada vez que el modal se abre
    if (changes['visible']?.currentValue === true) {
      this.resetSlots();
    }
  }

  private resetSlots(): void {
    this.slots.set([
      { method: 'cash', label: 'Efectivo', icon: 'cilCash', amount: this.total, reference: '' }
    ]);
  }

  addSlot(method: PosPaymentMethod): void {
    const existing = this.slots().find(s => s.method === method);
    if (existing) return;

    const def = POS_PAYMENT_METHODS.find(m => m.method === method)!;
    this.slots.update(s => [
      ...s.map(sl => ({ ...sl, amount: 0 })), // reset others when adding new
      { method, label: def.label, icon: def.icon, amount: this.remaining(), reference: '' }
    ]);
  }

  removeSlot(method: PosPaymentMethod): void {
    if (this.slots().length <= 1) return;
    this.slots.update(s => s.filter(sl => sl.method !== method));
    this.rebalance();
  }

  updateAmount(method: PosPaymentMethod, value: number): void {
    this.slots.update(s =>
      s.map(sl => sl.method === method ? { ...sl, amount: Math.max(0, value) } : sl)
    );
  }

  setExactAmount(method: PosPaymentMethod): void {
    const rem = this.remaining() + (this.slots().find(s => s.method === method)?.amount ?? 0);
    this.updateAmount(method, rem);
  }

  addQuickAmount(method: PosPaymentMethod, amount: number): void {
    const current = this.slots().find(s => s.method === method)?.amount ?? 0;
    this.updateAmount(method, current + amount);
  }

  private rebalance(): void {
    // Distribuir el total entre los slots restantes
    const slots  = this.slots();
    if (slots.length === 1) {
      this.updateAmount(slots[0].method, this.total);
    }
  }

  confirm(): void {
    if (!this.canConfirm()) return;
    const payments: PosPayment[] = this.slots().map(s => ({
      method:      s.method,
      methodLabel: s.label,
      amount:      s.amount,
      ...(s.reference ? { reference: s.reference } : {}),
      sriCode:     POS_PAYMENT_METHODS.find(m => m.method === s.method)?.sriCode ?? '',
    }));
    // Si hay cambio, reducir el efectivo por el cambio
    const cashSlot = payments.find(p => p.method === 'cash');
    if (cashSlot && this.change() > 0) {
      cashSlot.amount = Math.round((cashSlot.amount - this.change()) * 100) / 100;
    }
    this.confirmed.emit(payments);
  }

  hasSlot(method: PosPaymentMethod): boolean {
    return this.slots().some(s => s.method === method);
  }

  onVisibleChange(visible: boolean): void {
    if (!visible) this.cancelled.emit();
  }
}
