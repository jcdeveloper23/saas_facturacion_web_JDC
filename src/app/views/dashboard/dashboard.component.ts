import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ChartData } from 'chart.js';
import {
  Firestore, collection, query, where, getCountFromServer
} from '@angular/fire/firestore';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  RowComponent, ColComponent, BadgeComponent, SpinnerComponent,
  ButtonDirective, AlertComponent, ProgressComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { ChartjsComponent } from '@coreui/angular-chartjs';

import { InvoicesService }    from '../../features/invoices/services/invoices.service';
import { ProductsService }    from '../../features/products/services/products.service';
import { PosSalesService }    from '../../features/pos/services/pos-sales.service';
import { TenantService }      from '../../core/services/tenant.service';
import { PermissionsService } from '../../core/services/permissions.service';
import {
  Invoice,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS
} from '../../features/invoices/models/invoice.interface';
import { Product } from '../../features/products/models/product.interface';
import { PlanUsageWidgetComponent } from './widgets/plan-usage-widget/plan-usage-widget.component';

@Component({
  templateUrl: 'dashboard.component.html',
  styleUrls: ['dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    RowComponent, ColComponent, BadgeComponent, SpinnerComponent,
    ButtonDirective, AlertComponent, IconDirective,
    ChartjsComponent, ProgressComponent,
    PlanUsageWidgetComponent,
  ]
})
export class DashboardComponent implements OnInit, OnDestroy {
  private invoicesSvc  = inject(InvoicesService);
  private productsSvc  = inject(ProductsService);
  private posSalesSvc  = inject(PosSalesService);
  private tenantSvc    = inject(TenantService);
  private permsSvc     = inject(PermissionsService);
  private firestore    = inject(Firestore);
  private destroy$     = new Subject<void>();

  readonly hasModule = (m: string) => this.tenantSvc.hasModule(m);

  // ── Permisos del usuario actual ──────────────────────────────────────────────
  // Usados en el template para ocultar acciones que el usuario no puede realizar.
  // Doble verificación: el módulo debe estar activo en el plan del tenant Y
  // el usuario debe tener el permiso en su rol.
  readonly canViewInvoices    = computed(() => this.permsSvc.hasAnyPermission(['invoices.view']));
  readonly canCreateInvoice   = computed(() => this.permsSvc.hasAnyPermission(['invoices.create']));
  readonly canViewPurchases   = computed(() => this.permsSvc.hasAnyPermission(['purchases.view']));
  readonly canCreatePurchase  = computed(() => this.permsSvc.hasAnyPermission(['purchases.create']));
  readonly canViewPersonas    = computed(() => this.permsSvc.hasAnyPermission(['personas.view']));
  readonly canViewProducts    = computed(() => this.permsSvc.hasAnyPermission(['products.view']));
  readonly canViewStock       = computed(() => this.permsSvc.hasAnyPermission(['stock.view']));
  readonly canViewPos         = computed(() => this.permsSvc.hasAnyPermission(['pos.view']));
  readonly canViewAccounting  = computed(() => this.permsSvc.hasAnyPermission(['accounting.view']));
  readonly canViewRetentions  = computed(() => this.permsSvc.hasAnyPermission(['retentions.view']));
  readonly canViewDebitNotes  = computed(() => this.permsSvc.hasAnyPermission(['debit_notes.view']));

  // ── Date context ─────────────────────────────────────────────────────────────
  private readonly _now = new Date();
  readonly currentYear    = String(this._now.getFullYear());
  readonly currentMonth   = this._now.getMonth();
  readonly currentYear_n  = this._now.getFullYear();
  readonly daysInMonth    = new Date(this._now.getFullYear(), this.currentMonth + 1, 0).getDate();
  readonly monthName      = this._now.toLocaleString('es-EC', { month: 'long', year: 'numeric' });

  // ── Chart month selector (filtra client-side, 0 reads extra) ─────────────────
  selectedChartMonth = signal(this.currentMonth);

