import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, ButtonModule, CardModule, FormModule, GridModule, ModalModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../../core/services/notification.service';
import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { NoveltiesModalComponent } from '../../components/novelties-modal.component';
import { PayrollRun, Payslip, RUN_STATUS, money, runTitle, sumLines } from '../../models/payroll.models';
import { PayrollService, payrollErrorMessage } from '../../services/payroll.service';

type Busy = '' | 'recalc' | 'approve' | 'reverse' | 'email';

/**
 * Ficha de la nómina (§7.2): un rol por empleado, avisos, totales y las
 * acciones de su estado (§5.3). Todo pasa por las callables; aquí no se calcula.
 */
@Component({
  selector: 'app-payroll-run-detail-page',
  standalone: true,
  templateUrl: './run-detail-page.component.html',
  imports: [CommonModule, FormsModule, RouterLink, AlertModule, BadgeModule, ButtonModule, CardModule, FormModule,
    GridModule, ModalModule, SpinnerModule, PayrollTabsComponent, NoveltiesModalComponent],
})
export class RunDetailPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollService);
  private notifications = inject(NotificationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sub = new Subscription();

  readonly run = signal<PayrollRun | null>(null);
  readonly slips = signal<Payslip[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal<Busy>('');
  readonly confirm = signal<'' | 'approve' | 'reverse' | 'email'>('');
  readonly showNovelties = signal(false);
  readonly slipsError = signal('');
  reason = '';

  readonly STATUS = RUN_STATUS;
  readonly money = money;
  readonly title = runTitle;
  readonly sum = sumLines;
  readonly rows = computed(() => [...this.slips()].sort((a, b) => a.employee.name.localeCompare(b.employee.name)));

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('runId') ?? '';
    this.sub.add(this.svc.run(id).subscribe({
      next: (r) => { this.run.set(r); this.loading.set(false); },
      error: (err) => { this.error.set(payrollErrorMessage(err)); this.loading.set(false); },
    }));
    this.sub.add(this.svc.payslips(id).subscribe({
      next: (s) => { this.slips.set(s); this.slipsError.set(''); },
      error: (err) => this.slipsError.set(payrollErrorMessage(err)),
    }));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  openSlip(p: Payslip): void { this.router.navigate(['/payroll/payslips', p.id]); }

  private async act(kind: Busy, fn: () => Promise<unknown>, ok: (r: any) => string, warn = (_: any) => false): Promise<void> {
    this.busy.set(kind);
    try {
      const r = await fn();
      if (warn(r)) this.notifications.warning(ok(r)); else this.notifications.success(ok(r));
      this.confirm.set('');
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.busy.set('');
    }
  }

  recalc(): Promise<void> {
    return this.act('recalc', () => this.svc.recalculate(this.run()!.id), () => 'Nómina recalculada');
  }

  approve(): Promise<void> {
    return this.act('approve', () => this.svc.approve(this.run()!.id), (r) => `Nómina aprobada · asiento n.º ${r?.number ?? ''}`);
  }

  reverse(): Promise<void> {
    if (!this.reason.trim()) { this.notifications.warning('Escribe el motivo de la reversa.'); return Promise.resolve(); }
    return this.act('reverse', () => this.svc.reverse(this.run()!.id, this.reason.trim()), () => 'Nómina reversada');
  }

  sendEmails(): Promise<void> {
    return this.act('email', () => this.svc.sendEmails(this.run()!.id), (r) => [
      `${r?.sent ?? 0} enviado(s)`,
      r?.failed ? `${r.failed} con error` : '',
      r?.skipped ? `${r.skipped} sin correo en su ficha` : '',
      r?.alreadySent ? `${r.alreadySent} ya se habían enviado` : '',
    ].filter(Boolean).join(', '), (r) => (r?.failed ?? 0) > 0 || (r?.skipped ?? 0) > 0);
  }

  /** Al cerrar las novedades con cambios, el borrador se recalcula: lo que se ve es lo que se aprueba. */
  async onNoveltiesClosed(changed: boolean): Promise<void> {
    this.showNovelties.set(false);
    if (changed && this.run()?.status === 'draft') await this.recalc();
  }

  openConfirm(kind: 'approve' | 'reverse' | 'email'): void { this.reason = ''; this.confirm.set(kind); }
}
