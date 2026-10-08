import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, take, firstValueFrom } from 'rxjs';
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
import { ChartOfAccountsService }   from '../../services/chart-of-accounts.service';
import { AccountingPeriod }         from '../../models/accounting-period.interface';
import { CostCenter }               from '../../models/cost-center.interface';
import {
  AccountIndex, incomeStatement, centsToAmount, StatementSection
} from '../../utils/ledger-reports';

export interface EstadoResultadosLine {
  accountCode: string;
  accountName: string;
  netBalance:  number;   // con el signo de su grupo: crédito − débito en ingresos; débito − crédito en costos y gastos
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
  private accountsSvc    = inject(ChartOfAccountsService);
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

  truncated          = signal(false);
  reportYear         = signal(new Date().getFullYear());

  ingresos  = signal<EstadoResultadosLine[]>([]);
  /** Cuentas de tipo «costo» (costo de ventas). */
  costos    = signal<EstadoResultadosLine[]>([]);
  /** Cuentas de tipo «gasto». */
  gastos    = signal<EstadoResultadosLine[]>([]);

  // Totales en centavos (ledger-reports), mostrados en dólares.
  private totalsCents = signal({ income: 0, costs: 0, expenses: 0 });

  // ── Computed ──────────────────────────────────────────────────────────────
  totalIngresos = computed(() => centsToAmount(this.totalsCents().income));
  totalCostos   = computed(() => centsToAmount(this.totalsCents().costs));
  totalGastos   = computed(() => centsToAmount(this.totalsCents().expenses));
  utilidadBruta = computed(() => centsToAmount(this.totalsCents().income - this.totalsCents().costs));
  /** Costos + gastos (el PDF del servidor los muestra juntos). */
  totalCostosGastos = computed(() => centsToAmount(this.totalsCents().costs + this.totalsCents().expenses));
  utilidad      = computed(() => centsToAmount(
    this.totalsCents().income - this.totalsCents().costs - this.totalsCents().expenses));
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
    this.gastos.set([]);
    this.totalsCents.set({ income: 0, costs: 0, expenses: 0 });
    this.truncated.set(false);

    try {
      // Todo el ejercicio del período elegido (o el año en curso). Cuentan los
      // contabilizados y los anulados con reversa; SIN el asiento de cierre,
      // que deja en cero ingresos y gastos. Costo o gasto según el `type` de la
      // cuenta en el plan. Misma lógica que Conecta (utils/ledger-reports.ts).
      const year = this.selectedPeriod()
        ? this.periods().find(p => p.id === this.selectedPeriod())?.year ?? new Date().getFullYear()
        : new Date().getFullYear();
      this.reportYear.set(year);

      const [{ items, truncated }, accounts] = await Promise.all([
        this.svc.getLedgerEntries(year, year),
        firstValueFrom(this.accountsSvc.getAccounts().pipe(take(1))),
      ]);
      const entries = this.selectedPeriod() ? items.filter(e => e.periodId === this.selectedPeriod()) : items;
      const er = incomeStatement(entries, new AccountIndex(accounts), `${year}-01-01`, `${year}-12-31`,
        { costCenterId: this.selectedCostCenter() || null });

      const toLines = (sec: StatementSection): EstadoResultadosLine[] =>
        sec.rows.map(r => ({ accountCode: r.code, accountName: r.name, netBalance: centsToAmount(r.amount) }));
      this.ingresos.set(toLines(er.income));
      this.costos.set(toLines(er.costs));
      this.gastos.set(toLines(er.expenses));
      this.totalsCents.set({ income: er.totalIncome, costs: er.totalCosts, expenses: er.totalExpenses });
      this.truncated.set(truncated);
      this.searched.set(true);
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
        // El PDF del servidor tiene una sola sección «Costos y gastos».
        extraData: {
          ingresos:       this.ingresos(),
          costos:         [...this.costos(), ...this.gastos()],
          totalIngresos:  this.totalIngresos(),
          totalCostos:    this.totalCostosGastos(),
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
      ...this.costos().map(l => ({ Sección: 'Costos', Código: l.accountCode, Cuenta: l.accountName, Monto: this.round2(l.netBalance) })),
      { Sección: '', Código: '', Cuenta: 'TOTAL COSTOS', Monto: this.round2(this.totalCostos()) },
      { Sección: '', Código: '', Cuenta: 'UTILIDAD BRUTA', Monto: this.round2(this.utilidadBruta()) },
      ...this.gastos().map(l => ({ Sección: 'Gastos', Código: l.accountCode, Cuenta: l.accountName, Monto: this.round2(l.netBalance) })),
      { Sección: '', Código: '', Cuenta: 'TOTAL GASTOS', Monto: this.round2(this.totalGastos()) },
      { Sección: '', Código: '', Cuenta: this.isGanancia() ? 'UTILIDAD DEL EJERCICIO' : 'PÉRDIDA DEL EJERCICIO', Monto: this.round2(this.utilidad()) }
    ];
    this.excelSvc.export(`estado-resultados-${this.getPeriodName().replace(/\s+/g, '_')}`, [{ name: 'Estado de Resultados', rows }]);
  }

  getPeriodName(): string {
    if (!this.selectedPeriod()) return `Ejercicio ${this.reportYear()}`;
    return this.periods().find(p => p.id === this.selectedPeriod())?.name ?? '';
  }

  round2(n: number): number { return Math.round(n * 100) / 100; }
  trackByCode(_: number, item: EstadoResultadosLine): string { return item.accountCode; }
}