  readonly availableMonths = computed(() => {
    const months = [];
    for (let m = 0; m <= this.currentMonth; m++) {
      months.push({
        value: m,
        label: new Date(this.currentYear_n, m, 1)
          .toLocaleString('es-EC', { month: 'long' })
      });
    }
    return months;
  });

  readonly daysInSelectedMonth = computed(() =>
    new Date(this.currentYear_n, this.selectedChartMonth() + 1, 0).getDate()
  );

  readonly selectedMonthLabel = computed(() =>
    new Date(this.currentYear_n, this.selectedChartMonth(), 1)
      .toLocaleString('es-EC', { month: 'long', year: 'numeric' })
  );

  readonly invoicesInSelectedMonth = computed(() =>
    this.invoices().filter(i =>
      !i.isVoid && !i.isCreditNote &&
      ['issued', 'paid'].includes(i.status) &&
      this.inMonth(i.date, this.selectedChartMonth(), this.currentYear_n)
    ).length
  );

  onChartMonthChange(event: Event): void {
    this.selectedChartMonth.set(Number((event.target as HTMLSelectElement).value));
  }

  // ── Raw state ─────────────────────────────────────────────────────────────────
  loading         = signal(true);
  invoices        = signal<Invoice[]>([]);
  customersCount  = signal(0);
  products        = signal<Product[]>([]);
  posErrorCount   = signal(0);

  private _loadedCount = 0;
  private checkDone() {
    this._loadedCount++;
    if (this._loadedCount >= 2) this.loading.set(false);
  }

  // ── KPIs base ────────────────────────────────────────────────────────────────

  private readonly _thisMonthInvoices = computed(() =>
    this.invoices().filter(i =>
      !i.isVoid && !i.isCreditNote &&
      ['issued', 'paid'].includes(i.status) &&
      this.inMonth(i.date, this.currentMonth, this.currentYear_n)
    )
  );

  private readonly _prevMonth = computed(() => ({
    m: this.currentMonth === 0 ? 11 : this.currentMonth - 1,
    y: this.currentMonth === 0 ? this.currentYear_n - 1 : this.currentYear_n,
  }));

  private readonly _prevMonthInvoices = computed(() => {
    const { m, y } = this._prevMonth();
    return this.invoices().filter(i =>
      !i.isVoid && !i.isCreditNote &&
      ['issued', 'paid'].includes(i.status) &&
      this.inMonth(i.date, m, y)
    );
  });

  // ── Ventas del mes ────────────────────────────────────────────────────────────

  readonly salesThisMonth = computed(() =>
    this._thisMonthInvoices().reduce((s, i) => s + (i.total ?? 0), 0)
  );

  readonly salesPrevMonth = computed(() =>
    this._prevMonthInvoices().reduce((s, i) => s + (i.total ?? 0), 0)
  );

  readonly salesDeltaPct = computed(() => {
    const prev = this.salesPrevMonth();
    const curr = this.salesThisMonth();
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  });

  // ── Facturas del mes ──────────────────────────────────────────────────────────

  readonly invoicesThisMonth = computed(() => this._thisMonthInvoices().length);

  readonly invoicesPrevMonth = computed(() => this._prevMonthInvoices().length);

  readonly invoicesDeltaPct = computed(() => {
    const prev = this.invoicesPrevMonth();
    const curr = this.invoicesThisMonth();
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  });

  // ── Por cobrar ────────────────────────────────────────────────────────────────

  readonly outstanding = computed(() =>
    this.invoices()
      .filter(i => i.status === 'issued' && !i.isVoid && !i.isCreditNote)
      .reduce((s, i) => s + (i.total ?? 0), 0)
  );

  readonly outstandingCount = computed(() =>
    this.invoices().filter(i => i.status === 'issued' && !i.isVoid && !i.isCreditNote).length
  );

  // ── Ticket promedio ───────────────────────────────────────────────────────────

  readonly averageTicket = computed(() => {
    const count = this.invoicesThisMonth();
    return count === 0 ? 0 : this.salesThisMonth() / count;
  });

