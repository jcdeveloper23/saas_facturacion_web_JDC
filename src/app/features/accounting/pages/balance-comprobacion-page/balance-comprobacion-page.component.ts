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
import { TenantService }            from '../../../../core/services/tenant.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import { JournalEntry }             from '../../models/journal-entry.interface';
import { Account, AccountType, ACCOUNT_TYPE_LABELS } from '../../models/account.interface';
import { AccountingPeriod }         from '../../models/accounting-period.interface';
import { CostCenter }               from '../../models/cost-center.interface';

export interface BalanceLine {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  sumDebit:    number;
  sumCredit:   number;
}

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
  private tenantSvc      = inject(TenantService);
  private notifications  = inject(NotificationService);
  private destroy$       = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  downloadingPdf     = signal(false);
  accounts           = signal<Account[]>([]);
  periods            = signal<AccountingPeriod[]>([]);
  costCenters        = signal<CostCenter[]>([]);
  lines              = signal<BalanceLine[]>([]);
  selectedPeriod     = signal('');
  selectedCostCenter = signal('');
  searching          = signal(false);
  searched           = signal(false);

  readonly ACC_TYPES = ACCOUNT_TYPE_LABELS;

  // ── Computed ──────────────────────────────────────────────────────────────
  totalDebit  = computed(() => this.lines().reduce((s, l) => s + l.sumDebit,  0));
  totalCredit = computed(() => this.lines().reduce((s, l) => s + l.sumCredit, 0));
  isBalanced  = computed(() => Math.abs(this.totalDebit() - this.totalCredit()) < 0.01);

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

    try {
      // Fetch all posted entries for the selected period/year
      const year = this.selectedPeriod()
        ? this.periods().find(p => p.id === this.selectedPeriod())?.year ?? new Date().getFullYear()
        : new Date().getFullYear();

      const entriesObs = this.svc.getEntries({
        year:     year,
        status:   'posted',
        periodId: this.selectedPeriod() || undefined
      });

      // Use getDocs-style by subscribing once
      await new Promise<void>((resolve, reject) => {
        const sub = entriesObs.subscribe({
          next: (entries: JournalEntry[]) => {
            // Aggregate movements per account
            const map = new Map<string, BalanceLine>();

            const costCenterFilter = this.selectedCostCenter();
            for (const entry of entries) {
              for (const line of entry.lines) {
                if (costCenterFilter && line.costCenterId !== costCenterFilter) continue;
                const existing = map.get(line.accountCode);
                const acc      = this.accounts().find(a => a.code === line.accountCode);

                if (!existing) {
                  map.set(line.accountCode, {
                    accountCode: line.accountCode,
                    accountName: line.accountName,
                    accountType: acc?.type ?? 'activo',
                    sumDebit:    line.debit  ?? 0,
                    sumCredit:   line.credit ?? 0
                  });
                } else {
                  existing.sumDebit  += line.debit  ?? 0;
                  existing.sumCredit += line.credit ?? 0;
                }
              }
            }

            const result = [...map.values()].sort((a, b) => a.accountCode.localeCompare(b.accountCode));
            this.lines.set(result);
            this.searched.set(true);
            sub.unsubscribe();
            resolve();
          },
          error: reject
        });
      });
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
        data: this.lines().map(l => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          accountType: this.ACC_TYPES[l.accountType] ?? l.accountType,
          sumDebit:    l.sumDebit,
          sumCredit:   l.sumCredit
        })),
        extraData: { totalDebit: this.totalDebit(), totalCredit: this.totalCredit() }
      });
    } catch (err: any) {
      this.notifications.error('Error generando PDF: ' + (err?.message ?? err));
    } finally {
      this.downloadingPdf.set(false);
    }
  }

  getPeriodName(): string {
    if (!this.selectedPeriod()) return 'Todos los períodos';
    return this.periods().find(p => p.id === this.selectedPeriod())?.name ?? '';
  }

  round2(n: number): number { return Math.round(n * 100) / 100; }
  trackByCode(_: number, item: BalanceLine): string { return item.accountCode; }
}
