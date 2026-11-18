import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../core/services/notification.service';
import { PayrollRun, Payslip, money, runTitle } from '../models/payroll.models';
import { MoneySourceForm, ecuadorToday, moneySourcePayload, newMoneySource } from '../models/payroll-payments.models';
import { PayrollPaymentsService } from '../services/payroll-payments.service';
import { payrollErrorMessage } from '../services/payroll.service';
import { MoneySourceFieldsComponent } from './money-source-fields.component';

const MAX_PER_PAYMENT = 200;

/**
 * «Pagar roles» (NOMINA_PAGOS.md §3, payPayrollRun): se eligen los roles con
 * saldo y se paga lo que le falta a cada uno, completo. Un asiento por pago.
 */
@Component({
  selector: 'app-payroll-pay-run-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule,
    MoneySourceFieldsComponent],
  template: `
<c-modal [visible]="true" (visibleChange)="!$event && closed.emit()" backdrop="static" size="lg">
  <c-modal-header>
    <h5 cModalTitle>Pagar roles de {{ title(run) }}</h5>
    <button type="button" class="btn-close" (click)="closed.emit()"></button>
  </c-modal-header>
  <c-modal-body>
    @if (pending().length === 0) {
      <c-alert color="success" class="py-2 mb-0">Todos los roles de esta nómina están pagados.</c-alert>
    } @else {
      <div class="table-responsive border rounded mb-3" style="max-height: 280px">
        <table class="table table-sm mb-0 align-middle">
          <thead class="sticky-top bg-body">
            <tr>
              <th style="width: 2rem">
                <input class="form-check-input" type="checkbox" [checked]="allSelected()" (change)="toggleAll()" aria-label="Elegir todos" />
              </th>
              <th>Empleado</th><th class="text-end">Neto</th><th class="text-end">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            @for (p of pending(); track p.id) {
              <tr role="button" (click)="toggle(p.id)">
                <td><input class="form-check-input" type="checkbox" [checked]="selected().has(p.id)" (click)="$event.stopPropagation(); toggle(p.id)" /></td>
                <td>{{ p.employee.name }}</td>
                <td class="text-end font-monospace">{{ money(p.netCents) }}</td>
                <td class="text-end font-monospace fw-semibold">{{ money(pendingOf(p)) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <c-row class="g-2 mb-2">
        <c-col md="4">
          <label cLabel>Fecha del pago *</label>
          <input cFormControl type="date" [(ngModel)]="date" [min]="run.period + '-01'" />
        </c-col>
        <c-col md="8">
          <label cLabel>Referencia</label>
          <input cFormControl [(ngModel)]="reference" maxlength="120" placeholder="Ej.: transferencia 12345" />
        </c-col>
      </c-row>
      <app-payroll-money-source-fields [source]="source" name="pay-run" />
      <div class="mt-2">
        <label cLabel>Notas</label>
        <textarea cFormControl rows="2" [(ngModel)]="notes" maxlength="500"></textarea>
      </div>
      <small class="text-secondary d-block mt-2">
        A cada rol elegido se le paga lo que le falta, completo. El asiento descarga «Sueldos por pagar» contra la cuenta elegida.
      </small>
    }
  </c-modal-body>
  <c-modal-footer>
    <span class="me-auto fw-semibold">{{ selected().size }} rol(es) · Total {{ money(total()) }}</span>
    <button cButton color="secondary" variant="outline" (click)="closed.emit()">Cancelar</button>
    <button cButton color="success" (click)="pay()" [disabled]="saving() || selected().size === 0">
      @if (saving()) { <c-spinner size="sm" class="me-1"></c-spinner> } Pagar
    </button>
  </c-modal-footer>
</c-modal>`,
})
export class PayRunModalComponent implements OnInit {
  @Input({ required: true }) run!: PayrollRun;
  @Input({ required: true }) payslips: Payslip[] = [];
  @Output() closed = new EventEmitter<void>();

  private svc = inject(PayrollPaymentsService);
  private notifications = inject(NotificationService);

  readonly money = money;
  readonly title = runTitle;
  readonly saving = signal(false);
  readonly selected = signal<Set<string>>(new Set());
  private readonly slips = signal<Payslip[]>([]);
  readonly pending = computed(() => this.slips()
    .filter((p) => p.status === 'approved' && this.pendingOf(p) > 0)
    .sort((a, b) => a.employee.name.localeCompare(b.employee.name)));
  readonly allSelected = computed(() => this.pending().length > 0 && this.selected().size === this.pending().length);
  readonly total = computed(() => this.pending().filter((p) => this.selected().has(p.id)).reduce((s, p) => s + this.pendingOf(p), 0));

  date = ecuadorToday();
  reference = '';
  notes = '';
  source: MoneySourceForm = newMoneySource();

  pendingOf(p: Payslip): number { return Math.max(0, p.netCents - p.paidCents); }

  ngOnInit(): void {
    this.slips.set(this.payslips);
    // La fecha no puede ser anterior al mes de la nómina (paymentProblem).
    if (this.date.slice(0, 7) < this.run.period) this.date = `${this.run.period}-01`;
    this.selected.set(new Set(this.pending().map((p) => p.id)));
  }

  toggle(id: string): void {
    const s = new Set(this.selected());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.selected.set(s);
  }

  toggleAll(): void {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.pending().map((p) => p.id)));
  }

  async pay(): Promise<void> {
    const ids = this.pending().filter((p) => this.selected().has(p.id)).map((p) => p.id);
    if (ids.length === 0) { this.notifications.warning('Elige al menos un empleado a pagar.'); return; }
    if (ids.length > MAX_PER_PAYMENT) { this.notifications.warning(`Hasta ${MAX_PER_PAYMENT} roles por pago.`); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date)) { this.notifications.warning('Elige la fecha del pago.'); return; }
    const src = moneySourcePayload(this.source);
    if (!src.ok) { this.notifications.warning(src.error); return; }
    this.saving.set(true);
    try {
      const r = await this.svc.payRun({
        runId: this.run.id, payslipIds: ids, date: this.date, source: src.value,
        ...(this.reference.trim() ? { reference: this.reference.trim() } : {}),
        ...(this.notes.trim() ? { notes: this.notes.trim() } : {}),
      });
      this.notifications.success(`Pago ${r.number} registrado · ${money(r.totalCents)}`);
      this.closed.emit();
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
