import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../core/services/notification.service';
import { money } from '../models/payroll.models';
import { MoneySourceForm, ecuadorToday, moneySourcePayload, newMoneySource } from '../models/payroll-payments.models';
import { PayrollBonusRun } from '../models/payroll-bonus.models';
import { PayrollBonusService } from '../services/payroll-bonus.service';
import { payrollErrorMessage } from '../services/payroll.service';
import { MoneySourceFieldsComponent } from './money-source-fields.component';

/**
 * «Pagar» un lote de décimos (payPayrollBonusRun). El servidor recalcula con
 * la fecha del pago y paga a todos los que tienen saldo; el asiento descarga
 * la provisión y lleva el ajuste al gasto.
 */
@Component({
  selector: 'app-payroll-bonus-pay-modal',
  standalone: true,
  imports: [FormsModule, AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule, MoneySourceFieldsComponent],
  template: `
<c-modal [visible]="true" (visibleChange)="!$event && closed.emit()" backdrop="static" size="lg">
  <c-modal-header>
    <h5 cModalTitle>Pagar {{ run.label }}</h5>
    <button type="button" class="btn-close" (click)="closed.emit()"></button>
  </c-modal-header>
  <c-modal-body>
    <c-alert color="info" class="py-2 small">
      Al pagar se vuelve a calcular con la fecha del pago (en el 14.º, el salario básico de ese día) y se paga a todos
      los empleados con saldo. El asiento descarga la provisión del décimo y lleva la diferencia (el ajuste) al gasto.
      Mientras esté pagado, no se pueden reversar las nóminas de los meses que cubre.
    </c-alert>
    <c-row class="g-2 mb-2">
      <c-col md="4">
        <label cLabel>Fecha del pago *</label>
        <input cFormControl type="date" [(ngModel)]="date" [max]="today" />
      </c-col>
      <c-col md="8">
        <label cLabel>Referencia</label>
        <input cFormControl [(ngModel)]="reference" maxlength="120" />
      </c-col>
    </c-row>
    <app-payroll-money-source-fields [source]="source" name="bonus-pay" />
    <div class="mt-2">
      <label cLabel>Notas</label>
      <textarea cFormControl rows="2" [(ngModel)]="notes" maxlength="500"></textarea>
    </div>
  </c-modal-body>
  <c-modal-footer>
    <span class="me-auto fw-semibold">Saldo calculado: {{ money(run.totals.balanceCents) }}</span>
    <button cButton color="secondary" variant="outline" (click)="closed.emit()">Cancelar</button>
    <button cButton color="success" (click)="pay()" [disabled]="saving()">
      @if (saving()) { <c-spinner size="sm" class="me-1"></c-spinner> } Pagar
    </button>
  </c-modal-footer>
</c-modal>`,
})
export class BonusPayModalComponent {
  @Input({ required: true }) run!: PayrollBonusRun;
  @Output() closed = new EventEmitter<void>();

  private svc = inject(PayrollBonusService);
  private notifications = inject(NotificationService);
  readonly money = money;
  readonly saving = signal(false);
  readonly today = ecuadorToday();
  date = this.today;
  reference = '';
  notes = '';
  source: MoneySourceForm = newMoneySource();

  async pay(): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date)) { this.notifications.warning('Elige la fecha del pago.'); return; }
    if (this.date > this.today) { this.notifications.warning('La fecha del pago no puede ser futura.'); return; }
    const src = moneySourcePayload(this.source);
    if (!src.ok) { this.notifications.warning(src.error); return; }
    this.saving.set(true);
    try {
      const r = await this.svc.payBonusRun({
        bonusRunId: this.run.id, date: this.date, source: src.value,
        ...(this.reference.trim() ? { reference: this.reference.trim() } : {}),
        ...(this.notes.trim() ? { notes: this.notes.trim() } : {}),
      });
      this.notifications.success(`${this.run.label} pagado · ${money(r.totalCents)}`);
      this.closed.emit();
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
