import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, take } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { JournalEntriesService }    from '../../services/journal-entries.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { CostCentersService }       from '../../services/cost-centers.service';
import { AccountingPdfService }     from '../../services/accounting-pdf.service';
import { TenantService }            from '../../../../core/services/tenant.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import { JournalEntry }             from '../../models/journal-entry.interface';
import { AccountingPeriod }         from '../../models/accounting-period.interface';
import { CostCenter }               from '../../models/cost-center.interface';

export interface BalanceGeneralLine {
  accountCode: string;
  accountName: string;
  netBalance:  number;
}

export interface BalanceGeneralSection {
  key:    'activo_corriente' | 'activo_no_corriente' | 'pasivo_corriente' | 'pasivo_no_corriente' | 'patrimonio';
  label:  string;
  lines:  BalanceGeneralLine[];
  total:  number;
}

@Component({
  selector: 'app-balance-general-page',
  standalone: true,
  templateUrl: './balance-general-page.component.html',
  styleUrl:    './balance-general-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, IconModule
  ]
})
export class BalanceGeneralPageComponent implements OnInit, OnDestroy {
  private svc            = inject(JournalEntriesService);
  private periodsSvc     = inject(AccountingPeriodsService);
  private costCentersSvc = inject(CostCentersService);
  private pdfSvc         = inject(AccountingPdfService);
  private tenantSvc      = inject(TenantService);
  private notifications  = inject(NotificationService);
  private destroy$       = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  downloadingPdf     = signal(false);
  periods            = signal<AccountingPeriod[]>([]);
  costCenters        = signal<CostCenter[]>([]);
  selectedPeriod     = signal('');
  selectedCostCenter = signal('');
  searching          = signal(false);
  searched           = signal(false);

  activoCorriente    = signal<BalanceGeneralLine[]>([]);
  activoNoCorriente  = signal<BalanceGeneralLine[]>([]);
  pasivoCorriente    = signal<BalanceGeneralLine[]>([]);
  pasivoNoCorriente  = signal<BalanceGeneralLine[]>([]);
  patrimonio         = signal<BalanceGeneralLine[]>([]);

  // ── Computed ──────────────────────────────────────────────────────────────
  totalActivoCorriente   = computed(() => this.activoCorriente().reduce((s, l) => s + l.netBalance, 0));
  totalActivoNoCorriente = computed(() => this.activoNoCorriente().reduce((s, l) => s + l.netBalance, 0));
  totalPasivoCorriente   = computed(() => this.pasivoCorriente().reduce((s, l) => s + l.netBalance, 0));
  totalPasivoNoCorriente = computed(() => this.pasivoNoCorriente().reduce((s, l) => s + l.netBalance, 0));
  totalPatrimonio        = computed(() => this.patrimonio().reduce((s, l) => s + l.netBalance, 0));

  totalActivos   = computed(() => this.totalActivoCorriente() + this.totalActivoNoCorriente());
  totalPasivos   = computed(() => this.totalPasivoCorriente() + this.totalPasivoNoCorriente());
  totalPasivoPatrimonio = computed(() => this.totalPasivos() + this.totalPatrimonio());

