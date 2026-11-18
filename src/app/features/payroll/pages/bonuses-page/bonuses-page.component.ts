import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, SpinnerModule } from '@coreui/angular';

import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { BonusGenerateModalComponent } from '../../components/bonus-generate-modal.component';
import { money } from '../../models/payroll.models';
import { dayLabel, ecuadorToday } from '../../models/payroll-payments.models';
import { BONUS_STATUS, PayrollBonusRun } from '../../models/payroll-bonus.models';
import { PayrollBonusService } from '../../services/payroll-bonus.service';
import { payrollErrorMessage } from '../../services/payroll.service';

/** Nómina › Décimos (NOMINA_DECIMOS.md): los lotes del año y «Generar décimo». */
@Component({
  selector: 'app-payroll-bonuses-page',
  standalone: true,
  templateUrl: './bonuses-page.component.html',
  imports: [CommonModule, FormsModule, AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, SpinnerModule,
    PayrollTabsComponent, BonusGenerateModalComponent],
})
export class BonusesPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollBonusService);
  private router = inject(Router);
  private sub: Subscription | null = null;

  private readonly thisYear = Number(ecuadorToday().slice(0, 4));
  readonly year = signal(this.thisYear);
  readonly years = Array.from({ length: 5 }, (_, i) => this.thisYear - i);
  readonly runs = signal<PayrollBonusRun[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly showNew = signal(false);

  readonly STATUS = BONUS_STATUS;
  readonly money = money;
  readonly day = dayLabel;
  readonly rows = computed(() => [...this.runs()].sort((a, b) =>
    a.kind !== b.kind ? a.kind.localeCompare(b.kind) : (a.region ?? '').localeCompare(b.region ?? '') || b.version - a.version));

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  setYear(y: number): void { this.year.set(Number(y)); this.load(); }

  private load(): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.sub = this.svc.bonusRuns(this.year()).subscribe({
      next: (r) => { this.runs.set(r); this.error.set(''); this.loading.set(false); },
      error: (err) => { this.error.set(payrollErrorMessage(err)); this.loading.set(false); },
    });
  }

  open(r: PayrollBonusRun): void { this.router.navigate(['/payroll/bonuses', r.id]); }

  onGenerated(id: string | null): void {
    this.showNew.set(false);
    if (id) this.router.navigate(['/payroll/bonuses', id]);
  }

  /** Lo que se paga: en borrador, el saldo calculado; pagado, lo pagado. */
  toPay(r: PayrollBonusRun): number { return r.status === 'paid' ? r.paidCents : r.totals.balanceCents; }
}
