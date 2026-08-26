import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule,
  SpinnerModule, TableModule, FormModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective, ModalModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { QueryDocumentSnapshot } from '@angular/fire/firestore';

import { JournalEntriesService }    from '../../services/journal-entries.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { ChartOfAccountsService }   from '../../services/chart-of-accounts.service';
import { CostCentersService }       from '../../services/cost-centers.service';
import { ExcelExportService }       from '../../services/excel-export.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import {
  JournalEntry, JournalEntryStatus, JournalEntryType,
  JOURNAL_ENTRY_STATUS_LABELS, JOURNAL_ENTRY_STATUS_COLORS,
  JOURNAL_ENTRY_TYPE_LABELS, JOURNAL_ENTRY_TYPE_COLORS
} from '../../models/journal-entry.interface';
import { Account }     from '../../models/account.interface';
import { CostCenter }  from '../../models/cost-center.interface';
import { AccountingPeriod } from '../../models/accounting-period.interface';
import { AccountSelectComponent } from '../../components/account-select/account-select.component';

@Component({
  selector: 'app-journal-entries-page',
  standalone: true,
  templateUrl: './journal-entries-page.component.html',
  styleUrl:    './journal-entries-page.component.scss',
  imports: [
    CommonModule, RouterLink, FormsModule,
    CardModule, ButtonModule, GridModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, ModalModule, IconModule,
    InputGroupComponent, InputGroupTextDirective,
    AccountSelectComponent
  ]
})
export class JournalEntriesPageComponent implements OnInit, OnDestroy {
  private svc            = inject(JournalEntriesService);
  private periodsSvc     = inject(AccountingPeriodsService);
  private accountsSvc    = inject(ChartOfAccountsService);
  private costCentersSvc = inject(CostCentersService);
  private excelSvc       = inject(ExcelExportService);
  private notifications  = inject(NotificationService);
  private router         = inject(Router);
  private destroy$       = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  entries       = signal<JournalEntry[]>([]);
  periods       = signal<AccountingPeriod[]>([]);
  accounts      = signal<Account[]>([]);
  costCenters   = signal<CostCenter[]>([]);
  loading       = signal(false);
  loadingPage   = signal(false);
  exportingExcel = signal(false);

  // ── Filter signals ────────────────────────────────────────────────────────
  dateFrom      = signal('');              // YYYY-MM-DD
  dateTo        = signal('');              // YYYY-MM-DD
  accountCode   = signal('');             // '' = sin filtro
  costCenterId  = signal('');             // '' = sin filtro
  searchTerm    = signal('');
  typeFilter    = signal<JournalEntryType | null>(null);
  statusFilter  = signal<JournalEntryStatus | null>(null);

  /** true si ya se ejecutó al menos una consulta */
  hasQueried    = signal(false);

  // ── Paginación (cursor-based) ─────────────────────────────────────────────
  readonly PAGE_SIZE = 50;
  currentPage   = signal(1);
  hasMore       = signal(false);
  private cursorHistory: (QueryDocumentSnapshot | null)[] = [null];

  // Detail modal
  detailEntry   = signal<JournalEntry | null>(null);
  showDetail    = signal(false);
  cancelReason  = signal('');
  showCancelDlg = signal(false);

  // ── Lookups ───────────────────────────────────────────────────────────────
  readonly STATUS_LABELS = JOURNAL_ENTRY_STATUS_LABELS;
  readonly STATUS_COLORS = JOURNAL_ENTRY_STATUS_COLORS;
  readonly TYPE_LABELS   = JOURNAL_ENTRY_TYPE_LABELS;
  readonly TYPE_COLORS   = JOURNAL_ENTRY_TYPE_COLORS;
  readonly entryTypes: JournalEntryType[] = ['manual','automatic','opening','closing','adjustment'];

