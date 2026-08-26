import {
  Component, OnInit, OnDestroy, inject, signal, computed, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, take } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, SpinnerModule, TableModule, FormModule, BadgeComponent
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { BudgetService }            from '../../services/budget.service';
import { ChartOfAccountsService }   from '../../services/chart-of-accounts.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import { AccountingPeriod }         from '../../models/accounting-period.interface';
import { Account, AccountType }     from '../../models/account.interface';
import { Budget, BudgetLine }       from '../../models/budget.interface';

@Component({
  selector: 'app-budget-page',
  standalone: true,
  templateUrl: './budget-page.component.html',
  styleUrl: './budget-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, SpinnerModule, TableModule, FormModule,
    BadgeComponent, IconModule
  ]
})
export class BudgetPageComponent implements OnInit, OnDestroy {
  private budgetSvc   = inject(BudgetService);
  private coa         = inject(ChartOfAccountsService);
  private periodsSvc  = inject(AccountingPeriodsService);
  private notifications = inject(NotificationService);
  private subs        = new Subscription();

  // ── State ──────────────────────────────────────────────────────────────────
  periods         = signal<AccountingPeriod[]>([]);
  accounts        = signal<Account[]>([]);
  selectedPeriod  = signal('');
  loading         = signal(false);
  saving          = signal(false);
  deleting        = signal(false);
  existingBudget  = signal<Budget | null>(null);

  /** Map accountCode -> editable amount (string to allow empty input) */
  amounts         = signal<Record<string, number>>({});

  // ── Computed ──────────────────────────────────────────────────────────────

  budgetAccounts = computed(() =>
    this.accounts().filter(a =>
      a.allowsMovement &&
      a.isActive &&
      (['ingreso', 'gasto', 'costo'] as AccountType[]).includes(a.type)
    )
  );

  incomeAccounts = computed(() =>
    this.budgetAccounts().filter(a => a.type === 'ingreso')
  );

  expenseAccounts = computed(() =>
    this.budgetAccounts().filter(a => a.type === 'gasto' || a.type === 'costo')
  );

  totalIncome = computed(() =>
    this.incomeAccounts().reduce((s, a) => s + (this.amounts()[a.code] ?? 0), 0)
  );

  totalExpense = computed(() =>
    this.expenseAccounts().reduce((s, a) => s + (this.amounts()[a.code] ?? 0), 0)
  );

  hasBudget = computed(() => this.existingBudget() !== null);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.subs.add(
      this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => this.periods.set(p))
    );
    this.subs.add(
      this.coa.getActiveMovementAccounts().pipe(take(1)).subscribe(a => this.accounts.set(a))
    );
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  // ── Period change ─────────────────────────────────────────────────────────

  onPeriodChange(periodId: string): void {
    this.selectedPeriod.set(periodId);
    this.existingBudget.set(null);
    this.amounts.set({});

    if (!periodId) return;

    this.loading.set(true);
    this.subs.add(
      this.budgetSvc.getBudget(periodId).pipe(take(1)).subscribe({
        next: budget => {
          this.existingBudget.set(budget);
          if (budget) {
            const map: Record<string, number> = {};
            for (const line of budget.lines) {
              map[line.accountCode] = line.amount;
            }
            this.amounts.set(map);
          }
          this.loading.set(false);
        },
        error: err => {
          this.notifications.error('Error cargando presupuesto: ' + (err?.message ?? err));
          this.loading.set(false);
        }
      })
    );
  }

  // ── Get/set amount ────────────────────────────────────────────────────────

  getAmount(code: string): number {
    return this.amounts()[code] ?? 0;
  }

  setAmount(code: string, value: string): void {
    const num = parseFloat(value);
    const current = { ...this.amounts() };
    current[code] = isNaN(num) || num < 0 ? 0 : num;
    this.amounts.set(current);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    if (!this.selectedPeriod()) return;

    this.saving.set(true);
    try {
      const period = this.periods().find(p => p.id === this.selectedPeriod());
      if (!period) throw new Error('Período no encontrado');

      const lines: BudgetLine[] = this.budgetAccounts()
        .filter(a => (this.amounts()[a.code] ?? 0) > 0)
        .map(a => ({
          accountCode: a.code,
          accountName: a.name,
          accountType: a.type,
          amount:      this.amounts()[a.code] ?? 0
        }));

      const budget: Budget = {
        periodId:     period.id!,
        periodName:   period.name,
        year:         period.year,
        lines,
        totalIncome:  this.totalIncome(),
        totalExpense: this.totalExpense(),
        createdAt:    this.existingBudget()?.createdAt ?? null
      };

      await this.budgetSvc.saveBudget(budget);
      this.notifications.success('Presupuesto guardado correctamente');
      // Reload
      this.onPeriodChange(this.selectedPeriod());
    } catch (err: any) {
      this.notifications.error('Error guardando presupuesto: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async deleteBudget(): Promise<void> {
    if (!this.selectedPeriod() || !this.hasBudget()) return;
    const ok = await this.notifications.confirm({
      title: '¿Eliminar el presupuesto de este período?',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;

    this.deleting.set(true);
    try {
      await this.budgetSvc.deleteBudget(this.selectedPeriod());
      this.notifications.success('Presupuesto eliminado');
      this.existingBudget.set(null);
      this.amounts.set({});
    } catch (err: any) {
      this.notifications.error('Error eliminando presupuesto: ' + (err?.message ?? err));
    } finally {
      this.deleting.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  round2(n: number): number { return Math.round(n * 100) / 100; }
  trackByCode(_: number, item: Account): string { return item.code; }
}
