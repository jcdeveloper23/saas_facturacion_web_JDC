import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, FormModule, SpinnerModule
} from '@coreui/angular';

import { SchoolOrderService } from '../services/school-order.service';
import { SchoolOrder, SchoolOrderStatus } from '../models';

@Component({
  selector: 'app-school-orders-board',
  standalone: true,
  imports: [
    CommonModule,
    CardModule, ButtonModule, GridModule, BadgeModule, FormModule, SpinnerModule
  ],
  templateUrl: './school-orders-board.component.html'
})
export class SchoolOrdersBoardComponent implements OnInit {
  private orderService = inject(SchoolOrderService);

  orders       = signal<SchoolOrder[]>([]);
  selectedDate = signal<string>(new Date().toISOString().split('T')[0]);
  processingId = signal<string | null>(null);

  pending   = computed(() => this.orders().filter(o => o.status === 'pending'));
  confirmed = computed(() => this.orders().filter(o => o.status === 'confirmed'));
  preparing = computed(() => this.orders().filter(o => o.status === 'preparing'));
  ready     = computed(() => this.orders().filter(o => o.status === 'ready'));

  readonly statusColor: Record<SchoolOrderStatus, string> = {
    pending:     'secondary',
    confirmed:   'info',
    preparing:   'warning',
    ready:       'success',
    delivered:   'primary',
    undelivered: 'danger',
    cancelled:   'dark',
    refunded:    'light'
  };

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    this.orderService.getOrdersForDate(this.selectedDate())
      .subscribe(o => this.orders.set(o));
  }

  onDateChange(date: string): void {
    this.selectedDate.set(date);
    this.loadOrders();
  }

  async advance(order: SchoolOrder): Promise<void> {
    this.processingId.set(order.id!);
    try {
      switch (order.status) {
        case 'pending':   await this.orderService.confirmOrder(order.id!);  break;
        case 'confirmed': await this.orderService.markPreparing(order.id!); break;
        case 'preparing': await this.orderService.markReady(order.id!);     break;
        case 'ready':     await this.orderService.markDelivered(order);     break;
      }
    } finally {
      this.processingId.set(null);
    }
  }

  async cancel(id: string): Promise<void> {
    if (!confirm('¿Cancelar esta orden?')) return;
    await this.orderService.cancelOrder(id);
  }

  nextActionLabel(status: SchoolOrderStatus): string {
    const labels: Partial<Record<SchoolOrderStatus, string>> = {
      pending:   'Confirmar',
      confirmed: 'Preparar',
      preparing: 'Lista',
      ready:     'Entregar'
    };
    return labels[status] ?? '';
  }
}
