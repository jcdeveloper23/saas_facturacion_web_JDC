import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil, of, take } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Functions, httpsCallable } from '@angular/fire/functions';

import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { InvoicesService }   from './services/invoices.service';
import { SettingsService }   from '../settings/services/settings.service';
import { NotificationService } from '../../core/services/notification.service';
import { TenantService }       from '../../core/services/tenant.service';
import {
  Invoice, InvoiceStatus,
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  SRI_STATUS_LABELS, SRI_STATUS_COLORS, SriDocumentStatus,
  calcInvoiceTotals
} from './models/invoice.interface';
import { Timestamp } from '@angular/fire/firestore';

import { DocumentSeries } from '../settings/models/settings.interfaces';

export type DateRangeMode = 'today' | 'week' | 'month' | 'year';

export interface Gap       { seriesCode: string; number: number; }
export interface LineMatch { invoice: Invoice; lineDesc: string; lineSku: string; }

@Component({
  selector: 'app-invoices-list',
  standalone: true,
  templateUrl: './invoices-list.component.html',
  styles: [`
    /* ── Page icon ─────────────────────────────────────────────────────── */
    .page-icon {
      width:36px; height:36px; border-radius:10px; flex-shrink:0;
      background:linear-gradient(135deg,#321fdb 0%,#4638c2 100%);
      box-shadow:0 2px 8px rgba(50,31,219,.4);
      display:flex; align-items:center; justify-content:center;
    }

    /* ── Stat strip ──────────────────────────────────────────────────── */
    .stat-strip { display:flex; gap:.25rem; flex-wrap:wrap; align-items:center; }
    .stat-item {
      display:inline-flex; align-items:center; gap:.3rem;
      padding:.2rem .65rem; border-radius:99px;
      font-size:.75rem; border:1px solid var(--cui-border-color);
      color:var(--cui-secondary-color); background:transparent;
      transition:background .12s, color .12s;
    }
    .stat-item--click { cursor:pointer; }
    .stat-item--click:hover { background:var(--cui-tertiary-bg); color:var(--cui-body-color); }
    .stat-item--active { background:var(--cui-primary-bg-subtle); color:var(--cui-primary); border-color:var(--cui-primary-border-subtle); }
    .stat-item--warn { color:var(--cui-warning); border-color:rgba(var(--cui-warning-rgb),.3); }
    .stat-item--warn.stat-item--click:hover { background:var(--cui-warning-bg-subtle); }
    .stat-val { font-weight:600; }
    .stat-label-text { font-size:.7rem; color:var(--cui-secondary-color); }
    .stat-sep { width:1px; height:14px; background:var(--cui-border-color); margin:0 .15rem; flex-shrink:0; }

    /* ── Seg tabs ────────────────────────────────────────────────────── */
    .seg-tabs {
      display:flex; gap:2px;
      background:var(--cui-tertiary-bg);
      border:1px solid var(--cui-border-color);
      border-radius:9px; padding:3px; flex-shrink:0;
    }
    .seg-tab {
      font-size:.78rem; padding:4px 12px; border-radius:6px;
      border:1px solid transparent; background:transparent;
      color:var(--cui-secondary-color);
      cursor:pointer; transition:all .15s;
      display:flex; align-items:center; gap:5px; white-space:nowrap;
    }
    .seg-tab:hover { color:var(--cui-body-color); }
    .seg-tab.active { background:var(--cui-card-bg); border-color:var(--cui-border-color); color:var(--cui-primary); font-weight:500; }
    .seg-count {
      font-size:.65rem; font-weight:700;
      background:var(--cui-secondary-bg); color:var(--cui-secondary-color);
      border-radius:999px; padding:0 5px; min-width:18px;
      text-align:center; line-height:1.6;
    }

    /* ── Search ──────────────────────────────────────────────────────── */
    .search-wrap { position:relative; display:flex; align-items:center; flex:1; min-width:200px; max-width:320px; }
    .search-icon { position:absolute; left:10px; color:var(--cui-secondary-color); pointer-events:none; display:flex; }
    .search-input {
      width:100%; padding:6px 28px 6px 32px;
      border:1px solid var(--cui-border-color); border-radius:8px; font-size:.83rem;
      background:var(--cui-input-bg); color:var(--cui-body-color);
      outline:none; transition:border-color .15s, box-shadow .15s;
    }
    .search-input:focus { border-color:var(--cui-primary); box-shadow:0 0 0 3px rgba(var(--cui-primary-rgb),.15); }
    .search-clear { position:absolute; right:8px; background:none; border:none; padding:2px; color:var(--cui-secondary-color); cursor:pointer; }
    .search-clear:hover { color:var(--cui-danger); }

    /* ── Filter select wrap ──────────────────────────────────────────── */
    .filter-select-wrap {
      display:flex; align-items:center; gap:4px;
      border:1px solid var(--cui-border-color); border-radius:8px;
      background:var(--cui-input-bg); padding:0 8px;
      transition:border-color .15s, box-shadow .15s;
    }
    .filter-select-wrap:focus-within { border-color:var(--cui-primary); box-shadow:0 0 0 3px rgba(var(--cui-primary-rgb),.15); }
    .filter-select-wrap.active { border-color:var(--cui-primary); background:var(--cui-primary-bg-subtle); }
    .filter-select {
      border:none; background:transparent; outline:none;
      font-size:.82rem; padding:6px 2px; color:var(--cui-body-color);
      cursor:pointer; -webkit-appearance:none; appearance:none;
      min-width:110px; max-width:180px;
    }
    .filter-icon { color:var(--cui-secondary-color); flex-shrink:0; display:flex; }

    /* ── More filters button ─────────────────────────────────────────── */
    .more-filters-btn {
      display:flex; align-items:center; gap:5px;
      font-size:.82rem; padding:6px 12px; border-radius:8px;
      border:1px solid var(--cui-border-color); background:var(--cui-input-bg);
      color:var(--cui-body-color); cursor:pointer; transition:all .15s; white-space:nowrap;
    }
    .more-filters-btn:hover, .more-filters-btn.open { border-color:var(--cui-primary); color:var(--cui-primary); background:var(--cui-primary-bg-subtle); }
    .more-count {
      background:var(--cui-primary); color:#fff; font-size:.65rem; font-weight:700;
      border-radius:999px; padding:0 6px; min-width:18px; text-align:center; line-height:1.6;
    }

    /* ── Expandable filter panel ─────────────────────────────────────── */
    .filter-panel { border-top:1px solid var(--cui-border-color); background:var(--cui-tertiary-bg); animation:slideDown .18s ease; }
    @keyframes slideDown { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }

    /* ── Active chips ────────────────────────────────────────────────── */
    .chips-row { display:flex; align-items:center; gap:.3rem; flex-wrap:wrap; padding:.35rem .75rem; border-top:1px solid var(--cui-border-color); background:var(--cui-tertiary-bg); }
    .active-chip {
      display:inline-flex; align-items:center; gap:4px; font-size:.72rem;
      background:var(--cui-primary-bg-subtle); color:var(--cui-primary);
      border:1px solid var(--cui-primary-border-subtle); border-radius:999px; padding:2px 10px;
    }
    .chip-remove { cursor:pointer; opacity:.7; font-size:.9rem; line-height:1; }
    .chip-remove:hover { opacity:1; }
    .filter-clear-btn {
      font-size:.75rem; color:var(--cui-danger); background:var(--cui-danger-bg-subtle);
      border:1px solid var(--cui-danger-border-subtle); border-radius:6px; padding:3px 10px;
      cursor:pointer; display:flex; align-items:center; gap:4px; transition:filter .15s;
    }
    .filter-clear-btn:hover { filter:brightness(.95); }

    /* ── Table ───────────────────────────────────────────────────────── */
    .inv-table { width:100%; border-collapse:collapse; }
    .inv-table thead th {
      font-size:.69rem; font-weight:500; text-transform:uppercase; letter-spacing:.05em;
      color:var(--cui-tertiary-color); padding:.35rem .6rem;
      border-bottom:1px solid var(--cui-border-color); background:var(--cui-tertiary-bg);
      white-space:nowrap;
    }
    .inv-table tbody tr { cursor:pointer; }
    .inv-table tbody tr:hover td { background:var(--cui-tertiary-bg); }
    .inv-table tbody td { padding:.38rem .6rem; font-size:.82rem; border-bottom:1px solid var(--cui-border-color); vertical-align:middle; }
    .inv-table tbody tr:last-child td { border-bottom:none; }
    .inv-table tbody tr.row-void td { opacity:.5; }

    .inv-num  { font-family:monospace; font-size:.78rem; font-weight:500; }
    .inv-sub  { font-size:.72rem; color:var(--cui-secondary-color); }
    .inv-name { font-size:.83rem; font-weight:500; }
    .inv-meta { font-size:.75rem; color:var(--cui-secondary-color); }
    .inv-amt  { font-family:monospace; font-size:.82rem; text-align:right; white-space:nowrap; }
    .inv-amt--total { font-weight:600; }
    .date-cell { font-size:.82rem; white-space:nowrap; }

    .row-indicators { display:flex; gap:2px; align-items:center; flex-wrap:nowrap; }
    .row-ind { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:4px; font-size:.7rem; }
    .row-ind--paid    { background:rgba(var(--cui-success-rgb),.12); color:var(--cui-success); }
    .row-ind--void    { background:rgba(var(--cui-danger-rgb),.12);  color:var(--cui-danger); }
    .row-ind--cn      { background:rgba(var(--cui-warning-rgb),.12); color:var(--cui-warning); }
    .row-ind--overdue { background:rgba(var(--cui-danger-rgb),.12);  color:var(--cui-danger); }

    .due-today   { color:var(--cui-warning); font-weight:600; }
    .due-overdue { color:var(--cui-danger);  font-weight:600; }
    .notes-cell  { max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.76rem; color:var(--cui-secondary-color); }

    /* ── Table footer ────────────────────────────────────────────────── */
    .table-footer { display:flex; justify-content:space-between; align-items:center; padding:.4rem .75rem; font-size:.75rem; color:var(--cui-secondary-color); border-top:1px solid var(--cui-border-color); }
    .table-footer-totals { display:flex; gap:1.5rem; flex-wrap:wrap; }
    .table-footer-total { font-family:monospace; font-weight:600; color:var(--cui-body-color); }

    /* ── Gaps alert ──────────────────────────────────────────────────── */
    .gaps-alert { display:flex; align-items:center; gap:.5rem; padding:.45rem .75rem; background:rgba(var(--cui-warning-rgb),.08); border:1px solid rgba(var(--cui-warning-rgb),.3); border-radius:8px; margin-bottom:.75rem; font-size:.82rem; }

    /* ── Line search / modal ─────────────────────────────────────────── */
    .line-result-row { padding:.45rem .75rem; cursor:pointer; border-bottom:1px solid var(--cui-border-color); }
    .line-result-row:last-child { border-bottom:none; }
    .line-result-row:hover { background:var(--cui-tertiary-bg); }
    .line-result-inv { font-family:monospace; font-size:.8rem; font-weight:500; }
    .line-result-detail { font-size:.75rem; color:var(--cui-secondary-color); }
  `],
  imports: [
    CommonModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective,
    HasPermissionDirective
  ]
})
export class InvoicesListComponent implements OnInit, OnDestroy {
  private svc           = inject(InvoicesService);
  private settingsSvc   = inject(SettingsService);
  private notifications = inject(NotificationService);
  private tenantSvc     = inject(TenantService);
  private functions     = inject(Functions);
  private router        = inject(Router);
  private destroy$      = new Subject<void>();