  readonly averageTicketPrev = computed(() => {
    const list = this._prevMonthInvoices();
    return list.length === 0 ? 0 : list.reduce((s, i) => s + (i.total ?? 0), 0) / list.length;
  });

  readonly averageTicketDelta = computed(() => {
    const prev = this.averageTicketPrev();
    const curr = this.averageTicket();
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  });

  // ── Tasa de cobro ─────────────────────────────────────────────────────────────

  readonly collectionRate = computed(() => {
    const list = this._thisMonthInvoices();
    if (list.length === 0) return 0;
    const paid = list.filter(i => i.status === 'paid').length;
    return Math.round((paid / list.length) * 100);
  });

  readonly collectionRatePrev = computed(() => {
    const list = this._prevMonthInvoices();
    if (list.length === 0) return 0;
    const paid = list.filter(i => i.status === 'paid').length;
    return Math.round((paid / list.length) * 100);
  });

  readonly collectionRateDelta = computed(() =>
    this.collectionRate() - this.collectionRatePrev()
  );

  // ── SRI estado del mes ────────────────────────────────────────────────────────

  readonly sriStatusThisMonth = computed(() => {
    const list = this.invoices().filter(i =>
      !i.isVoid && !i.isCreditNote &&
      ['issued', 'paid'].includes(i.status) &&
      this.inMonth(i.date, this.currentMonth, this.currentYear_n)
    );
    const authorized = list.filter(i => i.sriStatus === 'authorized').length;
    const rejected   = list.filter(i => i.sriStatus === 'rejected').length;
    const pending    = list.filter(i =>
      i.sriStatus === 'pending' || i.sriStatus === 'xml_generated' || i.sriStatus === 'signed'
    ).length;
    return { authorized, rejected, pending, total: list.length };
  });

  // ── Alertas ───────────────────────────────────────────────────────────────────

  readonly lowStockProducts = computed(() =>
    this.products().filter(p =>
      p.isActive && p.trackStock && !p.noStock &&
      p.stockMin > 0 && p.stockAvailable <= p.stockMin
    )
  );

