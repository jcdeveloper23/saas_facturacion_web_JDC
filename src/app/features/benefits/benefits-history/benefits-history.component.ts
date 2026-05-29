import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CardComponent, CardBodyComponent,
  RowComponent, ColComponent,
  ButtonDirective,
  SpinnerComponent,
  AlertComponent,
  BadgeComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective, FormSelectDirective,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';

import { ProfitDistributionService } from '../services/profit-distribution.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  ProfitDistribution,
  PartnerPayment,
  PartnerPaymentMethod,
  DistributionStatus,
  DISTRIBUTION_STATUS_LABELS,
  DISTRIBUTION_STATUS_COLORS,
  calcDistributionStatus
} from '../models/benefit.interface';

@Component({
  selector: 'app-benefits-history',
  templateUrl: './benefits-history.component.html',
  styleUrl: './benefits-history.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CardComponent,
    CardBodyComponent,
    RowComponent,
    ColComponent,
    ButtonDirective,
    SpinnerComponent,
    AlertComponent,
    BadgeComponent,
    ModalComponent,
    ModalHeaderComponent,
    ModalBodyComponent,
    ModalFooterComponent,
    ModalTitleDirective,
    ButtonCloseDirective,
    FormLabelDirective,
    FormControlDirective,
    FormSelectDirective,
    InputGroupComponent,
    InputGroupTextDirective,
    IconDirective
  ]
})
export class BenefitsHistoryComponent implements OnInit, OnDestroy {
  private distributionService = inject(ProfitDistributionService);
  private notifications       = inject(NotificationService);

  private subs = new Subscription();

  // ─── Signals ───────────────────────────────────────────────────────────────

  distributions  = signal<ProfitDistribution[]>([]);
  loading        = signal(true);
  expandedDistId = signal<string | null>(null);

  // Filters
  searchTerm   = signal('');
  statusFilter = signal<DistributionStatus | ''>('');

  // Payment modal
  showPayModal     = signal(false);
  selectedDist     = signal<ProfitDistribution | null>(null);
  payingPartner    = signal<PartnerPayment | null>(null);
  paymentMethod    = signal<PartnerPaymentMethod>('cash');
  paymentReference = signal('');
  paymentNotes     = signal('');
  savingPay        = signal(false);

  readonly statusLabels = DISTRIBUTION_STATUS_LABELS;
  readonly statusColors = DISTRIBUTION_STATUS_COLORS;
  readonly statusKeys: DistributionStatus[] = ['pending', 'partially_paid', 'distributed'];

  // ─── Computed ──────────────────────────────────────────────────────────────

  readonly filteredDistributions = computed(() => {
    let list = this.distributions();
    const term   = this.searchTerm().toLowerCase().trim();
    const status = this.statusFilter();
    if (term)   list = list.filter(d =>
      d.periodLabel.toLowerCase().includes(term) ||
      d.configName.toLowerCase().includes(term)
    );
    if (status) list = list.filter(d => d.status === status);
    return list;
  });

  readonly totals = computed(() => {
    const list = this.filteredDistributions();
    return {
      revenue:    list.reduce((s, d) => s + d.totalRevenue, 0),
      grossProfit: list.reduce((s, d) => s + d.grossProfit, 0),
      count:      list.length
    };
  });

  readonly hasActiveFilters = computed(() => !!this.searchTerm() || !!this.statusFilter());

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.subs.add(
      this.distributionService.getDistributions(50).subscribe({
        next:  list => { this.distributions.set(list); this.loading.set(false); },
        error: err  => { this.loading.set(false); console.error('[BenefitsHistory]', err); }
      })
    );
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  // ─── Filters ───────────────────────────────────────────────────────────────

  clearFilters(): void {
    this.searchTerm.set('');
    this.statusFilter.set('');
  }

  // ─── Expand/collapse ───────────────────────────────────────────────────────

  toggleExpand(id: string): void {
    this.expandedDistId.update(cur => cur === id ? null : id);
  }

  isExpanded(id: string): boolean {
    return this.expandedDistId() === id;
  }

  // ─── Payment modal ─────────────────────────────────────────────────────────

  openPayModal(dist: ProfitDistribution, partner: PartnerPayment): void {
    this.selectedDist.set(dist);
    this.payingPartner.set(partner);
    this.paymentMethod.set('cash');
    this.paymentReference.set('');
    this.paymentNotes.set('');
    this.showPayModal.set(true);
  }

  closePayModal(): void {
    this.showPayModal.set(false);
    this.selectedDist.set(null);
    this.payingPartner.set(null);
  }

  async confirmPay(): Promise<void> {
    const dist    = this.selectedDist();
    const partner = this.payingPartner();
    if (!dist || !partner) return;

    this.savingPay.set(true);
    try {
      await this.distributionService.markPartnerPaid(dist.id, partner.partnerId, {
        paymentMethod:    this.paymentMethod(),
        paymentReference: this.paymentReference() || null,
        notes:            this.paymentNotes() || null
      });
      this.notifications.success(`Pago de ${partner.partnerName} registrado`);
      this.closePayModal();
    } catch (err: any) {
      this.notifications.error(err?.message ?? 'Error al registrar pago');
    } finally {
      this.savingPay.set(false);
    }
  }

  // ─── Formatting ────────────────────────────────────────────────────────────

  formatCurrency(n: number): string {
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
  }

  formatPct(n: number): string { return n.toFixed(2) + '%'; }

  formatDate(ts: any): string {
    if (!ts) return '—';
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts.seconds * 1000);
    return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  countByStatus(status: DistributionStatus): number {
    return this.distributions().filter(d => d.status === status).length;
  }

  trackById(_: number, d: ProfitDistribution): string { return d.id; }
  trackByPartnerId(_: number, p: PartnerPayment): string { return p.partnerId; }

  readonly calcDistributionStatus = calcDistributionStatus;
}
