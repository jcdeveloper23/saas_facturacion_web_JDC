import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil, take } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule, ModalModule, TooltipModule,
  AlertModule, InputGroupComponent, InputGroupTextDirective,
  CardHeaderComponent
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Timestamp } from '@angular/fire/firestore';

import { BankMovementModalComponent } from '../../components/bank-movement-modal/bank-movement-modal.component';
import { BankAccountsService }       from '../../services/bank-accounts.service';
import { BankReconciliationService }  from '../../services/bank-reconciliation.service';
import { JournalEntriesService }      from '../../services/journal-entries.service';
import { AccountingPeriodsService }   from '../../services/accounting-periods.service';
import { NotificationService }        from '../../../../core/services/notification.service';

import { BankAccount }                from '../../models/bank-account.interface';
import { BankStatement, BankTransaction, ParsedBankRow } from '../../models/bank-reconciliation.interface';
import { LibroMayorLine }             from '../../models/journal-entry.interface';
import { AccountingPeriod }           from '../../models/accounting-period.interface';

@Component({
  selector:    'app-bank-reconciliation-page',
  standalone:  true,
  templateUrl: './bank-reconciliation-page.component.html',
  styleUrl:    './bank-reconciliation-page.component.scss',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, ModalModule, TooltipModule, AlertModule, IconModule,
    InputGroupComponent, InputGroupTextDirective, CardHeaderComponent,
    BankMovementModalComponent
  ]
})
export class BankReconciliationPageComponent implements OnInit, OnDestroy {
  private bankAccountsSvc  = inject(BankAccountsService);
  private reconciliationSvc = inject(BankReconciliationService);
  private journalSvc       = inject(JournalEntriesService);
  private periodsSvc       = inject(AccountingPeriodsService);
  private notifications    = inject(NotificationService);

  private destroy$ = new Subject<void>();
  private txSub$   = new Subject<void>(); // reset when statement changes

  // ── State signals ─────────────────────────────────────────────────────────
  bankAccounts  = signal<BankAccount[]>([]);
  periods       = signal<AccountingPeriod[]>([]);
  statements    = signal<BankStatement[]>([]);
  transactions  = signal<BankTransaction[]>([]);
  glLines       = signal<LibroMayorLine[]>([]);

  selectedBankAccountId = signal('');
  selectedStatementId   = signal('');
  selectedPeriodId      = signal('');

  loadingAccounts   = signal(true);
  loadingStatements = signal(false);
  loadingGl         = signal(false);
  importing         = signal(false);
  saving            = signal(false);

  // Selection for matching
  selectedTxId      = signal<string | null>(null);
  selectedGlLineKey = signal<string | null>(null); // entryId

  // Sugerencias automáticas (Norma: sugerir + confirmar con un clic, nunca
  // vincular a ciegas — mismo criterio que usa Contifico). txId -> entryId.
  suggestedMatches  = signal<Map<string, string>>(new Map());
  suggesting        = signal(false);
  confirmingAll     = signal(false);

  // Manual bank movement modal
  showMovementModal = signal(false);

  // CSV import modal
  showImportModal        = signal(false);
  csvError               = signal('');
  parsedRows             = signal<ParsedBankRow[]>([]);
  importOpeningBalance   = signal(0);
  importPeriodFrom       = signal('');
  importPeriodTo         = signal('');

  // ── Computed ──────────────────────────────────────────────────────────────
  selectedBankAccount = computed(() =>
    this.bankAccounts().find(a => a.id === this.selectedBankAccountId()) ?? null
  );

  currentStatement = computed(() =>
    this.statements().find(s => s.id === this.selectedStatementId()) ?? null
  );

  unmatchedTxCount = computed(() =>
    this.transactions().filter(t => t.status === 'unmatched').length
  );

  matchedTxCount = computed(() =>
    this.transactions().filter(t => t.status === 'matched').length
  );

  glLinesWithStatus = computed(() => {
    const matchedEntryIds = new Set(
      this.transactions()
        .filter(t => t.matchedEntryId)
        .map(t => t.matchedEntryId!)
    );
    return this.glLines().map(l => ({
      ...l,
      isMatched: matchedEntryIds.has(l.entryId)
    }));
  });

  selectedTx = computed(() =>
    this.transactions().find(t => t.id === this.selectedTxId()) ?? null
  );

