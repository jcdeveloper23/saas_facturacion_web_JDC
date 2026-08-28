import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, take } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import { ChartData } from 'chart.js';
import {
  CardModule, ButtonModule, SpinnerModule, FormModule,
  AlertModule, TableModule, BadgeModule,
  RowComponent, ColComponent
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { ChartjsComponent } from '@coreui/angular-chartjs';

import { PurchasesService }    from '../../../purchases/services/purchases.service';
import { ExcelExportService }  from '../../../accounting/services/excel-export.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Purchase }            from '../../../purchases/models/purchase.interface';

// ─── Interfaces locales ───────────────────────────────────────────────────────
interface SupplierEntry { supplierId: string; supplierName: string; total: number; }
interface ProductEntry  { description: string; qty: number; subtotal: number; iva: number; total: number; }
interface HourEntry     { hour: number; label: string; count: number; total: number; }

@Component({
  selector: 'app-purchases-report-page',
  standalone: true,
  templateUrl: './purchases-report-page.component.html',
  styleUrl: './purchases-report-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, SpinnerModule, FormModule,
    AlertModule, TableModule, BadgeModule,
    RowComponent, ColComponent,
    IconModule, ChartjsComponent,
  ]
})
export class PurchasesReportPageComponent implements OnInit, OnDestroy {
  private purchasesSvc  = inject(PurchasesService);
  private excelSvc      = inject(ExcelExportService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── Date defaults ───────────────────────────────────────────────────────────
  readonly today           = new Date();
  readonly firstDayOfMonth = new Date(this.today.getFullYear(), this.today.getMonth(), 1);

  // ── Filter signals ──────────────────────────────────────────────────────────
  dateFrom         = signal(this.firstDayOfMonth.toISOString().split('T')[0]);
  dateTo           = signal(this.today.toISOString().split('T')[0]);
  supplierFilter   = signal('');
  costCenterFilter = signal('');
  statusFilter     = signal<'' | 'received' | 'paid' | 'cancelled'>('');
  dateError        = signal(false);

  // ── State ────────────────────────────────────────────────────────────────────
  loading   = signal(false);
  purchases = signal<Purchase[]>([]);
  hasData   = computed(() => this.purchases().length > 0);

  // ── Derived subsets ──────────────────────────────────────────────────────────
  private active  = computed(() => this.purchases().filter(p => p.status !== 'cancelled' && p.status !== 'draft'));
  private paid    = computed(() => this.active().filter(p => p.isPaid === true));
  private pending = computed(() => this.active().filter(p => !p.isPaid));
  private voided  = computed(() => this.purchases().filter(p => p.status === 'cancelled'));
  private drafts  = computed(() => this.purchases().filter(p => p.status === 'draft'));

  // ── Resumen General ─────────────────────────────────────────────────────────
  summary = computed(() => {
    const a = this.active();
    let subtotal        = 0;
    let totalDiscount   = 0;
    let totalTax        = 0;
    let total           = 0;
    let totalIrRet      = 0;
    let totalVatRet     = 0;

    for (const p of a) {
      subtotal      += p.subtotal;
      totalDiscount += p.totalDiscount;
      totalTax      += p.totalTax;
      total         += p.total;
      totalIrRet    += p.totalIrRetention;
      totalVatRet   += p.totalVatRetention;
    }

    const totalNeto       = total - totalIrRet - totalVatRet;
    const totalPagado     = this.paid().reduce((s, p) => s + p.total, 0);
    const totalPendiente  = this.pending().reduce((s, p) => s + p.total, 0);

    return {
      subtotal,
      totalDiscount,
      totalTax,
      total,
      totalIrRet,
      totalVatRet,
      totalNeto,
      totalPagado,
      totalPendiente,
    };
  });

  // ── Contadores de documentos ─────────────────────────────────────────────────
  docCounts = computed(() => {
    const a = this.active();
    const totalAmt = a.reduce((s, p) => s + p.total, 0);
    return {
      recibidas:   a.length,
      pagadas:     this.paid().length,
      pendientes:  this.pending().length,
      anuladas:    this.voided().length,
      borradores:  this.drafts().length,
      total:       a.length + this.voided().length,
      promedio:    a.length > 0 ? totalAmt / a.length : 0,
      pctPagado:   a.length > 0 ? (this.paid().length / a.length) * 100 : 0,
    };
  });

  // ── Por proveedor ────────────────────────────────────────────────────────────
  bySupplier = computed<SupplierEntry[]>(() => {
    const map = new Map<string, SupplierEntry>();
    for (const p of this.active()) {
      const key = p.supplierId;
      const cur = map.get(key) ?? { supplierId: p.supplierId, supplierName: p.supplierName, total: 0 };
      cur.total += p.total;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  });

  // ── Por producto / servicio ──────────────────────────────────────────────────
  byProduct = computed<ProductEntry[]>(() => {
    const map = new Map<string, ProductEntry>();
    for (const p of this.active()) {
      for (const line of p.lines ?? []) {
        const key = line.productId ?? line.productName;
        const desc = line.description ?? line.productName;
        const cur = map.get(key) ?? { description: desc, qty: 0, subtotal: 0, iva: 0, total: 0 };
        cur.qty      += line.qty;
        cur.subtotal += line.subtotal;
        cur.iva      += line.taxAmount;
        cur.total    += line.total;
        map.set(key, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  });

  // ── Por hora ─────────────────────────────────────────────────────────────────
  byHour = computed<HourEntry[]>(() => {
    const arr: HourEntry[] = Array.from({ length: 24 }, (_, h) => ({
      hour: h, label: `${String(h).padStart(2, '0')}:00`, count: 0, total: 0,
    }));
    for (const p of this.active()) {
      const h = p.date.toDate().getHours();
      arr[h].count++;
      arr[h].total += p.total;
    }
    return arr.filter(h => h.count > 0);
  });

  // ── Chart: Compras por hora (Line) ───────────────────────────────────────────
  hourChartData = computed<ChartData>(() => {
    const hours = this.byHour();
    return {
      labels:   hours.map(h => h.label),
      datasets: [
        {
          label:                'Total ($)',
          data:                 hours.map(h => h.total),
          backgroundColor:      'rgba(50, 130, 252, 0.12)',
          borderColor:          'rgba(50, 130, 252, 0.9)',
          borderWidth:          2,
          tension:              0.4,
          fill:                 true,
          pointRadius:          4,
          pointHoverRadius:     7,
          pointBackgroundColor: 'rgba(50, 130, 252, 0.9)',
          yAxisID:              'yMoney',
        },
        {
          label:                'Documentos',
          data:                 hours.map(h => h.count),
          backgroundColor:      'rgba(42, 190, 103, 0.12)',
          borderColor:          'rgba(42, 190, 103, 0.85)',
          borderWidth:          2,
          borderDash:           [5, 3],
          tension:              0.4,
          fill:                 false,
          pointRadius:          3,
          pointHoverRadius:     6,
          pointBackgroundColor: 'rgba(42, 190, 103, 0.85)',
          yAxisID:              'yCount',
        }
      ]
    };
  });

  readonly hourChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx: any) =>
            ctx.datasetIndex === 0
              ? ` Total: $${(ctx.raw as number).toFixed(2)}`
              : ` Docs: ${ctx.raw}`
        }
      }
    },
    scales: {
      x:       { grid: { display: false } },
      yMoney:  { position: 'left',  beginAtZero: true, ticks: { callback: (v: any) => `$${v}` } },
      yCount:  { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { stepSize: 1 } },
    }
  };

