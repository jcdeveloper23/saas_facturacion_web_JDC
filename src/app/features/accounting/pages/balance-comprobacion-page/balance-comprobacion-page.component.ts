import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, take } from 'rxjs';
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
import { BalanceComprobacionLine }  from '../../models/journal-entry.interface';
import { Account, ACCOUNT_TYPE_LABELS } from '../../models/account.interface';
import { AccountingPeriod }         from '../../models/accounting-period.interface';
import { CostCenter }               from '../../models/cost-center.interface';
import {
  AccountIndex, trialBalance, centsToAmount, TrialBalance
} from '../../utils/ledger-reports';

/**
 * Una fila del balance: saldo inicial (apertura), movimientos del ejercicio
 * (sumDebit / sumCredit, sin la apertura) y saldo final, todo en dólares.
 */
export type BalanceLine = BalanceComprobacionLine;

@Component({
  selector: 'app-balance-comprobacion-page',
  standalone: true,
  templateUrl: './balance-comprobacion-page.component.html',
  styleUrl:    './balance-comprobacion-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, TooltipModule, IconModule
  ]
})
export class BalanceComprobacionPageComponent implements OnInit, OnDestroy {
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
  downloadingPdf     = signal(false);
  accounts           = signal<Account[]>([]);
  periods            = signal<AccountingPeriod[]>([]);
  costCenters        = signal<CostCenter[]>([]);
  lines              = signal<BalanceLine[]>([]);
  /** Totales en centavos (los calcula ledger-reports). */
  trial              = signal<TrialBalance | null>(null);
  truncated          = signal(false);
  reportYear         = signal(new Date().getFullYear());
  selectedPeriod     = signal('');
  selectedCostCenter = signal('');
  searching          = signal(false);
  searched           = signal(false);

  readonly ACC_TYPES = ACCOUNT_TYPE_LABELS;

  // ── Computed ──────────────────────────────────────────────────────────────
  totalInitialDebit  = computed(() => centsToAmount(this.trial()?.openingDebit  ?? 0));
  totalInitialCredit = computed(() => centsToAmount(this.trial()?.openingCredit ?? 0));
  totalDebit         = computed(() => centsToAmount(this.trial()?.totalDebit    ?? 0));
  totalCredit        = computed(() => centsToAmount(this.trial()?.totalCredit   ?? 0));
  totalFinalDebit    = computed(() => centsToAmount(this.trial()?.closingDebit  ?? 0));
  totalFinalCredit   = computed(() => centsToAmount(this.trial()?.closingCredit ?? 0));
  /** Debe = Haber y saldos deudores = acreedores, al inicio y al final. */
  isBalanced         = computed(() => this.trial()?.isBalanced ?? true);

