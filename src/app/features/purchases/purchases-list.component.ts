import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PurchasesService } from './services/purchases.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  Purchase, PurchaseStatus,
  PURCHASE_STATUS_LABELS, PURCHASE_STATUS_COLORS
} from './models/purchase.interface';

@Component({
  selector: 'app-purchases-list',
  standalone: true,
  templateUrl: './purchases-list.component.html',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    IconModule,
  ],
})
export class PurchasesListComponent implements OnInit, OnDestroy {
  readonly router       = inject(Router);
  private svc           = inject(PurchasesService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  readonly STATUS_LABELS = PURCHASE_STATUS_LABELS;
  readonly STATUS_COLORS = PURCHASE_STATUS_COLORS;

  // ── State ───────────────────────────────────────────────────────────────────
  loading      = signal(true);
  all          = signal<Purchase[]>([]);
  statusFilter = signal<PurchaseStatus | ''>('');
  searchTerm   = '';

  // ── Stats ───────────────────────────────────────────────────────────────────
  stats = computed(() => {
    const all = this.all();
    return {
      total:     all.length,
      draft:     all.filter(p => p.status === 'draft').length,
      sent:      all.filter(p => p.status === 'sent').length,
      received:  all.filter(p => p.status === 'received').length,
      cancelled: all.filter(p => p.status === 'cancelled').length,
    };
  });

  // ── Filtered list ────────────────────────────────────────────────────────────
  filtered = computed(() => {
    const term   = this.searchTerm.toLowerCase().trim();
    const status = this.statusFilter();
    return this.all().filter(p => {
      if (status && p.status !== status) return false;
      if (!term) return true;
      return (
        p.fullNumber.toLowerCase().includes(term) ||
        p.supplierName.toLowerCase().includes(term) ||
        p.supplierRuc.includes(term) ||
        p.supplierInvoiceNumber.toLowerCase().includes(term)
      );
    });
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadAll(): void {
    this.loading.set(true);
    this.svc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  list => { this.all.set(list); this.loading.set(false); },
        error: ()   => this.loading.set(false),
      });
  }

  // ─── Interactions ────────────────────────────────────────────────────────────

  setStatusFilter(status: PurchaseStatus | ''): void {
    this.statusFilter.set(status);
  }

  canEdit(p: Purchase): boolean {
    return p.status === 'draft' || p.status === 'sent';
  }

  async receiveOrder(p: Purchase): Promise<void> {
    if (!confirm(`¿Marcar compra ${p.fullNumber} como RECIBIDA?\nEsto actualizará el stock del almacén.`)) return;
    try {
      await this.svc.markReceived(p.id);
      this.notifications.success(`Compra ${p.fullNumber} marcada como recibida`);
    } catch (err: any) {
      this.notifications.error('Error al recibir: ' + (err?.message ?? err));
    }
  }

  async cancelOrder(p: Purchase): Promise<void> {
    if (p.status === 'received') {
      this.notifications.error('No se puede cancelar una compra ya recibida');
      return;
    }
    if (!confirm(`¿Cancelar compra ${p.fullNumber}?`)) return;
    try {
      await this.svc.cancel(p.id);
      this.notifications.success(`Compra ${p.fullNumber} cancelada`);
    } catch (err: any) {
      this.notifications.error('Error al cancelar: ' + (err?.message ?? err));
    }
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
