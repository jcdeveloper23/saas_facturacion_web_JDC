import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../../core/services/notification.service';
import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { MONTH_NAMES, PayrollRun, RUN_STATUS, RunStatus, money, runTitle } from '../../models/payroll.models';
import { PayrollService, payrollErrorMessage } from '../../services/payroll.service';

/** Nómina › Nóminas (§7.2): las del año, contadores por estado y «Nueva nómina». */
@Component({
  selector: 'app-payroll-runs-page',
  standalone: true,
  templateUrl: './runs-page.component.html',
  imports: [CommonModule, FormsModule, AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, ModalModule,
    SpinnerModule, PayrollTabsComponent],
})
export class RunsPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollService);
  private notifications = inject(NotificationService);
  private router = inject(Router);
  private sub: Subscription | null = null;

  readonly year = signal(new Date().getFullYear());
  readonly years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  readonly runs = signal<PayrollRun[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly status = signal<RunStatus | ''>('');
  readonly showNew = signal(false);
  readonly creating = signal(false);
  newMonth = new Date().getMonth() + 1;

  readonly months = MONTH_NAMES;
  readonly STATUS = RUN_STATUS;
  readonly money = money;
  readonly title = runTitle;
  readonly rows = computed(() => this.runs()
    .filter((r) => !this.status() || r.status === this.status())
    .sort((a, b) => (b.period === a.period ? b.version - a.version : b.period.localeCompare(a.period))));
  /** Un mes que no empezó no se abre (el servidor lo rechaza: futurePeriodProblem). */
  isFuture(month: number): boolean {
    const now = new Date();
    return this.year() > now.getFullYear() || (this.year() === now.getFullYear() && month > now.getMonth() + 1);
  }
  count(s: RunStatus) { return this.runs().filter((r) => r.status === s).length; }

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  setYear(y: number): void { this.year.set(Number(y)); this.load(); }

  private load(): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.sub = this.svc.runs(this.year()).subscribe({
      next: (r) => { this.runs.set(r); this.error.set(''); this.loading.set(false); },
      error: (err) => { this.error.set(payrollErrorMessage(err)); this.loading.set(false); },
    });
  }

  open(r: PayrollRun): void { this.router.navigate(['/payroll/runs', r.id]); }

  async create(): Promise<void> {
    const period = `${this.year()}-${String(this.newMonth).padStart(2, '0')}`;
    this.creating.set(true);
    try {
      const r = await this.svc.createRun(period);
      this.notifications.success('Nómina creada en borrador');
      this.showNew.set(false);
      this.router.navigate(['/payroll/runs', r.runId]);
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.creating.set(false);
    }
  }
}
