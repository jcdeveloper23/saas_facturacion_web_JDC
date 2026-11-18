import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../../core/services/notification.service';
import { ChartOfAccountsService } from '../../../accounting/services/chart-of-accounts.service';
import { Account } from '../../../accounting/models/account.interface';
import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { LoanModalComponent } from '../../components/loan-modal.component';
import { LoanEditModalComponent } from '../../components/loan-edit-modal.component';
import { VoidReasonModalComponent } from '../../components/void-reason-modal.component';
import { PayrollEmployee, money, periodLabel } from '../../models/payroll.models';
import { dayLabel } from '../../models/payroll-payments.models';
import { LOAN_STATUS, LOAN_TYPE_LABELS, LoanStatus, PayrollLoan, isIessLoan } from '../../models/payroll-loans.models';
import { PayrollLoansService } from '../../services/payroll-loans.service';
import { PayrollService, payrollErrorMessage } from '../../services/payroll.service';

/**
 * Nómina › Préstamos (NOMINA_GRUPOS_PRESTAMOS.md): préstamos y anticipos a
 * largo plazo que se descuentan solos en cada rol, más los del IESS que la
 * empresa retiene. Filtro por estado o por empleado (uno a la vez en Firestore;
 * los dos juntos, el estado se filtra aquí para no pedir un índice compuesto).
 */
@Component({
  selector: 'app-payroll-loans-page',
  standalone: true,
  templateUrl: './loans-page.component.html',
  imports: [CommonModule, FormsModule, AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, SpinnerModule,
    PayrollTabsComponent, LoanModalComponent, LoanEditModalComponent, VoidReasonModalComponent],
})
export class LoansPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollLoansService);
  private payroll = inject(PayrollService);
  private chart = inject(ChartOfAccountsService);
  private notifications = inject(NotificationService);
  private sub = new Subscription();
  private loansSub: Subscription | null = null;

  readonly loans = signal<PayrollLoan[]>([]);
  readonly employees = signal<PayrollEmployee[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly status = signal<LoanStatus | ''>('active');
  readonly employeeId = signal('');
  readonly showNew = signal(false);
  readonly editing = signal<{ loan: PayrollLoan; mode: 'installment' | 'balance' } | null>(null);
  readonly cancelling = signal<PayrollLoan | null>(null);
  readonly busy = signal(false);

  readonly STATUS = LOAN_STATUS;
  readonly TYPES = LOAN_TYPE_LABELS;
  readonly money = money;
  readonly period = periodLabel;
  readonly day = dayLabel;
  readonly iess = isIessLoan;
  readonly activeEmployees = computed(() => this.employees().filter((e) => e.isActive).sort((a, b) => a.name.localeCompare(b.name)));
  readonly allEmployees = computed(() => [...this.employees()].sort((a, b) => a.name.localeCompare(b.name)));
  readonly rows = computed(() => this.loans()
    .filter((l) => !this.status() || l.status === this.status())
    .sort((a, b) => b.number.localeCompare(a.number)));
  readonly totalBalance = computed(() => this.rows().filter((l) => l.status === 'active').reduce((s, l) => s + l.balanceCents, 0));

  ngOnInit(): void {
    this.sub.add(this.payroll.employees().subscribe({ next: (e) => this.employees.set(e), error: () => {} }));
    this.sub.add(this.chart.getActiveMovementAccounts().subscribe({ next: (a) => this.accounts.set(a), error: () => {} }));
    this.load();
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); this.loansSub?.unsubscribe(); }

  setStatus(s: LoanStatus | ''): void { this.status.set(s); if (!this.employeeId()) this.load(); }
  setEmployee(id: string): void { this.employeeId.set(id); this.load(); }

  private load(): void {
    this.loansSub?.unsubscribe();
    this.loading.set(true);
    const filter = this.employeeId() ? { employeeId: this.employeeId() } : this.status() ? { status: this.status() as LoanStatus } : {};
    this.loansSub = this.svc.loans(filter).subscribe({
      next: (l) => { this.loans.set(l); this.error.set(''); this.loading.set(false); },
      error: (err) => { this.error.set(payrollErrorMessage(err)); this.loading.set(false); },
    });
  }

  async confirmCancel(l: PayrollLoan, reason: string): Promise<void> {
    this.busy.set(true);
    try {
      const r = await this.svc.cancelLoan(l.id, reason);
      this.notifications.success(r.reversalEntryId
        ? `Préstamo ${l.number} cancelado y su asiento de entrega reversado`
        : `Préstamo ${l.number} cancelado`);
      this.cancelling.set(null);
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  cancelText(l: PayrollLoan): string {
    const untouched = l.balanceCents === l.amountCents;
    if (l.disbursement?.entryId && untouched) {
      return 'Deja de descontarse. Como no se descontó nada, se reversa el asiento de la entrega.';
    }
    if (l.disbursement?.entryId) {
      return 'Deja de descontarse. Como ya se descontaron cuotas, el asiento de la entrega queda y el saldo pendiente se ajusta a mano con un asiento.';
    }
    return 'Deja de descontarse en los roles. Si hay un saldo que cobrar o devolver, ajústalo a mano.';
  }
}
