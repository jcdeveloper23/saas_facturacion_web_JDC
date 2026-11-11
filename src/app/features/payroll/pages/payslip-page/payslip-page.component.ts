import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, ButtonModule, CardModule, GridModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../../core/services/notification.service';
import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { Payslip, PayslipLine, RUN_STATUS, money, periodLabel, sumLines } from '../../models/payroll.models';
import { PayrollService, payrollErrorMessage } from '../../services/payroll.service';

/**
 * Ficha del rol (§7.2): ingresos, descuentos y neto; lo que paga el empleador y
 * lo provisionado van como información (no suman al neto, §4.4 regla 1).
 */
@Component({
  selector: 'app-payroll-payslip-page',
  standalone: true,
  imports: [CommonModule, RouterLink, AlertModule, BadgeModule, ButtonModule, CardModule, GridModule, SpinnerModule, PayrollTabsComponent],
  template: `
@if (loading()) {
  <div class="text-center py-5"><c-spinner color="primary"></c-spinner></div>
} @else if (error() || !slip()) {
  <c-alert color="warning">{{ error() || 'Este rol ya no existe.' }}</c-alert>
} @else {
  @let p = slip()!;
  <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
    <div>
      <a [routerLink]="['/payroll/runs', p.runId]" class="small">← Nómina de {{ label(p.period) }}</a>
      <h4 class="mb-0">Rol de pago · {{ p.employee.name }}
        <c-badge [color]="STATUS[p.status].color" class="ms-2 align-middle">{{ STATUS[p.status].label }}</c-badge>
      </h4>
      <small class="text-secondary">{{ p.employee.taxId }}{{ p.employee.position ? ' · ' + p.employee.position : '' }} · {{ p.workedDays }} días trabajados</small>
    </div>
    <div class="d-flex gap-2">
      <button cButton color="secondary" variant="outline" size="sm" (click)="pdf()" [disabled]="p.status === 'draft' || busy()">
        @if (busy() === 'pdf') { <c-spinner size="sm" class="me-1"></c-spinner> } Descargar PDF
      </button>
      @if (p.status === 'approved') {
        <button cButton color="secondary" variant="outline" size="sm" (click)="email()" [disabled]="busy()">
          @if (busy() === 'email') { <c-spinner size="sm" class="me-1"></c-spinner> } Enviar por correo
        </button>
      }
    </div>
  </div>
  <app-payroll-tabs />
  @if (p.status === 'draft') { <c-alert color="info" class="py-2 small">La nómina está en borrador: este rol todavía puede cambiar y no tiene PDF válido.</c-alert> }
  @if (p.status === 'reversed') { <c-alert color="danger" class="py-2 small">Esta nómina fue reversada: el rol no tiene validez.</c-alert> }
  @if (p.emailError) { <c-alert color="danger" class="py-2 small">No se pudo enviar a {{ p.emailTo || 'su correo' }}: {{ p.emailError }}</c-alert> }
  @else if (p.emailSent) { <c-alert color="success" class="py-2 small">Enviado a {{ p.emailTo }}.</c-alert> }
  <c-row class="g-3">
    <c-col lg="7">
      <ng-container *ngTemplateOutlet="block; context: { title: 'Ingresos', lines: p.earnings, sign: 1 }" />
      <ng-container *ngTemplateOutlet="block; context: { title: 'Descuentos', lines: p.deductions, sign: -1 }" />
    </c-col>
    <c-col lg="5">
      <c-card class="mb-3">
        <c-card-body>
          <div class="d-flex justify-content-between small"><span>Ingresos</span><span class="font-monospace">{{ money(sum(p.earnings)) }}</span></div>
          <div class="d-flex justify-content-between small"><span>Descuentos</span><span class="font-monospace text-danger">-{{ money(sum(p.deductions)) }}</span></div>
          <hr class="my-2" />
          <div class="d-flex justify-content-between fw-semibold text-primary"><span>Neto a recibir</span><span class="font-monospace">{{ money(p.netCents) }}</span></div>
        </c-card-body>
      </c-card>
      <ng-container *ngTemplateOutlet="block; context: { title: 'Paga el empleador (informativo)', lines: p.employerCosts, sign: 1, muted: true }" />
      <ng-container *ngTemplateOutlet="block; context: { title: 'Provisiones (informativo)', lines: p.provisions, sign: 1, muted: true }" />
    </c-col>
  </c-row>
}
<ng-template #block let-title="title" let-lines="lines" let-sign="sign" let-muted="muted">
  <c-card class="mb-3">
    <c-card-header class="small fw-semibold">{{ title }}</c-card-header>
    <c-card-body class="small">
      @for (l of lines; track $index) {
        <div class="d-flex justify-content-between py-1" [class.text-secondary]="muted">
          <span>{{ l.label || l.concept }}{{ l.qty != null ? ' (' + l.qty + ')' : '' }}</span>
          <span class="font-monospace" [class.text-danger]="sign < 0">{{ sign < 0 ? '-' : '' }}{{ money(l.amountCents) }}</span>
        </div>
      } @empty { <span class="text-secondary">—</span> }
    </c-card-body>
  </c-card>
</ng-template>`,
})
export class PayslipPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollService);
  private notifications = inject(NotificationService);
  private route = inject(ActivatedRoute);
  private sub: Subscription | null = null;

  readonly slip = signal<Payslip | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal<'' | 'pdf' | 'email'>('');
  readonly STATUS = RUN_STATUS;
  readonly money = money;
  readonly label = periodLabel;
  readonly sum = (l: PayslipLine[]) => sumLines(l);

  ngOnInit(): void {
    this.sub = this.svc.payslip(this.route.snapshot.paramMap.get('payslipId') ?? '').subscribe({
      next: (p) => { this.slip.set(p); this.loading.set(false); },
      error: (err) => { this.error.set(payrollErrorMessage(err)); this.loading.set(false); },
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  async pdf(): Promise<void> {
    this.busy.set('pdf');
    try { await this.svc.downloadPayslipPdf(this.slip()!.id); }
    catch (err) { this.notifications.error(payrollErrorMessage(err)); }
    finally { this.busy.set(''); }
  }

  async email(): Promise<void> {
    const p = this.slip()!;
    this.busy.set('email');
    try {
      const r = await this.svc.sendEmails(p.runId, [p.id]);
      if (r.failed) this.notifications.error('No se pudo enviar el rol: revisa el error en la ficha.');
      else if (r.skipped) this.notifications.warning('El empleado no tiene correo en su ficha de nómina.');
      else this.notifications.success(r.alreadySent ? 'Este rol ya se había enviado.' : 'Rol enviado');
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.busy.set('');
    }
  }
}
