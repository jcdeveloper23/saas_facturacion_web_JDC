import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule,
  SpinnerModule, TableModule, FormModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { JournalEntriesService }    from '../../services/journal-entries.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { ChartOfAccountsService }   from '../../services/chart-of-accounts.service';
import { CostCentersService }       from '../../services/cost-centers.service';
import { AccountingPdfService }     from '../../services/accounting-pdf.service';
import { ExcelExportService }       from '../../services/excel-export.service';
import { TenantService }            from '../../../../core/services/tenant.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import {
  JournalEntry, JournalEntryType,
  JOURNAL_ENTRY_TYPE_LABELS, JOURNAL_ENTRY_TYPE_COLORS,
  JOURNAL_ENTRY_STATUS_LABELS, JOURNAL_ENTRY_STATUS_COLORS
} from '../../models/journal-entry.interface';
import { Account }     from '../../models/account.interface';
import { CostCenter }  from '../../models/cost-center.interface';
import { AccountingPeriod } from '../../models/accounting-period.interface';
import { AccountSelectComponent } from '../../components/account-select/account-select.component';

@Component({
  selector: 'app-libro-diario-page',
  standalone: true,
  templateUrl: './libro-diario-page.component.html',
  styleUrl:    './libro-diario-page.component.scss',
  imports: [
    CommonModule, FormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective,
    AccountSelectComponent
  ]
})
export class LibroDiarioPageComponent implements OnInit, OnDestroy {
  private svc            = inject(JournalEntriesService);
  private periodsSvc     = inject(AccountingPeriodsService);
  private accountsSvc    = inject(ChartOfAccountsService);
  private costCentersSvc = inject(CostCentersService);
  private pdfSvc         = inject(AccountingPdfService);
  private excelSvc       = inject(ExcelExportService);
  private tenantSvc      = inject(TenantService);
  private notifications  = inject(NotificationService);
  private destroy$       = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  entries        = signal<JournalEntry[]>([]);
  truncated      = signal(false);   // true si el servidor devolvió limit(500) y había más
  downloadingPdf = signal(false);
  periods        = signal<AccountingPeriod[]>([]);
  accounts       = signal<Account[]>([]);
  costCenters    = signal<CostCenter[]>([]);
  loading        = signal(false);
  hasQueried     = signal(false);

  // ── Filter signals ────────────────────────────────────────────────────────
  periodFilter  = signal('');
  typeFilter    = signal<JournalEntryType | null>(null);
  accountCode   = signal('');             // '' = sin filtro
  costCenterId  = signal('');             // '' = sin filtro
  dateFrom      = signal('');
  dateTo        = signal('');
  searchTerm    = signal('');

  readonly TYPE_LABELS   = JOURNAL_ENTRY_TYPE_LABELS;
  readonly TYPE_COLORS   = JOURNAL_ENTRY_TYPE_COLORS;
  readonly STATUS_LABELS = JOURNAL_ENTRY_STATUS_LABELS;
  readonly STATUS_COLORS = JOURNAL_ENTRY_STATUS_COLORS;
  readonly entryTypes: JournalEntryType[] = ['manual','automatic','opening','closing','adjustment'];

  // ── Computed ──────────────────────────────────────────────────────────────
  filtered = computed(() => {
    const from       = this.dateFrom();
    const to         = this.dateTo();
    const term       = this.searchTerm().toLowerCase().trim();
    const type       = this.typeFilter();
    const period     = this.periodFilter();
    const account    = this.accountCode();
    const costCenter = this.costCenterId();

    let list = this.entries().filter(e => e.status === 'posted');

    if (period)     list = list.filter(e => e.periodId === period);
    if (type)       list = list.filter(e => e.type === type);
    if (from)       list = list.filter(e => this.tsToStr(e.date) >= from);
    if (to)         list = list.filter(e => this.tsToStr(e.date) <= to);
    if (account)    list = list.filter(e => e.lines.some(l => l.accountCode === account));
    if (costCenter) list = list.filter(e => e.lines.some(l => l.costCenterId === costCenter));
    if (term)       list = list.filter(e =>
      String(e.number).includes(term) ||
      e.description.toLowerCase().includes(term) ||
      (e.reference ?? '').toLowerCase().includes(term)
    );

    return list.sort((a, b) => {
      const da = this.tsToStr(a.date);
      const db = this.tsToStr(b.date);
      return da < db ? -1 : da > db ? 1 : a.number - b.number;
    });
  });

  grandTotalDebit  = computed(() => this.filtered().reduce((s, e) => s + e.totalDebit,  0));
  grandTotalCredit = computed(() => this.filtered().reduce((s, e) => s + e.totalCredit, 0));

  /** Validation: dateFrom <= dateTo */
  get dateRangeValid(): boolean {
    const from = this.dateFrom();
    const to   = this.dateTo();
    if (!from || !to) return false;
    return from <= to;
  }

