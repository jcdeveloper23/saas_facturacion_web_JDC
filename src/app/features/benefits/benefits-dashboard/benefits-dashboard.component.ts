import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CardComponent, CardBodyComponent,
  RowComponent, ColComponent,
  ButtonDirective,
  SpinnerComponent,
  AlertComponent,
  BadgeComponent,
  FormSelectDirective,
  InputGroupComponent, InputGroupTextDirective,
  FormControlDirective
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';

import { ProfitCalculatorService } from '../services/profit-calculator.service';
import { ProfitConfigService } from '../services/profit-config.service';
import { ProfitDistributionService } from '../services/profit-distribution.service';
import { PosSalesService } from '../../pos/services/pos-sales.service';
import { SettingsService } from '../../settings/services/settings.service';
import { FamiliesService } from '../../products/services/families.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  ProfitCalculationResult,
  ProfitConfig,
  ProfitPeriodType,
  PERIOD_TYPE_LABELS
} from '../models/benefit.interface';
import { Warehouse } from '../../settings/models/settings.interfaces';
import { Family } from '../../products/models/product.interface';
import { Timestamp as FsTimestamp } from '@angular/fire/firestore';

type SourceFilter = 'all' | 'pos' | 'invoice';

@Component({
  selector: 'app-benefits-dashboard',
  templateUrl: './benefits-dashboard.component.html',
  styleUrl: './benefits-dashboard.component.scss',
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
    FormSelectDirective,
    InputGroupComponent,
    InputGroupTextDirective,
    FormControlDirective,
    IconDirective
  ]
})
export class BenefitsDashboardComponent implements OnInit, OnDestroy {
  private calcService         = inject(ProfitCalculatorService);
  private configService       = inject(ProfitConfigService);
  private distributionService = inject(ProfitDistributionService);
  private posSalesService     = inject(PosSalesService);
  private settingsService     = inject(SettingsService);
  private familiesService     = inject(FamiliesService);
  private notifications       = inject(NotificationService);
  private router              = inject(Router);

  private subs = new Subscription();

  // ─── Signals ───────────────────────────────────────────────────────────────

  calculating  = signal(false);
  savingSnap   = signal(false);
  creatingDist = signal(false);

  result        = signal<ProfitCalculationResult | null>(null);
  activeConfig  = signal<ProfitConfig | null>(null);
  selectedPeriod = signal<ProfitPeriodType>('month');
  customStart   = signal('');
  customEnd     = signal('');

  // ─── Filter signals ────────────────────────────────────────────────────────

  showAdvancedFilters = signal(false);
  warehouseFilter     = signal('');
  familyFilter        = signal('');
  sourceFilter        = signal<SourceFilter>('all');

  warehouses   = signal<Warehouse[]>([]);
  families     = signal<Family[]>([]);

  readonly periodLabels = PERIOD_TYPE_LABELS;
  readonly periods: ProfitPeriodType[] = ['day', 'week', 'month', 'year', 'custom'];

  // ─── Computed ──────────────────────────────────────────────────────────────

  readonly filteredLines = computed(() => {
    const r = this.result();
    if (!r) return [];
    const src = this.sourceFilter();
    if (src === 'all') return r.lineBreakdown;
    return r.lineBreakdown.filter(l =>
      src === 'pos' ? l.sourceType === 'pos_sale' : l.sourceType === 'invoice'
    );
  });

  readonly filteredResult = computed(() => {
    const r = this.result();
    if (!r) return null;
    const lines = this.filteredLines();
    const totalRevenue = round2(lines.reduce((s, l) => s + l.revenue, 0));
    const totalCogs    = round2(lines.reduce((s, l) => s + l.cogs, 0));
    const grossProfit  = round2(totalRevenue - totalCogs);
    const margin       = totalRevenue > 0 ? round2((grossProfit / totalRevenue) * 100) : 0;
    const noGap        = lines.filter(l => !l.hasCost);
    return {
      ...r,
      totalRevenue,
      totalCogs,
      grossProfit,
      grossMarginPct:     margin,
      linesWithoutCost:   noGap.length,
      revenueWithoutCost: round2(noGap.reduce((s, l) => s + l.revenue, 0)),
      posSalesCount:  lines.filter(l => l.sourceType === 'pos_sale').map(l => l.sourceId).filter((v, i, a) => a.indexOf(v) === i).length,
      invoicesCount:  lines.filter(l => l.sourceType === 'invoice').map(l => l.sourceId).filter((v, i, a) => a.indexOf(v) === i).length
    };
  });

