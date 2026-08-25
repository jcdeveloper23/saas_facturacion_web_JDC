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
import { NotificationService }      from '../../../../core/services/notification.service';
import {
  JournalEntry, JournalEntryStatus, JournalEntryType,
  JOURNAL_ENTRY_STATUS_LABELS, JOURNAL_ENTRY_STATUS_COLORS,
  JOURNAL_ENTRY_TYPE_LABELS, JOURNAL_ENTRY_TYPE_COLORS
} from '../../models/journal-entry.interface';
import { AccountingPeriod } from '../../models/accounting-period.interface';
import { Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-journal-entries-page',
  standalone: true,
  templateUrl: './journal-entries-page.component.html',
  styleUrl:    './journal-entries-page.component.scss',
  imports: [
    CommonModule, RouterLink, FormsModule,
    CardModule, ButtonModule, GridModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, ModalModule, IconModule,
    InputGroupComponent, InputGroupTextDirective
  ]
})
export class JournalEntriesPageComponent implements OnInit, OnDestroy {
  private svc           = inject(JournalEntriesService);
  private periodsSvc    = inject(AccountingPeriodsService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private destroy$      = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  entries      = signal<JournalEntry[]>([]);
  periods      = signal<AccountingPeriod[]>([]);
  loading      = signal(true);
  loadingPage  = signal(false);
  searchTerm   = signal('');
  yearFilter   = signal(new Date().getFullYear());
  typeFilter   = signal<JournalEntryType | null>(null);
  statusFilter = signal<JournalEntryStatus | null>(null);

  // ── Paginación (cursor-based) ─────────────────────────────────────────────
  readonly PAGE_SIZE = 50;
  currentPage  = signal(1);
  hasMore      = signal(false);
  /** Historial de cursors: índice 0 = página 1 (null = inicio), índice 1 = cursor para página 2, etc. */
  private cursorHistory: (QueryDocumentSnapshot | null)[] = [null];

  // Detail modal
  detailEntry  = signal<JournalEntry | null>(null);
  showDetail   = signal(false);
  cancelReason = signal('');
  showCancelDlg= signal(false);

  // ── Lookups ───────────────────────────────────────────────────────────────
  readonly STATUS_LABELS = JOURNAL_ENTRY_STATUS_LABELS;
  readonly STATUS_COLORS = JOURNAL_ENTRY_STATUS_COLORS;
  readonly TYPE_LABELS   = JOURNAL_ENTRY_TYPE_LABELS;
  readonly TYPE_COLORS   = JOURNAL_ENTRY_TYPE_COLORS;
  readonly years         = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  readonly entryTypes: JournalEntryType[] = ['manual','automatic','opening','closing','adjustment'];

  // ── Computed ──────────────────────────────────────────────────────────────
  /** Filtro cliente: solo searchTerm. Tipo y estado van server-side en getEntriesPage(). */
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

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.periodsSvc.getPeriods().pipe(takeUntil(this.destroy$)).subscribe(p => this.periods.set(p));
    this.loadPage('reset');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
          year:   this.yearFilter(),
          type:   this.typeFilter()   ?? undefined,
          status: this.statusFilter() ?? undefined
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

  changeYear(year: number): void {
    this.yearFilter.set(year);
    this.loadPage('reset');
  }

  setTypeFilter(type: JournalEntryType | null): void {
    this.typeFilter.set(type);
    this.loadPage('reset');
  }

  setStatusFilter(status: JournalEntryStatus | null): void {
    this.statusFilter.set(status);
    this.loadPage('reset');
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
    if (!confirm(`¿Contabilizar el asiento N° ${entry.number}?`)) return;
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
    if (!confirm(`¿Eliminar el borrador N° ${entry.number}?`)) return;
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

  /** Clases para badge subtle (Norma 1). 'dark' no tiene subtle usable en dark mode → badge-neutral-subtle. */
  badgeClasses(color: string): string {
    if (color === 'dark') return 'badge badge-neutral-subtle';
    return `badge bg-${color}-subtle text-${color} border border-${color}-subtle`;
  }
}