  groupedLines = computed(() => {
    const groups = new Map<string, BalanceLine[]>();
    for (const line of this.lines()) {
      const g = groups.get(line.accountType) ?? [];
      g.push(line);
      groups.set(line.accountType, g);
    }
    return groups;
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.accountsSvc.getAccounts().pipe(take(1)).subscribe(a => this.accounts.set(a));
    this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => this.periods.set(p));
    this.costCentersSvc.getCostCenters().pipe(take(1)).subscribe(cc =>
      this.costCenters.set(cc.filter(c => c.isActive))
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Generate ─────────────────────────────────────────────────────────────

  async generate(): Promise<void> {
    this.searching.set(true);
    this.lines.set([]);

    this.trial.set(null);
    this.truncated.set(false);

    try {
      // Todo el ejercicio del período elegido (o el año en curso). Cuentan los
      // contabilizados y los anulados con reversa; la apertura va al saldo
      // inicial. Misma lógica que Conecta (utils/ledger-reports.ts).
      const year = this.selectedPeriod()
        ? this.periods().find(p => p.id === this.selectedPeriod())?.year ?? new Date().getFullYear()
        : new Date().getFullYear();
      this.reportYear.set(year);

      const { items, truncated } = await this.svc.getLedgerEntries(year, year);
      const entries = this.selectedPeriod() ? items.filter(e => e.periodId === this.selectedPeriod()) : items;
      const index   = new AccountIndex(this.accounts());
      const tb      = trialBalance(entries, index, `${year}-01-01`, `${year}-12-31`,
        { costCenterId: this.selectedCostCenter() || null });

      this.trial.set(tb);
      this.truncated.set(truncated);
      this.lines.set(tb.rows.map(r => ({
        accountCode:   r.code,
        accountName:   r.name,
        accountType:   index.get(r.code)?.type ?? r.group,
        initialDebit:  centsToAmount(r.openingDebit),
        initialCredit: centsToAmount(r.openingCredit),
        sumDebit:      centsToAmount(r.debit),
        sumCredit:     centsToAmount(r.credit),
        finalDebit:    centsToAmount(r.closingDebit),
        finalCredit:   centsToAmount(r.closingCredit),
      })));
      this.searched.set(true);
    } catch (err: any) {
      this.notifications.error('Error generando balance: ' + (err?.message ?? err));
    } finally {
      this.searching.set(false);
    }
  }

  printReport(): void { window.print(); }

  async downloadPdf(): Promise<void> {
    if (!this.lines().length) return;
    this.downloadingPdf.set(true);
    try {
      await this.pdfSvc.downloadPdf({
        reportType: 'balance-comprobacion',
        companyId:  this.tenantSvc.companyId,
        periodName: this.getPeriodName(),
        // El PDF (generateAccountingPdf) solo tiene columnas de sumas y saca el
        // saldo de ellas: se le mandan las sumas con el saldo inicial incluido,
        // así su «saldo» es el saldo final.
        data: this.lines().map(l => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          accountType: this.typeLabel(l.accountType),
          sumDebit:    this.round2(l.initialDebit  + l.sumDebit),
          sumCredit:   this.round2(l.initialCredit + l.sumCredit)
        })),
        extraData: {
          totalDebit:  this.round2(this.totalInitialDebit()  + this.totalDebit()),
          totalCredit: this.round2(this.totalInitialCredit() + this.totalCredit())
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
    const rows: Record<string, string | number>[] = this.lines().map(l => ({
      Código:                   l.accountCode,
      Cuenta:                   l.accountName,
      Tipo:                     this.typeLabel(l.accountType),
      'Saldo inicial deudor':   this.round2(l.initialDebit),
      'Saldo inicial acreedor': this.round2(l.initialCredit),
      Debe:                     this.round2(l.sumDebit),
      Haber:                    this.round2(l.sumCredit),
      'Saldo final deudor':     this.round2(l.finalDebit),
      'Saldo final acreedor':   this.round2(l.finalCredit)
    }));
    rows.push({
      Código: '', Cuenta: 'TOTALES', Tipo: '',
      'Saldo inicial deudor':   this.round2(this.totalInitialDebit()),
      'Saldo inicial acreedor': this.round2(this.totalInitialCredit()),
      Debe:                     this.round2(this.totalDebit()),
      Haber:                    this.round2(this.totalCredit()),
      'Saldo final deudor':     this.round2(this.totalFinalDebit()),
      'Saldo final acreedor':   this.round2(this.totalFinalCredit())
    });
    this.excelSvc.export(`balance-comprobacion-${this.getPeriodName().replace(/\s+/g, '_')}`, [{ name: 'Balance de Comprobación', rows }]);
  }

  typeLabel(type: string): string {
    return (this.ACC_TYPES as Record<string, string>)[type] ?? type;
  }

  getPeriodName(): string {
    if (!this.selectedPeriod()) return `Ejercicio ${this.reportYear()}`;
    return this.periods().find(p => p.id === this.selectedPeriod())?.name ?? '';
  }

  round2(n: number): number { return Math.round(n * 100) / 100; }
  trackByCode(_: number, item: BalanceLine): string { return item.accountCode; }
}
