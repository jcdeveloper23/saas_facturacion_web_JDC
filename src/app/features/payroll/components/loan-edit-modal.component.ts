import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule, FormModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../core/services/notification.service';
import { money, parseMoneyCents } from '../models/payroll.models';
import { PayrollLoan, isIessLoan } from '../models/payroll-loans.models';
import { PayrollLoansService } from '../services/payroll-loans.service';
import { payrollErrorMessage } from '../services/payroll.service';

/**
 * «Cambiar cuota» y, en los del IESS, «Cambiar saldo» (updatePayrollLoan). El
 * saldo de un préstamo de la empresa solo baja con los descuentos del rol.
 */
@Component({
  selector: 'app-payroll-loan-edit-modal',
  standalone: true,
  imports: [FormsModule, ButtonModule, FormModule, ModalModule, SpinnerModule],
  template: `
<c-modal [visible]="true" (visibleChange)="!$event && closed.emit()" backdrop="static">
  <c-modal-header>
    <h5 cModalTitle>{{ mode === 'balance' ? 'Cambiar saldo' : 'Cambiar cuota' }} · {{ loan.number }}</h5>
    <button type="button" class="btn-close" (click)="closed.emit()"></button>
  </c-modal-header>
  <c-modal-body class="small">
    <p class="mb-2">{{ loan.employeeName }} · saldo {{ money(loan.balanceCents) }} · cuota {{ money(loan.installmentCents) }}</p>
    @if (mode === 'balance') {
      <label cLabel>Saldo nuevo (USD) *</label>
      <input cFormControl [(ngModel)]="value" />
      <small class="text-secondary">El que informa el IESS. La cuota no puede ser mayor que el saldo.</small>
    } @else {
      <label cLabel>Cuota mensual nueva (USD) *</label>
      <input cFormControl [(ngModel)]="value" />
      <small class="text-secondary">Rige desde la próxima nómina que se calcule. No puede ser mayor que el saldo.</small>
    }
  </c-modal-body>
  <c-modal-footer>
    <button cButton color="secondary" variant="outline" (click)="closed.emit()">Cancelar</button>
    <button cButton color="primary" (click)="save()" [disabled]="saving()">
      @if (saving()) { <c-spinner size="sm" class="me-1"></c-spinner> } Guardar
    </button>
  </c-modal-footer>
</c-modal>`,
})
export class LoanEditModalComponent implements OnInit {
  @Input({ required: true }) loan!: PayrollLoan;
  @Input() mode: 'installment' | 'balance' = 'installment';
  @Output() closed = new EventEmitter<void>();

  private svc = inject(PayrollLoansService);
  private notifications = inject(NotificationService);
  readonly money = money;
  readonly saving = signal(false);
  value = '';

  ngOnInit(): void {
    if (this.mode === 'balance' && !isIessLoan(this.loan.type)) this.mode = 'installment';
    const cents = this.mode === 'balance' ? this.loan.balanceCents : this.loan.installmentCents;
    this.value = (cents / 100).toFixed(2);
  }

  async save(): Promise<void> {
    const cents = parseMoneyCents(this.value);
    if (!cents) { this.notifications.warning('Escribe un valor mayor que cero.'); return; }
    const installment = this.mode === 'installment' ? cents : this.loan.installmentCents;
    const balance = this.mode === 'balance' ? cents : this.loan.balanceCents;
    if (installment > balance) { this.notifications.warning('La cuota no puede ser mayor que el saldo.'); return; }
    this.saving.set(true);
    try {
      await this.svc.updateLoan(this.loan.id, this.mode === 'balance' ? { balanceCents: cents } : { installmentCents: cents });
      this.notifications.success(this.mode === 'balance' ? 'Saldo actualizado' : 'Cuota actualizada');
      this.closed.emit();
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