  // ── Core state ────────────────────────────────────────────────────────────
  invoices        = signal<Invoice[]>([]);
  loading         = signal(true);
  searchTerm      = signal('');
  statusFilter    = signal<InvoiceStatus | null>(null);
  yearFilter      = signal(new Date().getFullYear().toString());
  dateRangeMode   = signal<DateRangeMode>('today');

  // ── Advanced filters ──────────────────────────────────────────────────────
  showMoreFilters = signal(false);
  dateFrom            = signal('');
  dateTo              = signal('');
  seriesFilter        = signal('');
  series              = signal<DocumentSeries[]>([]);

  // ── Modals ─────────────────────────────────────────────────────────────────
  showLineSearch = signal(false);
  lineSearchTerm = signal('');
  showGapsModal  = signal(false);

  // ── SRI actions state ──────────────────────────────────────────────────────
  reenviarLoading     = signal<string | null>(null); // invoiceId being retried
  checkStatusLoading  = signal<string | null>(null);
  downloadingDoc      = signal<string | null>(null); // '{docId}-{fileType}' mientras descarga

  // ── Static lookups ─────────────────────────────────────────────────────────
  readonly STATUS_LABELS      = INVOICE_STATUS_LABELS;
  readonly STATUS_COLORS      = INVOICE_STATUS_COLORS;
  readonly SRI_STATUS_LABELS  = SRI_STATUS_LABELS;
  readonly SRI_STATUS_COLORS  = SRI_STATUS_COLORS;
  readonly years              = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
  readonly DATE_RANGE_MODES: DateRangeMode[] = ['today', 'week', 'month', 'year'];
  readonly DATE_RANGE_LABELS: Record<DateRangeMode, string> = {
    today: 'Hoy',
    week:  'Esta semana',
    month: 'Este mes',
    year:  'Este año',
  };

