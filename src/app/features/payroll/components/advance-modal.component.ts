import { Component, EventEmitter, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../core/services/notification.service';
import { PayrollEmployee, money, parseMoneyCents, periodLabel } from '../models/payroll.models';
import { MoneySourceForm, ecuadorToday, moneySourcePayload, newMoneySource, nextPeriod } from '../models/payroll-payments.models';
import { PayrollPaymentsService } from '../services/payroll-payments.service';
import { PayrollService, payrollErrorMessage } from '../services/payroll.service';
import { MoneySourceFieldsComponent } from './money-source-fields.component';

/**
 * «Nuevo anticipo» (NOMINA_PAGOS.md §3, registerPayrollAdvance): sale el
 * dinero (Debe Anticipos / Haber banco o cuenta) y el servidor crea la novedad
 * del mes del descuento, ligada. El tope del art. 90 lo mide el servidor.
 */
@Component({
  selector: 'app-payroll-advance-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule,
    MoneySourceFieldsComponent],
  template: `
<c-modal [visible]="true" (visibleChange)="!$event && closed.emit()" backdrop="static" size="lg">
  <c-modal-header>
    <h5 cModalTitle>Nuevo anticipo a empleado</h5>
    <button type="button" class="btn-close" (click)="closed.emit()"></button>
  </c-modal-header>
  <c-modal-body>
    @if (loadError()) { <c-alert color="warning" class="py-2 small">{{ loadError() }}</c-alert> }
    <c-row class="g-2 mb-2">
      <c-col md="6">
        <label cLabel>Empleado *</label>
        <select cSelect [(ngModel)]="employeeId">
          <option value="">Elegir</option>
          @for (e of employees(); track e.id) { <option [value]="e.id">{{ e.name }} · sueldo {{ money(e.salaryCents) }}</option> }
        </select>
      </c-col>
      <c-col md="3">
        <label cLabel>Valor (USD) *</label>
        <input cFormControl [(ngModel)]="amount" placeholder="Ej.: 50,00" />
      </c-col>
      <c-col md="3">
        <label cLabel>Fecha *</label>
        <input cFormControl type="date" [(ngModel)]="date" (ngModelChange)="onDateChange()" />
      </c-col>
      <c-col md="6">
        <label cLabel>Se descuenta en *</label>
        <select cSelect [(ngModel)]="period">
          @for (p of periods(); track p) { <option [value]="p">{{ label(p) }}</option> }
        </select>
      </c-col>
      <c-col md="6">
        <label cLabel>Referencia</label>
        <input cFormControl [(ngModel)]="reference" maxlength="120" />
      </c-col>
    </c-row>
    <app-payroll-money-source-fields [source]="source" name="advance" />
    <div class="mt-2">
      <label cLabel>Notas</label>
      <textarea cFormControl rows="2" [(ngModel)]="notes" maxlength="500"></textarea>
    </div>
    <small class="text-secondary d-block mt-2">
      El anticipo se descuenta solo en la nómina del mes elegido. Los anticipos del mes no pueden pasar del 10 % del
      sueldo del empleado (art. 90 del Código del Trabajo); el servidor lo revisa al registrarlo.
    </small>
  </c-modal-body>
  <c-modal-footer>
    <button cButton color="secondary" variant="outline" (click)="closed.emit()">Cancelar</button>
    <button cButton color="primary" (click)="save()" [disabled]="saving()">
      @if (saving()) { <c-spinner size="sm" class="me-1"></c-spinner> } Registrar anticipo
    </button>
  </c-modal-footer>
</c-modal>`,
})
export class AdvanceModalComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

  private payroll = inject(PayrollService);
  private svc = inject(PayrollPaymentsService);
  private notifications = inject(NotificationService);
  private sub: Subscription | null = null;

  readonly employees = signal<PayrollEmployee[]>([]);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly periods = signal<string[]>([]);
  readonly money = money;
  readonly label = periodLabel;

  employeeId = '';
  amount = '';
  date = ecuadorToday();
  period = '';
  reference = '';
  notes = '';
  source: MoneySourceForm = newMoneySource();

  ngOnInit(): void {
    this.onDateChange();
    this.sub = this.payroll.employees().subscribe({
      next: (e) => this.employees.set(e.filter((x) => x.isActive).sort((a, b) => a.name.localeCompare(b.name))),
      error: (err) => this.loadError.set(payrollErrorMessage(err)),
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  /** El descuento va en el mes de la fecha o en el siguiente (validateAdvanceInput). */
  onDateChange(): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date)) { this.periods.set([]); return; }
    const own = this.date.slice(0, 7);
    const options = [own, nextPeriod(own)];
    this.periods.set(options);
    if (!options.includes(this.period)) this.period = own;
  }

  async save(): Promise<void> {
    if (!this.employeeId) { this.notifications.warning('Elige el empleado.'); return; }
    const amountCents = parseMoneyCents(this.amount);
    if (!amountCents) { this.notifications.warning('Escribe un valor mayor que cero.'); return; }
    if (!this.periods().includes(this.period)) { this.notifications.warning('Elige la fecha del anticipo.'); return; }
    const src = moneySourcePayload(this.source);
    if (!src.ok) { this.notifications.warning(src.error); return; }
    this.saving.set(true);
    try {
      const r = await this.svc.registerAdvance({
        employeeId: this.employeeId, amountCents, date: this.date, period: this.period, source: src.value,
        ...(this.reference.trim() ? { reference: this.reference.trim() } : {}),
        ...(this.notes.trim() ? { notes: this.notes.trim() } : {}),
      });
      this.notifications.success(`Anticipo ${r.number} registrado. Se descuenta en ${periodLabel(this.period)}.`);
      this.closed.emit();
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
