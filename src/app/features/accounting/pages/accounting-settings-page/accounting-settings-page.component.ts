import {
  Component, OnInit, OnDestroy, inject, signal, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, SpinnerModule, FormModule, TooltipModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { AccountingSettingsService } from '../../services/accounting-settings.service';
import { ChartOfAccountsService }   from '../../services/chart-of-accounts.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import { Account }                  from '../../models/account.interface';
import { AccountSelectComponent }   from '../../components/account-select/account-select.component';
import {
  AccountMapping, DEFAULT_ACCOUNT_MAPPING, ACCOUNT_MAPPING_LABELS
} from '../../models/accounting-settings.interface';

@Component({
  selector: 'app-accounting-settings-page',
  standalone: true,
  templateUrl: './accounting-settings-page.component.html',
  styleUrl:    './accounting-settings-page.component.scss',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, SpinnerModule, FormModule,
    TooltipModule, AlertModule, IconModule,
    AccountSelectComponent
  ]
})
export class AccountingSettingsPageComponent implements OnInit, OnDestroy {
  private settingsSvc   = inject(AccountingSettingsService);
  private accountsSvc   = inject(ChartOfAccountsService);
  private notifications = inject(NotificationService);
  private fb            = inject(FormBuilder);
  private destroy$      = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  loading    = signal(true);
  saving     = signal(false);
  accounts   = signal<Account[]>([]);
  isModified = signal(false);

  readonly LABELS   = ACCOUNT_MAPPING_LABELS;
  readonly DEFAULTS = DEFAULT_ACCOUNT_MAPPING;

  readonly ingresoKeys:  (keyof AccountMapping)[] = ['sales15', 'sales0', 'salesExempt'];
  readonly activoKeys:   (keyof AccountMapping)[] = ['accountsReceivable', 'inventory', 'advancesToSuppliers'];

  // ── Form ──────────────────────────────────────────────────────────────────
  form = this.fb.group({
    sales15:            [DEFAULT_ACCOUNT_MAPPING.sales15,            Validators.required],
    sales0:             [DEFAULT_ACCOUNT_MAPPING.sales0,             Validators.required],
    salesExempt:        [DEFAULT_ACCOUNT_MAPPING.salesExempt,        Validators.required],
    ivaCollected:       [DEFAULT_ACCOUNT_MAPPING.ivaCollected,       Validators.required],
    accountsReceivable: [DEFAULT_ACCOUNT_MAPPING.accountsReceivable, Validators.required],
    inventory:          [DEFAULT_ACCOUNT_MAPPING.inventory,          Validators.required],
    cogs:               [DEFAULT_ACCOUNT_MAPPING.cogs,               Validators.required],
    advancesFromCustomers: [DEFAULT_ACCOUNT_MAPPING.advancesFromCustomers, Validators.required],
    advancesToSuppliers:   [DEFAULT_ACCOUNT_MAPPING.advancesToSuppliers,   Validators.required],
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.accountsSvc.getAccounts().pipe(takeUntil(this.destroy$)).subscribe(a => {
      this.accounts.set(a.filter(ac => ac.allowsMovement && ac.isActive));
    });

    this.settingsSvc.getSettings().pipe(takeUntil(this.destroy$)).subscribe(settings => {
      this.form.patchValue(settings.accountMapping ?? DEFAULT_ACCOUNT_MAPPING);
      this.loading.set(false);
      this.isModified.set(false);
    });

    this.form.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isModified.set(true);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    try {
      await this.settingsSvc.saveSettings(this.form.value as AccountMapping);
      this.notifications.success('Configuración de cuentas guardada');
      this.isModified.set(false);
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  async resetToDefaults(): Promise<void> {
    const ok = await this.notifications.confirm({
      title: '¿Restablecer los códigos de cuenta a los valores por defecto?',
      confirmText: 'Sí, restablecer',
      cancelText: 'Cancelar',
      icon: 'question'
    });
    if (!ok) return;
    this.form.patchValue(DEFAULT_ACCOUNT_MAPPING);
    this.isModified.set(true);
  }

  getAccountName(code: string): string {
    return this.accounts().find(a => a.code === code)?.name ?? '';
  }

  isDefault(key: keyof AccountMapping): boolean {
    return (this.form.get(key)?.value ?? '') === DEFAULT_ACCOUNT_MAPPING[key];
  }
}
