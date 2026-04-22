import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormArray, FormGroup } from '@angular/forms';
import { Subject, takeUntil, of } from 'rxjs';
import { catchError, take } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule, TooltipModule, TableModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Timestamp } from '@angular/fire/firestore';

import { JournalEntriesService }    from '../../services/journal-entries.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { ChartOfAccountsService }   from '../../services/chart-of-accounts.service';
import { CostCentersService }       from '../../services/cost-centers.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import {
  JournalEntry, JournalEntryLine, JournalEntryType,
  JOURNAL_ENTRY_TYPE_LABELS, calcEntryTotals
} from '../../models/journal-entry.interface';
import { AccountingPeriod } from '../../models/accounting-period.interface';
import { Account } from '../../models/account.interface';
import { CostCenter } from '../../models/cost-center.interface';

@Component({
  selector: 'app-journal-entry-form-page',
  standalone: true,
  templateUrl: './journal-entry-form-page.component.html',
  styleUrl:    './journal-entry-form-page.component.scss',
  imports: [
    CommonModule, RouterLink, FormsModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    FormModule, TooltipModule, TableModule, IconModule
  ]
})
export class JournalEntryFormPageComponent implements OnInit, OnDestroy {
  private svc           = inject(JournalEntriesService);
  private periodsSvc    = inject(AccountingPeriodsService);
  private accountsSvc   = inject(ChartOfAccountsService);
  private costCtrSvc    = inject(CostCentersService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private route         = inject(ActivatedRoute);
  private fb            = inject(FormBuilder);
  private destroy$      = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  entryId    = signal<string | null>(null);
  loading    = signal(true);
  saving     = signal(false);
  periods    = signal<AccountingPeriod[]>([]);
  accounts   = signal<Account[]>([]);
  costCenters= signal<CostCenter[]>([]);

  // Account typeahead per line
  accountSearch = signal<Record<number, string>>({});

  readonly TYPE_LABELS   = JOURNAL_ENTRY_TYPE_LABELS;
  readonly entryTypes: JournalEntryType[] = ['manual','adjustment'];

  // ── Form ──────────────────────────────────────────────────────────────────
  form = this.fb.group({
    date:        [this.todayStr(), Validators.required],
    description: ['', [Validators.required, Validators.minLength(3)]],
    periodId:    ['', Validators.required],
    type:        ['manual' as JournalEntryType, Validators.required],
    reference:   [''],
    lines:       this.fb.array([])
  });

  get linesArray(): FormArray { return this.form.get('lines') as FormArray; }

  // ── Computed totals ───────────────────────────────────────────────────────
  totals = computed(() => {
    const lines: JournalEntryLine[] = this.linesArray.controls.map((g: any) => ({
      id:          g.value.id ?? crypto.randomUUID(),
      accountCode: g.value.accountCode ?? '',
      accountName: g.value.accountName ?? '',
      debit:       parseFloat(g.value.debit)  || 0,
      credit:      parseFloat(g.value.credit) || 0,
      costCenterId:   g.value.costCenterId ?? null,
      costCenterName: g.value.costCenterName ?? null,
      description: g.value.description ?? ''
    }));
    return calcEntryTotals(lines);
  });

  // Needed to trigger recomputation when form changes
  linesVersion = signal(0);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.entryId.set(id);

    // Load supporting data
    this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => {
      this.periods.set(p.filter(x => x.status === 'open'));
    });
    this.accountsSvc.getActiveMovementAccounts().pipe(take(1)).subscribe(a => this.accounts.set(a));
    this.costCtrSvc.getCostCenters().pipe(take(1)).subscribe(c => this.costCenters.set(c.filter(x => x.isActive)));

