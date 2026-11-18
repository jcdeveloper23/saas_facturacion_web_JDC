import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, GridModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../../core/services/notification.service';
import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { VacationModalComponent } from '../../components/vacation-modal.component';
import { VoidReasonModalComponent } from '../../components/void-reason-modal.component';
import { PayrollEmployee } from '../../models/payroll.models';
import { dayLabel } from '../../models/payroll-payments.models';
import { PayrollVacation, VacationBalance } from '../../models/payroll-bonus.models';
import { PayrollBonusService } from '../../services/payroll-bonus.service';
import { PayrollService, payrollErrorMessage } from '../../services/payroll.service';

/**
 * Nómina › Vacaciones (NOMINA_DECIMOS.md §2): el saldo de días de un empleado
 * (art. 69) y sus registros. Sin efecto contable.
 */
@Component({
  selector: 'app-payroll-vacations-page',
  standalone: true,
  templateUrl: './vacations-page.component.html',
  imports: [CommonModule, FormsModule, AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, GridModule,
    SpinnerModule, PayrollTabsComponent, VacationModalComponent, VoidReasonModalComponent],
})
export class VacationsPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollBonusService);
  private payroll = inject(PayrollService);
  private notifications = inject(NotificationService);
  private sub = new Subscription();
  private vacSub: Subscription | null = null;

  readonly employees = signal<PayrollEmployee[]>([]);
  readonly employeeId = signal('');
  readonly balance = signal<VacationBalance | null>(null);
  readonly balanceError = signal('');
  readonly loadingBalance = signal(false);
  readonly vacations = signal<PayrollVacation[]>([]);
  readonly listError = signal('');
  readonly showNew = signal(false);
  readonly voiding = signal<PayrollVacation | null>(null);
  readonly busy = signal(false);

  readonly day = dayLabel;
  readonly sorted = computed(() => [...this.employees()].sort((a, b) =>
    Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)));
  readonly employee = computed(() => this.employees().find((e) => e.id === this.employeeId()) ?? null);
  readonly rows = computed(() => [...this.vacations()].sort((a, b) => b.from.localeCompare(a.from)));

  ngOnInit(): void {
    this.sub.add(this.payroll.employees().subscribe({ next: (e) => this.employees.set(e), error: () => {} }));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); this.vacSub?.unsubscribe(); }

  select(id: string): void {
    this.employeeId.set(id);
    this.vacSub?.unsubscribe();
    this.vacations.set([]);
    this.balance.set(null);
    if (!id) return;
    this.vacSub = this.svc.vacations(id).subscribe({
      next: (v) => { this.vacations.set(v); this.listError.set(''); },
      error: (err) => this.listError.set(payrollErrorMessage(err)),
    });
    this.loadBalance();
  }

  async loadBalance(): Promise<void> {
    const id = this.employeeId();
    if (!id) return;
    this.loadingBalance.set(true);
    try {
      const b = await this.svc.vacationBalance(id);
      if (this.employeeId() === id) { this.balance.set(b); this.balanceError.set(''); }
    } catch (err) {
      this.balanceError.set(payrollErrorMessage(err));
    } finally {
      this.loadingBalance.set(false);
    }
  }

  onRegistered(): void { this.showNew.set(false); this.loadBalance(); }

  async confirmVoid(v: PayrollVacation, reason: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.svc.voidVacation(v.id, reason);
      this.notifications.success('Registro de vacaciones anulado');
      this.voiding.set(null);
      this.loadBalance();
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
