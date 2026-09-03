import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs';
import { ModalModule, ButtonModule, FormModule, SpinnerModule } from '@coreui/angular';

import { BankAccountsService } from '../../../features/accounting/services/bank-accounts.service';
import { BankAccount } from '../../../features/accounting/models/bank-account.interface';

export interface MarkPaidResult {
  bankAccountId: string;
  date: string; // yyyy-mm-dd
}

/**
 * Modal compartido para marcar una factura o compra como pagada, eligiendo la
 * cuenta bancaria que recibió/pagó el dinero. Es el paso que hace falta antes
 * de generar el asiento de Cobro/Pago (ver generate-journal-entry-from-
 * {invoice,purchase}-payment.ts) — sin saber la cuenta bancaria específica no
 * se puede saber a qué cuenta contable de banco debe ir el asiento.
 */
@Component({
  selector: 'app-mark-paid-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalModule, ButtonModule, FormModule, SpinnerModule],
  templateUrl: './mark-paid-modal.component.html'
})
export class MarkPaidModalComponent implements OnChanges {
  private bankAccountsSvc = inject(BankAccountsService);

  @Input() visible = false;
  @Input() title = 'Marcar como pagada';
  @Input() confirming = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() confirm = new EventEmitter<MarkPaidResult>();

  bankAccounts = signal<BankAccount[]>([]);
  selectedBankAccountId = signal('');
  date = signal(this.todayInput());

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.date.set(this.todayInput());
      this.selectedBankAccountId.set('');
      this.bankAccountsSvc.getBankAccounts().pipe(take(1)).subscribe(list => {
        this.bankAccounts.set(list.filter(a => a.isActive));
        if (this.bankAccounts().length === 1) {
          this.selectedBankAccountId.set(this.bankAccounts()[0].id);
        }
      });
    }
  }

  onVisibleChange(v: boolean): void {
    this.visible = v;
    this.visibleChange.emit(v);
  }

  confirmClick(): void {
    if (this.bankAccounts().length > 0 && !this.selectedBankAccountId()) return;
    this.confirm.emit({ bankAccountId: this.selectedBankAccountId(), date: this.date() });
  }

  private todayInput(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
