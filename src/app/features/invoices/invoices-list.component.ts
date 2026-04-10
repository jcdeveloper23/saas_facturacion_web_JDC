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

export interface Gap       { seriesCode: string; number: number; }
export interface LineMatch { invoice: Invoice; lineDesc: string; lineSku: string; }

@Component({
  selector: 'app-invoices-list',
  standalone: true,
  templateUrl: './invoices-list.component.html',
  styles: [`
    .stat-strip { display:flex; gap:.25rem; flex-wrap:wrap; }
    .stat-pill {
      display:inline-flex; align-items:center; gap:.3rem;
      padding:.2rem .6rem; border-radius:99px; cursor:pointer;
      font-size:.75rem; font-weight:400;
      border:1px solid var(--cui-border-color);
      color:var(--cui-secondary-color);
      background:transparent; transition:background .12s, color .12s;
    }
    .stat-pill:hover { background:var(--cui-tertiary-bg); color:var(--cui-body-color); }
    .stat-pill--active { background:var(--cui-primary-bg-subtle); color:var(--cui-primary); border-color:var(--cui-primary-border-subtle); }
    .stat-pill .count { font-weight:600; }

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
    .inv-amt  { font-family:monospace; font-size:.82rem; text-align:right; white-space:nowrap; }
    .inv-amt--total { font-weight:600; }
    .p-dot   { width:7px; height:7px; border-radius:50%; display:inline-block; }

    /* Row indicators */
    .row-indicators { display:flex; gap:2px; align-items:center; flex-wrap:nowrap; }
    .row-ind {
      display:inline-flex; align-items:center; justify-content:center;
      width:18px; height:18px; border-radius:4px; font-size:.7rem;
    }
    .row-ind--paid    { background:rgba(var(--cui-success-rgb),.12); color:var(--cui-success); }
    .row-ind--void    { background:rgba(var(--cui-danger-rgb),.12);  color:var(--cui-danger); }
    .row-ind--cn      { background:rgba(var(--cui-warning-rgb),.12); color:var(--cui-warning); }
    .row-ind--overdue { background:rgba(var(--cui-danger-rgb),.12);  color:var(--cui-danger); }

    /* Due-date coloring */
    .due-today   { color:var(--cui-warning); font-weight:600; }
    .due-overdue { color:var(--cui-danger);  font-weight:600; }

    /* Notes cell */
    .notes-cell { max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.76rem; color:var(--cui-secondary-color); }

    /* Totals / footer */
    .table-footer { padding:.4rem .75rem; font-size:.75rem; color:var(--cui-secondary-color); border-top:1px solid var(--cui-border-color); }
    .table-footer-totals { display:flex; gap:1.5rem; flex-wrap:wrap; }
    .table-footer-total { font-family:monospace; font-weight:600; color:var(--cui-body-color); }

    /* Filters */
    .search-input { max-width:280px; }
    .year-select  { font-size:.82rem; max-width:100px; }
    .adv-filters  { border-top:1px solid var(--cui-border-color); padding-top:.75rem; margin-top:.5rem; }

    /* Gaps alert */
    .gaps-alert {
      display:flex; align-items:center; gap:.5rem;
      padding:.45rem .75rem; background:rgba(var(--cui-warning-rgb),.08);
      border:1px solid rgba(var(--cui-warning-rgb),.3); border-radius:8px;
      margin-bottom:.75rem; font-size:.82rem;
    }
    .gaps-alert svg { color:var(--cui-warning); flex-shrink:0; }

    /* Line search results */
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
    InputGroupComponent, InputGroupTextDirective
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
  invoices     = signal<Invoice[]>([]);
  loading      = signal(true);
  searchTerm   = signal('');
  statusFilter = signal<InvoiceStatus | null>(null);
  yearFilter   = signal(new Date().getFullYear().toString());

  // ── Advanced filters ──────────────────────────────────────────────────────
  showAdvancedFilters = signal(false);
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

  // ── Static lookups ─────────────────────────────────────────────────────────
  readonly STATUS_LABELS      = INVOICE_STATUS_LABELS;
  readonly STATUS_COLORS      = INVOICE_STATUS_COLORS;
  readonly SRI_STATUS_LABELS  = SRI_STATUS_LABELS;
  readonly SRI_STATUS_COLORS  = SRI_STATUS_COLORS;
  readonly years              = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

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

  hasActiveFilters = computed(() => !!this.dateFrom() || !!this.dateTo() || !!this.seriesFilter());

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
  private loadInvoices(): void {
    this.loading.set(true);
    this.invoices.set([]);
    this.svc.getInvoices({ year: this.yearFilter() }).pipe(
      catchError(err => {
        console.error('[InvoicesList] error:', err);
        this.notifications.error('Error cargando facturas: ' + (err?.message ?? err));
        this.loading.set(false);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: list => { this.invoices.set(list); this.loading.set(false); }
    });
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
        isCreditNote:          true,
        rectifiedInvoiceId:    inv.id,
        rectifiedInvoiceNumber: inv.fullNumber,
        notes:                 `Nota de crédito de ${inv.fullNumber}`,
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

  downloadXml(inv: Invoice, event: Event): void {
    event.stopPropagation();
    if (inv.xmlUrl) { window.open(inv.xmlUrl, '_blank', 'noopener'); }
  }

  downloadPdf(inv: Invoice, event: Event): void {
    event.stopPropagation();
    if (inv.pdfUrl) { window.open(inv.pdfUrl, '_blank', 'noopener'); }
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
