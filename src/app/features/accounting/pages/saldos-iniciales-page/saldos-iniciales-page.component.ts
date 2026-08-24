import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Timestamp } from '@angular/fire/firestore';

import { ChartOfAccountsService }   from '../../services/chart-of-accounts.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { JournalEntriesService }    from '../../services/journal-entries.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import { Account, AccountType, AccountNature, ACCOUNT_TYPE_LABELS } from '../../models/account.interface';
import { AccountingPeriod } from '../../models/accounting-period.interface';
import { JournalEntryLine } from '../../models/journal-entry.interface';

interface SaldoInicialRow {
  accountCode: string;
  accountName: string;
  type:        AccountType;
  nature:      AccountNature;
  amount:      number;
}

@Component({
  selector: 'app-saldos-iniciales-page',
  standalone: true,
  templateUrl: './saldos-iniciales-page.component.html',
  styleUrl:    './saldos-iniciales-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, IconModule
  ]
})
export class SaldosInicialesPageComponent implements OnInit {
  private accountsSvc   = inject(ChartOfAccountsService);
  private periodsSvc    = inject(AccountingPeriodsService);
  private journalSvc    = inject(JournalEntriesService);
  private notifications = inject(NotificationService);

  readonly TYPE_LABELS = ACCOUNT_TYPE_LABELS;

  // ── State ─────────────────────────────────────────────────────────────────
  loading        = signal(true);
  saving         = signal(false);
  periods        = signal<AccountingPeriod[]>([]);
  selectedPeriod = signal('');
  entryDate      = signal(this.todayStr());
  rows           = signal<SaldoInicialRow[]>([]);
  searchTerm     = signal('');

  // ── Computed ──────────────────────────────────────────────────────────────
  filteredRows = computed(() => {
    const t = this.searchTerm().toLowerCase().trim();
    if (!t) return this.rows();
    return this.rows().filter(r => r.accountCode.includes(t) || r.accountName.toLowerCase().includes(t));
  });

  nonZeroRows  = computed(() => this.rows().filter(r => Math.abs(r.amount || 0) >= 0.01));
  totalDebit   = computed(() => this.round2(this.rows().filter(r => r.nature === 'deudora').reduce((s, r) => s + (r.amount || 0), 0)));
  totalCredit  = computed(() => this.round2(this.rows().filter(r => r.nature === 'acreedora').reduce((s, r) => s + (r.amount || 0), 0)));
  diferencia   = computed(() => this.round2(this.totalDebit() - this.totalCredit()));
  isBalanced   = computed(() => Math.abs(this.diferencia()) < 0.01);

  eligiblePeriods = computed(() => this.periods().filter(p => p.status === 'open' && !p.openingEntryId));

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => {
      this.periods.set(p);
      const firstEligible = p.find(x => x.status === 'open' && !x.openingEntryId);
      if (firstEligible) this.selectedPeriod.set(firstEligible.id);
    });

    this.accountsSvc.getActiveMovementAccounts().pipe(take(1)).subscribe(accs => {
      this.rows.set(
        [...accs]
          .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
          .map(a => ({ accountCode: a.code, accountName: a.name, type: a.type, nature: a.nature, amount: 0 }))
      );
      this.loading.set(false);
    });
  }

  // ── Editing ───────────────────────────────────────────────────────────────
  updateAmount(row: SaldoInicialRow, raw: string): void {
    const val = parseFloat(raw);
    row.amount = isNaN(val) ? 0 : val;
    this.rows.update(rs => [...rs]); // fuerza recomputo de los computed()
  }

  clearAll(): void {
    if (!confirm('¿Limpiar todos los montos ingresados?')) return;
    this.rows.update(rs => rs.map(r => ({ ...r, amount: 0 })));
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  // Genera un único asiento manual (type:'opening', igual que el asiento de
  // apertura automático entre ejercicios) con una línea por cuenta con saldo
  // ≠ 0. Reusa journalEntriesSvc.createEntry() directo — sin Cloud Function,
  // mismo patrón que saldos iniciales de cuentas bancarias (bank-accounts-page).
  // Al guardar, marca period.openingEntryId para que el asistente de apertura
  // automática entre ejercicios (generateOpeningEntry) no genere un segundo
  // asiento de apertura duplicado sobre el mismo período.
  async save(): Promise<void> {
    if (!this.selectedPeriod()) {
      this.notifications.warning('Seleccione el ejercicio contable de destino');
      return;
    }
    if (!this.nonZeroRows().length) {
      this.notifications.warning('Ingrese al menos un monto');
      return;
    }
    if (!this.isBalanced()) {
      this.notifications.error(`Los saldos no cuadran. Débitos: ${this.totalDebit().toFixed(2)}, Créditos: ${this.totalCredit().toFixed(2)}`);
      return;
    }
    if (!confirm(`¿Generar el asiento de saldos iniciales con ${this.nonZeroRows().length} cuentas? Esta acción queda contabilizada de inmediato.`)) return;

    this.saving.set(true);
    try {
      const period = this.periods().find(p => p.id === this.selectedPeriod());
      if (!period) throw new Error('Ejercicio no encontrado');

      const lines: JournalEntryLine[] = this.nonZeroRows().map(r => ({
        id:          crypto.randomUUID(),
        accountCode: r.accountCode,
        accountName: r.accountName,
        debit:       r.nature === 'deudora'   ? this.round2(r.amount) : 0,
        credit:      r.nature === 'acreedora' ? this.round2(r.amount) : 0,
        description: 'Saldo inicial'
      }));

      const entryId = await this.journalSvc.createEntry({
        date:        Timestamp.fromDate(new Date(this.entryDate() + 'T12:00:00')),
        description: 'Carga de Saldos Iniciales',
        periodId:    period.id,
        periodYear:  period.year,
        type:        'opening',
        status:      'draft',
        lines
      } as any);
      await this.journalSvc.postEntry(entryId);
      await this.periodsSvc.updatePeriod(period.id, { openingEntryId: entryId });

      this.notifications.success('Saldos iniciales cargados y asiento contabilizado');
      this.rows.update(rs => rs.map(r => ({ ...r, amount: 0 })));

      // Refresca períodos para que eligiblePeriods() descarte el que ya quedó cargado
      this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => this.periods.set(p));
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  private todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  round2(n: number): number { return Math.round(n * 100) / 100; }
  trackByCode(_: number, item: SaldoInicialRow): string { return item.accountCode; }
}
