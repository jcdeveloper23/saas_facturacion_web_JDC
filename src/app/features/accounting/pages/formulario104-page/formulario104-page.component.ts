import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, take } from 'rxjs';
import {
  CardModule, ButtonModule, SpinnerModule, FormModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { JournalEntriesService }     from '../../services/journal-entries.service';
import { AccountingSettingsService } from '../../services/accounting-settings.service';
import { NotificationService }       from '../../../../core/services/notification.service';
import { JournalEntry }              from '../../models/journal-entry.interface';
import { AccountMapping, DEFAULT_ACCOUNT_MAPPING } from '../../models/accounting-settings.interface';
import { Form104Data }               from '../../models/sri-forms.interface';

@Component({
  selector: 'app-formulario104-page',
  standalone: true,
  templateUrl: './formulario104-page.component.html',
  styleUrl:    './formulario104-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, SpinnerModule, FormModule, AlertModule, IconModule
  ]
})
export class Formulario104PageComponent implements OnInit, OnDestroy {
  private svc           = inject(JournalEntriesService);
  private settingsSvc   = inject(AccountingSettingsService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── Selectors ─────────────────────────────────────────────────────────────
  readonly currentYear = new Date().getFullYear();
  readonly years       = Array.from({ length: 4 }, (_, i) => this.currentYear - i);
  readonly months      = [
    { value: 1,  label: 'Enero' },      { value: 2,  label: 'Febrero' },
    { value: 3,  label: 'Marzo' },      { value: 4,  label: 'Abril' },
    { value: 5,  label: 'Mayo' },       { value: 6,  label: 'Junio' },
    { value: 7,  label: 'Julio' },      { value: 8,  label: 'Agosto' },
    { value: 9,  label: 'Septiembre' }, { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },  { value: 12, label: 'Diciembre' }
  ];

  // ── State ──────────────────────────────────────────────────────────────────
  selectedYear  = signal(this.currentYear);
  selectedMonth = signal(new Date().getMonth() + 1);
  generating    = signal(false);
  generated     = signal(false);
  form104       = signal<Form104Data | null>(null);

  private accountMapping: AccountMapping = DEFAULT_ACCOUNT_MAPPING;

  // ── Computed ──────────────────────────────────────────────────────────────
  selectedMonthLabel = computed(() =>
    this.months.find(m => m.value === this.selectedMonth())?.label ?? ''
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.settingsSvc.getSettings().pipe(take(1)).subscribe(s => {
      this.accountMapping = s.accountMapping ?? DEFAULT_ACCOUNT_MAPPING;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  async generate(): Promise<void> {
    this.generating.set(true);
    this.generated.set(false);
    this.form104.set(null);

    try {
      const year  = this.selectedYear();
      const month = this.selectedMonth();
      const am    = this.accountMapping;

      const entriesObs = this.svc.getEntries({ year, status: 'posted' });

      await new Promise<void>((resolve, reject) => {
        const sub = entriesObs.subscribe({
          next: (entries: JournalEntry[]) => {
            // Filter client-side by month
            const monthly = entries.filter(e => {
              const d = e.date?.toDate ? e.date.toDate() : new Date(e.date as any);
              return d.getFullYear() === year && d.getMonth() + 1 === month;
            });

            let c401 = 0, c403 = 0, c404 = 0, c411 = 0, c500 = 0;

            for (const entry of monthly) {
              for (const line of entry.lines) {
                const code = line.accountCode ?? '';
                const cr   = line.credit ?? 0;
                const db   = line.debit  ?? 0;

                if (code === am.sales15)      c401 += cr;
                if (code === am.salesExempt)  c403 += cr;
                if (code === am.sales0)       c404 += cr;
                if (code === am.ivaCollected) c411 += cr;
                // IVA pagado en compras: cuenta 1.1.05.x excepto crédito tributario IR
                if (code.startsWith('1.1.05') && code !== '1.1.05.003') c500 += db;
              }
            }

            const r2 = (n: number) => Math.round(n * 100) / 100;
            c401 = r2(c401); c403 = r2(c403); c404 = r2(c404);
            c411 = r2(c411); c500 = r2(c500);

            const c408 = r2(c401 + c403 + c404);
            const c601 = c411;
            const c602 = r2(Math.min(c500, c601));
            const c609 = r2(Math.max(0, c601 - c602));
            const c699 = r2(Math.max(0, c602 - c601));

            this.form104.set({ c401, c403, c404, c408, c411, c500, c601, c602, c609, c699 });
            this.generated.set(true);
            sub.unsubscribe();
            resolve();
          },
          error: (err: any) => { sub.unsubscribe(); reject(err); }
        });
      });
    } catch (err: any) {
      this.notifications.error('Error generando Formulario 104: ' + (err?.message ?? err));
    } finally {
      this.generating.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  printReport(): void { window.print(); }
  fmt(n: number): string { return (n ?? 0).toFixed(2); }
}
