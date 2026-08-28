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

import { InvoicesService }     from '../../../invoices/services/invoices.service';
import { ExcelExportService }  from '../../../accounting/services/excel-export.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Invoice }             from '../../../invoices/models/invoice.interface';

// ─── Agrupación de códigos SRI de pago ───────────────────────────────────────
const PM_CASH       = new Set(['01']);           // Efectivo / Cheque
const PM_CREDIT     = new Set(['19', '18']);     // Tarjeta de crédito / prepago
const PM_DEBIT      = new Set(['16']);           // Tarjeta de débito
const PM_TRANSFER   = new Set(['20']);           // Transferencia / Otros sistema financiero
const PM_DIGITAL    = new Set(['17']);           // Dinero electrónico
const PM_OTHER      = new Set(['15', '21']);     // Compensación de deudas / Endoso

// ─── Interfaces locales ───────────────────────────────────────────────────────
interface VatBreakdownEntry { vatPct: number; taxableBase: number; vatAmount: number; }
interface ProductEntry { description: string; qty: number; subtotal: number; iva: number; total: number; }
interface HourEntry    { hour: number; label: string; count: number; total: number; }
interface PaymentEntry { name: string; total: number; }

@Component({
  selector: 'app-invoices-report-page',
  standalone: true,
  templateUrl: './invoices-report-page.component.html',
  styleUrl: './invoices-report-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, SpinnerModule, FormModule,
    AlertModule, TableModule, BadgeModule,
    RowComponent, ColComponent,
    IconModule, ChartjsComponent,
  ]
})
export class InvoicesReportPageComponent implements OnInit, OnDestroy {
  private invoicesSvc   = inject(InvoicesService);
  private excelSvc      = inject(ExcelExportService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── Date defaults ───────────────────────────────────────────────────────────
  readonly today           = new Date();
  readonly firstDayOfMonth = new Date(this.today.getFullYear(), this.today.getMonth(), 1);

  // ── Filter signals ──────────────────────────────────────────────────────────
  dateFrom         = signal(this.firstDayOfMonth.toISOString().split('T')[0]);
  dateTo           = signal(this.today.toISOString().split('T')[0]);
  customerFilter   = signal('');
  productFilter    = signal('');
  costCenterFilter = signal('');
  dateError        = signal(false);

  // ── State ────────────────────────────────────────────────────────────────────
  loading  = signal(false);
  invoices = signal<Invoice[]>([]);
  hasData  = computed(() => this.invoices().length > 0);

  // ── Derived subsets ──────────────────────────────────────────────────────────
  private active   = computed(() => this.invoices().filter(i => !i.isVoid && !i.isCreditNote && i.status !== 'draft'));
  private voided   = computed(() => this.invoices().filter(i => i.isVoid));
  private credits  = computed(() => this.invoices().filter(i => i.isCreditNote && !i.isVoid));
  private cobrados = computed(() => this.active().filter(i => i.isPaid));
  private pending  = computed(() => this.active().filter(i => !i.isPaid));

  // ── Resumen General ─────────────────────────────────────────────────────────
  summary = computed(() => {
    const a  = this.active();
    const cr = this.credits();

    // Base 0% = líneas con vatPct === 0 (no exento/no objeto, solo tarifa 0%)
    let subtotal0 = 0;
    // Base gravada = líneas con vatPct > 0 (IVA 5%, 8%, 15%, etc.)
    let subtotalIva = 0;
    let totalIva = 0;
    let totalDiscount = 0;
    let totalEmitido = 0;
    let totalCreditNotes = 0;

    for (const inv of a) {
      totalEmitido  += inv.total;
      totalDiscount += inv.discountAmount;
      totalIva      += inv.vatAmount;
      for (const vs of inv.vatSummary ?? []) {
        if (vs.vatPct === 0) subtotal0    += vs.taxableBase;
        else                 subtotalIva  += vs.taxableBase;
      }
    }
    for (const inv of cr) {
      totalCreditNotes += inv.total;
    }

    const totalCobrado  = this.cobrados().reduce((s, i) => s + i.total, 0);
    const totalPendiente = this.pending().reduce((s, i) => s + i.total, 0);

    return {
      subtotal0,
      subtotalIva,
      totalIva,
      totalDiscount,
      totalEmitido,
      totalCreditNotes,
      totalNeto:      totalEmitido - totalCreditNotes,
      totalCobrado,
      totalPendiente,
    };
  });

  // ── Contadores de documentos ─────────────────────────────────────────────────
  docCounts = computed(() => {
    const a = this.active();
    const totalAmt = a.reduce((s, i) => s + i.total, 0);
    return {
      emitidos:    a.length,
      cobrados:    this.cobrados().length,
      pendientes:  this.pending().length,
      anulados:    this.voided().length,
      creditNotes: this.credits().length,
      total:       a.length + this.voided().length,
      promedio:    a.length > 0 ? totalAmt / a.length : 0,
      pctCobrado:  a.length > 0 ? (this.cobrados().length / a.length) * 100 : 0,
    };
  });

  // ── Desglose IVA ────────────────────────────────────────────────────────────
  vatBreakdown = computed<VatBreakdownEntry[]>(() => {
    const map = new Map<number, VatBreakdownEntry>();
    for (const inv of this.active()) {
      for (const vs of inv.vatSummary ?? []) {
        const cur = map.get(vs.vatPct) ?? { vatPct: vs.vatPct, taxableBase: 0, vatAmount: 0 };
        cur.taxableBase += vs.taxableBase;
        cur.vatAmount   += vs.vatAmount;
        map.set(vs.vatPct, cur);
      }
    }
    return [...map.values()].sort((a, b) => a.vatPct - b.vatPct);
  });

  // ── Resumen de cobros ────────────────────────────────────────────────────────
  paymentSummary = computed(() => {
    let cash = 0, credit = 0, debit = 0, transfer = 0, digital = 0, other = 0;
    for (const inv of this.cobrados()) {
      for (const pm of inv.paymentMethods ?? []) {
        const amt = pm.amount ?? 0;
        if (PM_CASH.has(pm.code))     cash     += amt;
        else if (PM_CREDIT.has(pm.code))  credit   += amt;
        else if (PM_DEBIT.has(pm.code))   debit    += amt;
        else if (PM_TRANSFER.has(pm.code)) transfer += amt;
        else if (PM_DIGITAL.has(pm.code)) digital  += amt;
        else                              other    += amt;
      }
    }
    const totalCobrado  = this.cobrados().reduce((s, i) => s + i.total, 0);
    const totalEmitido  = this.active().reduce((s, i) => s + i.total, 0);
    const totalPendiente = this.pending().reduce((s, i) => s + i.total, 0);
    return { cash, credit, debit, transfer, digital, other, totalCobrado, totalEmitido, totalPendiente };
  });

  // ── Ventas por producto ──────────────────────────────────────────────────────
  byProduct = computed<ProductEntry[]>(() => {
    const map = new Map<string, ProductEntry>();
    const pf  = this.productFilter().toLowerCase().trim();
    for (const inv of this.active()) {
      for (const line of inv.lines ?? []) {
        if (pf && !line.description.toLowerCase().includes(pf)) continue;
        const key = line.productId ?? line.description;
        const cur = map.get(key) ?? { description: line.description, qty: 0, subtotal: 0, iva: 0, total: 0 };
        cur.qty      += line.quantity;
        cur.subtotal += line.subtotal;
        cur.iva      += line.vatAmount;
        cur.total    += line.total;
        map.set(key, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  });

  // ── Ventas por hora ──────────────────────────────────────────────────────────
  byHour = computed<HourEntry[]>(() => {
    const arr: HourEntry[] = Array.from({ length: 24 }, (_, h) => ({
      hour: h, label: `${String(h).padStart(2, '0')}:00`, count: 0, total: 0,
    }));
    for (const inv of this.active()) {
      const h = inv.date.toDate().getHours();
      arr[h].count++;
      arr[h].total += inv.total;
    }
    return arr.filter(h => h.count > 0);
  });

  // ── Chart: Ventas por hora (Line) ────────────────────────────────────────────
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

  // ── Desglose visual de documentos (barras CSS) ───────────────────────────────
  docBreakdown = computed(() => {
    const d = this.docCounts();
    const total = d.emitidos || 1;
    return [
      { label: 'Cobrados',    value: d.cobrados,   color: 'var(--cui-success)', pct: (d.cobrados   / total) * 100 },
      { label: 'Pendientes',  value: d.pendientes, color: 'var(--cui-warning)', pct: (d.pendientes / total) * 100 },
      { label: 'Anulados',    value: d.anulados,   color: 'var(--cui-danger)',  pct: (d.anulados   / total) * 100 },
      { label: 'N. Crédito',  value: d.creditNotes,color: '#8250df',            pct: (d.creditNotes/ total) * 100 },
    ].filter(r => r.value > 0);
  });

  // ── Chart: Top productos (Bar horizontal) ─────────────────────────────────────
  productChartData = computed<ChartData>(() => {
    const top = this.byProduct().slice(0, 10);
    return {
      labels:   top.map(p => p.description.length > 28 ? p.description.slice(0, 26) + '…' : p.description),
      datasets: [{
        label: 'Total ($)',
        data:  top.map(p => p.total),
        backgroundColor: top.map((_, i) => `hsla(${210 + i * 18}, 80%, 55%, 0.75)`),
        borderRadius: 4,
        borderWidth: 0,
      }]
    };
  });

  readonly productChartOptions: any = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (ctx: any) => ` $${(ctx.raw as number).toFixed(2)}` }
      }
    },
    scales: {
      x: { beginAtZero: true, ticks: { callback: (v: any) => `$${v}` } },
      y: { grid: { display: false } }
    }
  };

