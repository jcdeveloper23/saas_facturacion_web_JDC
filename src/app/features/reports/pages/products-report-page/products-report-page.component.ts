import { Component, OnInit, OnDestroy, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, take, forkJoin } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import { ChartData } from 'chart.js';
import {
  CardModule, ButtonModule, SpinnerModule, FormModule,
  AlertModule, TableModule, BadgeModule,
  RowComponent, ColComponent
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { ChartjsComponent } from '@coreui/angular-chartjs';

import { ProductsService }    from '../../../products/services/products.service';
import { FamiliesService }    from '../../../products/services/families.service';
import { InvoicesService }    from '../../../invoices/services/invoices.service';
import { PurchasesService }   from '../../../purchases/services/purchases.service';
import { ExcelExportService } from '../../../accounting/services/excel-export.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Product, Family }    from '../../../products/models/product.interface';
import { Invoice }            from '../../../invoices/models/invoice.interface';
import { Purchase }           from '../../../purchases/models/purchase.interface';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ProductReportRow {
  productId:     string;
  sku:           string;
  name:          string;
  familyName:    string;
  type:          'product' | 'service';
  costPrice:     number;
  salePrice:     number;
  margin:        number;
  stockQty:      number;
  stockMin:      number;
  trackStock:    boolean;
  qtySold:       number;
  revenueSold:   number;
  qtyPurchased:  number;
  costPurchased: number;
  rotation:      number;
}

interface FamilyRow {
  familyName:  string;
  stockValue:  number;
  revenueSold: number;
  qtySold:     number;
  avgMargin:   number;
  pct:         number;
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-products-report-page',
  standalone: true,
  templateUrl: './products-report-page.component.html',
  styleUrl: './products-report-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, SpinnerModule, FormModule,
    AlertModule, TableModule, BadgeModule,
    RowComponent, ColComponent,
    IconModule, ChartjsComponent,
  ]
})
export class ProductsReportPageComponent implements OnInit, OnDestroy {
  private productsSvc   = inject(ProductsService);
  private familiesSvc   = inject(FamiliesService);
  private invoicesSvc   = inject(InvoicesService);
  private purchasesSvc  = inject(PurchasesService);
  private excelSvc      = inject(ExcelExportService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── Date defaults ────────────────────────────────────────────────────────────
  readonly today           = new Date();
  readonly firstDayOfMonth = new Date(this.today.getFullYear(), this.today.getMonth(), 1);

  // ── Filter signals ───────────────────────────────────────────────────────────
  dateFrom      = signal(this.firstDayOfMonth.toISOString().split('T')[0]);
  dateTo        = signal(this.today.toISOString().split('T')[0]);
  familyFilter  = signal('');
  typeFilter    = signal<'' | 'product' | 'service'>('');
  stockFilter   = signal<'' | 'low' | 'zero' | 'ok'>('');
  searchFilter  = signal('');
  dateError     = signal(false);

  // ── State signals ────────────────────────────────────────────────────────────
  loading         = signal(false);
  products        = signal<Product[]>([]);
  families        = signal<Family[]>([]);
  invoices        = signal<Invoice[]>([]);
  purchases       = signal<Purchase[]>([]);
  invoicesLoaded  = signal(false);

  hasData         = computed(() => this.products().length > 0);
  hasInvoiceData  = computed(() => this.invoicesLoaded() && this.invoices().length > 0);

  // ── Paginación ───────────────────────────────────────────────────────────────
  readonly pageSizeOptions = [10, 25, 50, 100, 500];
  pageSize     = signal(10);

  // Catálogo
  catalogPage  = signal(1);
  totalCatalogPages = computed(() => Math.ceil(this.byProduct().length / this.pageSize()));
  catalogPageData   = computed(() => {
    const p = this.catalogPage(), s = this.pageSize();
    return this.byProduct().slice((p - 1) * s, p * s);
  });
  catalogPages = computed(() => {
    const total = this.totalCatalogPages(), current = this.catalogPage();
    const pages: number[] = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) pages.push(i);
    }
    return pages;
  });

  // Stock crítico
  criticalPage = signal(1);
  totalCriticalPages = computed(() => Math.ceil(this.stockCritical().length / this.pageSize()));
  criticalPageData   = computed(() => {
    const p = this.criticalPage(), s = this.pageSize();
    return this.stockCritical().slice((p - 1) * s, p * s);
  });
  criticalPages = computed(() => {
    const total = this.totalCriticalPages(), current = this.criticalPage();
    const pages: number[] = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) pages.push(i);
    }
    return pages;
  });

  readonly Math = Math;

  constructor() {
    effect(() => {
      this.familyFilter(); this.typeFilter(); this.stockFilter();
      this.searchFilter(); this.products(); this.pageSize();
      untracked(() => { this.catalogPage.set(1); this.criticalPage.set(1); });
    });
  }

  goToCatalogPage(n: number): void {
    if (n >= 1 && n <= this.totalCatalogPages()) this.catalogPage.set(n);
  }

  goToCriticalPage(n: number): void {
    if (n >= 1 && n <= this.totalCriticalPages()) this.criticalPage.set(n);
  }

  // ── Filtered products ────────────────────────────────────────────────────────
  filteredProducts = computed<Product[]>(() => {
    let list = this.products();
    const fam    = this.familyFilter();
    const type   = this.typeFilter();
    const stock  = this.stockFilter();
    const search = this.searchFilter().toLowerCase().trim();

    if (fam)    list = list.filter(p => p.familyId === fam);
    if (type)   list = list.filter(p => p.type === type);
    if (search) list = list.filter(p =>
      p.name.toLowerCase().includes(search) ||
      p.sku.toLowerCase().includes(search)
    );
    if (stock === 'low')  list = list.filter(p => p.trackStock && p.stockQty > 0 && p.stockQty <= p.stockMin);
    if (stock === 'zero') list = list.filter(p => p.trackStock && p.stockQty <= 0);
    if (stock === 'ok')   list = list.filter(p => !p.trackStock || p.stockQty > p.stockMin);

    return list;
  });

  // ── Catalog summary ──────────────────────────────────────────────────────────
  catalogSummary = computed(() => {
    const list = this.filteredProducts();
    let totalProducts   = list.length;
    let activeWithStock = 0;
    let outOfStock      = 0;
    let lowStock        = 0;
    let stockValue      = 0;
    let stockValueSale  = 0;

    for (const p of list) {
      if (p.stockQty > 0) activeWithStock++;
      if (p.trackStock && p.stockQty <= 0) outOfStock++;
      if (p.trackStock && p.stockQty > 0 && p.stockQty <= p.stockMin) lowStock++;
      stockValue     += (p.stockQty ?? 0) * (p.averageCost ?? 0);
      stockValueSale += (p.stockQty ?? 0) * (p.salePrice ?? 0);
    }

    return { totalProducts, activeWithStock, outOfStock, lowStock, stockValue, stockValueSale };
  });

  // ── byProduct: join catalog + invoice lines + purchase lines ─────────────────
  byProduct = computed<ProductReportRow[]>(() => {
    const products  = this.filteredProducts();
    const invList   = this.invoices();
    const purList   = this.purchases();

    // Build maps: productId -> { qtySold, revenueSold, qtyPurchased, costPurchased }
    const saleMap = new Map<string, { qtySold: number; revenueSold: number }>();
    for (const inv of invList) {
      if (inv.isVoid || inv.isCreditNote) continue;
      for (const line of inv.lines ?? []) {
        const key = line.productId?.trim() || line.description;
        if (!key) continue;
        const cur = saleMap.get(key) ?? { qtySold: 0, revenueSold: 0 };
        cur.qtySold      += line.quantity ?? 0;
        cur.revenueSold  += line.total    ?? 0;
        saleMap.set(key, cur);
      }
    }

    const purchMap = new Map<string, { qtyPurchased: number; costPurchased: number }>();
    for (const pur of purList) {
      if (pur.status === 'cancelled') continue;
      for (const line of pur.lines ?? []) {
        const key = line.productId?.trim();
        if (!key) continue;
        const cur = purchMap.get(key) ?? { qtyPurchased: 0, costPurchased: 0 };
        cur.qtyPurchased  += line.qty   ?? 0;
        cur.costPurchased += line.total ?? 0;
        purchMap.set(key, cur);
      }
    }

    return products.map(p => {
      const sale  = saleMap.get(p.id)  ?? { qtySold: 0, revenueSold: 0 };
      const purch = purchMap.get(p.id) ?? { qtyPurchased: 0, costPurchased: 0 };
      const cost  = p.averageCost ?? p.costPrice ?? 0;
      const margin = p.salePrice > 0
        ? Math.round(((p.salePrice - cost) / p.salePrice) * 10000) / 100
        : 0;
      const rotation = p.trackStock
        ? (p.stockQty > 0 ? sale.qtySold / p.stockQty : sale.qtySold)
        : sale.qtySold;

      return {
        productId:     p.id,
        sku:           p.sku,
        name:          p.name,
        familyName:    p.familyName || 'Sin categoría',
        type:          p.type,
        costPrice:     cost,
        salePrice:     p.salePrice ?? 0,
        margin,
        stockQty:      p.stockQty  ?? 0,
        stockMin:      p.stockMin  ?? 0,
        trackStock:    p.trackStock ?? false,
        qtySold:       sale.qtySold,
        revenueSold:   sale.revenueSold,
        qtyPurchased:  purch.qtyPurchased,
        costPurchased: purch.costPurchased,
        rotation:      Math.round(rotation * 100) / 100,
      };
    }).sort((a, b) => b.revenueSold - a.revenueSold);
  });

  // ── byFamily ─────────────────────────────────────────────────────────────────
  byFamily = computed<FamilyRow[]>(() => {
    const map = new Map<string, FamilyRow>();
    for (const row of this.byProduct()) {
      const cur = map.get(row.familyName) ?? {
        familyName: row.familyName, stockValue: 0, revenueSold: 0, qtySold: 0, avgMargin: 0, pct: 0
      };
      cur.stockValue  += row.stockQty * row.costPrice;
      cur.revenueSold += row.revenueSold;
      cur.qtySold     += row.qtySold;
      map.set(row.familyName, cur);
    }
    // Compute avgMargin per family from byProduct rows
    const countMap = new Map<string, { sum: number; count: number }>();
    for (const row of this.byProduct()) {
      const cur = countMap.get(row.familyName) ?? { sum: 0, count: 0 };
      cur.sum   += row.margin;
      cur.count += 1;
      countMap.set(row.familyName, cur);
    }
    const result = [...map.values()].map(f => {
      const mc = countMap.get(f.familyName);
      return { ...f, avgMargin: mc && mc.count > 0 ? Math.round((mc.sum / mc.count) * 100) / 100 : 0 };
    });
    return result.sort((a, b) => b.revenueSold - a.revenueSold);
  });

  // ── topSold — top 10 by revenueSold ──────────────────────────────────────────
  topSold = computed<ProductReportRow[]>(() =>
    [...this.byProduct()].sort((a, b) => b.revenueSold - a.revenueSold).slice(0, 10)
  );

  // ── stockCritical ─────────────────────────────────────────────────────────────
  stockCritical = computed<ProductReportRow[]>(() =>
    this.byProduct()
      .filter(r => r.trackStock && r.stockQty <= r.stockMin)
      .sort((a, b) => a.stockQty - b.stockQty)
  );

  // ── familyBreakdown — top 6 for bar chart ────────────────────────────────────
  familyBreakdown = computed(() => {
    const top6 = this.byFamily().slice(0, 6);
    const max  = top6[0]?.revenueSold || top6[0]?.stockValue || 1;
    return top6.map(f => ({
      ...f,
      pct: (f.revenueSold > 0 ? f.revenueSold : f.stockValue) / max * 100,
    }));
  });

  // ── Global average margin ────────────────────────────────────────────────────
  globalMargin = computed(() => {
    const rows = this.byProduct();
    if (rows.length === 0) return 0;
    const sum = rows.reduce((s, r) => s + r.margin, 0);
    return Math.round((sum / rows.length) * 100) / 100;
  });

  // ── Chart: Top 10 ventas ─────────────────────────────────────────────────────
  topSoldChartData = computed<ChartData>(() => {
    const rows = this.topSold();
    return {
      labels: rows.map(r => r.name.length > 22 ? r.name.slice(0, 22) + '…' : r.name),
      datasets: [
        {
          label:           'Revenue ($)',
          data:             rows.map(r => r.revenueSold),
          backgroundColor: rows.map((_, i) =>
            `hsla(${210 - i * 18}, 70%, 52%, 0.75)`
          ),
          borderColor: rows.map((_, i) =>
            `hsla(${210 - i * 18}, 70%, 42%, 1)`
          ),
          borderWidth: 1,
          borderRadius: 4,
        }
      ]
    };
  });

  readonly topSoldChartOptions: any = {
    indexAxis: 'y',
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
      x: {
        beginAtZero: true,
        ticks: { callback: (v: any) => `$${v}` },
        grid:  { color: 'rgba(0,0,0,0.05)' }
      },
      y: { grid: { display: false } }
    }
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  ngOnInit(): void { /* usuario inicia con filtros vacíos — debe pulsar Generar */ }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Actions ───────────────────────────────────────────────────────────────────
  loadData(): void {
    const from = new Date(this.dateFrom() + 'T00:00:00');
    const to   = new Date(this.dateTo()   + 'T23:59:59');
    if (from > to) { this.dateError.set(true); return; }
    this.dateError.set(false);
    this.loading.set(true);
    this.invoicesLoaded.set(false);
    this.products.set([]);
    this.families.set([]);
    this.invoices.set([]);
    this.purchases.set([]);

    const tsFrom = Timestamp.fromDate(from);
    const tsTo   = Timestamp.fromDate(to);

    forkJoin({
      products:  this.productsSvc.getActiveProducts().pipe(take(1)),
      invoices:  this.invoicesSvc.getInvoices({ dateFrom: tsFrom, dateTo: tsTo }).pipe(take(1)),
      purchases: this.purchasesSvc.getPurchases({ dateFrom: tsFrom, dateTo: tsTo }).pipe(take(1)),
      families:  this.familiesSvc.getAll().pipe(take(1)),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ products, invoices, purchases, families }) => {
        this.products.set(products);
        this.families.set(families);
        this.invoices.set(invoices.filter(i => !i.isVoid && !(i as any).isCreditNote));
        this.purchases.set(purchases);
        this.invoicesLoaded.set(true);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.notifications.error('Error al cargar el reporte: ' + msg);
        this.loading.set(false);
      }
    });
  }

  exportExcel(): void {
    const period = `${this.dateFrom()}_${this.dateTo()}`;
    const s = this.catalogSummary();

    this.excelSvc.export(`Reporte_Productos_${period}`, [
      {
        name: 'Resumen',
        rows: [
          { 'Concepto': 'Total Productos',            'Valor': s.totalProducts },
          { 'Concepto': 'Con Stock',                  'Valor': s.activeWithStock },
          { 'Concepto': 'Sin Stock',                  'Valor': s.outOfStock },
          { 'Concepto': 'Stock Crítico',              'Valor': s.lowStock },
          { 'Concepto': 'Valor al Costo ($)',         'Valor': s.stockValue },
          { 'Concepto': 'Valor a Precio de Venta ($)', 'Valor': s.stockValueSale },
        ]
      },
      {
        name: 'Catálogo Completo',
        rows: this.filteredProducts().map(p => ({
          'SKU':           p.sku,
          'Nombre':        p.name,
          'Familia':       p.familyName || 'Sin categoría',
          'Tipo':          p.type === 'product' ? 'Producto' : 'Servicio',
          'Costo ($)':     p.averageCost ?? p.costPrice ?? 0,
          'Precio ($)':    p.salePrice ?? 0,
          'Margen %':      p.salePrice > 0
            ? Math.round(((p.salePrice - (p.averageCost ?? p.costPrice ?? 0)) / p.salePrice) * 10000) / 100
            : 0,
          'Stock':         p.stockQty ?? 0,
          'Stock Mín':     p.stockMin ?? 0,
          'Control Stock': p.trackStock ? 'Sí' : 'No',
        }))
      },
      {
        name: 'Rotación del Período',
        rows: this.byProduct().map(r => ({
          'SKU':              r.sku,
          'Nombre':           r.name,
          'Familia':          r.familyName,
          'Qtd. Vendida':     r.qtySold,
          'Revenue ($)':      r.revenueSold,
          'Qtd. Comprada':    r.qtyPurchased,
          'Costo Compra ($)': r.costPurchased,
          'Stock Actual':     r.stockQty,
          'Rotación':         r.rotation,
        }))
      },
      {
        name: 'Stock Crítico',
        rows: this.stockCritical().map(r => ({
          'Nombre':    r.name,
          'SKU':       r.sku,
          'Stock':     r.stockQty,
          'Mínimo':    r.stockMin,
          'Estado':    r.stockQty <= 0 ? 'Sin stock' : 'Crítico',
        }))
      }
    ]);
  }

  printReport(): void { window.print(); }

  fmt(n: number | undefined | null): string { return (n ?? 0).toFixed(2); }
  pct(n: number): string { return n.toFixed(1) + '%'; }
  fmtN(n: number | undefined | null, decimals = 2): string { return (n ?? 0).toFixed(decimals); }
}
