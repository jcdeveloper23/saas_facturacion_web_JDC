import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import { ModalModule, ButtonModule, FormModule, SpinnerModule } from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { ChartOfAccountsService }   from '../../services/chart-of-accounts.service';
import { JournalEntriesService }    from '../../services/journal-entries.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import { Account } from '../../models/account.interface';
import { BankAccount } from '../../models/bank-account.interface';
import { AccountingPeriod } from '../../models/accounting-period.interface';

export type BankMovementType = 'ingreso' | 'egreso';

/**
 * Registra un movimiento bancario suelto (no ligado a una factura/compra):
 * transferencia entre cuentas, comisión bancaria, interés ganado, etc.
 * Genera un asiento de 2 líneas directo vía JournalEntriesService.createEntry()
 * — mismo mecanismo 100% frontend que ya usa journal-entry-form-page, sin
 * necesitar una Cloud Function nueva.
 */
@Component({
  selector: 'app-bank-movement-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalModule, ButtonModule, FormModule, SpinnerModule, IconModule],
  templateUrl: './bank-movement-modal.component.html'
})
export class BankMovementModalComponent implements OnChanges {
  private chartSvc   = inject(ChartOfAccountsService);
  private journalSvc = inject(JournalEntriesService);
  private periodsSvc = inject(AccountingPeriodsService);
  private notifications = inject(NotificationService);

  @Input() visible = false;
  @Input() bankAccount: BankAccount | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();

  glAccounts = signal<Account[]>([]);
  periods    = signal<AccountingPeriod[]>([]);
  saving     = signal(false);

  movementType    = signal<BankMovementType>('ingreso');
  counterAccountCode = signal('');
  amount     = signal(0);
  date       = signal(this.todayInput());
  description = signal('');

  counterAccount = computed(() =>
    this.glAccounts().find(a => a.code === this.counterAccountCode()) ?? null
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.movementType.set('ingreso');
      this.counterAccountCode.set('');
      this.amount.set(0);
      this.date.set(this.todayInput());
      this.description.set('');

      if (this.glAccounts().length === 0) {
        this.chartSvc.getActiveMovementAccounts().pipe(take(1)).subscribe(accs => this.glAccounts.set(accs));
      }
      if (this.periods().length === 0) {
        this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => this.periods.set(p));
      }
    }
  }

  onVisibleChange(v: boolean): void {
    this.visible = v;
    this.visibleChange.emit(v);
  }

  async confirm(): Promise<void> {
    const bank = this.bankAccount;
    const counter = this.counterAccount();
    const amt = this.amount();

    if (!bank || !counter || amt <= 0 || !this.description().trim()) return;

    const dateStr = this.date();
    const year = new Date(dateStr + 'T00:00:00').getFullYear();
    const period = this.periods().find(p => p.year === year && p.status === 'open');
    if (!period) {
      this.notifications.error(`No hay un período contable abierto para ${year}.`);
      return;
    }

    this.saving.set(true);
    try {
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const isIngreso = this.movementType() === 'ingreso';
      const desc = this.description().trim();

      const bankLine = {
        id: crypto.randomUUID(), accountCode: bank.linkedGlCode, accountName: bank.linkedGlName,
        debit: isIngreso ? round2(amt) : 0, credit: isIngreso ? 0 : round2(amt),
        costCenterId: null, costCenterName: null, description: desc
      };
      const counterLine = {
        id: crypto.randomUUID(), accountCode: counter.code, accountName: counter.name,
        debit: isIngreso ? 0 : round2(amt), credit: isIngreso ? round2(amt) : 0,
        costCenterId: null, costCenterName: null, description: desc
      };

      const entryId = await this.journalSvc.createEntry({
        date: Timestamp.fromDate(new Date(dateStr + 'T00:00:00')),
        description: desc,
        periodId: period.id,
        periodYear: period.year,
        type: 'manual',
        status: 'draft',
        reference: `${bank.bankName} — ${bank.accountNumber}`,
        lines: [bankLine, counterLine]
      });
      await this.journalSvc.postEntry(entryId);

      this.notifications.success('Movimiento registrado');
      this.saved.emit();
      this.onVisibleChange(false);
    } catch (err: any) {
      this.notifications.error('Error al registrar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  private todayInput(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