  // ── Desglose visual de cobros (barras CSS) ───────────────────────────────────
  paymentBreakdown = computed(() => {
    const p = this.paymentSummary();
    const total = p.totalCobrado || 1;
    return [
      { label: 'Efectivo / Cheque', value: p.cash,     color: '#2abe67' },
      { label: 'T. Crédito',        value: p.credit,   color: '#3282fc' },
      { label: 'T. Débito',         value: p.debit,    color: '#00bcd4' },
      { label: 'Transferencia',     value: p.transfer, color: '#8250df' },
      { label: 'Dinero digital',    value: p.digital,  color: '#f4b500' },
      { label: 'Otros',             value: p.other,    color: '#969696' },
    ]
      .filter(r => r.value > 0)
      .map(r => ({ ...r, pct: (r.value / total) * 100 }));
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
    this.invoices.set([]);

    const cf  = this.customerFilter().toLowerCase().trim();
    const ccf = this.costCenterFilter().toLowerCase().trim();

    this.invoicesSvc.getInvoices({
      dateFrom: Timestamp.fromDate(from),
      dateTo:   Timestamp.fromDate(to),
    }).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        let filtered = data;
        if (cf)  filtered = filtered.filter(i =>
          i.customerName?.toLowerCase().includes(cf) || i.customerTaxId?.includes(this.customerFilter().trim()));
        if (ccf) filtered = filtered.filter(i =>
          i.costCenterName?.toLowerCase().includes(ccf));
        this.invoices.set(filtered);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.notifications.error('Error al cargar facturas: ' + msg);
        this.loading.set(false);
      }
    });
  }

  exportExcel(): void {
    const period = `${this.dateFrom()}_${this.dateTo()}`;
    const s = this.summary();
    const d = this.docCounts();
    const p = this.paymentSummary();

    this.excelSvc.export(`Reporte_Ventas_${period}`, [
      {
        name: 'Resumen General',
        rows: [
          { 'Concepto': '--- VENTAS ---',          'Valor USD': '' },
          { 'Concepto': 'Subtotal 0%',              'Valor USD': s.subtotal0 },
          { 'Concepto': 'Subtotal IVA (gravado)',   'Valor USD': s.subtotalIva },
          { 'Concepto': 'IVA',                      'Valor USD': s.totalIva },
          { 'Concepto': 'Descuento',                'Valor USD': s.totalDiscount },
          { 'Concepto': 'TOTAL Emitido',            'Valor USD': s.totalEmitido },
          { 'Concepto': 'Notas de Crédito',         'Valor USD': -s.totalCreditNotes },
          { 'Concepto': 'Total Neto (emitido − NC)','Valor USD': s.totalNeto },
          { 'Concepto': '',                          'Valor USD': '' },
          { 'Concepto': '--- COBROS ---',           'Valor USD': '' },
          { 'Concepto': 'Efectivo / Cheque',        'Valor USD': p.cash },
          { 'Concepto': 'Tarjeta de Crédito',       'Valor USD': p.credit },
          { 'Concepto': 'Tarjeta de Débito',        'Valor USD': p.debit },
          { 'Concepto': 'Transferencia',            'Valor USD': p.transfer },
          { 'Concepto': 'Dinero Digital',           'Valor USD': p.digital },
          { 'Concepto': 'Otras formas',             'Valor USD': p.other },
          { 'Concepto': 'TOTAL Cobrado',            'Valor USD': p.totalCobrado },
          { 'Concepto': 'Pendiente de cobro',       'Valor USD': p.totalPendiente },
          { 'Concepto': '',                          'Valor USD': '' },
          { 'Concepto': '--- DOCUMENTOS ---',       'Valor USD': '' },
          { 'Concepto': 'Emitidos',                 'Valor USD': d.emitidos },
          { 'Concepto': 'Cobrados',                 'Valor USD': d.cobrados },
          { 'Concepto': 'Pendientes',               'Valor USD': d.pendientes },
          { 'Concepto': 'Anulados',                 'Valor USD': d.anulados },
          { 'Concepto': 'Notas de Crédito',         'Valor USD': d.creditNotes },
          { 'Concepto': 'Promedio / documento',     'Valor USD': d.promedio },
        ]
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
        name: 'Por Hora',
        rows: this.byHour().map(r => ({
          'Hora':        r.label,
          'Documentos':  r.count,
          'Total':       r.total,
        }))
      },
      {
        name: 'Detalle Facturas',
        rows: this.active().map(i => ({
          'N° Factura':      i.fullNumber,
          'Fecha':           i.date.toDate().toLocaleDateString('es-EC'),
          'Cliente':         i.customerName,
          'RUC/CI':          i.customerTaxId,
          'Centro de Costo': i.costCenterName ?? '',
          'Subtotal':        i.netAmount,
          'IVA':             i.vatAmount,
          'Total':           i.total,
          'Estado':          i.isPaid ? 'Cobrada' : 'Pendiente',
        }))
      }
    ]);
  }

  printReport(): void { window.print(); }

  fmt(n: number | undefined | null): string { return (n ?? 0).toFixed(2); }
  pct(n: number): string { return n.toFixed(1) + '%'; }
}