  // ── Computed ──────────────────────────────────────────────────────────────
  /** Client-side text filter over loaded page */
  filtered = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.entries();
    return this.entries().filter(e =>
      String(e.number).includes(term) ||
      e.description.toLowerCase().includes(term) ||
      (e.reference ?? '').toLowerCase().includes(term)
    );
  });

  totalPostedDebit = computed(() =>
    this.filtered().filter(e => e.status === 'posted').reduce((s, e) => s + e.totalDebit, 0)
  );

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
      this.searchTerm() || this.typeFilter() || this.statusFilter()
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
  /** Ejecuta la consulta manualmente. Valida Desde/Hasta antes. */
  async consultar(): Promise<void> {
    if (!this.dateFrom() || !this.dateTo()) {
      this.notifications.warning('Las fechas Desde y Hasta son obligatorias');
      return;
    }
    if (!this.dateRangeValid) {
      this.notifications.warning('La fecha Desde no puede ser mayor que Hasta');
      return;
    }
    this.hasQueried.set(true);
    await this.loadPage('reset');
  }

  // ── Paginación ────────────────────────────────────────────────────────────
  async loadPage(direction: 'next' | 'prev' | 'reset'): Promise<void> {
    const isReset = direction === 'reset';

    if (isReset) {
      this.cursorHistory = [null];
      this.currentPage.set(1);
      this.loading.set(true);
    } else {
      this.loadingPage.set(true);
    }

    let page = this.currentPage();
    if (direction === 'next') page++;
    else if (direction === 'prev') page--;

    const cursor = this.cursorHistory[page - 1] ?? undefined;

    try {
      const result = await this.svc.getEntriesPage(
        {
          dateFrom:     this.dateFrom()     || undefined,
          dateTo:       this.dateTo()       || undefined,
          type:         this.typeFilter()   ?? undefined,
          status:       this.statusFilter() ?? undefined,
          accountCode:  this.accountCode()  || undefined,
          costCenterId: this.costCenterId() || undefined,
        },
        this.PAGE_SIZE,
        cursor
      );
      this.entries.set(result.items);
      this.hasMore.set(result.hasMore);
      this.currentPage.set(page);
      if (result.nextCursor) this.cursorHistory[page] = result.nextCursor;
    } catch (err: any) {
      this.notifications.error('Error cargando asientos: ' + (err?.message ?? err));
    } finally {
      this.loading.set(false);
      this.loadingPage.set(false);
    }
  }

  setTypeFilter(type: JournalEntryType | null): void {
    this.typeFilter.set(type);
    if (this.hasQueried()) this.loadPage('reset');
  }

  setStatusFilter(status: JournalEntryStatus | null): void {
    this.statusFilter.set(status);
    if (this.hasQueried()) this.loadPage('reset');
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
    this.statusFilter.set(null);
    this.entries.set([]);
    this.hasQueried.set(false);
    this.cursorHistory = [null];
    this.currentPage.set(1);
    this.hasMore.set(false);
  }

  // ── Excel Export ──────────────────────────────────────────────────────────
  async exportExcel(): Promise<void> {
    if (this.exportingExcel()) return;
    this.exportingExcel.set(true);
    try {
      const allEntries = await this.svc.getEntriesByRange({
        dateFrom:     this.dateFrom()     || undefined,
        dateTo:       this.dateTo()       || undefined,
        type:         this.typeFilter()   ?? undefined,
        status:       this.statusFilter() ?? undefined,
        accountCode:  this.accountCode()  || undefined,
        costCenterId: this.costCenterId() || undefined,
      });

      // Sheet 1: Entry headers
      const headersRows = allEntries.map(e => ({
        'N°':          e.number,
        'Fecha':       this.formatDate(e.date),
        'Descripción': e.description,
        'Tipo':        this.TYPE_LABELS[e.type],
        'Estado':      this.STATUS_LABELS[e.status],
        'Referencia':  e.reference ?? '',
        'Débito':      e.totalDebit,
        'Crédito':     e.totalCredit,
        'Cuadrado':    e.isBalanced ? 'Sí' : 'No',
      }));

      // Sheet 2: Entry lines detail
      const linesRows: Record<string, string | number>[] = [];
      for (const e of allEntries) {
        for (const l of e.lines) {
          linesRows.push({
            'N° Asiento':      e.number,
            'Fecha':           this.formatDate(e.date),
            'Código Cuenta':   l.accountCode,
            'Cuenta':          l.accountName,
            'Centro de Costo': l.costCenterName ?? '',
            'Débito':          l.debit,
            'Crédito':         l.credit,
            'Detalle Línea':   l.description ?? '',
          });
        }
      }

      const fromStr = this.dateFrom() || 'todos';
      const toStr   = this.dateTo()   || '';
      const suffix  = toStr ? `${fromStr}_${toStr}` : fromStr;

      this.excelSvc.export(`asientos_${suffix}`, [
        { name: 'Asientos', rows: headersRows },
        { name: 'Líneas',   rows: linesRows   },
      ]);
    } catch (err: any) {
      this.notifications.error('Error exportando: ' + (err?.message ?? err));
    } finally {
      this.exportingExcel.set(false);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  openNew(): void { this.router.navigate(['/accounting/journal-entries/new']); }
  openEdit(entry: JournalEntry): void {
    this.router.navigate(['/accounting/journal-entries', entry.id, 'edit']);
  }

  // ── Detail modal ──────────────────────────────────────────────────────────
  openDetail(entry: JournalEntry, event: Event): void {
    event.stopPropagation();
    this.detailEntry.set(entry);
    this.showDetail.set(true);
  }

  closeDetail(): void {
    this.showDetail.set(false);
    setTimeout(() => this.detailEntry.set(null), 350);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async postEntry(entry: JournalEntry, event: Event): Promise<void> {
    event.stopPropagation();
    const ok = await this.notifications.confirm({
      title: `¿Contabilizar el asiento N° ${entry.number}?`,
      confirmText: 'Sí, contabilizar',
      cancelText: 'Cancelar',
      icon: 'question'
    });
    if (!ok) return;
    try {
      await this.svc.postEntry(entry.id);
      this.notifications.success('Asiento contabilizado');
      this.loadPage('reset');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  openCancelDlg(entry: JournalEntry, event: Event): void {
    event.stopPropagation();
    this.detailEntry.set(entry);
    this.cancelReason.set('');
    this.showCancelDlg.set(true);
  }

  async confirmCancel(): Promise<void> {
    const entry = this.detailEntry();
    if (!entry || !this.cancelReason().trim()) {
      this.notifications.warning('Ingrese el motivo de anulación');
      return;
    }
    try {
      await this.svc.cancelEntry(entry.id, this.cancelReason());
      this.notifications.success('Asiento anulado');
      this.showCancelDlg.set(false);
      this.loadPage('reset');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  async duplicateEntry(entry: JournalEntry, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      const id = await this.svc.duplicateEntry(entry.id);
      this.notifications.success('Asiento duplicado como borrador');
      this.router.navigate(['/accounting/journal-entries', id, 'edit']);
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  async deleteEntry(entry: JournalEntry, event: Event): Promise<void> {
    event.stopPropagation();
    if (entry.status !== 'draft') return;
    const ok2 = await this.notifications.confirm({
      title: `¿Eliminar el borrador N° ${entry.number}?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok2) return;
    try {
      await this.svc.deleteEntry(entry.id);
      this.notifications.success('Borrador eliminado');
      this.loadPage('reset');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  // ── Formatters ────────────────────────────────────────────────────────────
  formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatAmt(n: number): string {
    return (n ?? 0).toFixed(2);
  }

  getPeriodName(periodId: string): string {
    return this.periods().find(p => p.id === periodId)?.name ?? periodId;
  }

  trackById(_: number, item: { id: string }): string { return item.id; }

  /** Clases para badge subtle */
  badgeClasses(color: string): string {
    if (color === 'dark') return 'badge badge-neutral-subtle';
    return `badge bg-${color}-subtle text-${color} border border-${color}-subtle`;
  }

  /** Label para mostrar en el select de cuentas */
  accountLabel(a: Account): string {
    return `${a.code} — ${a.name}`;
  }

  /** Label para mostrar en el select de centros (con indentación visual para subcentros) */
  costCenterLabel(c: CostCenter): string {
    return c.parentId ? `  ↳ ${c.code} — ${c.name}` : `${c.code} — ${c.name}`;
  }
}


