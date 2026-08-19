import {
  Component, OnInit, OnDestroy, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, take } from 'rxjs';
import {
  CardModule, ButtonModule, SpinnerModule, FormModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { JournalEntriesService }     from '../../services/journal-entries.service';
import { AccountingPeriodsService }  from '../../services/accounting-periods.service';
import { NotificationService }       from '../../../../core/services/notification.service';
import { JournalEntry }              from '../../models/journal-entry.interface';
import { AccountingPeriod }          from '../../models/accounting-period.interface';
import { Form101Data }               from '../../models/sri-forms.interface';

@Component({
  selector: 'app-formulario101-page',
  standalone: true,
  templateUrl: './formulario101-page.component.html',
  styleUrl:    './formulario101-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, SpinnerModule, FormModule, AlertModule, IconModule
  ]
})
export class Formulario101PageComponent implements OnInit, OnDestroy {
  private svc         = inject(JournalEntriesService);
  private periodsSvc  = inject(AccountingPeriodsService);
  private notifications = inject(NotificationService);
  private destroy$    = new Subject<void>();

  // ── State ──────────────────────────────────────────────────────────────────
  periods        = signal<AccountingPeriod[]>([]);
  selectedPeriod = signal('');
  generating     = signal(false);
  generated      = signal(false);
  form101        = signal<Form101Data | null>(null);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => this.periods.set(p));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  async generate(): Promise<void> {
    this.generating.set(true);
    this.generated.set(false);
    this.form101.set(null);

    try {
      const periodId = this.selectedPeriod() || undefined;
      const year = periodId
        ? (this.periods().find(p => p.id === periodId)?.year ?? new Date().getFullYear())
        : new Date().getFullYear();

      const entriesObs = this.svc.getEntries({ year, status: 'posted', periodId });

      await new Promise<void>((resolve, reject) => {
        const sub = entriesObs.subscribe({
          next: (entries: JournalEntry[]) => {
            let c701 = 0, c7102 = 0, c7199 = 0, c879 = 0;

            for (const entry of entries) {
              for (const line of entry.lines) {
                const code = line.accountCode ?? '';
                const cr   = line.credit ?? 0;
                const db   = line.debit  ?? 0;

                // Ingresos (grupo 4): naturaleza acreedora — saldo = crédito - débito
                if (code.startsWith('4')) {
                  c701 += cr - db;
                }

                // Costo de ventas (5.1.x): naturaleza deudora — saldo = débito - crédito
                if (code.startsWith('5.1')) {
                  c7102 += db - cr;
                }

                // Gastos operacionales (5 pero no 5.1): naturaleza deudora
                if (code.startsWith('5') && !code.startsWith('5.1')) {
                  c7199 += db - cr;
                }

                // Retenciones en la fuente a favor: cuenta 1.1.05.003
                if (code === '1.1.05.003') {
                  c879 += db;
                }
              }
            }

            const r2 = (n: number) => Math.round(n * 100) / 100;

            // Ensure ingresos and costos are non-negative in the form context
            c701  = r2(Math.max(0, c701));
            c7102 = r2(Math.max(0, c7102));
            c7199 = r2(Math.max(0, c7199));
            c879  = r2(Math.max(0, c879));

            const c7999 = r2(c7102 + c7199);
            // c801 can be negative (pérdida)
            const c801Raw = r2(c701 - c7999);
            const c801    = c801Raw;
            const c839    = c801 > 0 ? r2(c801 * 0.22) : 0;
            const c899    = r2(Math.max(0, c839 - c879));
            const c903    = r2(Math.max(0, c879 - c839));

            this.form101.set({ c701, c7102, c7199, c7999, c801, c839, c879, c899, c903 });
            this.generated.set(true);
            sub.unsubscribe();
            resolve();
          },
          error: (err: any) => { sub.unsubscribe(); reject(err); }
        });
      });
    } catch (err: any) {
      this.notifications.error('Error generando Formulario 101: ' + (err?.message ?? err));
    } finally {
      this.generating.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  getPeriodName(): string {
    if (!this.selectedPeriod()) return 'Todos los períodos';
    return this.periods().find(p => p.id === this.selectedPeriod())?.name ?? '';
  }

  printReport(): void { window.print(); }
  fmt(n: number): string { return (n ?? 0).toFixed(2); }
}
