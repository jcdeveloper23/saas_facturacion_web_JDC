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
import { AccountingPdfService }     from '../../services/accounting-pdf.service';
import { TenantService }            from '../../../../core/services/tenant.service';
import { NotificationService }      from '../../../../core/services/notification.service';
import { JournalEntry, JournalEntryLine } from '../../models/journal-entry.interface';
import { AccountingPeriod }         from '../../models/accounting-period.interface';

export interface FlujoEfectivoLine {
  accountCode: string;
  accountName: string;
  amount: number;
}

type FlujoCategory = 'operacion' | 'inversion' | 'financiamiento';

// Grupo "Efectivo y Equivalentes de Efectivo" del plan de cuentas
// (Caja General, Caja Chica, Bancos Cta Corriente/Ahorros — ver account.interface.ts)
const CASH_PREFIX = '1.1.01';

@Component({
  selector: 'app-flujo-efectivo-page',
  standalone: true,
  templateUrl: './flujo-efectivo-page.component.html',
  styleUrl:    './flujo-efectivo-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, IconModule
  ]
})
export class FlujoEfectivoPageComponent implements OnInit, OnDestroy {
  private svc           = inject(JournalEntriesService);
  private periodsSvc    = inject(AccountingPeriodsService);
  private pdfSvc        = inject(AccountingPdfService);
  private tenantSvc     = inject(TenantService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  downloadingPdf = signal(false);
  periods        = signal<AccountingPeriod[]>([]);
  selectedPeriod = signal('');
  searching      = signal(false);
  searched       = signal(false);

  efectivoInicial = signal(0);
  operacion       = signal<FlujoEfectivoLine[]>([]);
  inversion       = signal<FlujoEfectivoLine[]>([]);
  financiamiento  = signal<FlujoEfectivoLine[]>([]);

  // ── Computed ──────────────────────────────────────────────────────────────
  totalOperacion      = computed(() => this.operacion().reduce((s, l) => s + l.amount, 0));
  totalInversion      = computed(() => this.inversion().reduce((s, l) => s + l.amount, 0));
  totalFinanciamiento = computed(() => this.financiamiento().reduce((s, l) => s + l.amount, 0));
  variacionNeta       = computed(() => this.totalOperacion() + this.totalInversion() + this.totalFinanciamiento());
  efectivoFinal        = computed(() => this.efectivoInicial() + this.variacionNeta());

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.periodsSvc.getPeriods().pipe(take(1)).subscribe(p => this.periods.set(p));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  // Método indirecto simplificado: recorre los asientos posteados del período,
  // detecta los que mueven cuentas de Efectivo (1.1.01.x) y clasifica cada
  // movimiento neto de caja según el tipo de la cuenta contraparte:
  //   - activo fijo (1.2.x)                    → Inversión
  //   - patrimonio (3.x) o deuda largo plazo (2.2.x) → Financiamiento
  //   - todo lo demás (CxC, CxP, ingresos, gastos, IVA, anticipos...) → Operación
  // El "efectivo al inicio" se toma del asiento de apertura del período
  // (type:'opening', generado por generateOpeningEntry) — así no hace falta
  // acumular saldos desde años anteriores.
  async generate(): Promise<void> {
    if (!this.selectedPeriod()) {
      this.notifications.warning('Seleccione un ejercicio contable');
      return;
    }

    this.searching.set(true);
    this.efectivoInicial.set(0);
    this.operacion.set([]);
    this.inversion.set([]);
    this.financiamiento.set([]);

    try {
      const entries = await new Promise<JournalEntry[]>((resolve, reject) => {
        const sub = this.svc.getEntries({ periodId: this.selectedPeriod(), status: 'posted' }).subscribe({
          next:  es => { sub.unsubscribe(); resolve(es); },
          error: reject
        });
      });

      let inicial = 0;
      const maps: Record<FlujoCategory, Map<string, FlujoEfectivoLine>> = {
        operacion: new Map(), inversion: new Map(), financiamiento: new Map()
      };

      for (const entry of entries) {
        const cashLines = entry.lines.filter(l => l.accountCode.startsWith(CASH_PREFIX));
        if (!cashLines.length) continue;

        const delta = cashLines.reduce((s, l) => s + (l.debit ?? 0) - (l.credit ?? 0), 0);
        if (Math.abs(delta) < 0.01) continue; // ej. transferencia entre dos cuentas de caja/banco propias

        if (entry.type === 'opening') {
          inicial += delta;
          continue;
        }

        const otherLines = entry.lines.filter(l => !l.accountCode.startsWith(CASH_PREFIX));
        const category    = this.classify(otherLines);
        const rep          = this.representative(otherLines);
        const key          = rep?.accountCode ?? entry.id;
        const label        = rep?.accountName ?? entry.description;

        const map      = maps[category];
        const existing = map.get(key);
        if (existing) existing.amount += delta;
        else map.set(key, { accountCode: key, accountName: label, amount: delta });
      }

      const sortFn = (a: FlujoEfectivoLine, b: FlujoEfectivoLine) => Math.abs(b.amount) - Math.abs(a.amount);
      const finalize = (m: Map<string, FlujoEfectivoLine>) =>
        [...m.values()].map(l => ({ ...l, amount: this.round2(l.amount) })).sort(sortFn);

      this.efectivoInicial.set(this.round2(inicial));
      this.operacion.set(finalize(maps.operacion));
      this.inversion.set(finalize(maps.inversion));
      this.financiamiento.set(finalize(maps.financiamiento));
      this.searched.set(true);
    } catch (err: any) {
      this.notifications.error('Error generando flujo de efectivo: ' + (err?.message ?? err));
    } finally {
      this.searching.set(false);
    }
  }

  private classify(otherLines: JournalEntryLine[]): FlujoCategory {
    if (otherLines.some(l => l.accountCode.startsWith('1.2'))) return 'inversion';
    if (otherLines.some(l => l.accountCode.startsWith('3') || l.accountCode.startsWith('2.2'))) return 'financiamiento';
    return 'operacion';
  }

  // Cuenta contraparte "más representativa" del movimiento de caja — la de
  // mayor magnitud, usada para etiquetar la línea agregada en el reporte.
  private representative(otherLines: JournalEntryLine[]): JournalEntryLine | undefined {
    return otherLines.reduce<JournalEntryLine | undefined>((max, l) => {
      const mag    = Math.abs((l.debit ?? 0) - (l.credit ?? 0));
      const maxMag = max ? Math.abs((max.debit ?? 0) - (max.credit ?? 0)) : -1;
      return mag > maxMag ? l : max;
    }, undefined);
  }

  printReport(): void { window.print(); }

  async downloadPdf(): Promise<void> {
    if (!this.searched()) return;
    this.downloadingPdf.set(true);
    try {
      await this.pdfSvc.downloadPdf({
        reportType: 'flujo-efectivo',
        companyId:  this.tenantSvc.companyId,
        periodName: this.getPeriodName(),
        data:       [],
        extraData: {
          efectivoInicial:     this.efectivoInicial(),
          operacion:           this.operacion(),
          inversion:           this.inversion(),
          financiamiento:      this.financiamiento(),
          totalOperacion:      this.totalOperacion(),
          totalInversion:      this.totalInversion(),
          totalFinanciamiento: this.totalFinanciamiento(),
          variacionNeta:       this.variacionNeta(),
          efectivoFinal:       this.efectivoFinal()
        }
      });
    } catch (err: any) {
      this.notifications.error('Error generando PDF: ' + (err?.message ?? err));
    } finally {
      this.downloadingPdf.set(false);
    }
  }

  getPeriodName(): string {
    return this.periods().find(p => p.id === this.selectedPeriod())?.name ?? '';
  }

  round2(n: number): number { return Math.round(n * 100) / 100; }
  trackByCode(_: number, item: FlujoEfectivoLine): string { return item.accountCode; }
}
