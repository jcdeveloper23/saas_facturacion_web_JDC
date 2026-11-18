import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../core/services/notification.service';
import { MAX_VACATION_DAYS, VacationBalance, calendarDays } from '../models/payroll-bonus.models';
import { PayrollBonusService } from '../services/payroll-bonus.service';
import { payrollErrorMessage } from '../services/payroll.service';

/**
 * «Registrar vacaciones» (registerPayrollVacation): días corridos, sin asiento.
 * El servidor mide el saldo a la fecha de salida; sin saldo, solo como adelanto.
 */
@Component({
  selector: 'app-payroll-vacation-modal',
  standalone: true,
  imports: [FormsModule, AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule],
  template: `
<c-modal [visible]="true" (visibleChange)="!$event && closed.emit()" backdrop="static">
  <c-modal-header>
    <h5 cModalTitle>Registrar vacaciones · {{ employeeName }}</h5>
    <button type="button" class="btn-close" (click)="closed.emit()"></button>
  </c-modal-header>
  <c-modal-body>
    <c-row class="g-2">
      <c-col md="6"><label cLabel>Desde *</label><input cFormControl type="date" [(ngModel)]="from" (ngModelChange)="onDates()" /></c-col>
      <c-col md="6"><label cLabel>Hasta *</label><input cFormControl type="date" [(ngModel)]="to" [min]="from" (ngModelChange)="onDates()" /></c-col>
    </c-row>
    <p class="small mt-2 mb-2">
      <strong>{{ days() }}</strong> día(s) corridos (incluyen fines de semana y feriados).
      @if (balance(); as b) { Disponibles al {{ from }}: <strong>{{ b.availableDays }}</strong>. }
      @if (checking()) { <c-spinner size="sm" class="ms-1"></c-spinner> }
    </p>
    @if (days() > max) {
      <c-alert color="warning" class="py-2 small">Un registro tiene hasta {{ max }} días.</c-alert>
    }
    @if (needsAdvance()) {
      <c-alert color="warning" class="py-2 small mb-2">
        Pide más días de los disponibles. Solo se registra si es un adelanto acordado con el empleado.
      </c-alert>
      <div class="form-check mb-2">
        <input class="form-check-input" type="checkbox" id="vac-advance" [(ngModel)]="allowAdvance" />
        <label class="form-check-label" for="vac-advance">Es un adelanto acordado</label>
      </div>
    }
    <label cLabel>Notas</label>
    <textarea cFormControl rows="2" [(ngModel)]="notes" maxlength="500"></textarea>
    <small class="text-secondary d-block mt-2">
      No crea asiento: el sueldo de esos días se paga en la nómina del mes como siempre. Un permiso sin sueldo se
      registra como la novedad «Permiso sin sueldo» del mes.
    </small>
  </c-modal-body>
  <c-modal-footer>
    <button cButton color="secondary" variant="outline" (click)="closed.emit()">Cancelar</button>
    <button cButton color="primary" (click)="save()" [disabled]="saving() || days() === 0 || days() > max || (needsAdvance() && !allowAdvance)">
      @if (saving()) { <c-spinner size="sm" class="me-1"></c-spinner> } Registrar
    </button>
  </c-modal-footer>
</c-modal>`,
})
export class VacationModalComponent {
  @Input({ required: true }) employeeId = '';
  @Input() employeeName = '';
  @Output() closed = new EventEmitter<void>();

  private svc = inject(PayrollBonusService);
  private notifications = inject(NotificationService);
  readonly saving = signal(false);
  readonly checking = signal(false);
  readonly days = signal(0);
  /** El saldo a la fecha de salida (como lo mide el servidor). */
  readonly balance = signal<VacationBalance | null>(null);
  readonly max = MAX_VACATION_DAYS;
  private asked = '';

  from = '';
  to = '';
  allowAdvance = false;
  notes = '';

  needsAdvance(): boolean { const b = this.balance(); return !!b && this.days() > b.availableDays; }

  async onDates(): Promise<void> {
    this.days.set(calendarDays(this.from, this.to));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.from) || this.from === this.asked) return;
    this.asked = this.from;
    this.checking.set(true);
    try {
      const b = await this.svc.vacationBalance(this.employeeId, this.from);
      if (this.asked === this.from) this.balance.set(b);
    } catch {
      this.balance.set(null);
    } finally {
      this.checking.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.days() === 0) { this.notifications.warning('Elige las fechas; el regreso no puede ser antes de la salida.'); return; }
    this.saving.set(true);
    try {
      const r = await this.svc.registerVacation({
        employeeId: this.employeeId, from: this.from, to: this.to,
        ...(this.allowAdvance && this.needsAdvance() ? { allowAdvance: true } : {}),
        ...(this.notes.trim() ? { notes: this.notes.trim() } : {}),
      });
      this.notifications.success(`Vacaciones registradas · ${r.days} día(s). Quedan ${r.balance.availableDays} disponibles.`);
      this.closed.emit();
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