  readonly distribution = computed(() => {
    const r = this.filteredResult();
    const c = this.activeConfig();
    if (!r || !c) return [];
    return c.partners.map(p => ({
      partnerId:   p.id,
      partnerName: p.name,
      percentage:  p.percentage,
      amount:      Math.round(r.grossProfit * (p.percentage / 100) * 100) / 100
    }));
  });

  readonly hasWarnings = computed(() => (this.filteredResult()?.linesWithoutCost ?? 0) > 0);

  posInvoiceErrorCount = signal(0);

  readonly hasActiveFilters = computed(() =>
    !!this.warehouseFilter() || !!this.familyFilter() || this.sourceFilter() !== 'all'
  );

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.subs.add(
      this.configService.getActiveConfig().subscribe({
        next:  cfg => this.activeConfig.set(cfg),
        error: err => console.error('[BenefitsDashboard] config error:', err)
      })
    );
    this.subs.add(
      this.posSalesService.getSalesWithInvoiceError().subscribe(
        sales => this.posInvoiceErrorCount.set(sales.length)
      )
    );
    this.subs.add(
      this.settingsService.getWarehouses().subscribe(list =>
        this.warehouses.set(list.filter(w => w.isActive))
      )
    );
    this.subs.add(
      this.familiesService.getAll().subscribe(list =>
        this.families.set(list)
      )
    );
    this.loadCurrentMonth();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  // ─── Period helpers ────────────────────────────────────────────────────────

  loadCurrentMonth(): void {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    this.selectedPeriod.set('month');
    void this.calculate(start, end, 'month');
  }

  onPeriodChange(period: ProfitPeriodType): void {
    this.selectedPeriod.set(period);
    if (period === 'custom') return;

    const now = new Date();
    let start: Date;
    let end: Date;

    switch (period) {
      case 'day':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        break;
      case 'week': {
        const day  = now.getDay();
        const diff = (day === 0 ? -6 : 1 - day);
        start = new Date(now); start.setDate(now.getDate() + diff); start.setHours(0,0,0,0);
        end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
        break;
      }
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      default:
        return;
    }
    void this.calculate(start, end, period);
  }

  applyCustomRange(): void {
    const s = this.customStart();
    const e = this.customEnd();
    if (!s || !e) { this.notifications.warning('Seleccione ambas fechas'); return; }
    const start = new Date(s + 'T00:00:00');
    const end   = new Date(e + 'T23:59:59');
    if (start > end) { this.notifications.warning('La fecha de inicio debe ser anterior a la fecha fin'); return; }
    void this.calculate(start, end, 'custom');
  }

  async calculate(start: Date, end: Date, periodType: ProfitPeriodType): Promise<void> {
    this.calculating.set(true);
    try {
      const wh  = this.warehouseFilter() || undefined;
      const fam = this.familyFilter()    || undefined;
      const res = await this.calcService.calculate(start, end, wh, fam);
      res.periodType  = periodType;
      res.periodLabel = this.buildPeriodLabel(start, periodType);
      this.result.set(res);
    } catch (err: any) {
      this.notifications.error(err?.message ?? 'Error al calcular beneficios');
    } finally {
      this.calculating.set(false);
    }
  }

  recalculate(): void {
    const r = this.result();
    if (!r) return;
    void this.calculate(r.startDate, r.endDate, r.periodType);
  }

  clearFilters(): void {
    this.warehouseFilter.set('');
    this.familyFilter.set('');
    this.sourceFilter.set('all');
    this.recalculate();
  }

  private buildPeriodLabel(start: Date, type: ProfitPeriodType): string {
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    switch (type) {
      case 'day':   return `${y}-${m}-${d}`;
      case 'week':  return `${y}-W${this.isoWeek(start)}`;
      case 'month': return `${y}-${m}`;
      case 'year':  return String(y);
      default:      return `${y}-${m}-${d}`;
    }
  }

