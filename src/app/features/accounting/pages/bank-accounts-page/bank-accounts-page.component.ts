import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subject, takeUntil, take } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule, ModalModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { BankAccountsService }    from '../../services/bank-accounts.service';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { NotificationService }    from '../../../../core/services/notification.service';
import {
  BankAccount, BankAccountType,
  BANK_ACCOUNT_TYPE_LABELS
} from '../../models/bank-account.interface';
import { Account } from '../../models/account.interface';

@Component({
  selector:     'app-bank-accounts-page',
  standalone:   true,
  templateUrl:  './bank-accounts-page.component.html',
  styleUrl:     './bank-accounts-page.component.scss',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, ModalModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective
  ]
})
export class BankAccountsPageComponent implements OnInit, OnDestroy {
  private svc        = inject(BankAccountsService);
  private chartSvc   = inject(ChartOfAccountsService);
  private notifications = inject(NotificationService);
  private fb         = inject(FormBuilder);
  private destroy$   = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  accounts   = signal<BankAccount[]>([]);
  glAccounts = signal<Account[]>([]);
  loading    = signal(true);
  saving     = signal(false);
  deleting   = signal<string | null>(null);
  showModal  = signal(false);
  editingId  = signal<string | null>(null);
  searchTerm = signal('');

  // ── Constants ─────────────────────────────────────────────────────────────
  readonly TYPE_LABELS  = BANK_ACCOUNT_TYPE_LABELS;
  readonly accountTypes: BankAccountType[] = ['corriente', 'ahorros'];

  // ── Form ──────────────────────────────────────────────────────────────────
  form = this.fb.group({
    bankName:      ['', Validators.required],
    accountNumber: ['', Validators.required],
    accountType:   ['corriente' as BankAccountType, Validators.required],
    currency:      ['USD', Validators.required],
    linkedGlCode:  ['', Validators.required],
    linkedGlName:  ['', Validators.required],
    isActive:      [true as boolean]
  });

  // ── Computed ──────────────────────────────────────────────────────────────
  filtered = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.accounts();
    return this.accounts().filter(a =>
      a.bankName.toLowerCase().includes(term) ||
      a.accountNumber.toLowerCase().includes(term)
    );
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.svc.getBankAccounts().pipe(
      catchError(err => {
        this.notifications.error('Error cargando cuentas bancarias: ' + (err?.message ?? err));
        this.loading.set(false);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(list => {
      this.accounts.set(list);
      this.loading.set(false);
    });

    // Load GL accounts for the picker (one-shot, picker is reference data)
    this.chartSvc.getActiveMovementAccounts().pipe(take(1)).subscribe(accs => {
      this.glAccounts.set(accs);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── GL account picker ─────────────────────────────────────────────────────
  onGlAccountChange(code: string): void {
    const acc = this.glAccounts().find(a => a.code === code);
    if (acc) {
      this.form.patchValue({
        linkedGlCode: acc.code,
        linkedGlName: acc.name
      });
    }
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  openNew(): void {
    this.editingId.set(null);
    this.form.reset({
      bankName:      '',
      accountNumber: '',
      accountType:   'corriente',
      currency:      'USD',
      linkedGlCode:  '',
      linkedGlName:  '',
      isActive:      true
    });
    this.showModal.set(true);
  }

  openEdit(acc: BankAccount, event: Event): void {
    event.stopPropagation();
    this.editingId.set(acc.id);
    this.form.patchValue({
      bankName:      acc.bankName,
      accountNumber: acc.accountNumber,
      accountType:   acc.accountType,
      currency:      acc.currency,
      linkedGlCode:  acc.linkedGlCode,
      linkedGlName:  acc.linkedGlName,
      isActive:      acc.isActive
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingId.set(null);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const v = this.form.value;
    const input = {
      bankName:      v.bankName!.trim(),
      accountNumber: v.accountNumber!.trim(),
      accountType:   v.accountType! as BankAccountType,
      currency:      v.currency!.trim(),
      linkedGlCode:  v.linkedGlCode!.trim(),
      linkedGlName:  v.linkedGlName!.trim(),
      isActive:      v.isActive ?? true
    };

    try {
      const id = this.editingId();
      if (id) {
        await this.svc.updateBankAccount(id, input);
        this.notifications.success('Cuenta bancaria actualizada');
      } else {
        await this.svc.createBankAccount(input);
        this.notifications.success('Cuenta bancaria creada');
      }
      this.closeModal();
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  // ── Toggle / Delete ───────────────────────────────────────────────────────
  async toggleActive(acc: BankAccount, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.svc.toggleActive(acc.id, !acc.isActive);
      this.notifications.success(acc.isActive ? 'Cuenta inactivada' : 'Cuenta activada');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  async deleteAccount(acc: BankAccount, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(`¿Eliminar cuenta bancaria "${acc.bankName} — ${acc.accountNumber}"?`)) return;
    this.deleting.set(acc.id);
    try {
      await this.svc.deleteBankAccount(acc.id);
      this.notifications.success('Cuenta bancaria eliminada');
    } catch (err: any) {
      this.notifications.error('Error al eliminar: ' + (err?.message ?? err));
    } finally {
      this.deleting.set(null);
    }
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