  // ── Top 5 proveedores (barras CSS) ───────────────────────────────────────────
  supplierBreakdown = computed(() => {
    const top5 = this.bySupplier().slice(0, 5);
    const max  = top5[0]?.total || 1;
    return top5.map(s => ({
      ...s,
      pct: (s.total / max) * 100,
    }));
  });

  // ── Desglose visual de documentos (barras CSS) ───────────────────────────────
  docBreakdown = computed(() => {
    const d     = this.docCounts();
    const total = d.recibidas || 1;
    return [
      { label: 'Pagadas',    value: d.pagadas,    color: 'var(--cui-success)',   pct: (d.pagadas    / total) * 100 },
      { label: 'Pendientes', value: d.pendientes, color: 'var(--cui-warning)',   pct: (d.pendientes / total) * 100 },
      { label: 'Anuladas',   value: d.anuladas,   color: 'var(--cui-danger)',    pct: (d.anuladas   / total) * 100 },
      { label: 'Borradores', value: d.borradores, color: 'var(--cui-secondary)', pct: (d.borradores / total) * 100 },
    ].filter(r => r.value > 0);
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void { /* usuario inicia con filtros vacíos — debe pulsar Generar */ }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Acciones ─────────────────────────────────────────────────────────────────
  loadData(): void {
    const from = new Date(this.dateFrom() + 'T00:00:00');
    const to   = new Date(this.dateTo()   + 'T23:59:59');
    if (from > to) { this.dateError.set(true); return; }
    this.dateError.set(false);
    this.loading.set(true);
    this.purchases.set([]);

    const sf  = this.supplierFilter().toLowerCase().trim();
    const ccf = this.costCenterFilter().toLowerCase().trim();
    const stf = this.statusFilter();

    this.purchasesSvc.getPurchases({
      dateFrom: Timestamp.fromDate(from),
      dateTo:   Timestamp.fromDate(to),
    }).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        let filtered = data;
        if (sf)  filtered = filtered.filter(p =>
          p.supplierName?.toLowerCase().includes(sf) || p.supplierRuc?.includes(this.supplierFilter().trim()));
        if (ccf) filtered = filtered.filter(p =>
          p.costCenterName?.toLowerCase().includes(ccf));
        if (stf) filtered = filtered.filter(p => p.status === stf);
        this.purchases.set(filtered);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.notifications.error('Error al cargar compras: ' + msg);
        this.loading.set(false);
      }
    });
  }

  exportExcel(): void {
    const period = `${this.dateFrom()}_${this.dateTo()}`;
    const s = this.summary();
    const d = this.docCounts();

    this.excelSvc.export(`Reporte_Compras_${period}`, [
      {
        name: 'Resumen General',
        rows: [
          { 'Concepto': '--- COMPRAS ---',              'Valor USD': '' },
          { 'Concepto': 'Subtotal',                     'Valor USD': s.subtotal },
          { 'Concepto': 'Descuento',                    'Valor USD': s.totalDiscount },
          { 'Concepto': 'IVA',                          'Valor USD': s.totalTax },
          { 'Concepto': 'TOTAL Compras',                'Valor USD': s.total },
          { 'Concepto': 'Retención IR',                 'Valor USD': s.totalIrRet },
          { 'Concepto': 'Retención IVA',                'Valor USD': s.totalVatRet },
          { 'Concepto': 'Total Neto a Pagar',           'Valor USD': s.totalNeto },
          { 'Concepto': '',                              'Valor USD': '' },
          { 'Concepto': '--- ESTADO DE PAGO ---',       'Valor USD': '' },
          { 'Concepto': 'Pagado',                       'Valor USD': s.totalPagado },
          { 'Concepto': 'Pendiente de pago',            'Valor USD': s.totalPendiente },
          { 'Concepto': '',                              'Valor USD': '' },
          { 'Concepto': '--- DOCUMENTOS ---',           'Valor USD': '' },
          { 'Concepto': 'Recibidas',                    'Valor USD': d.recibidas },
          { 'Concepto': 'Pagadas',                      'Valor USD': d.pagadas },
          { 'Concepto': 'Pendientes',                   'Valor USD': d.pendientes },
          { 'Concepto': 'Anuladas',                     'Valor USD': d.anuladas },
          { 'Concepto': 'Borradores',                   'Valor USD': d.borradores },
          { 'Concepto': 'Promedio / documento',         'Valor USD': d.promedio },
        ]
      },
      {
        name: 'Por Proveedor',
        rows: this.bySupplier().map(r => ({
          'Proveedor': r.supplierName,
          'Total':     r.total,
        }))
      },
      {
        name: 'Por Producto',
        rows: this.byProduct().map(r => ({
          'Producto':  r.description,
          'Cantidad':  r.qty,
          'Subtotal':  r.subtotal,
          'IVA':       r.iva,
          'Total':     r.total,
        }))
      },
      {
        name: 'Detalle Compras',
        rows: this.active().map(p => ({
          'N° Compra':          p.fullNumber,
          'N° Factura Prov.':   p.supplierInvoiceNumber,
          'Fecha':              p.date.toDate().toLocaleDateString('es-EC'),
          'Proveedor':          p.supplierName,
          'RUC':                p.supplierRuc,
          'Centro de Costo':    p.costCenterName ?? '',
          'Subtotal':           p.subtotal,
          'IVA':                p.totalTax,
          'Total':              p.total,
          'Ret. IR':            p.totalIrRetention,
          'Ret. IVA':           p.totalVatRetention,
          'Estado':             p.isPaid ? 'Pagada' : 'Pendiente',
        }))
      }
    ]);
  }

  printReport(): void { window.print(); }

  fmt(n: number | undefined | null): string { return (n ?? 0).toFixed(2); }
  pct(n: number): string { return n.toFixed(1) + '%'; }
}
