import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, take, forkJoin } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, SpinnerModule, TableModule, FormModule, BadgeComponent
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { BudgetService }            from '../../services/budget.service';
import { JournalEntriesService }    from '../../services/journal-entries.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { AccountingPdfService }     from '../../services/accounting-pdf.service';
import { TenantService }            from '../../../../core/services/tenant.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import { AccountingPeriod }         from '../../models/accounting-period.interface';
import { JournalEntry }             from '../../models/journal-entry.interface';
import { Budget }                   from '../../models/budget.interface';

export interface VsRealLine {
  accountCode:    string;
  accountName:    string;
  accountType:    string;
  budgeted:       number;   // presupuestado
  actual:         number;   // real
  variance:       number;   // real - presupuestado
  variancePct:    number | null;  // null si presupuestado === 0
}

@Component({
  selector: 'app-presupuesto-vs-real-page',
  standalone: true,
  templateUrl: './presupuesto-vs-real-page.component.html',
  styleUrl: './presupuesto-vs-real-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, SpinnerModule, TableModule, FormModule,
    BadgeComponent, IconModule
  ]
})
export class PresupuestoVsRealPageComponent implements OnInit, OnDestroy {
  private budgetSvc     = inject(BudgetService);
  private entriesSvc    = inject(JournalEntriesService);
  private periodsSvc    = inject(AccountingPeriodsService);
  private pdfSvc        = inject(AccountingPdfService);
  private tenantSvc     = inject(TenantService);
  private notifications = inject(NotificationService);
  private subs          = new Subscription();

  // ── State ──────────────────────────────────────────────────────────────────
  periods         = signal<AccountingPeriod[]>([]);
  selectedPeriod  = signal('');
  searching       = signal(false);
  searched        = signal(false);
  downloadingPdf  = signal(false);

  incomeLines  = signal<VsRealLine[]>([]);
  expenseLines = signal<VsRealLine[]>([]);

  // ── Computed totals ───────────────────────────────────────────────────────

  totalIncomeBudgeted  = computed(() => this.incomeLines().reduce((s, l) => s + l.budgeted, 0));
  totalIncomeActual    = computed(() => this.incomeLines().reduce((s, l) => s + l.actual, 0));
  totalIncomeVariance  = computed(() => this.totalIncomeActual() - this.totalIncomeBudgeted());

