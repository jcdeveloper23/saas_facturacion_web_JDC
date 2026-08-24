import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule,
  SpinnerModule, TableModule, FormModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { JournalEntriesService }    from '../../services/journal-entries.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { AccountingPdfService }     from '../../services/accounting-pdf.service';
import { ExcelExportService }       from '../../services/excel-export.service';
import { TenantService }            from '../../../../core/services/tenant.service';
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
    CardModule, ButtonModule, GridModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective
  ]
})
export class LibroDiarioPageComponent implements OnInit, OnDestroy {
  private svc           = inject(JournalEntriesService);
  private periodsSvc    = inject(AccountingPeriodsService);
  private pdfSvc        = inject(AccountingPdfService);
  private excelSvc      = inject(ExcelExportService);
  private tenantSvc     = inject(TenantService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  entries        = signal<JournalEntry[]>([]);
  downloadingPdf = signal(false);
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

  async downloadPdf(): Promise<void> {
    this.downloadingPdf.set(true);
    try {
      const periodName = this.periodFilter()
        ? this.periods().find(p => p.id === this.periodFilter())?.name ?? String(this.yearFilter())
        : String(this.yearFilter());
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
          // Detalle de cada línea (cuenta debitada/acreditada) — sin esto el PDF
          // solo muestra totales por asiento, no un Libro Diario real.
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
      ? this.periods().find(p => p.id === this.periodFilter())?.name ?? String(this.yearFilter())
      : String(this.yearFilter());
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

  /** Clases para badge subtle (Norma 1). 'dark' no tiene subtle usable en dark mode → badge-neutral-subtle. */
  badgeClasses(color: string): string {
    if (color === 'dark') return 'badge badge-neutral-subtle';
    return `badge bg-${color}-subtle text-${color} border border-${color}-subtle`;
  }
}
