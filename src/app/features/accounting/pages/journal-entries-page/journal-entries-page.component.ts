import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule,
  SpinnerModule, TableModule, FormModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective, ModalModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

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
  entries     = signal<JournalEntry[]>([]);
  periods     = signal<AccountingPeriod[]>([]);
  loading     = signal(true);
  searchTerm  = signal('');
  yearFilter  = signal(new Date().getFullYear());
  typeFilter  = signal<JournalEntryType | null>(null);
  statusFilter= signal<JournalEntryStatus | null>(null);

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
  filtered = computed(() => {
    const term   = this.searchTerm().toLowerCase().trim();
    const type   = this.typeFilter();
    const status = this.statusFilter();
    let list     = this.entries();

    if (type)   list = list.filter(e => e.type === type);
    if (status) list = list.filter(e => e.status === status);
    if (term)   list = list.filter(e =>
      String(e.number).includes(term) ||
      e.description.toLowerCase().includes(term) ||
      (e.reference ?? '').toLowerCase().includes(term)
    );

    return list;
  });

  counts = computed(() => {
    const all = this.entries();
    return {
      total:     all.length,
      draft:     all.filter(e => e.status === 'draft').length,
      posted:    all.filter(e => e.status === 'posted').length,
      cancelled: all.filter(e => e.status === 'cancelled').length,
    };
  });

  totalPostedDebit = computed(() =>
    this.filtered().filter(e => e.status === 'posted').reduce((s, e) => s + e.totalDebit, 0)
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadEntries();
    this.periodsSvc.getPeriods().pipe(takeUntil(this.destroy$)).subscribe(p => this.periods.set(p));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadEntries(): void {
    this.loading.set(true);
    this.svc.getEntries({ year: this.yearFilter() }).pipe(
      catchError(err => {
        this.notifications.error('Error cargando asientos: ' + (err?.message ?? err));
        this.loading.set(false);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(list => {
      this.entries.set(list);
      this.loading.set(false);
    });
  }

  changeYear(year: number): void {
    this.yearFilter.set(year);
    this.destroy$.next();
    this.loadEntries();
    this.periodsSvc.getPeriods().pipe(takeUntil(this.destroy$)).subscribe(p => this.periods.set(p));
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
    this.detailEntry.set(null);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async postEntry(entry: JournalEntry, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(`¿Contabilizar el asiento N° ${entry.number}?`)) return;
    try {
      await this.svc.postEntry(entry.id);
      this.notifications.success('Asiento contabilizado');
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
