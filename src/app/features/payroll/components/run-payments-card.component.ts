import { Component, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, ButtonModule, CardModule } from '@coreui/angular';

import { NotificationService } from '../../../core/services/notification.service';
import { money } from '../models/payroll.models';
import { DOC_STATUS, PayrollPayment, dayLabel } from '../models/payroll-payments.models';
import { PayrollPaymentsService } from '../services/payroll-payments.service';
import { payrollErrorMessage } from '../services/payroll.service';
import { VoidReasonModalComponent } from './void-reason-modal.component';

/** Los pagos de una nómina (payrollPayments por runId) y «Anular» (voidPayrollPayment). */
@Component({
  selector: 'app-payroll-run-payments-card',
  standalone: true,
  imports: [CommonModule, AlertModule, BadgeModule, ButtonModule, CardModule, VoidReasonModalComponent],
  template: `
<c-card class="mt-3">
  <c-card-header>Pagos de la nómina</c-card-header>
  @if (error()) {
    <c-card-body><c-alert color="warning" class="mb-0">No se pudieron leer los pagos: {{ error() }}</c-alert></c-card-body>
  } @else if (rows().length === 0) {
    <c-card-body class="text-secondary small">Todavía no hay pagos. Usa «Pagar roles».</c-card-body>
  } @else {
    <div class="table-responsive">
      <table class="table table-sm mb-0 align-middle">
        <thead>
          <tr><th>Número</th><th>Fecha</th><th>Origen</th><th class="text-end">Roles</th><th class="text-end">Total</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          @for (p of rows(); track p.id) {
            <tr>
              <td class="font-monospace">{{ p.number }}</td>
              <td>{{ day(p.date) }}</td>
              <td class="small">{{ p.sourceLabel }}@if (p.chequeNumber) { · cheque {{ p.chequeNumber }} }
                @if (p.reference) { <br /><span class="text-secondary">{{ p.reference }}</span> }</td>
              <td class="text-end">{{ p.lines.length }}</td>
              <td class="text-end font-monospace">{{ money(p.totalCents) }}</td>
              <td>
                <c-badge [color]="STATUS[p.status].color">{{ STATUS[p.status].label }}</c-badge>
                @if (p.voidReason) { <br /><small class="text-secondary">{{ p.voidReason }}</small> }
              </td>
              <td class="text-end">
                @if (p.status === 'posted') {
                  <button cButton color="danger" variant="ghost" size="sm" (click)="voiding.set(p)">Anular</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</c-card>
@if (voiding(); as p) {
  <app-payroll-void-reason-modal [title]="'Anular el pago ' + p.number" [busy]="busy()"
    text="Se crea la reversa del asiento del pago y los roles vuelven a quedar por pagar."
    (confirmed)="confirmVoid(p, $event)" (cancelled)="voiding.set(null)" />
}`,
})
export class RunPaymentsCardComponent implements OnInit, OnDestroy {
  @Input({ required: true }) runId = '';

  private svc = inject(PayrollPaymentsService);
  private notifications = inject(NotificationService);
  private sub: Subscription | null = null;

  readonly payments = signal<PayrollPayment[]>([]);
  readonly error = signal('');
  readonly voiding = signal<PayrollPayment | null>(null);
  readonly busy = signal(false);
  readonly STATUS = DOC_STATUS;
  readonly money = money;
  readonly day = dayLabel;
  readonly rows = computed(() => [...this.payments()].sort((a, b) => b.number.localeCompare(a.number)));

  ngOnInit(): void {
    this.sub = this.svc.payments(this.runId).subscribe({
      next: (p) => { this.payments.set(p); this.error.set(''); },
      error: (err) => this.error.set(payrollErrorMessage(err)),
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  async confirmVoid(p: PayrollPayment, reason: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.svc.voidPayment(p.id, reason);
      this.notifications.success(`Pago ${p.number} anulado`);
      this.voiding.set(null);
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