  // ── Computed: filtered list ────────────────────────────────────────────────
  filtered = computed(() => {
    const term   = this.searchTerm().toLowerCase().trim();
    const from   = this.dateFrom();
    const to     = this.dateTo();
    const series = this.seriesFilter();
    let list     = this.invoices();

    if (this.statusFilter()) list = list.filter(i => i.status === this.statusFilter());
    if (series)              list = list.filter(i => i.seriesCode === series);
    if (from)                list = list.filter(i => this.tsToStr(i.date) >= from);
    if (to)                  list = list.filter(i => this.tsToStr(i.date) <= to);
    if (term) {
      list = list.filter(i =>
        i.fullNumber.includes(term)                       ||
        i.customerName.toLowerCase().includes(term)       ||
        i.customerTaxId.includes(term)                    ||
        (i.notes              ?? '').toLowerCase().includes(term) ||
        (i.customerReference  ?? '').toLowerCase().includes(term)
      );
    }
    return list;
  });

  // ── Computed: status pill counts ──────────────────────────────────────────
  counts = computed(() => {
    const all = this.invoices();
    return {
      total:       all.length,
      draft:       all.filter(i => i.status === 'draft').length,
      issued:      all.filter(i => i.status === 'issued').length,
      paid:        all.filter(i => i.status === 'paid').length,
      void:        all.filter(i => i.status === 'void').length,
      credit_note: all.filter(i => i.status === 'credit_note').length,
    };
  });

