import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ChartData } from 'chart.js';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  RowComponent, ColComponent, BadgeComponent, SpinnerComponent,
  ButtonDirective
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { ChartjsComponent } from '@coreui/angular-chartjs';

import { InvoicesService } from '../../features/invoices/services/invoices.service';
import { PersonasService } from '../../features/personas/services/personas.service';
import { TenantService }   from '../../core/services/tenant.service';
import {
  Invoice,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS
} from '../../features/invoices/models/invoice.interface';
import { PlanUsageWidgetComponent } from './widgets/plan-usage-widget/plan-usage-widget.component';

@Component({
  templateUrl: 'dashboard.component.html',
  styleUrls: ['dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    RowComponent, ColComponent, BadgeComponent, SpinnerComponent,
    ButtonDirective, IconDirective,
    ChartjsComponent,
    PlanUsageWidgetComponent,
  ]
})
export class DashboardComponent implements OnInit, OnDestroy {
  private invoicesSvc = inject(InvoicesService);
  private personasSvc = inject(PersonasService);
  private tenantSvc   = inject(TenantService);
  private destroy$    = new Subject<void>();

  // ── Date context ─────────────────────────────────────────────────────────────
  private readonly _now = new Date();
  readonly currentYear    = String(this._now.getFullYear());
  readonly currentMonth   = this._now.getMonth();
  readonly currentYear_n  = this._now.getFullYear();
  readonly daysInMonth    = new Date(this._now.getFullYear(), this.currentMonth + 1, 0).getDate();
  readonly monthName      = this._now.toLocaleString('es-EC', { month: 'long', year: 'numeric' });

  // ── Raw state ─────────────────────────────────────────────────────────────────
  loading         = signal(true);
  invoices        = signal<Invoice[]>([]);
  customersCount  = signal(0);

  private _loadedCount = 0;
  private checkDone() {
    this._loadedCount++;
    if (this._loadedCount >= 2) this.loading.set(false);
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────────

  readonly salesThisMonth = computed(() =>
    this.invoices()
      .filter(i => !i.isVoid && !i.isCreditNote &&
                   ['issued', 'paid'].includes(i.status) &&
                   this.inMonth(i.date, this.currentMonth, this.currentYear_n))
      .reduce((s, i) => s + (i.total ?? 0), 0)
  );

  readonly salesPrevMonth = computed(() => {
    const m = this.currentMonth === 0 ? 11 : this.currentMonth - 1;
    const y = this.currentMonth === 0 ? this.currentYear_n - 1 : this.currentYear_n;
    return this.invoices()
      .filter(i => !i.isVoid && !i.isCreditNote &&
                   ['issued', 'paid'].includes(i.status) &&
                   this.inMonth(i.date, m, y))
      .reduce((s, i) => s + (i.total ?? 0), 0);
  });

  readonly salesDeltaPct = computed(() => {
    const prev = this.salesPrevMonth();
    const curr = this.salesThisMonth();
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  });

  readonly invoicesThisMonth = computed(() =>
    this.invoices().filter(
      i => !i.isVoid && !i.isCreditNote &&
           ['issued', 'paid'].includes(i.status) &&
           this.inMonth(i.date, this.currentMonth, this.currentYear_n)
    ).length
  );

  readonly invoicesPrevMonth = computed(() => {
    const m = this.currentMonth === 0 ? 11 : this.currentMonth - 1;
    const y = this.currentMonth === 0 ? this.currentYear_n - 1 : this.currentYear_n;
    return this.invoices().filter(
      i => !i.isVoid && !i.isCreditNote &&
           ['issued', 'paid'].includes(i.status) &&
           this.inMonth(i.date, m, y)
    ).length;
  });

  readonly invoicesDeltaPct = computed(() => {
    const prev = this.invoicesPrevMonth();
    const curr = this.invoicesThisMonth();
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  });

  readonly outstanding = computed(() =>
    this.invoices()
      .filter(i => i.status === 'issued' && !i.isVoid && !i.isCreditNote)
      .reduce((s, i) => s + (i.total ?? 0), 0)
  );

  readonly outstandingCount = computed(() =>
    this.invoices().filter(i => i.status === 'issued' && !i.isVoid && !i.isCreditNote).length
  );

  readonly recentInvoices = computed(() =>
    this.invoices().filter(i => !i.isVoid).slice(0, 6)
  );

  // ── Chart ─────────────────────────────────────────────────────────────────────

  readonly chartData = computed<ChartData>(() => {
    const sums = new Array(this.daysInMonth).fill(0);
    this.invoices()
      .filter(i => !i.isVoid && !i.isCreditNote &&
                   ['issued', 'paid'].includes(i.status) &&
                   this.inMonth(i.date, this.currentMonth, this.currentYear_n))
      .forEach(i => {
        const d = this.tsToDate(i.date);
        if (d) sums[d.getDate() - 1] += i.total ?? 0;
      });

    return {
      labels: Array.from({ length: this.daysInMonth }, (_, k) => String(k + 1)),
      datasets: [{
        label: 'Ventas ($)',
        data: sums,
        backgroundColor: 'rgba(50, 130, 252, 0.25)',
        borderColor: 'rgba(50, 130, 252, 0.85)',
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    };
  });

  readonly chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` $${(ctx.raw as number).toFixed(2)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: { callback: (v: any) => `$${v}` }
      }
    }
  };

  // ── Labels/Colors ─────────────────────────────────────────────────────────────
  readonly STATUS_LABELS = INVOICE_STATUS_LABELS;
  readonly STATUS_COLORS = INVOICE_STATUS_COLORS;

  // ── Computed company info ─────────────────────────────────────────────────────
  readonly companyName = computed(() => this.tenantSvc.company?.name ?? '');

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.invoicesSvc.getInvoices({ year: this.currentYear })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: list => { this.invoices.set(list); this.checkDone(); },
        error: ()  => this.checkDone()
      });

    this.personasSvc.getPersonas('customer')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: list => { this.customersCount.set(list.length); this.checkDone(); },
        error: ()  => this.checkDone()
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private tsToDate(ts: any): Date | null {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    return null;
  }

  private inMonth(ts: any, month: number, year: number): boolean {
    const d = this.tsToDate(ts);
    if (!d) return false;
    return d.getMonth() === month && d.getFullYear() === year;
  }

  invoiceDate(ts: any): Date | null { return this.tsToDate(ts); }

  trackById(_: number, item: Invoice): string { return item.id; }
}
