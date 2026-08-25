import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, of, take } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule, TooltipModule
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
import { LibroMayorLine, JOURNAL_ENTRY_TYPE_LABELS, JOURNAL_ENTRY_TYPE_COLORS } from '../../models/journal-entry.interface';
import { Account, ACCOUNT_TYPE_LABELS, ACCOUNT_NATURE_LABELS } from '../../models/account.interface';
import { AccountingPeriod } from '../../models/accounting-period.interface';
import { CostCenter } from '../../models/cost-center.interface';
import { AccountSelectComponent } from '../../components/account-select/account-select.component';

@Component({
  selector: 'app-libro-mayor-page',
  standalone: true,
  templateUrl: './libro-mayor-page.component.html',
  styleUrl:    './libro-mayor-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, IconModule,
    AccountSelectComponent
  ]
})
export class LibroMayorPageComponent implements OnInit, OnDestroy {
  private svc            = inject(JournalEntriesService);
  private periodsSvc     = inject(AccountingPeriodsService);
  private accountsSvc    = inject(ChartOfAccountsService);
  private costCentersSvc = inject(CostCentersService);
  private pdfSvc         = inject(AccountingPdfService);
  private excelSvc       = inject(ExcelExportService);
  private tenantSvc      = inject(TenantService);
  private notifications  = inject(NotificationService);
  private route          = inject(ActivatedRoute);
  private destroy$       = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  downloadingPdf      = signal(false);
  accounts            = signal<Account[]>([]);
  periods             = signal<AccountingPeriod[]>([]);
  costCenters         = signal<CostCenter[]>([]);
  lines               = signal<LibroMayorLine[]>([]);
  selectedAccount     = signal<Account | null>(null);
  selectedPeriod      = signal('');
  selectedCode        = signal('');
  selectedCostCenter  = signal('');
  loading             = signal(false);
  searching           = signal(false);

  readonly TYPE_LABELS  = JOURNAL_ENTRY_TYPE_LABELS;
  readonly TYPE_COLORS  = JOURNAL_ENTRY_TYPE_COLORS;
  readonly ACC_TYPES    = ACCOUNT_TYPE_LABELS;
  readonly ACC_NATURES  = ACCOUNT_NATURE_LABELS;

  // ── Computed ──────────────────────────────────────────────────────────────
  totalDebit  = computed(() => this.lines().reduce((s, l) => s + l.debit,  0));
  totalCredit = computed(() => this.lines().reduce((s, l) => s + l.credit, 0));
  finalBalance = computed(() => {
    const last = this.lines();
    return last.length ? last[last.length - 1].balance : 0;
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    // Drill-down desde chart-of-accounts-page ("Ver movimientos"): preselecciona
    // y carga automáticamente la cuenta pasada por query param.
    const preselectCode = this.route.snapshot.queryParamMap.get('accountCode');

    this.accountsSvc.getActiveMovementAccounts().pipe(take(1)).subscribe(a => {
      this.accounts.set(a);
      if (preselectCode && a.some(acc => acc.code === preselectCode)) {
        this.selectedCode.set(preselectCode);
        this.loadMayor();
      }
    });
    this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => this.periods.set(p));
    this.costCentersSvc.getCostCenters().pipe(take(1)).subscribe(cc =>
      this.costCenters.set(cc.filter(c => c.isActive))
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Load mayor ────────────────────────────────────────────────────────────
  async loadMayor(): Promise<void> {
    const code = this.selectedCode();
    if (!code) { this.notifications.warning('Seleccione una cuenta'); return; }

    const acc = this.accounts().find(a => a.code === code);
    this.selectedAccount.set(acc ?? null);
    this.searching.set(true);
    this.lines.set([]);

    try {
      const periodId     = this.selectedPeriod()     || undefined;
      const costCenterId = this.selectedCostCenter() || undefined;
      const result       = await this.svc.getLibroMayor(code, periodId, costCenterId);
      this.lines.set(result);
    } catch (err: any) {
      this.notifications.error('Error cargando libro mayor: ' + (err?.message ?? err));
    } finally {
      this.searching.set(false);
    }
  }

  printReport(): void { window.print(); }

  async downloadPdf(): Promise<void> {
    if (!this.lines().length) return;
    this.downloadingPdf.set(true);
    try {
      const acc        = this.selectedAccount();
      const periodName = this.getPeriodName(this.selectedPeriod());
      await this.pdfSvc.downloadPdf({
        reportType: 'libro-mayor',
        companyId:  this.tenantSvc.companyId,
        periodName,
        data: this.lines().map(l => ({
          entryNumber: l.entryNumber,
          date:        this.formatDate(l.date),
          description: l.description,
          type:        this.TYPE_LABELS[l.type] ?? l.type,
          debit:       l.debit,
          credit:      l.credit,
          balance:     l.balance
        })),
        extraData: {
          accountCode:  acc?.code ?? '',
          accountName:  acc?.name ?? '',
          totalDebit:   this.totalDebit(),
          totalCredit:  this.totalCredit(),
          finalBalance: this.finalBalance()
        }
      });
    } catch (err: any) {
      this.notifications.error('Error generando PDF: ' + (err?.message ?? err));
    } finally {
      this.downloadingPdf.set(false);
    }
  }

  downloadExcel(): void {
    if (!this.lines().length) return;
    const acc = this.selectedAccount();
    const rows: Record<string, string | number>[] = this.lines().map(l => ({
      'N° Asiento': l.entryNumber,
      Fecha:        this.formatDate(l.date),
      Descripción:  l.description,
      Referencia:   l.reference,
      Tipo:         this.TYPE_LABELS[l.type] ?? l.type,
      Debe:         this.round2Amt(l.debit),
      Haber:        this.round2Amt(l.credit),
      Saldo:        this.round2Amt(l.balance)
    }));
    rows.push({
      'N° Asiento': '', Fecha: '', Descripción: 'TOTALES', Referencia: '', Tipo: '',
      Debe: this.round2Amt(this.totalDebit()), Haber: this.round2Amt(this.totalCredit()), Saldo: this.round2Amt(this.finalBalance())
    });
    const label = acc ? `${acc.code}-${acc.name}` : 'libro-mayor';
    this.excelSvc.export(`libro-mayor-${label.replace(/[^\w-]+/g, '_')}`, [{ name: 'Libro Mayor', rows }]);
  }

  private round2Amt(n: number): number { return Math.round((n ?? 0) * 100) / 100; }

  badgeClasses(color: string): string {
    if (color === 'dark') return 'badge badge-neutral-subtle';
    return `badge bg-${color}-subtle text-${color} border border-${color}-subtle`;
  }

  balanceClass(bal: number): string {
    if (bal > 0)  return 'bal-positive';
    if (bal < 0)  return 'bal-negative';
    return 'bal-zero';
  }

  // ── Formatters ────────────────────────────────────────────────────────────
  formatDate(ts: any): string {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatAmt(n: number): string { return n !== 0 ? n.toFixed(2) : ''; }
  formatBal(n: number): string { return n.toFixed(2); }

  getPeriodName(periodId: string): string {
    return this.periods().find(p => p.id === periodId)?.name ?? 'Todos los períodos';
  }

  trackByEntryId(_: number, item: LibroMayorLine): string { return item.entryId + item.date?.toString(); }
}
