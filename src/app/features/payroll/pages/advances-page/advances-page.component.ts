import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../../core/services/notification.service';
import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { AdvanceModalComponent } from '../../components/advance-modal.component';
import { VoidReasonModalComponent } from '../../components/void-reason-modal.component';
import { MONTH_NAMES, money, periodLabel } from '../../models/payroll.models';
import { DOC_STATUS, PayrollAdvance, dayLabel, ecuadorToday } from '../../models/payroll-payments.models';
import { PayrollPaymentsService } from '../../services/payroll-payments.service';
import { payrollErrorMessage } from '../../services/payroll.service';

/**
 * Nómina › Anticipos (NOMINA_PAGOS.md): los que se descuentan en un mes (o los
 * últimos registrados), «Nuevo anticipo» y «Anular».
 */
@Component({
  selector: 'app-payroll-advances-page',
  standalone: true,
  templateUrl: './advances-page.component.html',
  imports: [CommonModule, FormsModule, AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, SpinnerModule,
    PayrollTabsComponent, AdvanceModalComponent, VoidReasonModalComponent],
})
export class AdvancesPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollPaymentsService);
  private notifications = inject(NotificationService);
  private sub: Subscription | null = null;

  private readonly today = ecuadorToday();
  readonly year = signal(Number(this.today.slice(0, 4)));
  readonly month = signal(Number(this.today.slice(5, 7)));
  readonly recent = signal(false);
  readonly years = Array.from({ length: 5 }, (_, i) => Number(this.today.slice(0, 4)) + 1 - i);
  readonly recentLimit = 50;
  readonly advances = signal<PayrollAdvance[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly showNew = signal(false);
  readonly voiding = signal<PayrollAdvance | null>(null);
  readonly busy = signal(false);

  readonly months = MONTH_NAMES;
  readonly STATUS = DOC_STATUS;
  readonly money = money;
  readonly label = periodLabel;
  readonly day = dayLabel;
  readonly period = computed(() => `${this.year()}-${String(this.month()).padStart(2, '0')}`);
  /** Por período, del más nuevo al más viejo; los recientes ya llegan así. */
  readonly rows = computed(() => this.recent() ? this.advances()
    : [...this.advances()].sort((a, b) => b.number.localeCompare(a.number)));
  readonly totalPosted = computed(() => this.advances()
    .filter((a) => a.status === 'posted').reduce((s, a) => s + a.amountCents, 0));

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  setYear(y: number): void { this.year.set(Number(y)); this.load(); }
  setMonth(m: number): void { this.month.set(Number(m)); this.load(); }
  setRecent(v: boolean): void { this.recent.set(!!v); this.load(); }

  private load(): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    const src = this.recent() ? this.svc.recentAdvances(this.recentLimit) : this.svc.advances(this.period());
    this.sub = src.subscribe({
      next: (a) => { this.advances.set(a); this.error.set(''); this.loading.set(false); },
      error: (err) => { this.error.set(payrollErrorMessage(err)); this.loading.set(false); },
    });
  }

  async confirmVoid(a: PayrollAdvance, reason: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.svc.voidAdvance(a.id, reason);
      this.notifications.success(`Anticipo ${a.number} anulado`);
      this.voiding.set(null);
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