    if (id) {
      this.svc.getEntry(id).pipe(take(1), catchError(() => of(null))).subscribe(entry => {
        if (entry) this.patchForm(entry);
        else this.addEmptyLines(2);
        this.loading.set(false);
      });
    } else {
      this.addEmptyLines(2);
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Form helpers ──────────────────────────────────────────────────────────
  private todayStr(): string {
    return new Date().toISOString().substring(0, 10);
  }

  private patchForm(entry: JournalEntry): void {
    const dateStr = entry.date?.toDate ? entry.date.toDate().toISOString().substring(0, 10) : '';
    this.form.patchValue({
      date:        dateStr,
      description: entry.description,
      periodId:    entry.periodId,
      type:        entry.type,
      reference:   entry.reference ?? ''
    });
    this.linesArray.clear();
    for (const line of entry.lines) {
      this.linesArray.push(this.makeLineGroup(line));
    }
    this.linesVersion.update(v => v + 1);
  }

  private makeLineGroup(line?: Partial<JournalEntryLine>): FormGroup {
    return this.fb.group({
      id:            [line?.id ?? crypto.randomUUID()],
      accountCode:   [line?.accountCode ?? '', Validators.required],
      accountName:   [line?.accountName ?? ''],
      debit:         [line?.debit ?? 0],
      credit:        [line?.credit ?? 0],
      costCenterId:  [line?.costCenterId ?? null],
      costCenterName:[line?.costCenterName ?? null],
      description:   [line?.description ?? '']
    });
  }

  addLine(): void {
    this.linesArray.push(this.makeLineGroup());
    this.linesVersion.update(v => v + 1);
  }

  removeLine(i: number): void {
    if (this.linesArray.length <= 2) { this.notifications.warning('Mínimo 2 líneas'); return; }
    this.linesArray.removeAt(i);
    this.linesVersion.update(v => v + 1);
  }

  // ── Account selection ─────────────────────────────────────────────────────
  onAccountSelect(index: number, event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    const acc  = this.accounts().find(a => a.code === code);
    if (acc) {
      const group = this.linesArray.at(index) as FormGroup;
      group.patchValue({ accountCode: acc.code, accountName: acc.name });
      this.linesVersion.update(v => v + 1);
    }
  }

  onCostCenterSelect(index: number, event: Event): void {
    const id  = (event.target as HTMLSelectElement).value;
    const cc  = this.costCenters().find(c => c.id === id);
    const group = this.linesArray.at(index) as FormGroup;
    group.patchValue({
      costCenterId:   cc?.id   ?? null,
      costCenterName: cc?.name ?? null
    });
    this.linesVersion.update(v => v + 1);
  }

  onAmountChange(): void {
    this.linesVersion.update(v => v + 1);
  }

  // Add blank lines to quickly populate a balanced entry
  addEmptyLines(n: number): void {
    for (let i = 0; i < n; i++) this.linesArray.push(this.makeLineGroup());
    this.linesVersion.update(v => v + 1);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async save(postImmediately = false): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const v = this.form.value;
    const lines: JournalEntryLine[] = (v.lines as any[]).map(l => ({
      id:            l.id ?? crypto.randomUUID(),
      accountCode:   l.accountCode,
      accountName:   l.accountName,
      debit:         parseFloat(l.debit)  || 0,
      credit:        parseFloat(l.credit) || 0,
      costCenterId:  l.costCenterId  || null,
      costCenterName:l.costCenterName || null,
      description:   l.description   || ''
    }));

    const t = calcEntryTotals(lines);
    if (!t.isBalanced) {
      this.notifications.error(`Asiento descuadrado. Débitos: ${t.totalDebit.toFixed(2)}, Créditos: ${t.totalCredit.toFixed(2)}`);
      this.saving.set(false);
      return;
    }

    const periodYear = this.periods().find(p => p.id === v.periodId)?.year ?? new Date().getFullYear();
    const dateTs     = Timestamp.fromDate(new Date(v.date! + 'T12:00:00'));
    const status     = postImmediately ? 'posted' : 'draft';

    try {
      const input = {
        date:        dateTs,
        description: v.description!.trim(),
        periodId:    v.periodId!,
        periodYear,
        type:        v.type! as JournalEntryType,
        status,
        reference:   v.reference?.trim() || undefined,
        lines
      };

      const id = this.entryId();
      if (id) {
        await this.svc.updateEntry(id, input as any);
        this.notifications.success(postImmediately ? 'Asiento contabilizado' : 'Asiento actualizado');
      } else {
        await this.svc.createEntry(input as any);
        this.notifications.success(postImmediately ? 'Asiento creado y contabilizado' : 'Asiento guardado como borrador');
      }
      this.router.navigate(['/accounting/journal-entries']);
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    this.router.navigate(['/accounting/journal-entries']);
  }

  // Helpers
  getLineGroup(i: number): FormGroup { return this.linesArray.at(i) as FormGroup; }

  filteredAccounts(search: string): Account[] {
    if (!search) return this.accounts();
    const t = search.toLowerCase();
    return this.accounts().filter(a => a.code.includes(t) || a.name.toLowerCase().includes(t)).slice(0, 50);
  }

  get isEdit(): boolean { return !!this.entryId(); }

  get pageTitle(): string {
    return this.isEdit ? 'Editar Asiento Contable' : 'Nuevo Asiento Contable';
  }
}
