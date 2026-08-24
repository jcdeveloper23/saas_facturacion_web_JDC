import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, take, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule, ModalModule, TooltipModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Timestamp } from '@angular/fire/firestore';

import { PettyCashService, PettyCashFundCreateInput } from '../../services/petty-cash.service';
import { BankAccountsService }    from '../../services/bank-accounts.service';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { NotificationService }    from '../../../../core/services/notification.service';

import { PettyCashFund, PettyCashMovement } from '../../models/petty-cash.interface';
import { BankAccount } from '../../models/bank-account.interface';
import { Account } from '../../models/account.interface';

@Component({
  selector: 'app-petty-cash-page',
  standalone: true,
  templateUrl: './petty-cash-page.component.html',
  styleUrl:    './petty-cash-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    FormModule, ModalModule, TooltipModule, AlertModule, IconModule
  ]
})
export class PettyCashPageComponent implements OnInit, OnDestroy {
  private svc          = inject(PettyCashService);
  private bankAccountsSvc = inject(BankAccountsService);
  private chartSvc     = inject(ChartOfAccountsService);
  private notifications = inject(NotificationService);
  private destroy$     = new Subject<void>();
  private movTxSub$     = new Subject<void>();

  // ── State ──────────────────────────────────────────────────────────────────
  loading      = signal(true);
  funds        = signal<PettyCashFund[]>([]);
  bankAccounts = signal<BankAccount[]>([]);
  glAccounts   = signal<Account[]>([]);
  selectedFundId = signal('');
  movements    = signal<PettyCashMovement[]>([]);
  loadingMovements = signal(false);

  selectedFund = computed(() => this.funds().find(f => f.id === this.selectedFundId()) ?? null);
  pendingMovements = computed(() => this.movements().filter(m => !m.reimbursed));
  pendingTotal = computed(() => Math.round(this.pendingMovements().reduce((s, m) => s + m.amount, 0) * 100) / 100);

  // ── New fund modal ────────────────────────────────────────────────────────
  showFundModal = signal(false);
  creatingFund  = signal(false);
  newFundName      = signal('');
  newFundCustodian = signal('');
  newFundAmount    = signal(0);
  newFundGlCode    = signal('');
  newFundBankAccountId = signal('');

  // ── New expense modal ─────────────────────────────────────────────────────
  showExpenseModal = signal(false);
  creatingExpense   = signal(false);
  newExpDate        = signal(this.todayInput());
  newExpDescription = signal('');
  newExpAmount      = signal(0);
  newExpAccountCode = signal('');
  newExpReceiptRef  = signal('');

  // ── Replenish modal ───────────────────────────────────────────────────────
  showReplenishModal = signal(false);
  replenishing = signal(false);
  replenishBankAccountId = signal('');

  ngOnInit(): void {
    this.svc.getFunds().pipe(
      catchError(err => { this.notifications.error('Error cargando fondos: ' + (err?.message ?? err)); this.loading.set(false); return of([]); }),
      takeUntil(this.destroy$)
    ).subscribe(list => { this.funds.set(list); this.loading.set(false); });

    this.bankAccountsSvc.getBankAccounts().pipe(take(1)).subscribe(list => this.bankAccounts.set(list.filter(a => a.isActive)));
    this.chartSvc.getActiveMovementAccounts().pipe(take(1)).subscribe(list => this.glAccounts.set(list));
  }

  ngOnDestroy(): void {
    this.movTxSub$.next(); this.movTxSub$.complete();
    this.destroy$.next(); this.destroy$.complete();
  }

  // ── Fund selection ────────────────────────────────────────────────────────
  selectFund(fundId: string): void {
    this.selectedFundId.set(fundId);
    this.movements.set([]);
    this.movTxSub$.next();
    if (!fundId) return;

    this.loadingMovements.set(true);
    this.svc.getMovements(fundId).pipe(
      takeUntil(this.movTxSub$), takeUntil(this.destroy$)
    ).subscribe(list => { this.movements.set(list); this.loadingMovements.set(false); });
  }