  readonly overdueInvoices = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.invoices().filter(i => {
      if (i.status !== 'issued' || i.isVoid || i.isCreditNote) return false;
      const due = this.tsToDate(i.dueDate);
      return due !== null && due < today;
    });
  });

  // ── Últimas facturas ──────────────────────────────────────────────────────────

  readonly recentInvoices = computed(() =>
    this.invoices().filter(i => !i.isVoid).slice(0, 6)
  );

  // ── Aging de cuentas por cobrar ───────────────────────────────────────────────

  readonly aging = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const result = {
      current: 0, currentCount: 0,
      d1_30:   0, d1_30Count:   0,
      d31_60:  0, d31_60Count:  0,
      d60plus: 0, d60plusCount: 0,
    };
    this.invoices()
      .filter(i => i.status === 'issued' && !i.isVoid && !i.isCreditNote)
      .forEach(inv => {
        const due = this.tsToDate(inv.dueDate);
        const amount = inv.total ?? 0;
        if (!due || due >= today) {
          result.current += amount; result.currentCount++;
        } else {
          const days = Math.ceil((today.getTime() - due.getTime()) / 86_400_000);
          if (days <= 30)      { result.d1_30  += amount; result.d1_30Count++;  }
          else if (days <= 60) { result.d31_60 += amount; result.d31_60Count++; }
          else                 { result.d60plus += amount; result.d60plusCount++; }
        }
      });
    return result;
  });

  // ── Top 5 clientes del mes ────────────────────────────────────────────────────

  readonly topCustomers = computed(() => {
    const map = new Map<string, { name: string; count: number; total: number }>();
    this._thisMonthInvoices().forEach(inv => {
      const key = inv.customerId ?? inv.customerName;
      const cur = map.get(key);
      if (cur) { cur.count++; cur.total += inv.total ?? 0; }
      else map.set(key, { name: inv.customerName ?? '', count: 1, total: inv.total ?? 0 });
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  });

  // ── Tendencia 6 meses ─────────────────────────────────────────────────────────

  readonly trendMonths = computed<{ label: string; month: number; year: number }[]>(() => {
    const result: { label: string; month: number; year: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      let m = this.currentMonth - i;
      let y = this.currentYear_n;
      if (m < 0) { m += 12; y--; }
      result.push({
        label: new Date(y, m, 1).toLocaleString('es-EC', { month: 'short' }),
        month: m,
        year:  y,
      });
    }
    return result;
  });

  readonly salesTrend = computed<ChartData>(() => {
    const months = this.trendMonths();
    const sums   = months.map(({ month, year }) =>
      this.invoices()
        .filter(i => !i.isVoid && !i.isCreditNote &&
                     ['issued', 'paid'].includes(i.status) &&
                     this.inMonth(i.date, month, year))
        .reduce((s, i) => s + (i.total ?? 0), 0)
    );
    return {
      labels: months.map(m => m.label),
      datasets: [{
        label: 'Ventas',
        data: sums,
        fill: true,
        backgroundColor: (ctx: any) => {
          const canvas = ctx?.chart?.ctx;
          if (!canvas) return 'rgba(50,130,252,0.15)';
          const gradient = canvas.createLinearGradient(0, 0, 0, 260);
          gradient.addColorStop(0,   'rgba(50,130,252,0.35)');
          gradient.addColorStop(0.6, 'rgba(50,130,252,0.08)');
          gradient.addColorStop(1,   'rgba(50,130,252,0)');
          return gradient;
        },
        borderColor:   'rgba(50,130,252,1)',
        borderWidth:   2.5,
        tension:       0.4,
        pointRadius:   5,
        pointHoverRadius: 7,
        pointBackgroundColor: 'rgba(50,130,252,1)',
        pointBorderColor:     '#fff',
        pointBorderWidth:     2,
      }]
    };
  });

  readonly trendChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15,20,40,0.9)',
        titleColor:      '#fff',
        bodyColor:       'rgba(255,255,255,0.75)',
        padding:         10,
        cornerRadius:    8,
        callbacks: {
          label: (ctx: any) => ` $${(ctx.raw as number).toLocaleString('es-EC', { minimumFractionDigits: 2 })}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 12 } }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(128,128,128,0.1)' },
        ticks: { callback: (v: any) => `$${Number(v).toLocaleString('es-EC')}` }
      }
    }
  };

  // ── Gráfico ventas por día (mes seleccionable) ────────────────────────────────

  readonly chartData = computed<ChartData>(() => {
    const days  = this.daysInSelectedMonth();
    const month = this.selectedChartMonth();
    const year  = this.currentYear_n;
    const sums  = new Array(days).fill(0);
    this.invoices()
      .filter(i => !i.isVoid && !i.isCreditNote &&
                   ['issued', 'paid'].includes(i.status) &&
                   this.inMonth(i.date, month, year))
      .forEach(i => {
        const d = this.tsToDate(i.date);
        if (d) sums[d.getDate() - 1] += i.total ?? 0;
      });
    return {
      labels: Array.from({ length: days }, (_, k) => String(k + 1)),
      datasets: [{
        label: 'Ventas ($)',
        data:  sums,
        backgroundColor: 'rgba(50, 130, 252, 0.25)',
        borderColor:     'rgba(50, 130, 252, 0.85)',
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
      tooltip: { callbacks: { label: (ctx: any) => ` $${(ctx.raw as number).toFixed(2)}` } }
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { callback: (v: any) => `$${v}` } }
    }
  };

  // ── Top 10 productos del mes ──────────────────────────────────────────────────

  readonly topProducts = computed(() => {
    const map = new Map<string, { description: string; sku: string; qty: number; total: number }>();
    this._thisMonthInvoices().forEach(inv => {
      (inv.lines ?? []).forEach(line => {
        const key = line.productId ?? line.description;
        const cur = map.get(key);
        if (cur) { cur.qty += line.quantity; cur.total += line.total; }
        else map.set(key, { description: line.description, sku: line.productSku ?? '', qty: line.quantity, total: line.total });
      });
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  });

  // ── Ventas por familia ────────────────────────────────────────────────────────

  private readonly _familyColors = [
    'rgba(50,130,252,0.8)', 'rgba(46,213,115,0.8)', 'rgba(255,165,2,0.8)',
    'rgba(255,71,87,0.8)',  'rgba(165,94,234,0.8)', 'rgba(24,220,255,0.8)',
    'rgba(255,127,80,0.8)', 'rgba(100,200,200,0.8)','rgba(255,200,100,0.8)',
  ];

  readonly salesByFamily = computed<ChartData>(() => {
    const familyMap = new Map<string, string>();
    this.products().forEach(p => familyMap.set(p.id, p.familyName ?? 'Sin familia'));

    const totals = new Map<string, number>();
    this._thisMonthInvoices().forEach(inv => {
      (inv.lines ?? []).forEach(line => {
        const family = (line.productId ? familyMap.get(line.productId) : null) ?? 'Sin familia';
        totals.set(family, (totals.get(family) ?? 0) + line.total);
      });
    });

    const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    return {
      labels: entries.map(e => e[0]),
      datasets: [{
        data:            entries.map(e => Math.round(e[1] * 100) / 100),
        backgroundColor: entries.map((_, i) => this._familyColors[i % this._familyColors.length]),
        borderWidth: 1,
      }]
    };
  });

  readonly familyChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx: any) => ` $${(ctx.raw as number).toFixed(2)}` } }
    }
  };

  // ── Alerta certificado SRI ────────────────────────────────────────────────────

  readonly sriCertDaysLeft = computed<number | null>(() => {
    const expiry = (this.tenantSvc.company as any)?.sri?.certificateExpiry;
    if (!expiry) return null;
    const expiryDate: Date = typeof expiry.toDate === 'function'
      ? expiry.toDate()
      : new Date(expiry.seconds * 1000);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.ceil((expiryDate.getTime() - today.getTime()) / 86_400_000);
  });

  // ── Total ventas del año ──────────────────────────────────────────────────────

  readonly salesThisYear = computed(() =>
    this.invoices()
      .filter(i => !i.isVoid && !i.isCreditNote && ['issued', 'paid'].includes(i.status))
      .reduce((s, i) => s + (i.total ?? 0), 0)
  );

  readonly invoicesThisYear = computed(() =>
    this.invoices()
      .filter(i => !i.isVoid && !i.isCreditNote && ['issued', 'paid'].includes(i.status))
      .length
  );

  // ── Labels / colors ───────────────────────────────────────────────────────────

  readonly STATUS_LABELS = INVOICE_STATUS_LABELS;
  readonly STATUS_COLORS = INVOICE_STATUS_COLORS;
  readonly companyName   = computed(() => this.tenantSvc.company?.name ?? '');

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.invoicesSvc.getInvoices({ year: this.currentYear })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: list => { this.invoices.set(list); this.checkDone(); },
        error: ()  => this.checkDone()
      });

    // 1 Firestore read (count aggregation) — replaces real-time subscription
    const companyId = this.tenantSvc.companyId;
    const personasCol = collection(this.firestore, `companies/${companyId}/personas`);
    getCountFromServer(query(personasCol, where('roles', 'array-contains', 'customer')))
      .then(snap => { this.customersCount.set(snap.data().count); this.checkDone(); })
      .catch(() => this.checkDone());

    // Non-blocking: products (stock alerts + family chart)
    this.productsSvc.getActiveProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: list => this.products.set(list) });

    // Non-blocking: POS sales with invoice errors
    if (this.tenantSvc.hasModule('pos')) {
      this.posSalesSvc.getSalesWithInvoiceError()
        .pipe(takeUntil(this.destroy$))
        .subscribe({ next: list => this.posErrorCount.set(list.length) });
    }
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
