import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AlertModule, ButtonModule, CardModule, FormModule, SpinnerModule } from '@coreui/angular';

import { NotificationService } from '../../../../core/services/notification.service';
import { ChartOfAccountsService } from '../../../accounting/services/chart-of-accounts.service';
import { Account } from '../../../accounting/models/account.interface';
import { PayrollTabsComponent } from '../../components/payroll-tabs.component';
import {
  PAYROLL_ACCOUNT_FALLBACK, PAYROLL_ACCOUNT_GROUPS, PAYROLL_ACCOUNT_LABELS, PayrollAccountKey, PayrollAccountsView,
} from '../../models/payroll-payments.models';
import { PayrollPaymentsService } from '../../services/payroll-payments.service';
import { payrollErrorMessage } from '../../services/payroll.service';

/**
 * Nómina › Cuentas (NOMINA_PAGOS.md §3): la cuenta del plan para cada concepto
 * del asiento de nómina. Vacío = la sugerida. «Guardar» manda solo lo que
 * cambió; el servidor exige cuentas de movimiento activas.
 */
@Component({
  selector: 'app-payroll-accounts-page',
  standalone: true,
  templateUrl: './accounts-page.component.html',
  imports: [CommonModule, FormsModule, AlertModule, ButtonModule, CardModule, FormModule, SpinnerModule, PayrollTabsComponent],
})
export class AccountsPageComponent implements OnInit, OnDestroy {
  private svc = inject(PayrollPaymentsService);
  private chart = inject(ChartOfAccountsService);
  private notifications = inject(NotificationService);
  private sub: Subscription | null = null;

  readonly view = signal<PayrollAccountsView | null>(null);
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);
  /** Lo que se edita: clave → código ('' = la sugerida). */
  edits: Partial<Record<PayrollAccountKey, string>> = {};

  readonly groups = PAYROLL_ACCOUNT_GROUPS;
  readonly labels = PAYROLL_ACCOUNT_LABELS;
  private readonly byCode = computed(() => new Map(this.accounts().map((a) => [a.code, a.name])));

  ngOnInit(): void {
    this.load();
    this.sub = this.chart.getActiveMovementAccounts().subscribe({
      next: (a) => this.accounts.set(a),
      error: () => this.notifications.warning('No se pudo leer el plan de cuentas; escribe los códigos a mano.'),
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.apply(await this.svc.getAccounts());
      this.error.set('');
    } catch (err) {
      this.error.set(payrollErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  private apply(v: PayrollAccountsView): void {
    this.view.set(v);
    this.edits = Object.fromEntries(Object.keys(PAYROLL_ACCOUNT_LABELS).map((k) => [k, v.saved?.[k as PayrollAccountKey] ?? '']));
  }

  accountName(code: string | undefined): string { return code ? this.byCode().get(code.trim()) ?? '' : ''; }

  /** La sugerida, o de qué clave toma la cuenta si no tiene. */
  suggested(key: PayrollAccountKey): { code: string; note: string } {
    const code = this.view()?.defaults?.[key] ?? '';
    if (code) return { code, note: this.accountName(code) };
    const fb = PAYROLL_ACCOUNT_FALLBACK[key];
    return fb ? { code: '', note: `(usa la de «${this.labels[fb]}»)` } : { code: '', note: 'Sin sugerida: elígela si la usas' };
  }

  /** Las claves cuyo código cambió frente a lo guardado. */
  changed(): Partial<Record<PayrollAccountKey, string>> {
    const saved = this.view()?.saved ?? {};
    const out: Partial<Record<PayrollAccountKey, string>> = {};
    for (const k of Object.keys(PAYROLL_ACCOUNT_LABELS) as PayrollAccountKey[]) {
      const now = String(this.edits[k] ?? '').trim();
      if (now !== (saved[k] ?? '')) out[k] = now;
    }
    return out;
  }

  isChanged(k: PayrollAccountKey): boolean { return String(this.edits[k] ?? '').trim() !== (this.view()?.saved?.[k] ?? ''); }
  changedCount(): number { return Object.keys(this.changed()).length; }

  /** Un código que no es cuenta de movimiento activa (aviso; el servidor rechaza). */
  unknown(k: PayrollAccountKey): boolean {
    const code = String(this.edits[k] ?? '').trim();
    return !!code && this.accounts().length > 0 && !this.byCode().has(code);
  }

  discard(): void { const v = this.view(); if (v) this.apply(v); }

  async save(): Promise<void> {
    const accounts = this.changed();
    if (Object.keys(accounts).length === 0) { this.notifications.info('No hay cambios que guardar.'); return; }
    this.saving.set(true);
    try {
      this.apply(await this.svc.saveAccounts(accounts));
      this.notifications.success('Cuentas de nómina guardadas');
    } catch (err) {
      this.notifications.error(payrollErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