  totalExpenseBudgeted = computed(() => this.expenseLines().reduce((s, l) => s + l.budgeted, 0));
  totalExpenseActual   = computed(() => this.expenseLines().reduce((s, l) => s + l.actual, 0));
  totalExpenseVariance = computed(() => this.totalExpenseActual() - this.totalExpenseBudgeted());

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.subs.add(
      this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => this.periods.set(p))
    );
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  // ── Generate ──────────────────────────────────────────────────────────────

  async generate(): Promise<void> {
    if (!this.selectedPeriod()) return;

    this.searching.set(true);
    this.searched.set(false);
    this.incomeLines.set([]);
    this.expenseLines.set([]);

    try {
      const period = this.periods().find(p => p.id === this.selectedPeriod());
      if (!period) throw new Error('Período no encontrado');

      const year = period.year;

      // Load budget and journal entries in parallel
      const budget$ = this.budgetSvc.getBudget(this.selectedPeriod()).pipe(take(1));
      const entries$ = this.entriesSvc.getEntries({
        year,
        status:   'posted',
        periodId: this.selectedPeriod()
      }).pipe(take(1));

      await new Promise<void>((resolve, reject) => {
        forkJoin({ budget: budget$, entries: entries$ }).subscribe({
          next: ({ budget, entries }) => {
            this.buildReport(budget, entries as JournalEntry[]);
            this.searched.set(true);
            resolve();
          },
          error: reject
        });
      });
    } catch (err: any) {
      this.notifications.error('Error generando reporte: ' + (err?.message ?? err));
    } finally {
      this.searching.set(false);
    }
  }

  // ── Build comparative report ───────────────────────────────────────────────

  private buildReport(budget: Budget | null, entries: JournalEntry[]): void {
    // Aggregate real movements by accountCode
    const realMap = new Map<string, { name: string; type: string; balance: number }>();

    for (const entry of entries) {
      for (const line of entry.lines) {
        const code = line.accountCode ?? '';
        if (!code.startsWith('4') && !code.startsWith('5')) continue;

        const existing = realMap.get(code);
        if (code.startsWith('4')) {
          // Income: credit - debit
          const delta = (line.credit ?? 0) - (line.debit ?? 0);
          if (existing) {
            existing.balance += delta;
          } else {
            realMap.set(code, { name: line.accountName, type: 'ingreso', balance: delta });
          }
        } else {
          // Cost/Expense: debit - credit
          const delta = (line.debit ?? 0) - (line.credit ?? 0);
          if (existing) {
            existing.balance += delta;
          } else {
            const type = code.startsWith('5.1') ? 'costo' : 'gasto';
            realMap.set(code, { name: line.accountName, type, balance: delta });
          }
        }
      }
    }

    // Build budget map from lines
    const budgetMap = new Map<string, { name: string; type: string; amount: number }>();
    if (budget) {
      for (const bl of budget.lines) {
        budgetMap.set(bl.accountCode, {
          name:   bl.accountName,
          type:   bl.accountType,
          amount: bl.amount
        });
      }
    }

    // Union of all account codes
    const allCodes = new Set([...budgetMap.keys(), ...realMap.keys()]);

    const incomeLines:  VsRealLine[] = [];
    const expenseLines: VsRealLine[] = [];

    for (const code of allCodes) {
      const bEntry = budgetMap.get(code);
      const rEntry = realMap.get(code);

      const budgeted = bEntry?.amount  ?? 0;
      const actual   = rEntry?.balance ?? 0;
      const variance = actual - budgeted;

      const variancePct = budgeted !== 0
        ? Math.round((variance / budgeted) * 10000) / 100
        : null;

      const name = bEntry?.name ?? rEntry?.name ?? code;
      const type = bEntry?.type ?? rEntry?.type ?? 'ingreso';

      const vsLine: VsRealLine = {
        accountCode: code,
        accountName: name,
        accountType: type,
        budgeted,
        actual,
        variance,
        variancePct
      };

      if (type === 'ingreso') {
        incomeLines.push(vsLine);
      } else {
        expenseLines.push(vsLine);
      }
    }

    const sortFn = (a: VsRealLine, b: VsRealLine) =>
      a.accountCode.localeCompare(b.accountCode);

    this.incomeLines.set(incomeLines.sort(sortFn));
    this.expenseLines.set(expenseLines.sort(sortFn));
  }

  // ── Semaphore badge color ─────────────────────────────────────────────────

  badgeColor(pct: number | null): string {
    if (pct === null) return 'secondary';
    const abs = Math.abs(pct);
    if (abs <= 5)  return 'success';
    if (abs <= 15) return 'warning';
    return 'danger';
  }

  // ── PDF ───────────────────────────────────────────────────────────────────

  async downloadPdf(): Promise<void> {
    if (!this.searched()) return;
    this.downloadingPdf.set(true);
    try {
      await this.pdfSvc.downloadPdf({
        reportType: 'presupuesto-vs-real' as any,
        companyId:  this.tenantSvc.companyId,
        periodName: this.getPeriodName(),
        data:       [],
        extraData: {
          incomeLines:          this.incomeLines(),
          expenseLines:         this.expenseLines(),
          totalIncomeBudgeted:  this.totalIncomeBudgeted(),
          totalIncomeActual:    this.totalIncomeActual(),
          totalIncomeVariance:  this.totalIncomeVariance(),
          totalExpenseBudgeted: this.totalExpenseBudgeted(),
          totalExpenseActual:   this.totalExpenseActual(),
          totalExpenseVariance: this.totalExpenseVariance()
        }
      });
    } catch (err: any) {
      this.notifications.error('Error generando PDF: ' + (err?.message ?? err));
    } finally {
      this.downloadingPdf.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getPeriodName(): string {
    if (!this.selectedPeriod()) return 'Todos los períodos';
    return this.periods().find(p => p.id === this.selectedPeriod())?.name ?? '';
  }

  printReport(): void { window.print(); }
  round2(n: number): number { return Math.round(n * 100) / 100; }
  trackByCode(_: number, item: VsRealLine): string { return item.accountCode; }
}
