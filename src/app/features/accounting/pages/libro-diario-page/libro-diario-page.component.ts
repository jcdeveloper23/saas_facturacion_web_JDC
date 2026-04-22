import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { JournalEntriesService }    from '../../services/journal-entries.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import {
  JournalEntry, JournalEntryType,
  JOURNAL_ENTRY_TYPE_LABELS, JOURNAL_ENTRY_TYPE_COLORS,
  JOURNAL_ENTRY_STATUS_LABELS, JOURNAL_ENTRY_STATUS_COLORS
} from '../../models/journal-entry.interface';
import { AccountingPeriod } from '../../models/accounting-period.interface';

@Component({
  selector: 'app-libro-diario-page',
  standalone: true,
  templateUrl: './libro-diario-page.component.html',
  styleUrl:    './libro-diario-page.component.scss',
  imports: [
    CommonModule, FormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective
  ]
})
export class LibroDiarioPageComponent implements OnInit, OnDestroy {
  private svc           = inject(JournalEntriesService);
  private periodsSvc    = inject(AccountingPeriodsService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  entries      = signal<JournalEntry[]>([]);
  periods      = signal<AccountingPeriod[]>([]);
  loading      = signal(true);
  periodFilter = signal('');
  yearFilter   = signal(new Date().getFullYear());
  typeFilter   = signal<JournalEntryType | null>(null);
  dateFrom     = signal('');
  dateTo       = signal('');
  searchTerm   = signal('');

  readonly TYPE_LABELS   = JOURNAL_ENTRY_TYPE_LABELS;
  readonly TYPE_COLORS   = JOURNAL_ENTRY_TYPE_COLORS;
  readonly STATUS_LABELS = JOURNAL_ENTRY_STATUS_LABELS;
  readonly STATUS_COLORS = JOURNAL_ENTRY_STATUS_COLORS;
  readonly years         = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  readonly entryTypes: JournalEntryType[] = ['manual','automatic','opening','closing','adjustment'];

  // ── Computed ──────────────────────────────────────────────────────────────
  filtered = computed(() => {
    const from   = this.dateFrom();
    const to     = this.dateTo();
    const term   = this.searchTerm().toLowerCase().trim();
    const type   = this.typeFilter();
    const period = this.periodFilter();

    let list = this.entries().filter(e => e.status === 'posted');

    if (period) list = list.filter(e => e.periodId === period);
    if (type)   list = list.filter(e => e.type === type);
    if (from)   list = list.filter(e => this.tsToStr(e.date) >= from);
    if (to)     list = list.filter(e => this.tsToStr(e.date) <= to);
    if (term)   list = list.filter(e =>
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
        this.notifications.error('Error cargando libro diario: ' + (err?.message ?? err));
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

  printReport(): void { window.print(); }

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

  getPeriodName(periodId: string): string {
    return this.periods().find(p => p.id === periodId)?.name ?? periodId;
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