  // ── New fund ──────────────────────────────────────────────────────────────
  openNewFund(): void {
    this.newFundName.set('');
    this.newFundCustodian.set('');
    this.newFundAmount.set(0);
    this.newFundGlCode.set('');
    this.newFundBankAccountId.set('');
    this.showFundModal.set(true);
  }

  async confirmNewFund(): Promise<void> {
    const gl = this.glAccounts().find(a => a.code === this.newFundGlCode());
    if (!this.newFundName().trim() || !gl) return;
    if (this.newFundAmount() > 0 && !this.newFundBankAccountId()) {
      this.notifications.error('Seleccione la cuenta bancaria desde la que se financia el fondo.');
      return;
    }

    this.creatingFund.set(true);
    try {
      const input: PettyCashFundCreateInput = {
        name: this.newFundName().trim(),
        custodianName: this.newFundCustodian().trim(),
        fixedAmount: this.newFundAmount(),
        linkedGlCode: gl.code,
        linkedGlName: gl.name,
        isActive: true,
      };
      const bank = this.bankAccounts().find(b => b.id === this.newFundBankAccountId());
      await this.svc.createFund(input, bank ? { linkedGlCode: bank.linkedGlCode, linkedGlName: bank.linkedGlName } : undefined);
      this.notifications.success('Fondo de caja chica creado');
      this.showFundModal.set(false);
    } catch (err: any) {
      this.notifications.error('Error al crear el fondo: ' + (err?.message ?? err));
    } finally {
      this.creatingFund.set(false);
    }
  }

  async toggleFundActive(fund: PettyCashFund, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.svc.toggleActive(fund.id, !fund.isActive);
      this.notifications.success(fund.isActive ? 'Fondo inactivado' : 'Fondo activado');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  // ── New expense ───────────────────────────────────────────────────────────
  openNewExpense(): void {
    this.newExpDate.set(this.todayInput());
    this.newExpDescription.set('');
    this.newExpAmount.set(0);
    this.newExpAccountCode.set('');
    this.newExpReceiptRef.set('');
    this.showExpenseModal.set(true);
  }

  async confirmNewExpense(): Promise<void> {
    const fund = this.selectedFund();
    const acc  = this.glAccounts().find(a => a.code === this.newExpAccountCode());
    if (!fund || !acc || this.newExpAmount() <= 0 || !this.newExpDescription().trim()) return;

    this.creatingExpense.set(true);
    try {
      await this.svc.createMovement({
        fundId: fund.id, fundName: fund.name,
        date: this.newExpDate(), description: this.newExpDescription().trim(),
        amount: this.newExpAmount(),
        expenseAccountCode: acc.code, expenseAccountName: acc.name,
        receiptRef: this.newExpReceiptRef() || undefined,
      });
      this.notifications.success('Gasto registrado');
      this.showExpenseModal.set(false);
    } catch (err: any) {
      this.notifications.error('Error al registrar: ' + (err?.message ?? err));
    } finally {
      this.creatingExpense.set(false);
    }
  }

  // ── Replenish ─────────────────────────────────────────────────────────────
  openReplenish(): void {
    this.replenishBankAccountId.set('');
    this.showReplenishModal.set(true);
  }

  async confirmReplenish(): Promise<void> {
    const fund = this.selectedFund();
    const bank = this.bankAccounts().find(b => b.id === this.replenishBankAccountId());
    const pending = this.pendingMovements();
    if (!fund || !bank || !pending.length) return;

    this.replenishing.set(true);
    try {
      await this.svc.replenish(fund, pending, { linkedGlCode: bank.linkedGlCode, linkedGlName: bank.linkedGlName });
      this.notifications.success(`Reposición registrada — ${pending.length} gasto(s), ${this.pendingTotal().toFixed(2)} USD`);
      this.showReplenishModal.set(false);
    } catch (err: any) {
      this.notifications.error('Error al reponer: ' + (err?.message ?? err));
    } finally {
      this.replenishing.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  formatDate(ts: Timestamp | undefined): string {
    if (!ts) return '—';
    return ts.toDate().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private todayInput(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
