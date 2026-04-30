import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CardModule, ButtonModule, BadgeModule, SpinnerModule,
  TableModule, ModalModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { TenantService }      from '../../../core/services/tenant.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CatalogOrderService } from '../services/catalog-order.service';
import {
  CatalogOrder,
  CatalogOrderStatus,
  CatalogPaymentStatus,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../models/catalog-order.interface';

// ─── Local color maps ─────────────────────────────────────────────────────────

const ORDER_STATUS_COLORS: Record<CatalogOrderStatus, string> = {
  new:        'info',
  processing: 'warning',
  shipped:    'primary',
  completed:  'success',
  cancelled:  'danger',
};

const PAYMENT_STATUS_COLORS: Record<CatalogPaymentStatus, string> = {
  pending:        'warning',
  proof_uploaded: 'info',
  confirmed:      'success',
  rejected:       'danger',
};

@Component({
  selector: 'app-marketplace-orders',
  standalone: true,
  templateUrl: './marketplace-orders.component.html',
  styleUrl:    './marketplace-orders.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CardModule,
    ButtonModule,
    BadgeModule,
    SpinnerModule,
    TableModule,
    ModalModule,
    AlertModule,
    IconModule,
  ],
})
export class MarketplaceOrdersComponent implements OnInit, OnDestroy {
  private tenant        = inject(TenantService);
  private orderSvc      = inject(CatalogOrderService);
  private notifications = inject(NotificationService);
  private subs          = new Subscription();

  // ── Labels / Colors exposed to the template ──────────────────────────────
  readonly statusLabels = ORDER_STATUS_LABELS;
  readonly payLabels    = PAYMENT_STATUS_LABELS;
  readonly methodLabels = PAYMENT_METHOD_LABELS;
  readonly statusColors = ORDER_STATUS_COLORS;
  readonly payColors    = PAYMENT_STATUS_COLORS;

  // ── State ─────────────────────────────────────────────────────────────────
  loading         = signal(true);
  orders          = signal<CatalogOrder[]>([]);
  slug            = signal<string>('');
  noSlug          = signal(false);

  statusFilter    = signal<CatalogOrderStatus | ''>('');
  payFilter       = signal<CatalogPaymentStatus | ''>('');
  searchTerm      = '';   // two-way NgModel, not a signal

  selected        = signal<CatalogOrder | null>(null);
  showDetail      = signal(false);
  processing      = signal(false);
  showRejectForm  = signal(false);
  rejectReason    = signal('');

  // ── New status selection for the detail modal ─────────────────────────────
  pendingStatus   = signal<CatalogOrderStatus | ''>('');

  // ── Stats ─────────────────────────────────────────────────────────────────
  stats = computed(() => {
    const all = this.orders();
    return {
      total:          all.length,
      new:            all.filter(o => o.status === 'new').length,
      processing:     all.filter(o => o.status === 'processing').length,
      shipped:        all.filter(o => o.status === 'shipped').length,
      completed:      all.filter(o => o.status === 'completed').length,
      cancelled:      all.filter(o => o.status === 'cancelled').length,
      pending_pay:    all.filter(o => o.paymentStatus === 'pending').length,
      proof_uploaded: all.filter(o => o.paymentStatus === 'proof_uploaded').length,
      confirmed:      all.filter(o => o.paymentStatus === 'confirmed').length,
    };
  });

  // ── Filtered list ─────────────────────────────────────────────────────────
  filtered = computed(() => {
    const term   = this.searchTerm.toLowerCase().trim();
    const status = this.statusFilter();
    const pay    = this.payFilter();

    return this.orders().filter(o => {
      if (status && o.status !== status)              return false;
      if (pay    && o.paymentStatus !== pay)          return false;
      if (!term)                                      return true;
      return (
        o.orderNumber.toLowerCase().includes(term) ||
        o.customer.name.toLowerCase().includes(term) ||
        o.customer.email.toLowerCase().includes(term)
      );
    });
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const slugValue = this.tenant.company?.marketplace?.slug;

    if (!slugValue) {
      this.noSlug.set(true);
      this.loading.set(false);
      return;
    }

    this.slug.set(slugValue);
    this.subs.add(
      this.orderSvc.getOrdersBySlug(slugValue).subscribe({
        next:  list => { this.orders.set(list); this.loading.set(false); },
        error: ()   => this.loading.set(false),
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  // ── Detail modal ──────────────────────────────────────────────────────────

  openDetail(order: CatalogOrder): void {
    this.selected.set(order);
    this.pendingStatus.set(order.status);
    this.showRejectForm.set(false);
    this.rejectReason.set('');
    this.showDetail.set(true);
  }

  closeDetail(): void {
    this.showDetail.set(false);
    this.selected.set(null);
  }

  // ── Payment actions ───────────────────────────────────────────────────────

  async confirmPayment(): Promise<void> {
    const order = this.selected();
    if (!order) return;
    this.processing.set(true);
    try {
      await this.orderSvc.confirmPayment(this.slug(), order.id);
      this.notifications.success(`Pago confirmado para ${order.orderNumber}`);
      this.closeDetail();
    } catch (err: any) {
      this.notifications.error('Error al confirmar pago: ' + (err?.message ?? err));
    } finally {
      this.processing.set(false);
    }
  }

  async rejectPayment(): Promise<void> {
    const order  = this.selected();
    const reason = this.rejectReason().trim();
    if (!order)  return;
    if (!reason) { this.notifications.error('Ingresa el motivo del rechazo'); return; }
    this.processing.set(true);
    try {
      await this.orderSvc.rejectPayment(this.slug(), order.id, reason);
      this.notifications.success(`Pago rechazado para ${order.orderNumber}`);
      this.closeDetail();
    } catch (err: any) {
      this.notifications.error('Error al rechazar pago: ' + (err?.message ?? err));
    } finally {
      this.processing.set(false);
    }
  }

  // ── Order status change ───────────────────────────────────────────────────

  async setOrderStatus(status: CatalogOrderStatus): Promise<void> {
    const order = this.selected();
    if (!order) return;
    this.processing.set(true);
    try {
      await this.orderSvc.updateOrderStatus(this.slug(), order.id, status);
      this.notifications.success(`Estado actualizado a "${ORDER_STATUS_LABELS[status]}"`);
      this.closeDetail();
    } catch (err: any) {
      this.notifications.error('Error al actualizar estado: ' + (err?.message ?? err));
    } finally {
      this.processing.set(false);
    }
  }

  applyPendingStatus(): void {
    const s = this.pendingStatus();
    if (s !== '') {
      this.setOrderStatus(s);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  trackById(_: number, item: { id: string }): string { return item.id; }

  readonly orderStatuses: CatalogOrderStatus[] = ['new', 'processing', 'shipped', 'completed', 'cancelled'];
}