  get hasActiveFilters(): boolean {
    return !!(
      this.dateFrom() || this.dateTo() ||
      this.accountCode() || this.costCenterId() ||
      this.searchTerm() || this.typeFilter() || this.periodFilter()
    );
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.periodsSvc.getPeriods().pipe(takeUntil(this.destroy$))
      .subscribe(p => this.periods.set(p));

    this.accountsSvc.getActiveMovementAccounts().pipe(takeUntil(this.destroy$))
      .subscribe(a => this.accounts.set(a));

    this.costCentersSvc.getActiveCostCenters().pipe(takeUntil(this.destroy$))
      .subscribe(c => this.costCenters.set(c));

    // Default date range: current month
    const now   = new Date();
    const y     = now.getFullYear();
    const m     = String(now.getMonth() + 1).padStart(2, '0');
    this.dateFrom.set(`${y}-${m}-01`);
    this.dateTo.set(new Date(y, now.getMonth() + 1, 0).toISOString().slice(0, 10));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Query (Consultar) ─────────────────────────────────────────────────────
  async consultar(): Promise<void> {
    if (!this.dateFrom() || !this.dateTo()) {
      this.notifications.warning('Las fechas Desde y Hasta son obligatorias');
      return;
    }
    if (!this.dateRangeValid) {
      this.notifications.warning('La fecha Desde no puede ser mayor que Hasta');
      return;
    }
    await this.loadEntries();
  }

  private async loadEntries(): Promise<void> {
    this.loading.set(true);
    this.truncated.set(false);
    try {
      const result = await this.svc.getEntriesByRange({
        dateFrom: this.dateFrom() || undefined,
        dateTo:   this.dateTo()   || undefined,
        status:   'posted',
        type:     this.typeFilter() || undefined
      });
      this.entries.set(result);
      this.truncated.set(result.length >= 500);
      this.hasQueried.set(true);
    } catch (err: any) {
      this.notifications.error('Error cargando libro diario: ' + (err?.message ?? err));
    } finally {
      this.loading.set(false);
    }
  }

  setTypeFilter(type: JournalEntryType | null): void {
    this.typeFilter.set(type);
    if (this.hasQueried()) this.loadEntries();
  }

  setPeriodFilter(periodId: string): void {
    this.periodFilter.set(periodId);
    if (this.hasQueried()) this.loadEntries();
  }

  clearFilters(): void {
    const now = new Date();
    const y   = now.getFullYear();
    const m   = String(now.getMonth() + 1).padStart(2, '0');
    this.dateFrom.set(`${y}-${m}-01`);
    this.dateTo.set(new Date(y, now.getMonth() + 1, 0).toISOString().slice(0, 10));
    this.accountCode.set('');
    this.costCenterId.set('');
    this.searchTerm.set('');
    this.typeFilter.set(null);
    this.periodFilter.set('');
    this.entries.set([]);
    this.hasQueried.set(false);
    this.truncated.set(false);
  }

  printReport(): void { window.print(); }

  async downloadPdf(): Promise<void> {
    this.downloadingPdf.set(true);
    try {
      const periodName = this.periodFilter()
        ? this.periods().find(p => p.id === this.periodFilter())?.name ?? `${this.dateFrom()} a ${this.dateTo()}`
        : `${this.dateFrom()} a ${this.dateTo()}`;

      await this.pdfSvc.downloadPdf({
        reportType: 'libro-diario',
        companyId:  this.tenantSvc.companyId,
        periodName,
        data: this.filtered().map(e => ({
          number:      e.number,
          date:        this.formatDate(e.date),
          description: e.description,
          reference:   e.reference ?? '',
          totalDebit:  e.totalDebit,
          totalCredit: e.totalCredit,
          lines: e.lines.map(l => ({
            accountCode: l.accountCode,
            accountName: l.accountName,
            debit:       l.debit,
            credit:      l.credit
          }))
        })),
        extraData: {
          totalDebit:  this.grandTotalDebit(),
          totalCredit: this.grandTotalCredit()
        }
      });
    } catch (err: any) {
      this.notifications.error('Error generando PDF: ' + (err?.message ?? err));
    } finally {
      this.downloadingPdf.set(false);
    }
  }

  downloadExcel(): void {
    if (!this.filtered().length) return;
    const rows: Record<string, string | number>[] = [];
    for (const e of this.filtered()) {
      for (const l of e.lines) {
        rows.push({
          'N° Asiento': e.number,
          Fecha:        this.formatDate(e.date),
          Descripción:  e.description,
          Referencia:   e.reference ?? '',
          Cuenta:       l.accountCode,
          'Nombre Cuenta': l.accountName,
          Debe:         l.debit  ?? 0,
          Haber:        l.credit ?? 0
        });
      }
    }
    rows.push({
      'N° Asiento': '', Fecha: '', Descripción: 'TOTALES', Referencia: '', Cuenta: '', 'Nombre Cuenta': '',
      Debe: this.grandTotalDebit(), Haber: this.grandTotalCredit()
    });
    const periodName = this.periodFilter()
      ? this.periods().find(p => p.id === this.periodFilter())?.name ?? `${this.dateFrom()} a ${this.dateTo()}`
      : `${this.dateFrom()} a ${this.dateTo()}`;
    this.excelSvc.export(`libro-diario-${periodName.replace(/\s+/g, '_')}`, [{ name: 'Libro Diario', rows }]);
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
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  getPeriodName(periodId: string): string {
    return this.periods().find(p => p.id === periodId)?.name ?? periodId;
  }

  trackById(_: number, item: { id: string }): string { return item.id; }

  badgeClasses(color: string): string {
    if (color === 'dark') return 'badge badge-neutral-subtle';
    return `badge bg-${color}-subtle text-${color} border border-${color}-subtle`;
  }

  accountLabel(a: Account): string {
    return `${a.code} — ${a.name}`;
  }

  costCenterLabel(c: CostCenter): string {
    return c.parentId ? `  ↳ ${c.code} — ${c.name}` : `${c.code} — ${c.name}`;
  }
}
