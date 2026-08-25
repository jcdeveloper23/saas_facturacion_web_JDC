import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, take } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, SpinnerModule, TableModule, FormModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { JournalEntriesService }    from '../../services/journal-entries.service';
import { AccountingPeriodsService } from '../../services/accounting-periods.service';
import { CostCentersService }       from '../../services/cost-centers.service';
import { AccountingPdfService }     from '../../services/accounting-pdf.service';
import { ExcelExportService }       from '../../services/excel-export.service';
import { TenantService }            from '../../../../core/services/tenant.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import { JournalEntry }             from '../../models/journal-entry.interface';
import { AccountingPeriod }         from '../../models/accounting-period.interface';
import { CostCenter }               from '../../models/cost-center.interface';

export interface EstadoResultadosLine {
  accountCode: string;
  accountName: string;
  netBalance:  number;   // crédito - débito para ingresos; débito - crédito para costos/gastos
}

export interface EstadoResultadosSection {
  label:    string;
  group:    '4' | '5';
  lines:    EstadoResultadosLine[];
  total:    number;
}

@Component({
  selector: 'app-estado-resultados-page',
  standalone: true,
  templateUrl: './estado-resultados-page.component.html',
  styleUrl:    './estado-resultados-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, SpinnerModule, TableModule, FormModule,
    IconModule
  ]
})
export class EstadoResultadosPageComponent implements OnInit, OnDestroy {
  private svc            = inject(JournalEntriesService);
  private periodsSvc     = inject(AccountingPeriodsService);
  private costCentersSvc = inject(CostCentersService);
  private pdfSvc         = inject(AccountingPdfService);
  private excelSvc       = inject(ExcelExportService);
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

  ingresos  = signal<EstadoResultadosLine[]>([]);
  costos    = signal<EstadoResultadosLine[]>([]);

  // ── Computed ──────────────────────────────────────────────────────────────
  totalIngresos = computed(() => this.ingresos().reduce((s, l) => s + l.netBalance, 0));
  totalCostos   = computed(() => this.costos().reduce((s, l) => s + l.netBalance, 0));
  utilidad      = computed(() => this.totalIngresos() - this.totalCostos());
  isGanancia    = computed(() => this.utilidad() >= 0);
  margenNeto    = computed(() => {
    const t = this.totalIngresos();
    return t === 0 ? 0 : Math.round((this.utilidad() / t) * 1000) / 10;
  });

  pctOfIngresos(amount: number): number {
    const t = this.totalIngresos();
    return t === 0 ? 0 : Math.round((amount / t) * 1000) / 10;
  }

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
    this.ingresos.set([]);
    this.costos.set([]);

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
            const mapIngresos = new Map<string, EstadoResultadosLine>();
            const mapCostos   = new Map<string, EstadoResultadosLine>();

            const costCenterFilter = this.selectedCostCenter();
            for (const entry of entries) {
              for (const line of entry.lines) {
                if (costCenterFilter && line.costCenterId !== costCenterFilter) continue;
                const code = line.accountCode ?? '';

                if (code.startsWith('4')) {
                  // Ingresos: naturaleza acreedora → saldo = crédito - débito
                  const existing = mapIngresos.get(code);
                  if (!existing) {
                    mapIngresos.set(code, {
                      accountCode: code,
                      accountName: line.accountName,
                      netBalance:  (line.credit ?? 0) - (line.debit ?? 0)
                    });
                  } else {
                    existing.netBalance += (line.credit ?? 0) - (line.debit ?? 0);
                  }
                } else if (code.startsWith('5')) {
                  // Costos y Gastos: naturaleza deudora → saldo = débito - crédito
                  const existing = mapCostos.get(code);
                  if (!existing) {
                    mapCostos.set(code, {
                      accountCode: code,
                      accountName: line.accountName,
                      netBalance:  (line.debit ?? 0) - (line.credit ?? 0)
                    });
                  } else {
                    existing.netBalance += (line.debit ?? 0) - (line.credit ?? 0);
                  }
                }
              }
            }

            const sortFn = (a: EstadoResultadosLine, b: EstadoResultadosLine) =>
              a.accountCode.localeCompare(b.accountCode);

            this.ingresos.set([...mapIngresos.values()].filter(l => l.netBalance !== 0).sort(sortFn));
            this.costos.set([...mapCostos.values()].filter(l => l.netBalance !== 0).sort(sortFn));
            this.searched.set(true);
            sub.unsubscribe();
            resolve();
          },
          error: reject
        });
      });
    } catch (err: any) {
      this.notifications.error('Error generando estado de resultados: ' + (err?.message ?? err));
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
        reportType: 'estado-resultados',
        companyId:  this.tenantSvc.companyId,
        periodName: this.getPeriodName(),
        data:       [],
        extraData: {
          ingresos:       this.ingresos(),
          costos:         this.costos(),
          totalIngresos:  this.totalIngresos(),
          totalCostos:    this.totalCostos(),
          utilidad:       this.utilidad()
        }
      });
    } catch (err: any) {
      this.notifications.error('Error generando PDF: ' + (err?.message ?? err));
    } finally {
      this.downloadingPdf.set(false);
    }
  }

  downloadExcel(): void {
    if (!this.searched()) return;
    const rows = [
      ...this.ingresos().map(l => ({ Sección: 'Ingresos', Código: l.accountCode, Cuenta: l.accountName, Monto: this.round2(l.netBalance) })),
      { Sección: '', Código: '', Cuenta: 'TOTAL INGRESOS', Monto: this.round2(this.totalIngresos()) },
      ...this.costos().map(l => ({ Sección: 'Costos y Gastos', Código: l.accountCode, Cuenta: l.accountName, Monto: this.round2(l.netBalance) })),
      { Sección: '', Código: '', Cuenta: 'TOTAL COSTOS Y GASTOS', Monto: this.round2(this.totalCostos()) },
      { Sección: '', Código: '', Cuenta: this.isGanancia() ? 'UTILIDAD DEL EJERCICIO' : 'PÉRDIDA DEL EJERCICIO', Monto: this.round2(this.utilidad()) }
    ];
    this.excelSvc.export(`estado-resultados-${this.getPeriodName().replace(/\s+/g, '_')}`, [{ name: 'Estado de Resultados', rows }]);
  }

  getPeriodName(): string {
    if (!this.selectedPeriod()) return 'Todos los períodos';
    return this.periods().find(p => p.id === this.selectedPeriod())?.name ?? '';
  }

  round2(n: number): number { return Math.round(n * 100) / 100; }
  trackByCode(_: number, item: EstadoResultadosLine): string { return item.accountCode; }
}
