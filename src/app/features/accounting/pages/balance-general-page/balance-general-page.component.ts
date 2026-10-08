import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, take, firstValueFrom } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule
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
  AccountIndex, balanceSheet, centsToAmount, StatementSection
} from '../../utils/ledger-reports';

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

  activoCorriente    = signal<BalanceGeneralLine[]>([]);
  activoNoCorriente  = signal<BalanceGeneralLine[]>([]);
  pasivoCorriente    = signal<BalanceGeneralLine[]>([]);
  pasivoNoCorriente  = signal<BalanceGeneralLine[]>([]);
  patrimonio         = signal<BalanceGeneralLine[]>([]);
  /**
   * Resultado del ejercicio: ingresos − costos − gastos a la fecha de corte,
   * cierre incluido (con el año ya cerrado da 0: el resultado está en el patrimonio).
   */
  resultadoEjercicio = signal(0);
  truncated          = signal(false);
  reportYear         = signal(new Date().getFullYear());
  cutoff             = signal('');

  // ── Computed ──────────────────────────────────────────────────────────────
  totalActivoCorriente   = computed(() => this.activoCorriente().reduce((s, l) => s + l.netBalance, 0));
  totalActivoNoCorriente = computed(() => this.activoNoCorriente().reduce((s, l) => s + l.netBalance, 0));
  totalPasivoCorriente   = computed(() => this.pasivoCorriente().reduce((s, l) => s + l.netBalance, 0));
  totalPasivoNoCorriente = computed(() => this.pasivoNoCorriente().reduce((s, l) => s + l.netBalance, 0));
  /** Cuentas de patrimonio, sin el resultado del ejercicio. */
  totalCuentasPatrimonio = computed(() => this.patrimonio().reduce((s, l) => s + l.netBalance, 0));
  /** Patrimonio + resultado del ejercicio. */
  totalPatrimonio        = computed(() => this.round2(this.totalCuentasPatrimonio() + this.resultadoEjercicio()));

  totalActivos   = computed(() => this.round2(this.totalActivoCorriente() + this.totalActivoNoCorriente()));
  totalPasivos   = computed(() => this.round2(this.totalPasivoCorriente() + this.totalPasivoNoCorriente()));
  /** Pasivo + patrimonio + resultado del ejercicio. */
  totalPasivoPatrimonio = computed(() => this.round2(this.totalPasivos() + this.totalPatrimonio()));

  /** Activo − (pasivo + patrimonio + resultado), calculado en centavos. */
  diferenciaCents = signal(0);
  diferencia  = computed(() => Math.abs(centsToAmount(this.diferenciaCents())));
  isCuadrado  = computed(() => this.diferenciaCents() === 0);

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
    this.resultadoEjercicio.set(0);
    this.diferenciaCents.set(0);
    this.truncated.set(false);

    try {
      // Saldos al cierre del ejercicio del período elegido (o del año en curso),
      // con todo lo que cuenta: apertura, movimientos, anulaciones con su reversa
      // y el cierre. Signo por GRUPO (las contra-cuentas restan), corriente =
      // bajo 1.1 / 2.1, y «Resultado del ejercicio» para que cuadre
      // activo = pasivo + patrimonio + resultado. Misma lógica que Conecta.
      const year = this.selectedPeriod()
        ? this.periods().find(p => p.id === this.selectedPeriod())?.year ?? new Date().getFullYear()
        : new Date().getFullYear();
      this.reportYear.set(year);
      this.cutoff.set(`${year}-12-31`);

      const [{ items, truncated }, accounts] = await Promise.all([
        this.svc.getLedgerEntries(year, year),
        firstValueFrom(this.accountsSvc.getAccounts().pipe(take(1))),
      ]);
      const entries = this.selectedPeriod() ? items.filter(e => e.periodId === this.selectedPeriod()) : items;
      const bs = balanceSheet(entries, new AccountIndex(accounts), this.cutoff(),
        { costCenterId: this.selectedCostCenter() || null });

      const toLines = (sec: StatementSection): BalanceGeneralLine[] =>
        sec.rows.map(r => ({ accountCode: r.code, accountName: r.name, netBalance: centsToAmount(r.amount) }));
      this.activoCorriente.set(toLines(bs.currentAssets));
      this.activoNoCorriente.set(toLines(bs.nonCurrentAssets));
      this.pasivoCorriente.set(toLines(bs.currentLiabilities));
      this.pasivoNoCorriente.set(toLines(bs.nonCurrentLiabilities));
      this.patrimonio.set(toLines(bs.equity));
      this.resultadoEjercicio.set(centsToAmount(bs.periodResult));
      this.diferenciaCents.set(bs.difference);
      this.truncated.set(truncated);
      this.searched.set(true);
    } catch (err: any) {
      this.notifications.error('Error generando balance general: ' + (err?.message ?? err));
    } finally {
      this.searching.set(false);
    }
  }

  /** Patrimonio con la fila «Resultado del ejercicio» (para PDF y Excel). */
  private patrimonioConResultado(): BalanceGeneralLine[] {
    return [
      ...this.patrimonio(),
      { accountCode: '', accountName: 'Resultado del ejercicio', netBalance: this.resultadoEjercicio() },
    ];
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
          patrimonio:            this.patrimonioConResultado(),
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

  downloadExcel(): void {
    if (!this.searched()) return;
    const section = (label: string, lines: BalanceGeneralLine[], subtotal: number) => [
      ...lines.map(l => ({ Sección: label, Código: l.accountCode, Cuenta: l.accountName, Monto: this.round2(l.netBalance) })),
      { Sección: '', Código: '', Cuenta: `Subtotal ${label}`, Monto: this.round2(subtotal) }
    ];
    const rows = [
      ...section('Activo Corriente',    this.activoCorriente(),   this.totalActivoCorriente()),
      ...section('Activo No Corriente', this.activoNoCorriente(), this.totalActivoNoCorriente()),
      { Sección: '', Código: '', Cuenta: 'TOTAL ACTIVOS', Monto: this.round2(this.totalActivos()) },
      ...section('Pasivo Corriente',    this.pasivoCorriente(),   this.totalPasivoCorriente()),
      ...section('Pasivo No Corriente', this.pasivoNoCorriente(), this.totalPasivoNoCorriente()),
      ...section('Patrimonio',          this.patrimonioConResultado(), this.totalPatrimonio()),
      { Sección: '', Código: '', Cuenta: 'TOTAL PASIVOS + PATRIMONIO', Monto: this.round2(this.totalPasivoPatrimonio()) }
    ];
    this.excelSvc.export(`balance-general-${this.getPeriodName().replace(/\s+/g, '_')}`, [{ name: 'Balance General', rows }]);
  }

  getPeriodName(): string {
    const base = this.selectedPeriod()
      ? this.periods().find(p => p.id === this.selectedPeriod())?.name ?? ''
      : `Ejercicio ${this.reportYear()}`;
    return this.cutoff() ? `${base} — al ${this.cutoff()}` : base;
  }

  round2(n: number): number { return Math.round(n * 100) / 100; }
  trackByCode(_: number, item: BalanceGeneralLine): string { return item.accountCode; }
}