  // ── Computed: footer totals ───────────────────────────────────────────────
  totalAmount   = computed(() => this.filtered().filter(i => !i.isVoid).reduce((s, i) => s + (i.total ?? 0), 0));
  totalNet      = computed(() => this.filtered().filter(i => !i.isVoid).reduce((s, i) => s + (i.netAmount ?? 0), 0));
  totalVat      = computed(() => this.filtered().filter(i => !i.isVoid).reduce((s, i) => s + (i.vatAmount ?? 0), 0));

  hasActiveFilters = computed(() => this.activeFilterCount() > 0);
  activeFilterCount = computed(() =>
    [!!this.dateFrom(), !!this.dateTo(), !!this.seriesFilter()].filter(Boolean).length
  );
  overdueCount = computed(() => this.invoices().filter(i => this.isOverdue(i)).length);

  // ── Computed: line search results (client-side) ───────────────────────────
  lineResults = computed<LineMatch[]>(() => {
    const term = this.lineSearchTerm().toLowerCase().trim();
    if (term.length < 2) return [];
    const results: LineMatch[] = [];
    for (const inv of this.invoices()) {
      for (const line of (inv.lines ?? [])) {
        if (
          (line.description ?? '').toLowerCase().includes(term) ||
          (line.productSku  ?? '').toLowerCase().includes(term)
        ) {
          results.push({ invoice: inv, lineDesc: line.description, lineSku: line.productSku ?? '' });
          break; // one result per invoice
        }
      }
      if (results.length >= 60) break;
    }
    return results;
  });