  selectedGlLine = computed(() => {
    const key = this.selectedGlLineKey();
    if (!key) return null;
    return this.glLines().find(l => l.entryId === key) ?? null;
  });

  canMatch = computed(() =>
    this.selectedTxId() !== null && this.selectedGlLineKey() !== null
  );

  glBalance = computed(() => {
    const lines = this.glLines();
    if (!lines.length) return 0;
    return Math.round(lines[lines.length - 1].balance * 100) / 100;
  });

  glDifference = computed(() => {
    const stmt = this.currentStatement();
    if (!stmt) return 0;
    return Math.round((stmt.closingBalance - this.glBalance()) * 100) / 100;
  });

  parsedPreviewRows = computed(() => this.parsedRows().slice(0, 5));

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.bankAccountsSvc.getBankAccounts().pipe(take(1)).subscribe(accounts => {
      this.bankAccounts.set(accounts.filter(a => a.isActive));
      this.loadingAccounts.set(false);
    });
    this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => this.periods.set(p));
  }

  ngOnDestroy(): void {
    this.txSub$.next();
    this.txSub$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Bank account change ───────────────────────────────────────────────────
  onBankAccountChange(accountId: string): void {
    this.selectedBankAccountId.set(accountId);
    this.selectedStatementId.set('');
    this.transactions.set([]);
    this.glLines.set([]);
    this.selectedTxId.set(null);
    this.selectedGlLineKey.set(null);

    if (!accountId) {
      this.statements.set([]);
      return;
    }

    this.loadingStatements.set(true);
    this.reconciliationSvc.getStatements(accountId).pipe(
      takeUntil(this.destroy$)
    ).subscribe(stmts => {
      this.statements.set(stmts);
      this.loadingStatements.set(false);
    });
  }

  // ── Statement change ──────────────────────────────────────────────────────
  onStatementChange(statementId: string): void {
    this.selectedStatementId.set(statementId);
    this.selectedTxId.set(null);
    this.selectedGlLineKey.set(null);
    this.transactions.set([]);

    // Cancel previous tx subscription
    this.txSub$.next();

    if (!statementId) return;

    // Live subscription for transactions (real-time match updates)
    this.reconciliationSvc.getTransactions(statementId).pipe(
      takeUntil(this.txSub$),
      takeUntil(this.destroy$)
    ).subscribe(txs => {
      this.transactions.set(txs);
    });
  }

  // ── Load GL lines ─────────────────────────────────────────────────────────
  async loadGlLines(): Promise<void> {
    const acc = this.selectedBankAccount();
    if (!acc) return;

    this.loadingGl.set(true);
    try {
      const periodId = this.selectedPeriodId() || undefined;
      const lines    = await this.journalSvc.getLibroMayor(acc.linkedGlCode, periodId);
      this.glLines.set(lines);
    } catch (err: any) {
      this.notifications.error('Error cargando libro mayor: ' + (err?.message ?? err));
    } finally {
      this.loadingGl.set(false);
    }
  }

  // ── CSV Import Modal ──────────────────────────────────────────────────────
  openImportModal(): void {
    this.csvError.set('');
    this.parsedRows.set([]);
    this.importOpeningBalance.set(0);
    this.importPeriodFrom.set('');
    this.importPeriodTo.set('');
    this.showImportModal.set(true);
  }

  closeImportModal(): void {
    this.showImportModal.set(false);
    this.csvError.set('');
    this.parsedRows.set([]);
  }

  handleFileUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    this.csvError.set('');
    this.parsedRows.set([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const rows = this.parseBankCsv(text);
        if (rows.length === 0) {
          this.csvError.set('No se encontraron transacciones válidas en el archivo.');
          return;
        }
        this.parsedRows.set(rows);
      } catch (err: any) {
        this.csvError.set('Error al procesar CSV: ' + (err?.message ?? 'Formato no reconocido'));
      }
    };
    reader.onerror = () => this.csvError.set('Error al leer el archivo');
    reader.readAsText(file, 'UTF-8');
  }

  private parseBankCsv(text: string): ParsedBankRow[] {
    // Normalize line endings
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length < 2) throw new Error('El archivo no tiene filas de datos');

    // Detect delimiter (comma or semicolon)
    const headerLine = lines[0];
    const delimiter  = headerLine.includes(';') ? ';' : ',';

    // Parse headers
    const headers = headerLine.split(delimiter).map(h =>
      h.trim().toLowerCase().replace(/["""]/g, '')
    );

    const colIdx = {
      date:        this.findColIndex(headers, ['fecha', 'date', 'fec']),
      description: this.findColIndex(headers, ['descripcion', 'description', 'detalle', 'concepto']),
      debit:       this.findColIndex(headers, ['debito', 'debit', 'retiro', 'cargo', 'egreso']),
      credit:      this.findColIndex(headers, ['credito', 'credit', 'deposito', 'abono', 'ingreso']),
      balance:     this.findColIndex(headers, ['saldo', 'balance']),
      reference:   this.findColIndex(headers, ['referencia', 'reference', 'voucher', 'doc'])
    };

    if (colIdx.date === -1 || colIdx.description === -1) {
      throw new Error('No se encontraron columnas de Fecha y/o Descripción en el CSV');
    }

    const rows: ParsedBankRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;

      const cells = raw.split(delimiter).map(c => c.trim().replace(/^[""]|[""]$/g, ''));

      const debit  = colIdx.debit  !== -1 ? this.parseAmount(cells[colIdx.debit])  : 0;
      const credit = colIdx.credit !== -1 ? this.parseAmount(cells[colIdx.credit]) : 0;
      if (debit === 0 && credit === 0) continue;

      const parsedDate = this.parseDate(cells[colIdx.date]);
      if (!parsedDate) continue;

      rows.push({
        date:        parsedDate,
        description: cells[colIdx.description] ?? '',
        reference:   colIdx.reference !== -1 ? (cells[colIdx.reference] ?? '') : '',
        debit,
        credit,
        balance:     colIdx.balance !== -1 ? this.parseAmount(cells[colIdx.balance]) : 0
      });
    }

    return rows;
  }

  private findColIndex(headers: string[], candidates: string[]): number {
    for (const candidate of candidates) {
      const idx = headers.findIndex(h => h.includes(candidate));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  private parseAmount(raw: string): number {
    if (!raw) return 0;
    const cleaned = raw.replace(/[$\s]/g, '').replace(/,/g, '');
    const value   = parseFloat(cleaned);
    return isNaN(value) ? 0 : Math.round(value * 100) / 100;
  }

  private parseDate(raw: string): Date | null {
    if (!raw) return null;
    const s = raw.trim();

    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(s + 'T00:00:00');
      return isNaN(d.getTime()) ? null : d;
    }

    // Try DD/MM/YYYY
    const ddMmYyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddMmYyyy) {
      const d = new Date(+ddMmYyyy[3], +ddMmYyyy[2] - 1, +ddMmYyyy[1]);
      return isNaN(d.getTime()) ? null : d;
    }

    // Try MM/DD/YYYY
    const mmDdYyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (mmDdYyyy) {
      const year = mmDdYyyy[3].length === 2 ? 2000 + +mmDdYyyy[3] : +mmDdYyyy[3];
      const d    = new Date(year, +mmDdYyyy[1] - 1, +mmDdYyyy[2]);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  // ── Save import ───────────────────────────────────────────────────────────
  async saveImport(): Promise<void> {
    const rows = this.parsedRows();
    if (rows.length === 0 || this.importing()) return;

    const acc = this.selectedBankAccount();
    if (!acc) return;

    const periodFrom = this.importPeriodFrom();
    const periodTo   = this.importPeriodTo();
    if (!periodFrom || !periodTo) {
      this.notifications.error('Ingrese el período del estado de cuenta');
      return;
    }

    this.importing.set(true);
    try {
      const totalCredits = rows.reduce((s, r) => s + r.credit, 0);
      const totalDebits  = rows.reduce((s, r) => s + r.debit,  0);
      const opening      = this.importOpeningBalance();
      const closing      = Math.round((opening + totalCredits - totalDebits) * 100) / 100;

      const input: Omit<BankStatement, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
        bankAccountId:    acc.id,
        bankAccountName:  `${acc.bankName} — ${acc.accountNumber}`,
        linkedGlCode:     acc.linkedGlCode,
        periodFrom:       Timestamp.fromDate(new Date(periodFrom + 'T00:00:00')),
        periodTo:         Timestamp.fromDate(new Date(periodTo   + 'T00:00:00')),
        openingBalance:   opening,
        closingBalance:   closing,
        totalCredits:     Math.round(totalCredits * 100) / 100,
        totalDebits:      Math.round(totalDebits  * 100) / 100,
        transactionCount: rows.length,
        reconciledCount:  0,
        difference:       0,
        status:           'draft'
      };

      const statementId = await this.reconciliationSvc.createStatement(input, rows);

      this.closeImportModal();
      this.onStatementChange(statementId);
      this.selectedStatementId.set(statementId);
      this.notifications.success(`${rows.length} transacciones importadas correctamente`);
    } catch (err: any) {
      this.notifications.error('Error al importar: ' + (err?.message ?? err));
    } finally {
      this.importing.set(false);
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  selectTransaction(tx: BankTransaction): void {
    if (tx.status !== 'unmatched') return;
    this.selectedTxId.update(prev => prev === tx.id ? null : tx.id);
  }

  selectGlLine(line: LibroMayorLine & { isMatched: boolean }): void {
    if (line.isMatched) return;
    this.selectedGlLineKey.update(prev => prev === line.entryId ? null : line.entryId);
  }

  // ── Match ─────────────────────────────────────────────────────────────────
  async matchSelected(): Promise<void> {
    const tx      = this.selectedTx();
    const glLine  = this.selectedGlLine();
    const stmtId  = this.selectedStatementId();
    if (!tx || !glLine || !stmtId) return;

    try {
      await this.reconciliationSvc.matchTransaction(
        stmtId,
        tx.id,
        glLine.entryId,
        glLine.entryId, // using entryId as lineId (no distinct lineId on LibroMayorLine)
        glLine.description
      );
      this.selectedTxId.set(null);
      this.selectedGlLineKey.set(null);
      this.notifications.success('Transacción vinculada correctamente');
    } catch (err: any) {
      this.notifications.error('Error al vincular: ' + (err?.message ?? err));
    }
  }

  // ── Sugerencia automática de coincidencias ───────────────────────────────
  //
  // No vincula nada por sí sola — solo pre-selecciona pares candidatos por
  // monto exacto + fecha cercana (±5 días) para que el usuario confirme con
  // un clic en vez de buscar manualmente en dos listas largas. Si el mismo
  // monto aparece más de una vez dentro de la ventana, se deja ambiguo (sin
  // sugerir) para evitar vincular mal un movimiento financiero.
  private static readonly MATCH_DATE_WINDOW_DAYS = 5;
  private static readonly MATCH_AMOUNT_EPSILON = 0.01;

  suggestMatches(): void {
    this.suggesting.set(true);
    try {
      const unmatchedTxs = this.transactions().filter(t => t.status === 'unmatched');
      const unmatchedGl  = this.glLinesWithStatus().filter(l => !l.isMatched);

      const claimedGlEntryIds = new Set<string>();
      const suggestions = new Map<string, string>();

      for (const tx of unmatchedTxs) {
        // BankTransaction: debit = salida de dinero, credit = entrada.
        // LibroMayorLine (cuenta de banco, activo): debit = entrada, credit = salida.
        // Por eso el campo se invierte al comparar.
        const isDeposit = tx.credit > 0;
        const amount    = isDeposit ? tx.credit : tx.debit;
        if (amount <= 0) continue;

        const txDate = tx.date.toDate().getTime();
        const dayMs  = 24 * 60 * 60 * 1000;

        const candidates = unmatchedGl.filter(l => {
          if (claimedGlEntryIds.has(l.entryId)) return false;
          const glAmount = isDeposit ? l.debit : l.credit;
          if (Math.abs(glAmount - amount) > BankReconciliationPageComponent.MATCH_AMOUNT_EPSILON) return false;
          const glDate = l.date.toDate().getTime();
          const diffDays = Math.abs(glDate - txDate) / dayMs;
          return diffDays <= BankReconciliationPageComponent.MATCH_DATE_WINDOW_DAYS;
        });

        if (candidates.length === 1) {
          suggestions.set(tx.id, candidates[0].entryId);
          claimedGlEntryIds.add(candidates[0].entryId);
        }
      }

      this.suggestedMatches.set(suggestions);
      if (suggestions.size === 0) {
        this.notifications.info('No se encontraron coincidencias sugeribles (por monto exacto y fecha cercana).');
      } else {
        this.notifications.success(`${suggestions.size} coincidencia(s) sugerida(s) — revisa y confirma.`);
      }
    } finally {
      this.suggesting.set(false);
    }
  }

  suggestionForTx(txId: string): LibroMayorLine | null {
    const entryId = this.suggestedMatches().get(txId);
    if (!entryId) return null;
    return this.glLines().find(l => l.entryId === entryId) ?? null;
  }

  async confirmSuggestion(tx: BankTransaction): Promise<void> {
    const entryId = this.suggestedMatches().get(tx.id);
    const stmtId  = this.selectedStatementId();
    if (!entryId || !stmtId) return;
    const glLine = this.glLines().find(l => l.entryId === entryId);
    if (!glLine) return;

    try {
      await this.reconciliationSvc.matchTransaction(stmtId, tx.id, entryId, entryId, glLine.description);
      this.suggestedMatches.update(m => { const next = new Map(m); next.delete(tx.id); return next; });
      this.notifications.success('Transacción vinculada correctamente');
    } catch (err: any) {
      this.notifications.error('Error al vincular: ' + (err?.message ?? err));
    }
  }

  dismissSuggestion(txId: string): void {
    this.suggestedMatches.update(m => { const next = new Map(m); next.delete(txId); return next; });
  }

  async confirmAllSuggestions(): Promise<void> {
    const stmtId = this.selectedStatementId();
    if (!stmtId) return;
    const entries = [...this.suggestedMatches().entries()];
    if (!entries.length) return;

    this.confirmingAll.set(true);
    let ok = 0;
    try {
      for (const [txId, entryId] of entries) {
        const glLine = this.glLines().find(l => l.entryId === entryId);
        if (!glLine) continue;
        try {
          await this.reconciliationSvc.matchTransaction(stmtId, txId, entryId, entryId, glLine.description);
          ok++;
        } catch {
          // sigue con las demás — se reporta el conteo final
        }
      }
      this.suggestedMatches.set(new Map());
      this.notifications.success(`${ok} de ${entries.length} coincidencia(s) confirmada(s)`);
    } finally {
      this.confirmingAll.set(false);
    }
  }

  // ── Unmatch ───────────────────────────────────────────────────────────────
  async unmatch(tx: BankTransaction, event: Event): Promise<void> {
    event.stopPropagation();
    const stmtId = this.selectedStatementId();
    if (!stmtId) return;

    try {
      await this.reconciliationSvc.unmatchTransaction(stmtId, tx.id, tx.status === 'matched');
      this.notifications.success('Vinculación eliminada');
    } catch (err: any) {
      this.notifications.error('Error al desvincular: ' + (err?.message ?? err));
    }
  }

  // ── Ignore ────────────────────────────────────────────────────────────────
  async ignore(tx: BankTransaction, event: Event): Promise<void> {
    event.stopPropagation();
    const stmtId = this.selectedStatementId();
    if (!stmtId) return;

    try {
      await this.reconciliationSvc.ignoreTransaction(stmtId, tx.id);
      this.notifications.success('Transacción ignorada');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  // ── Mark reconciled ───────────────────────────────────────────────────────
  async markReconciled(): Promise<void> {
    const stmtId = this.selectedStatementId();
    if (!stmtId) return;

    if (!confirm('¿Marcar este estado de cuenta como conciliado? Esta acción no se puede deshacer fácilmente.')) return;

    try {
      await this.reconciliationSvc.markReconciled(stmtId);
      this.notifications.success('Estado de cuenta marcado como conciliado');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  // ── Delete statement ──────────────────────────────────────────────────────
  async deleteStatement(): Promise<void> {
    const stmtId = this.selectedStatementId();
    if (!stmtId) return;

    if (!confirm('¿Eliminar este estado de cuenta y todas sus transacciones? Esta acción no se puede deshacer.')) return;

    try {
      await this.reconciliationSvc.deleteStatement(stmtId);
      this.selectedStatementId.set('');
      this.transactions.set([]);
      this.notifications.success('Estado de cuenta eliminado');
    } catch (err: any) {
      this.notifications.error('Error al eliminar: ' + (err?.message ?? err));
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  formatDate(ts: Timestamp | undefined): string {
    if (!ts) return '—';
    const d = ts.toDate();
    return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
  trackByEntryId(_: number, item: LibroMayorLine): string { return item.entryId; }
}