  private isoWeek(d: Date): string {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return String(Math.ceil((((date.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7)).padStart(2, '0');
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  async saveSnapshot(): Promise<void> {
    const r = this.filteredResult();
    const c = this.activeConfig();
    if (!r) return;

    this.savingSnap.set(true);
    try {
      await this.distributionService.saveSnapshot({
        periodType:         r.periodType,
        periodLabel:        r.periodLabel,
        startDate:          FsTimestamp.fromDate(r.startDate),
        endDate:            FsTimestamp.fromDate(r.endDate),
        warehouseCode:      this.warehouseFilter() || null,
        familyId:           this.familyFilter()    || null,
        posSalesCount:      r.posSalesCount,
        invoicesCount:      r.invoicesCount,
        totalDocsCount:     r.posSalesCount + r.invoicesCount,
        totalRevenue:       r.totalRevenue,
        totalCogs:          r.totalCogs,
        grossProfit:        r.grossProfit,
        grossMarginPct:     r.grossMarginPct,
        linesWithoutCost:   r.linesWithoutCost,
        revenueWithoutCost: r.revenueWithoutCost,
        configId:           c?.id ?? '',
        distribution:       this.distribution(),
        calculatedAt:       FsTimestamp.now(),
        calculatedBy:       'manual',
        isStale:            false,
        source:             'manual'
      });
      this.notifications.success('Snapshot guardado correctamente');
    } catch (err: any) {
      this.notifications.error(err?.message ?? 'Error al guardar snapshot');
    } finally {
      this.savingSnap.set(false);
    }
  }

  async createDistribution(): Promise<void> {
    const r = this.filteredResult();
    const c = this.activeConfig();
    if (!r || !c) return;

    this.creatingDist.set(true);
    try {
      const distribution = this.distribution();
      const snapshotId = await this.distributionService.saveSnapshot({
        periodType:         r.periodType,
        periodLabel:        r.periodLabel,
        startDate:          FsTimestamp.fromDate(r.startDate),
        endDate:            FsTimestamp.fromDate(r.endDate),
        warehouseCode:      this.warehouseFilter() || null,
        familyId:           this.familyFilter()    || null,
        posSalesCount:      r.posSalesCount,
        invoicesCount:      r.invoicesCount,
        totalDocsCount:     r.posSalesCount + r.invoicesCount,
        totalRevenue:       r.totalRevenue,
        totalCogs:          r.totalCogs,
        grossProfit:        r.grossProfit,
        grossMarginPct:     r.grossMarginPct,
        linesWithoutCost:   r.linesWithoutCost,
        revenueWithoutCost: r.revenueWithoutCost,
        configId:           c.id,
        distribution,
        calculatedAt:       FsTimestamp.now(),
        calculatedBy:       'manual',
        isStale:            false,
        source:             'manual'
      });

      await this.distributionService.createDistribution(
        {
          id:                 snapshotId,
          periodType:         r.periodType,
          periodLabel:        r.periodLabel,
          startDate:          FsTimestamp.fromDate(r.startDate),
          endDate:            FsTimestamp.fromDate(r.endDate),
          warehouseCode:      this.warehouseFilter() || null,
          familyId:           this.familyFilter()    || null,
          posSalesCount:      r.posSalesCount,
          invoicesCount:      r.invoicesCount,
          totalDocsCount:     r.posSalesCount + r.invoicesCount,
          totalRevenue:       r.totalRevenue,
          totalCogs:          r.totalCogs,
          grossProfit:        r.grossProfit,
          grossMarginPct:     r.grossMarginPct,
          linesWithoutCost:   r.linesWithoutCost,
          revenueWithoutCost: r.revenueWithoutCost,
          configId:           c.id,
          distribution,
          calculatedAt:       FsTimestamp.now(),
          calculatedBy:       'manual',
          isStale:            false,
          source:             'manual' as const
        },
        c
      );
      this.notifications.success('Liquidación creada correctamente');
      void this.router.navigate(['/benefits/history']);
    } catch (err: any) {
      this.notifications.error(err?.message ?? 'Error al crear liquidación');
    } finally {
      this.creatingDist.set(false);
    }
  }

  // ─── Formatting ────────────────────────────────────────────────────────────

  formatCurrency(n: number): string {
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
  }

  formatPct(n: number): string {
    return n.toFixed(2) + '%';
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