  diferencia  = computed(() => Math.abs(this.totalActivos() - this.totalPasivoPatrimonio()));
  isCuadrado  = computed(() => this.diferencia() < 0.01);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => this.periods.set(p));
    this.costCentersSvc.getCostCenters().pipe(take(1)).subscribe(cc =>
      this.costCenters.set(cc.filter(c => c.isActive))
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Generate ──────────────────────────────────────────────────────────────

  async generate(): Promise<void> {
    this.searching.set(true);
    this.activoCorriente.set([]);
    this.activoNoCorriente.set([]);
    this.pasivoCorriente.set([]);
    this.pasivoNoCorriente.set([]);
    this.patrimonio.set([]);

    try {
      const year = this.selectedPeriod()
        ? this.periods().find(p => p.id === this.selectedPeriod())?.year ?? new Date().getFullYear()
        : new Date().getFullYear();

      const entriesObs = this.svc.getEntries({
        year,
        status:   'posted',
        periodId: this.selectedPeriod() || undefined
      });

      await new Promise<void>((resolve, reject) => {
        const sub = entriesObs.subscribe({
          next: (entries: JournalEntry[]) => {
            const maps: Record<string, Map<string, BalanceGeneralLine>> = {
              activoCorriente:   new Map(),
              activoNoCorriente: new Map(),
              pasivoCorriente:   new Map(),
              pasivoNoCorriente: new Map(),
              patrimonio:        new Map()
            };

            const costCenterFilter = this.selectedCostCenter();
            for (const entry of entries) {
              for (const line of entry.lines) {
                if (costCenterFilter && line.costCenterId !== costCenterFilter) continue;
                const code = line.accountCode ?? '';
                // Activos (grupo 1): naturaleza deudora → saldo = débito - crédito
                // Pasivos (grupo 2) y Patrimonio (grupo 3): naturaleza acreedora → saldo = crédito - débito
                let mapKey: string | null = null;
                let netDelta = 0;

                if (code.startsWith('1.1')) {
                  mapKey   = 'activoCorriente';
                  netDelta = (line.debit ?? 0) - (line.credit ?? 0);
                } else if (code.startsWith('1.2')) {
                  mapKey   = 'activoNoCorriente';
                  netDelta = (line.debit ?? 0) - (line.credit ?? 0);
                } else if (code.startsWith('1')) {
                  // otros activos → corriente por defecto
                  mapKey   = 'activoCorriente';
                  netDelta = (line.debit ?? 0) - (line.credit ?? 0);
                } else if (code.startsWith('2.1')) {
                  mapKey   = 'pasivoCorriente';
                  netDelta = (line.credit ?? 0) - (line.debit ?? 0);
                } else if (code.startsWith('2.2') || code.startsWith('2.3')) {
                  mapKey   = 'pasivoNoCorriente';
                  netDelta = (line.credit ?? 0) - (line.debit ?? 0);
                } else if (code.startsWith('2')) {
                  mapKey   = 'pasivoCorriente';
                  netDelta = (line.credit ?? 0) - (line.debit ?? 0);
                } else if (code.startsWith('3')) {
                  mapKey   = 'patrimonio';
                  netDelta = (line.credit ?? 0) - (line.debit ?? 0);
                }

                if (!mapKey) continue;

                const map      = maps[mapKey];
                const existing = map.get(code);
                if (!existing) {
                  map.set(code, { accountCode: code, accountName: line.accountName, netBalance: netDelta });
                } else {
                  existing.netBalance += netDelta;
                }
              }
            }

            const sortFn = (a: BalanceGeneralLine, b: BalanceGeneralLine) =>
              a.accountCode.localeCompare(b.accountCode);
            const nonZero = (l: BalanceGeneralLine) => Math.abs(l.netBalance) >= 0.01;

            this.activoCorriente.set([...maps['activoCorriente'].values()].filter(nonZero).sort(sortFn));
            this.activoNoCorriente.set([...maps['activoNoCorriente'].values()].filter(nonZero).sort(sortFn));
            this.pasivoCorriente.set([...maps['pasivoCorriente'].values()].filter(nonZero).sort(sortFn));
            this.pasivoNoCorriente.set([...maps['pasivoNoCorriente'].values()].filter(nonZero).sort(sortFn));
            this.patrimonio.set([...maps['patrimonio'].values()].filter(nonZero).sort(sortFn));

            this.searched.set(true);
            sub.unsubscribe();
            resolve();
          },
          error: reject
        });
      });
    } catch (err: any) {
      this.notifications.error('Error generando balance general: ' + (err?.message ?? err));
    } finally {
      this.searching.set(false);
    }
  }

  printReport(): void { window.print(); }

  async downloadPdf(): Promise<void> {
    if (!this.searched()) return;
    this.downloadingPdf.set(true);
    try {
      await this.pdfSvc.downloadPdf({
        reportType: 'balance-general',
        companyId:  this.tenantSvc.companyId,
        periodName: this.getPeriodName(),
        data:       [],
        extraData: {
          activoCorriente:       this.activoCorriente(),
          activoNoCorriente:     this.activoNoCorriente(),
          pasivoCorriente:       this.pasivoCorriente(),
          pasivoNoCorriente:     this.pasivoNoCorriente(),
          patrimonio:            this.patrimonio(),
          totalActivoCorriente:  this.totalActivoCorriente(),
          totalActivoNoCorriente:this.totalActivoNoCorriente(),
          totalPasivoCorriente:  this.totalPasivoCorriente(),
          totalPasivoNoCorriente:this.totalPasivoNoCorriente(),
          totalPatrimonio:       this.totalPatrimonio(),
          totalActivos:          this.totalActivos(),
          totalPasivoPatrimonio: this.totalPasivoPatrimonio()
        }
      });
    } catch (err: any) {
      this.notifications.error('Error generando PDF: ' + (err?.message ?? err));
    } finally {
      this.downloadingPdf.set(false);
    }
  }

  getPeriodName(): string {
    if (!this.selectedPeriod()) return 'Todos los períodos';
    return this.periods().find(p => p.id === this.selectedPeriod())?.name ?? '';
  }

  round2(n: number): number { return Math.round(n * 100) / 100; }
  trackByCode(_: number, item: BalanceGeneralLine): string { return item.accountCode; }
}
