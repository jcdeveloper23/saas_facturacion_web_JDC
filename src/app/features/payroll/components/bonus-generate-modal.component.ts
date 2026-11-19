import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../core/services/notification.service';
import { periodLabel } from '../models/payroll.models';
import { ecuadorToday } from '../models/payroll-payments.models';
import { BonusKind, BonusRegion, bonusLastMonth, bonusPeriodHint } from '../models/payroll-bonus.models';
import { PayrollBonusService } from '../services/payroll-bonus.service';
import { PayrollPaymentsService } from '../services/payroll-payments.service';
import { payrollErrorMessage } from '../services/payroll.service';

/** «Generar décimo» (createPayrollBonusRun): abre el lote en borrador. */
@Component({
  selector: 'app-payroll-bonus-generate-modal',
  standalone: true,
  imports: [FormsModule, AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule],
  template: `
<c-modal [visible]="true" (visibleChange)="!$event && closed.emit(null)" backdrop="static">
  <c-modal-header>
    <h5 cModalTitle>Generar décimo</h5>
    <button type="button" class="btn-close" (click)="closed.emit(null)"></button>
  </c-modal-header>
  <c-modal-body>
    <c-row class="g-2">
      <c-col [md]="kind === 'fourteenth' ? 4 : 6">
        <label cLabel>Décimo *</label>
        <select cSelect [(ngModel)]="kind">
          <option value="thirteenth">13.º (décimo tercero)</option>
          <option value="fourteenth">14.º (décimo cuarto)</option>
        </select>
      </c-col>
      <c-col [md]="kind === 'fourteenth' ? 4 : 6">
        <label cLabel>Año *</label>
        <select cSelect [(ngModel)]="year">
          @for (y of years; track y) { <option [ngValue]="y">{{ y }}</option> }
        </select>
      </c-col>
      @if (kind === 'fourteenth') {
        <c-col md="4">
          <label cLabel>Región *</label>
          <select cSelect [(ngModel)]="region">
            <option value="sierra">Sierra y Amazonía</option>
            <option value="costa">Costa e Insular</option>
          </select>
          <small class="text-secondary">La de la empresa está en Parámetros.</small>
        </c-col>
      }
    </c-row>
    <c-alert color="info" class="py-2 small mt-3 mb-2">{{ hint() }}</c-alert>
    @if (tooEarly()) {
      <c-alert color="warning" class="py-2 small mb-2">
        Se puede generar desde {{ label(lastMonth()) }}, el último mes del periodo.
      </c-alert>
    }
    <small class="text-secondary d-block">
      Solo aparecen los empleados que <strong>acumulan</strong> este décimo; quien lo cobra mensualizado ya lo recibió
      en cada rol. El lote queda en borrador para revisarlo antes de pagarlo.
    </small>
  </c-modal-body>
  <c-modal-footer>
    <button cButton color="secondary" variant="outline" (click)="closed.emit(null)">Cancelar</button>
    <button cButton color="primary" (click)="create()" [disabled]="saving() || tooEarly()">
      @if (saving()) { <c-spinner size="sm" class="me-1"></c-spinner> } Generar
    </button>
  </c-modal-footer>
</c-modal>`,
})
export class BonusGenerateModalComponent implements OnInit {
  @Input() defaultYear = Number(ecuadorToday().slice(0, 4));
  /** El id del lote creado, o null si se cerró sin crear. */
  @Output() closed = new EventEmitter<string | null>();

  private svc = inject(PayrollBonusService);
  private notifications = inject(NotificationService);
  private accounts = inject(PayrollPaymentsService);
  readonly saving = signal(false);
  readonly label = periodLabel;
  private readonly thisMonth = ecuadorToday().slice(0, 7);
  readonly years = Array.from({ length: 4 }, (_, i) => Number(this.thisMonth.slice(0, 4)) - i);

  kind: BonusKind = 'thirteenth';
  year = this.years[0];
  region: BonusRegion = 'sierra';

  ngOnInit(): void {
    if (this.years.includes(this.defaultYear)) this.year = this.defaultYear;
    // La región de la empresa (Parámetros); si no se puede leer, queda Sierra (la de por defecto del servidor).
    this.accounts.getAccounts().then((v) => { if (v.region === 'costa') this.region = 'costa'; }).catch(() => {});
  }

  hint(): string { return bonusPeriodHint(this.kind, this.year, this.region); }
  lastMonth(): string { return bonusLastMonth(this.kind, this.year, this.region); }
  tooEarly(): boolean { return this.thisMonth < this.lastMonth(); }

  async create(): Promise<void> {
    this.saving.set(true);
    try {
      const r = await this.svc.createBonusRun(this.kind, this.year, this.kind === 'fourteenth' ? this.region : null);
      this.notifications.success(`Lote generado en borrador · ${r.totals.employees} empleado(s)`);
      this.closed.emit(r.bonusRunId);
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