  // ── Computed: numbering gaps ──────────────────────────────────────────────
  gaps = computed<Gap[]>(() => {
    const byKey = new Map<string, number[]>();
    for (const inv of this.invoices()) {
      if (inv.isVoid || !inv.number) continue;
      const nums = byKey.get(inv.seriesCode) ?? [];
      nums.push(inv.number);
      byKey.set(inv.seriesCode, nums);
    }
    const result: Gap[] = [];
    for (const [seriesCode, nums] of byKey) {
      nums.sort((a, b) => a - b);
      for (let i = 1; i < nums.length; i++) {
        for (let n = nums[i - 1] + 1; n < nums[i]; n++) {
          result.push({ seriesCode, number: n });
        }
      }
    }
    return result;
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadInvoices();
    this.settingsSvc.getDocumentSeries().pipe(take(1)).subscribe({
      next: list => this.series.set(list.filter(s => s.documentType === 'invoice'))
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  /** Returns the Firestore Timestamp boundaries for the active date range mode. */
  private dateRangeTimestamps(): { dateFrom: Timestamp; dateTo: Timestamp } {
    const now   = new Date();
    const mode  = this.dateRangeMode();

    let from: Date;
    let to: Date;

    if (mode === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      to   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (mode === 'week') {
      // Monday as first day of week
      const day  = now.getDay(); // 0=Sun
      const diff = (day === 0 ? -6 : 1 - day);
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0, 0);
      to   = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 23, 59, 59, 999);
    } else if (mode === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      to   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      // year — use full fiscal year
      from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      to   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    }

    return { dateFrom: Timestamp.fromDate(from), dateTo: Timestamp.fromDate(to) };
  }

  private loadInvoices(): void {
    this.loading.set(true);
    this.invoices.set([]);

    const { dateFrom, dateTo } = this.dateRangeTimestamps();

    this.svc.getInvoices({ dateFrom, dateTo }).pipe(
      catchError(err => {
        console.error('[InvoicesList] error:', err);
        this.notifications.error('Error cargando facturas: ' + (err?.message ?? err));
        this.loading.set(false);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: list => {
        this.invoices.set(list);
        this.loading.set(false);
      }
    });
  }

  changeDateRangeMode(mode: DateRangeMode): void {
    this.dateRangeMode.set(mode);
    // Update yearFilter to keep the year-based fallback in sync for credit note creation
    this.yearFilter.set(new Date().getFullYear().toString());
    this.destroy$.next();
    this.loadInvoices();
  }

  changeYear(year: string): void {
    this.yearFilter.set(year);
    this.destroy$.next();
    this.loadInvoices();
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  openNew(): void  { this.router.navigate(['/invoices', 'new']); }
  openEdit(inv: Invoice): void { this.router.navigate(['/invoices', inv.id, 'edit']); }

  // ── Filters ───────────────────────────────────────────────────────────────
  setStatusFilter(status: InvoiceStatus | null): void { this.statusFilter.set(status); }

  clearFilters(): void {
    this.searchTerm.set('');
    this.statusFilter.set(null);
    this.dateFrom.set('');
    this.dateTo.set('');
    this.seriesFilter.set('');
  }

  // ── Row helpers ───────────────────────────────────────────────────────────
  isOverdue(inv: Invoice): boolean {
    if (!inv.dueDate || inv.isPaid || inv.isVoid || inv.status === 'draft') return false;
    return this.tsToDate(inv.dueDate) < new Date();
  }

  isDueToday(inv: Invoice): boolean {
    if (!inv.dueDate || inv.isPaid || inv.isVoid || inv.status === 'draft') return false;
    const due   = this.tsToDate(inv.dueDate);
    const today = new Date();
    return due.toDateString() === today.toDateString();
  }

  dueDateClass(inv: Invoice): string {
    if (this.isOverdue(inv))  return 'due-overdue';
    if (this.isDueToday(inv)) return 'due-today';
    return '';
  }

  // ── Status actions ────────────────────────────────────────────────────────
  async markPaid(inv: Invoice, event: Event): Promise<void> {
    event.stopPropagation();
    if (inv.status !== 'issued') return;
    try {
      await this.svc.markPaid(inv.id);
      this.notifications.success('Factura marcada como pagada');
    } catch {
      this.notifications.error('Error al actualizar estado');
    }
  }

  async markVoid(inv: Invoice, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(`¿Anular factura ${inv.fullNumber}?`)) return;
    try {
      await this.svc.markVoid(inv.id);
      this.notifications.success('Factura anulada');
    } catch {
      this.notifications.error('Error al anular');
    }
  }

  async deleteInvoice(inv: Invoice, event: Event): Promise<void> {
    event.stopPropagation();
    if (inv.status !== 'draft') return;
    if (!confirm(`¿Eliminar borrador ${inv.fullNumber}?`)) return;
    try {
      await this.svc.deleteInvoice(inv.id);
      this.notifications.success('Borrador eliminado');
    } catch {
      this.notifications.error('Error al eliminar');
    }
  }

  // ── Nota de Crédito ──────────────────────────────────────────────────────
  async createCreditNote(inv: Invoice, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(`¿Crear nota de crédito para la factura ${inv.fullNumber}?`)) return;
    try {
      const today = new Date();
      const lines = inv.lines.map(l => ({ ...l, id: crypto.randomUUID() }));
      const totals = calcInvoiceTotals(lines, inv.globalDiscountPct);

      const input: Partial<Invoice> & Record<string, any> = {
        seriesCode:            inv.seriesCode,
        seriesEstablishment:   inv.seriesEstablishment,
        seriesEmissionPoint:   inv.seriesEmissionPoint,
        fiscalYear:            new Date().getFullYear().toString(),
        date:                  Timestamp.fromDate(today),
        dueDate:               Timestamp.fromDate(today),
        customerId:            inv.customerId,
        customerCode:          inv.customerCode,
        customerName:          inv.customerName,
        customerTaxId:         inv.customerTaxId,
        customerTaxIdType:     inv.customerTaxIdType,
        customerAddress:       inv.customerAddress ?? '',
        customerCity:          inv.customerCity ?? '',
        customerProvince:      inv.customerProvince ?? '',
        customerEmail:         inv.customerEmail ?? '',
        warehouseCode:         inv.warehouseCode,
        paymentTermCode:       inv.paymentTermCode,
        currency:              inv.currency,
        exchangeRate:          inv.exchangeRate,
        agentCode:             inv.agentCode ?? '',
        globalDiscountPct:     inv.globalDiscountPct,
        customerReference:     inv.customerReference ?? '',
        lines,
        status:                'draft',
        isPaid:                false,
        isVoid:                false,
        isCreditNote:               true,
        rectifiedInvoiceId:         inv.id,
        rectifiedInvoiceNumber:     inv.fullNumber,
        rectifiedInvoiceAuthNumber: inv.authorizationNumber ?? '',
        rectifiedInvoiceDate:       inv.date,
        creditNoteMotivo:           '',
        notes:                      `Nota de crédito de ${inv.fullNumber}`,
        paymentMethods:        inv.paymentMethods ?? [{ code: '01', name: 'Efectivo', amount: totals.total }],
        ...totals,
      };

      const id = await this.svc.createInvoice(input as any);
      this.notifications.success(`Nota de crédito creada como borrador`);
      this.router.navigate(['/invoices', id, 'edit']);
    } catch (err: unknown) {
      this.notifications.error('Error al crear nota de crédito: ' + ((err as any)?.message ?? err));
    }
  }

  // ── SRI actions ──────────────────────────────────────────────────────────
  async reenviarSri(inv: Invoice, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.reenviarLoading()) return;
    this.reenviarLoading.set(inv.id);
    try {
      const fn = httpsCallable<{ invoiceId: string; companyId: string }, { success: boolean }>(
        this.functions, 'sendToSri'
      );
      await fn({ invoiceId: inv.id, companyId: this.tenantSvc.companyId });
      this.notifications.success('Factura enviada al SRI correctamente');
    } catch (err: unknown) {
      const msg = (err as any)?.message ?? 'Error al reenviar al SRI';
      this.notifications.error(msg);
    } finally {
      this.reenviarLoading.set(null);
    }
  }

  async checkSriStatus(inv: Invoice, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.checkStatusLoading()) return;
    this.checkStatusLoading.set(inv.id);
    try {
      const fn = httpsCallable<
        { invoiceId: string; companyId: string },
        { sriStatus: string; authorizationNumber: string | null; estado: string; mensaje: string }
      >(this.functions, 'checkSriStatus');
      const result = await fn({ invoiceId: inv.id, companyId: this.tenantSvc.companyId });
      const d = result.data;
      if (d.sriStatus === 'authorized') {
        this.notifications.success(`Autorizada — N° ${d.authorizationNumber}`);
      } else {
        this.notifications.error(`SRI: ${d.estado} — ${d.mensaje || 'Sin detalle'}`);
      }
    } catch (err: unknown) {
      this.notifications.error((err as any)?.message ?? 'Error al consultar el SRI');
    } finally {
      this.checkStatusLoading.set(null);
    }
  }

  async downloadDoc(docId: string, fileType: 'xml' | 'pdf', documentType: string, event?: Event): Promise<void> {
    event?.stopPropagation();
    const key = `${docId}-${fileType}`;
    if (this.downloadingDoc() === key) return;
    this.downloadingDoc.set(key);
    try {
      const fn = httpsCallable<object, { url: string }>(this.functions, 'downloadDocument');
      const result = await fn({ documentId: docId, companyId: this.tenantSvc.companyId, fileType, documentType });
      window.open(result.data.url, '_blank');
    } catch {
      this.notifications.error('No se pudo obtener el archivo. Verifique que el documento fue procesado.');
    } finally {
      this.downloadingDoc.set(null);
    }
  }

  // ── Formatters ────────────────────────────────────────────────────────────
  formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private tsToStr(ts: any): string {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().substring(0, 10);
  }

  private tsToDate(ts: any): Date {
    if (!ts) return new Date(0);
    return ts?.toDate ? ts.toDate() : new Date(ts);
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
