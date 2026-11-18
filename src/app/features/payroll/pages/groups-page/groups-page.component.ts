import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, ButtonModule, CardModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../../core/services/notification.service';
import { ChartOfAccountsService } from '../../../accounting/services/chart-of-accounts.service';
import { Account } from '../../../accounting/models/account.interface';
import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { GroupModalComponent } from '../../components/group-modal.component';
import { PayrollEmployee } from '../../models/payroll.models';
import { PayrollAccountsView } from '../../models/payroll-payments.models';
import { PayrollGroup } from '../../models/payroll-loans.models';
import { PayrollLoansService } from '../../services/payroll-loans.service';
import { PayrollPaymentsService } from '../../services/payroll-payments.service';
import { PayrollService, payrollErrorMessage } from '../../services/payroll.service';

/**
 * Nómina › Grupos (NOMINA_GRUPOS_PRESTAMOS.md): grupos de colaboradores con
 * cuentas propias encima de las de la empresa. Se asignan en la ficha del
 * empleado. Solo se borra un grupo sin empleados (si no, se desactiva).
 */
@Component({
  selector: 'app-payroll-groups-page',
  standalone: true,
  templateUrl: './groups-page.component.html',
  imports: [CommonModule, AlertModule, BadgeModule, ButtonModule, CardModule, ModalModule, SpinnerModule,
    PayrollTabsComponent, GroupModalComponent],
})
export class GroupsPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollLoansService);
  private payroll = inject(PayrollService);
  private payments = inject(PayrollPaymentsService);
  private chart = inject(ChartOfAccountsService);
  private notifications = inject(NotificationService);
  private sub = new Subscription();

  readonly groups = signal<PayrollGroup[]>([]);
  readonly employees = signal<PayrollEmployee[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly companyAccounts = signal<PayrollAccountsView | null>(null);
  readonly companyError = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  /** undefined = cerrado; null = grupo nuevo. */
  readonly editing = signal<PayrollGroup | null | undefined>(undefined);
  readonly deleting = signal<PayrollGroup | null>(null);
  readonly busy = signal(false);

  readonly rows = computed(() => [...this.groups()].sort((a, b) => a.name.localeCompare(b.name)));
  private readonly counts = computed(() => {
    const m = new Map<string, number>();
    for (const e of this.employees()) if (e.groupId) m.set(e.groupId, (m.get(e.groupId) ?? 0) + 1);
    return m;
  });

  count(g: PayrollGroup): number { return this.counts().get(g.id) ?? 0; }
  overrides(g: PayrollGroup): number { return Object.keys(g.accounts).length; }

  ngOnInit(): void {
    this.sub.add(this.svc.groups().subscribe({
      next: (g) => { this.groups.set(g); this.error.set(''); this.loading.set(false); },
      error: (err) => { this.error.set(payrollErrorMessage(err)); this.loading.set(false); },
    }));
    this.sub.add(this.payroll.employees().subscribe({ next: (e) => this.employees.set(e), error: () => {} }));
    this.sub.add(this.chart.getActiveMovementAccounts().subscribe({ next: (a) => this.accounts.set(a), error: () => {} }));
    this.payments.getAccounts()
      .then((v) => this.companyAccounts.set(v))
      .catch((err) => this.companyError.set(`No se pudieron leer las cuentas de la empresa: ${payrollErrorMessage(err)}`));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  async remove(g: PayrollGroup): Promise<void> {
    this.busy.set(true);
    try {
      await this.svc.deleteGroup(g.id);
      this.notifications.success(`Grupo «${g.name}» borrado`);
      this.deleting.set(null);
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
