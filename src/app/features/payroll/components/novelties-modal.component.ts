import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../core/services/notification.service';
import {
  NOVELTY_TYPES, NoveltyType, PayrollEmployee, PayrollNovelty, money, noveltyInfo, parseMoneyCents, periodLabel,
} from '../models/payroll.models';
import { PayrollService, payrollErrorMessage } from '../services/payroll.service';

/**
 * Novedades del mes (§5.1): agregar y quitar, con savePayrollNovelties. El
 * borrador se actualiza con «Recalcular». El tope de anticipos (art. 90) lo
 * aplica el servidor, que conoce la remuneración del mes.
 */
@Component({
  selector: 'app-payroll-novelties-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertModule, ButtonModule, FormModule, GridModule, ModalModule, SpinnerModule],
  template: `
<c-modal [visible]="true" (visibleChange)="!$event && closed.emit(changed)" backdrop="static" size="lg">
  <c-modal-header>
    <h5 cModalTitle>Novedades de {{ label(period) }}</h5>
    <button type="button" class="btn-close" (click)="closed.emit(changed)"></button>
  </c-modal-header>
  <c-modal-body>
    <c-row class="g-2 align-items-end">
      <c-col md="4">
        <label cLabel>Empleado *</label>
        <select cSelect [(ngModel)]="employeeId">
          <option value="">Elegir</option>
          @for (e of employees(); track e.id) { <option [value]="e.id">{{ e.name }}</option> }
        </select>
      </c-col>
      <c-col md="4">
        <label cLabel>Tipo *</label>
        <select cSelect [(ngModel)]="type">
          @for (t of types; track t.code) { <option [value]="t.code">{{ t.label }}</option> }
        </select>
      </c-col>
      <c-col md="2">
        <label cLabel>{{ unit() === 'amount' ? 'Valor (USD)' : unit() === 'hours' ? 'Horas' : 'Días' }} *</label>
        <input cFormControl [(ngModel)]="value" placeholder="Ej.: 5" />
      </c-col>
      <c-col md="2">
        <button cButton color="primary" class="w-100" (click)="add()" [disabled]="saving()">Agregar</button>
      </c-col>
      @if (type === 'otherDeduction') {
        <c-col md="6"><label cLabel>Cuenta contable</label><input cFormControl [(ngModel)]="accountCode" placeholder="Ej.: 2.1.04.099" /></c-col>
      }
      <c-col [md]="type === 'otherDeduction' ? 6 : 12"><label cLabel>Nota</label><input cFormControl [(ngModel)]="note" /></c-col>
    </c-row>
    @if (unit() === 'hours') {
      <small class="text-secondary d-block mt-2">Con jornada eficiente, registre solo lo que supere 40 horas en la semana.</small>
    }
    <hr />
    @if (loadError()) { <c-alert color="warning" class="py-2 small">{{ loadError() }}</c-alert> }
    <h6>Cargadas en el mes</h6>
    @if (rows().length === 0) {
      <p class="text-secondary small mb-0">Sin novedades este mes.</p>
    } @else {
      <table class="table table-sm mb-0 align-middle">
        <tbody>
          @for (n of rows(); track n.id) {
            <tr>
              <td>{{ nameOf(n.employeeId) }}</td>
              <td>{{ info(n.type)?.label ?? n.type }}</td>
              <td class="text-end font-monospace">{{ n.amountCents != null ? money(n.amountCents) : (n.qty + (info(n.type)?.unit === 'days' ? ' día(s)' : ' h')) }}</td>
              <td class="small text-secondary">{{ n.note }}</td>
              <td class="text-end"><button cButton color="danger" variant="ghost" size="sm" (click)="remove(n)" [disabled]="saving()">Quitar</button></td>
            </tr>
          }
        </tbody>
      </table>
    }
  </c-modal-body>
  <c-modal-footer>
    <small class="text-secondary me-auto">Al cerrar, si cambiaste algo, la nómina se recalcula.</small>
    <button cButton color="secondary" variant="outline" (click)="closed.emit(changed)">Cerrar</button>
  </c-modal-footer>
</c-modal>`,
})
export class NoveltiesModalComponent implements OnInit, OnDestroy {
  @Input({ required: true }) period = '';
  /** true si se agregó o quitó alguna novedad (la ficha recalcula). */
  @Output() closed = new EventEmitter<boolean>();

  private svc = inject(PayrollService);
  private notifications = inject(NotificationService);
  private sub = new Subscription();

  readonly employees = signal<PayrollEmployee[]>([]);
  readonly allEmployees = signal<PayrollEmployee[]>([]);
  readonly loadError = signal('');
  changed = false;
  readonly novelties = signal<PayrollNovelty[]>([]);
  readonly saving = signal(false);
  readonly types = NOVELTY_TYPES;
  readonly money = money;
  readonly info = noveltyInfo;
  readonly label = periodLabel;
  readonly rows = computed(() => [...this.novelties()].sort((a, b) => this.nameOf(a.employeeId).localeCompare(this.nameOf(b.employeeId))));

  employeeId = '';
  type: NoveltyType = 'overtime50';
  value = '';
  accountCode = '';
  note = '';

  unit() { return noveltyInfo(this.type)?.unit ?? 'amount'; }
  nameOf(id: string) { return this.allEmployees().find((e) => e.id === id)?.name ?? id; }

  ngOnInit(): void {
    const fail = (err: unknown) => this.loadError.set(payrollErrorMessage(err));
    this.sub.add(this.svc.employees().subscribe({
      next: (e) => { this.allEmployees.set(e); this.employees.set(e.filter((x) => x.isActive)); },
      error: fail,
    }));
    this.sub.add(this.svc.novelties(this.period).subscribe({ next: (n) => this.novelties.set(n), error: fail }));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  async add(): Promise<void> {
    if (!this.employeeId) { this.notifications.warning('Elige el empleado.'); return; }
    const byAmount = this.unit() === 'amount';
    const amountCents = byAmount ? parseMoneyCents(this.value) : null;
    const qty = byAmount ? null : Number(String(this.value).replace(',', '.'));
    if (byAmount ? !amountCents : !(qty! > 0)) { this.notifications.warning('Escribe un valor mayor que cero.'); return; }
    this.saving.set(true);
    try {
      await this.svc.addNovelty(this.period, {
        employeeId: this.employeeId, type: this.type,
        ...(byAmount ? { amountCents: amountCents! } : { qty: qty! }),
        ...(this.accountCode.trim() ? { accountCode: this.accountCode.trim() } : {}),
        ...(this.note.trim() ? { note: this.note.trim() } : {}),
      });
      this.value = ''; this.note = ''; this.changed = true;
      this.notifications.success('Novedad agregada. Recalcula la nómina para verla en el rol.');
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  async remove(n: PayrollNovelty): Promise<void> {
    this.saving.set(true);
    try {
      await this.svc.deleteNovelty(this.period, n.id);
      this.changed = true;
      this.notifications.success('Novedad quitada');
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
