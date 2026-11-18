import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../core/services/notification.service';
import { Account } from '../../accounting/models/account.interface';
import { PayrollEmployee, money, parseMoneyCents } from '../models/payroll.models';
import { MoneySourceForm, ecuadorToday, moneySourcePayload, newMoneySource } from '../models/payroll-payments.models';
import { LOAN_TYPES, LoanType, isDisbursedLoan, isIessLoan } from '../models/payroll-loans.models';
import { PayrollLoansService } from '../services/payroll-loans.service';
import { payrollErrorMessage } from '../services/payroll.service';
import { MoneySourceFieldsComponent } from './money-source-fields.component';

/**
 * «Nuevo préstamo» (createPayrollLoan): se descuenta solo en cada rol desde el
 * primer mes hasta quedar en cero. La entrega del dinero (asiento) solo en los
 * que presta la empresa y sin saldo previo.
 */
@Component({
  selector: 'app-payroll-loan-modal',
  standalone: true,
  imports: [FormsModule, AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule, MoneySourceFieldsComponent],
  template: `
<c-modal [visible]="true" (visibleChange)="!$event && closed.emit()" backdrop="static" size="lg" scrollable>
  <c-modal-header>
    <h5 cModalTitle>Nuevo préstamo</h5>
    <button type="button" class="btn-close" (click)="closed.emit()"></button>
  </c-modal-header>
  <c-modal-body>
    <c-row class="g-2 mb-2">
      <c-col md="6">
        <label cLabel>Empleado *</label>
        <select cSelect [(ngModel)]="employeeId">
          <option value="">Elegir</option>
          @for (e of employees; track e.id) { <option [value]="e.id">{{ e.name }} · sueldo {{ money(e.salaryCents) }}</option> }
        </select>
      </c-col>
      <c-col md="6">
        <label cLabel>Tipo *</label>
        <select cSelect [(ngModel)]="type" (ngModelChange)="onType()">
          @for (t of types; track t.code) { <option [value]="t.code">{{ t.label }}</option> }
        </select>
      </c-col>
      <c-col md="4"><label cLabel>Monto (USD) *</label><input cFormControl [(ngModel)]="amount" placeholder="Ej.: 600,00" /></c-col>
      <c-col md="4">
        <label cLabel>Saldo (USD)</label>
        <input cFormControl [(ngModel)]="balance" placeholder="Igual al monto" (ngModelChange)="onBalance()" />
        <small class="text-secondary">Solo si ya venía descontándose.</small>
      </c-col>
      <c-col md="4"><label cLabel>Cuota mensual (USD) *</label><input cFormControl [(ngModel)]="installment" placeholder="Ej.: 50,00" /></c-col>
      <c-col md="4"><label cLabel>Primer mes del descuento *</label><input cFormControl type="month" [(ngModel)]="startPeriod" /></c-col>
      <c-col md="8">
        <label cLabel>Cuenta propia del préstamo</label>
        <input cFormControl class="font-monospace" [(ngModel)]="accountCode" list="loan-accounts" placeholder="Vacío = la de Nómina › Cuentas" />
        <datalist id="loan-accounts">@for (a of accounts; track a.id) { <option [value]="a.code">{{ a.name }}</option> }</datalist>
      </c-col>
      <c-col md="12"><label cLabel>Notas</label><input cFormControl [(ngModel)]="notes" maxlength="500" /></c-col>
    </c-row>

    @if (iess()) {
      <c-alert color="info" class="py-2 small">
        Un préstamo del IESS no tiene entrega: el dinero lo paga el IESS y la empresa solo retiene la cuota en el rol y
        se la paga al IESS. El saldo lo informa el IESS y se puede corregir después.
      </c-alert>
    } @else {
      @if (type === 'longTermAdvance') {
        <c-alert color="info" class="py-2 small">Las cuotas de un anticipo a largo plazo cuentan en el tope del 10 % del sueldo (art. 90).</c-alert>
      }
      <div class="form-check mb-2">
        <input class="form-check-input" type="checkbox" id="loan-disburse" [(ngModel)]="disburse" [disabled]="hasPriorBalance()" />
        <label class="form-check-label" for="loan-disburse">Registrar la entrega del dinero</label>
      </div>
      @if (hasPriorBalance()) {
        <small class="text-secondary d-block mb-2">Un préstamo que ya venía descontándose no lleva asiento de entrega.</small>
      } @else if (disburse) {
        <c-row class="g-2 mb-2">
          <c-col md="4"><label cLabel>Fecha de la entrega *</label><input cFormControl type="date" [(ngModel)]="date" [max]="today" /></c-col>
          <c-col md="8"><label cLabel>Referencia</label><input cFormControl [(ngModel)]="reference" maxlength="120" /></c-col>
        </c-row>
        <app-payroll-money-source-fields [source]="source" name="loan" />
      } @else {
        <small class="text-secondary d-block">Sin entrega: el dinero salió antes o fuera del sistema.</small>
      }
    }
  </c-modal-body>
  <c-modal-footer>
    <button cButton color="secondary" variant="outline" (click)="closed.emit()">Cancelar</button>
    <button cButton color="primary" (click)="save()" [disabled]="saving()">
      @if (saving()) { <c-spinner size="sm" class="me-1"></c-spinner> } Crear préstamo
    </button>
  </c-modal-footer>
</c-modal>`,
})
export class LoanModalComponent implements OnInit {
  @Input() employees: PayrollEmployee[] = [];
  @Input() accounts: Account[] = [];
  @Output() closed = new EventEmitter<void>();

