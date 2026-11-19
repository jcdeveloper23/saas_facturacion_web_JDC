import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertModule, ButtonModule, CardModule, FormModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../core/services/notification.service';
import { PayrollPaymentsService } from '../services/payroll-payments.service';
import { payrollErrorMessage } from '../services/payroll.service';

type Region = 'sierra' | 'costa';

/**
 * «Región para el décimo cuarto»: una sola por empresa (NOMINA_COLABORADOR.md
 * §6). Se lee de getPayrollAccounts y se guarda con savePayrollRegion.
 */
@Component({
  selector: 'app-payroll-region-card',
  standalone: true,
  imports: [FormsModule, AlertModule, ButtonModule, CardModule, FormModule, SpinnerModule],
  template: `
<c-card class="mb-3">
  <c-card-header>Región para el décimo cuarto</c-card-header>
  <c-card-body class="small">
    @if (error()) { <c-alert color="warning" class="py-2">{{ error() }}</c-alert> }
    <div class="d-flex flex-wrap align-items-center gap-2">
      <select cSelect style="max-width: 460px" [(ngModel)]="region" [disabled]="loading() || saving()">
        <option value="sierra">Sierra y Amazonía (agosto–julio, pago hasta el 15 de agosto)</option>
        <option value="costa">Costa e Insular (marzo–febrero, pago hasta el 15 de marzo)</option>
      </select>
      <button cButton color="primary" size="sm" (click)="save()" [disabled]="loading() || saving() || region === saved()">
        @if (saving()) { <c-spinner size="sm" class="me-1"></c-spinner> } Guardar
      </button>
      @if (loading()) { <c-spinner size="sm" color="primary"></c-spinner> }
    </div>
    <p class="text-secondary mt-2 mb-0">
      Aplica a todos los colaboradores de la empresa: define el periodo y la fecha de pago del 14.º. Las nóminas en
      borrador se recalculan con la región nueva; las aprobadas conservan la de su mes.
    </p>
  </c-card-body>
</c-card>`,
})
export class PayrollRegionCardComponent implements OnInit {
  private svc = inject(PayrollPaymentsService);
  private notifications = inject(NotificationService);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly saved = signal<Region>('sierra');
  region: Region = 'sierra';

  async ngOnInit(): Promise<void> {
    try {
      const v = await this.svc.getAccounts();
      this.saved.set(v.region === 'costa' ? 'costa' : 'sierra');
      this.region = this.saved();
    } catch (err) {
      this.error.set(`No se pudo leer la región: ${payrollErrorMessage(err)}`);
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const v = await this.svc.saveRegion(this.region);
      this.saved.set(v.region === 'costa' ? 'costa' : this.region);
      this.notifications.success('Región del décimo cuarto guardada');
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
