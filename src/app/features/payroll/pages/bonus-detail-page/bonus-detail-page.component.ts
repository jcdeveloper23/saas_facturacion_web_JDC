import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AlertModule, BadgeModule, ButtonModule, CardModule, GridModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../../core/services/notification.service';
import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import { BonusPayModalComponent } from '../../components/bonus-pay-modal.component';
import { VoidReasonModalComponent } from '../../components/void-reason-modal.component';
import { money } from '../../models/payroll.models';
import { dayLabel } from '../../models/payroll-payments.models';
import { BONUS_STATUS, PayrollBonusRun } from '../../models/payroll-bonus.models';
import { PayrollBonusService } from '../../services/payroll-bonus.service';
import { payrollErrorMessage } from '../../services/payroll.service';

/**
 * Ficha de un lote de décimos: una línea por empleado que lo acumula, con su
 * valor legal, lo provisionado, el ajuste y el saldo. Borrador: recalcular,
 * pagar o descartar. Pagado: anular el pago.
 */
@Component({
  selector: 'app-payroll-bonus-detail-page',
  standalone: true,
  templateUrl: './bonus-detail-page.component.html',
  imports: [CommonModule, RouterLink, AlertModule, BadgeModule, ButtonModule, CardModule, GridModule, SpinnerModule,
    PayrollTabsComponent, BonusPayModalComponent, VoidReasonModalComponent],
})
export class BonusDetailPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollBonusService);
  private notifications = inject(NotificationService);
  private route = inject(ActivatedRoute);
  private sub: Subscription | null = null;

  readonly run = signal<PayrollBonusRun | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly showPay = signal(false);
  readonly showVoid = signal(false);

  readonly STATUS = BONUS_STATUS;
  readonly money = money;
  readonly day = dayLabel;
  readonly rows = computed(() => [...(this.run()?.lines ?? [])].sort((a, b) => a.employeeName.localeCompare(b.employeeName)));
  readonly errorCount = computed(() => this.rows().filter((l) => l.errors.length > 0).length);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('bonusRunId') ?? '';
    this.sub = this.svc.bonusRun(id).subscribe({
      next: (r) => { this.run.set(r); this.loading.set(false); },
      error: (err) => { this.error.set(payrollErrorMessage(err)); this.loading.set(false); },
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  async recalc(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await this.svc.recalculateBonusRun(this.run()!.id);
      this.notifications.success(`Lote recalculado · ${r.totals.employees} empleado(s)`);
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  voidTitle(r: PayrollBonusRun): string { return r.status === 'paid' ? `Anular el pago de ${r.label}` : `Descartar ${r.label}`; }
  voidText(r: PayrollBonusRun): string {
    return r.status === 'paid'
      ? 'Se crea la reversa del asiento del pago y se liberan las nóminas de los meses que cubre. Después se puede generar una versión nueva.'
      : 'El borrador se descarta (no tiene asiento). Después se puede generar una versión nueva.';
  }

  async confirmVoid(reason: string): Promise<void> {
    const r = this.run()!;
    this.busy.set(true);
    try {
      await this.svc.voidBonusRun(r.id, reason);
      this.notifications.success(r.status === 'paid' ? 'Pago del décimo anulado' : 'Borrador descartado');
      this.showVoid.set(false);
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