  private svc = inject(PayrollLoansService);
  private notifications = inject(NotificationService);

  readonly types = LOAN_TYPES;
  readonly money = money;
  readonly saving = signal(false);
  readonly today = ecuadorToday();

  employeeId = '';
  type: LoanType = 'companyLoan';
  amount = '';
  balance = '';
  installment = '';
  startPeriod = '';
  accountCode = '';
  notes = '';
  disburse = false;
  date = this.today;
  reference = '';
  source: MoneySourceForm = newMoneySource();

  iess(): boolean { return isIessLoan(this.type); }
  hasPriorBalance(): boolean { return this.balance.trim() !== ''; }

  ngOnInit(): void { this.startPeriod = this.today.slice(0, 7); }
  onType(): void { if (!isDisbursedLoan(this.type)) this.disburse = false; }
  onBalance(): void { if (this.hasPriorBalance()) this.disburse = false; }

  async save(): Promise<void> {
    const warn = (m: string) => { this.notifications.warning(m); };
    if (!this.employeeId) return warn('Elige el empleado.');
    const amountCents = parseMoneyCents(this.amount);
    if (!amountCents) return warn('Escribe el monto del préstamo.');
    const balanceCents = this.hasPriorBalance() ? parseMoneyCents(this.balance) : null;
    if (this.hasPriorBalance() && !balanceCents) return warn('El saldo tiene que ser mayor que cero.');
    if (balanceCents && balanceCents > amountCents) return warn('El saldo no puede ser mayor que el monto.');
    const installmentCents = parseMoneyCents(this.installment);
    if (!installmentCents) return warn('Escribe la cuota mensual.');
    if (installmentCents > (balanceCents ?? amountCents)) return warn('La cuota no puede ser mayor que el saldo.');
    if (!/^\d{4}-\d{2}$/.test(this.startPeriod)) return warn('Elige el primer mes del descuento.');

    let disbursement: Record<string, unknown> | undefined;
    if (this.disburse && isDisbursedLoan(this.type) && !this.hasPriorBalance()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date)) return warn('Elige la fecha de la entrega.');
      if (this.date > this.today) return warn('La fecha de la entrega no puede ser futura.');
      if (this.startPeriod < this.date.slice(0, 7)) return warn('El primer descuento no puede ser antes del mes de la entrega.');
      const src = moneySourcePayload(this.source);
      if (!src.ok) return warn(src.error);
      disbursement = { date: this.date, ...src.value, ...(this.reference.trim() ? { reference: this.reference.trim() } : {}) };
    }

    this.saving.set(true);
    try {
      const r = await this.svc.createLoan({
        employeeId: this.employeeId, type: this.type, amountCents, installmentCents, startPeriod: this.startPeriod,
        ...(balanceCents ? { balanceCents } : {}),
        ...(this.accountCode.trim() ? { accountCode: this.accountCode.trim() } : {}),
        ...(this.notes.trim() ? { notes: this.notes.trim() } : {}),
        ...(disbursement ? { disbursement: disbursement as { date: string } } : {}),
      });
      this.notifications.success(`Préstamo ${r.number} creado${r.entryId ? ' con su asiento de entrega' : ''}`);
      this.closed.emit();
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
