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

import { Timestamp } from '@angular/fire/firestore';
import { BankAccountsService }    from '../../services/bank-accounts.service';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { JournalEntriesService }  from '../../services/journal-entries.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { NotificationService }    from '../../../../core/services/notification.service';
import {
  BankAccount, BankAccountType,
  BANK_ACCOUNT_TYPE_LABELS
} from '../../models/bank-account.interface';
import { Account } from '../../models/account.interface';
import { AccountSelectComponent } from '../../components/account-select/account-select.component';
import { AccountingPeriod } from '../../models/accounting-period.interface';

// Cuenta puente fija para saldos iniciales cargados fuera del ciclo formal de
// apertura de período — mismo criterio que PURCHASE_FIXED_ACCOUNTS en el backend.
const OPENING_BALANCE_OFFSET_ACCOUNT = { code: '3.3.01.001', name: 'Utilidades Acumuladas Ejercicios Anteriores' };

@Component({
  selector:     'app-bank-accounts-page',
  standalone:   true,
  templateUrl:  './bank-accounts-page.component.html',
  styleUrl:     './bank-accounts-page.component.scss',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, ModalModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective,
    AccountSelectComponent
  ]
})
export class BankAccountsPageComponent implements OnInit, OnDestroy {
  private svc        = inject(BankAccountsService);
  private chartSvc   = inject(ChartOfAccountsService);
  private journalSvc = inject(JournalEntriesService);
  private periodsSvc = inject(AccountingPeriodsService);
  private notifications = inject(NotificationService);
  private fb         = inject(FormBuilder);
  private destroy$   = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  accounts   = signal<BankAccount[]>([]);
  glAccounts = signal<Account[]>([]);
  periods    = signal<AccountingPeriod[]>([]);
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
    isActive:      [true as boolean],
    openingBalance:     [0, [Validators.min(0)]],
    openingBalanceDate: [this.toDateInput(new Date())]
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

    this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => this.periods.set(p));
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
    this.form.get('openingBalance')?.enable();
    this.form.get('openingBalanceDate')?.enable();
    this.form.reset({
      bankName:      '',
      accountNumber: '',
      accountType:   'corriente',
      currency:      'USD',
      linkedGlCode:  '',
      linkedGlName:  '',
      isActive:      true,
      openingBalance:     0,
      openingBalanceDate: this.toDateInput(new Date())
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
      isActive:      acc.isActive,
      openingBalance:     acc.openingBalance ?? 0,
      openingBalanceDate: acc.openingBalanceDate ? this.toDateInput(acc.openingBalanceDate.toDate()) : ''
    });
    // El saldo inicial solo se carga una vez, al crear — se muestra de
    // referencia pero no se re-edita ni se vuelve a postear un asiento nuevo.
    this.form.get('openingBalance')?.disable();
    this.form.get('openingBalanceDate')?.disable();
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingId.set(null);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;

    const v = this.form.getRawValue();
    const linkedGlCode = v.linkedGlCode!.trim();
    const id = this.editingId();

    // Dos cuentas bancarias con la misma cuenta contable mezclarían sus
    // movimientos en un mismo libro mayor — rompería la conciliación de
    // ambas. Nada lo impedía hasta ahora (ni frontend ni Firestore rules).
    const duplicate = this.accounts().find(a =>
      a.isActive && a.linkedGlCode === linkedGlCode && a.id !== id
    );
    if (duplicate) {
      this.notifications.error(
        `La cuenta contable ${linkedGlCode} ya está vinculada a "${duplicate.bankName} — ${duplicate.accountNumber}". Cada cuenta bancaria necesita su propia cuenta contable.`
      );
      return;
    }

    this.saving.set(true);

    const input = {
      bankName:      v.bankName!.trim(),
      accountNumber: v.accountNumber!.trim(),
      accountType:   v.accountType! as BankAccountType,
      currency:      v.currency!.trim(),
      linkedGlCode,
      linkedGlName:  v.linkedGlName!.trim(),
      isActive:      v.isActive ?? true
    };

    try {
      if (id) {
        await this.svc.updateBankAccount(id, input);
        this.notifications.success('Cuenta bancaria actualizada');
      } else {
        const newId = await this.svc.createBankAccount(input);

        const openingBalance = v.openingBalance ?? 0;
        if (openingBalance > 0) {
          await this.postOpeningBalance(newId, input.linkedGlCode, input.linkedGlName, openingBalance, v.openingBalanceDate!);
        }

        this.notifications.success('Cuenta bancaria creada');
      }
      this.closeModal();
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  /** Asiento de saldo inicial: Debe [cuenta banco] / Haber cuenta puente de resultados acumulados. */
  private async postOpeningBalance(
    bankAccountId: string, glCode: string, glName: string, amount: number, dateStr: string
  ): Promise<void> {
    const date = Timestamp.fromDate(new Date(dateStr + 'T00:00:00'));
    const year = new Date(dateStr + 'T00:00:00').getFullYear();
    const period = this.periods().find(p => p.year === year && p.status === 'open');

    if (!period) {
      this.notifications.warning(
        `Cuenta creada, pero no hay un período contable abierto para ${year} — el saldo inicial no se contabilizó. Ábralo y registre el saldo manualmente desde Asientos Contables.`
      );
      return;
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const entryId = await this.journalSvc.createEntry({
      date,
      description: `Saldo inicial — ${glName}`,
      periodId:   period.id,
      periodYear: period.year,
      type:       'automatic',
      status:     'draft',
      reference:  'Saldo inicial cuenta bancaria',
      referenceId: bankAccountId,
      lines: [
        {
          id: crypto.randomUUID(), accountCode: glCode, accountName: glName,
          debit: round2(amount), credit: 0, costCenterId: null, costCenterName: null,
          description: `Saldo inicial — ${glName}`
        },
        {
          id: crypto.randomUUID(),
          accountCode: OPENING_BALANCE_OFFSET_ACCOUNT.code, accountName: OPENING_BALANCE_OFFSET_ACCOUNT.name,
          debit: 0, credit: round2(amount), costCenterId: null, costCenterName: null,
          description: `Saldo inicial — ${glName}`
        }
      ]
    });

    await this.journalSvc.postEntry(entryId);
    await this.svc.updateBankAccount(bankAccountId, {
      openingBalance: amount,
      openingBalanceDate: date,
      openingBalanceEntryId: entryId
    });
  }

  private toDateInput(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
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
