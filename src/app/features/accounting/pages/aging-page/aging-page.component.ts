import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { InvoicesService }  from '../../../invoices/services/invoices.service';
import { PurchasesService } from '../../../purchases/services/purchases.service';
import { PersonasService }  from '../../../personas/services/personas.service';
import { NotificationService } from '../../../../core/services/notification.service';

export type AgingMode   = 'cxc' | 'cxp';
export type AgingBucket = 'current' | 'b0_30' | 'b31_60' | 'b61_90' | 'b90_plus';

export interface AgingPartyRow {
  partyId:        string;
  partyName:      string;
  partyTaxId:     string;
  current:        number;   // no vencido (por vencer)
  b0_30:          number;
  b31_60:         number;
  b61_90:         number;
  b90_plus:       number;
  total:          number;
  documentCount:  number;
}

@Component({
  selector: 'app-aging-page',
  standalone: true,
  templateUrl: './aging-page.component.html',
  styleUrl:    './aging-page.component.scss',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, IconModule
  ]
})
export class AgingPageComponent {
  private invoicesSvc   = inject(InvoicesService);
  private purchasesSvc  = inject(PurchasesService);
  private personasSvc   = inject(PersonasService);
  private notifications = inject(NotificationService);

  // ── State ─────────────────────────────────────────────────────────────────
  mode     = signal<AgingMode>('cxc');
  loading  = signal(false);
  loaded   = signal(false);
  rows     = signal<AgingPartyRow[]>([]);
  asOfDate = signal<Date>(this.startOfToday());

  // ── Computed ──────────────────────────────────────────────────────────────
  totals = computed(() => {
    const rows = this.rows();
    return {
      current:  rows.reduce((s, r) => s + r.current,  0),
      b0_30:    rows.reduce((s, r) => s + r.b0_30,    0),
      b31_60:   rows.reduce((s, r) => s + r.b31_60,   0),
      b61_90:   rows.reduce((s, r) => s + r.b61_90,   0),
      b90_plus: rows.reduce((s, r) => s + r.b90_plus, 0),
      total:    rows.reduce((s, r) => s + r.total,    0),
    };
  });

  overdueTotal = computed(() => this.totals().total - this.totals().current);

  // ── Mode switch ───────────────────────────────────────────────────────────
  setMode(m: AgingMode): void {
    if (this.mode() === m) return;
    this.mode.set(m);
    this.rows.set([]);
    this.loaded.set(false);
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  // Antigüedad de cartera "al día de hoy" (no depende de un período contable
  // seleccionado — es un corte instantáneo de lo pendiente de cobro/pago).
  // CxP calcula la fecha de vencimiento de cada compra como
  // fecha_compra + días de pago del proveedor (SupplierData.paymentDays,
  // 0 = contado si no está configurado) — Purchase no guarda dueDate propio.
  async generate(): Promise<void> {
    this.loading.set(true);
    this.rows.set([]);
    const today = this.startOfToday();
    this.asOfDate.set(today);

    try {
      const map = new Map<string, AgingPartyRow>();

      if (this.mode() === 'cxc') {
        const invoices = await firstValueFrom(this.invoicesSvc.getInvoices({}));
        for (const inv of invoices) {
          if (inv.isPaid || inv.isVoid || inv.status === 'draft') continue;
          const due = inv.dueDate?.toDate ? inv.dueDate.toDate() : null;
          if (!due) continue;
          const days = this.daysBetween(due, today);
          this.accumulate(map, inv.customerId, inv.customerName, inv.customerTaxId, days, inv.total);
        }
      } else {
        const [purchases, suppliers] = await Promise.all([
          firstValueFrom(this.purchasesSvc.getAll()),
          firstValueFrom(this.personasSvc.getPersonas('supplier'))
        ]);
        const termsByPartyId = new Map<string, number>();
        for (const s of suppliers) termsByPartyId.set(s.id, s.supplierData?.paymentDays ?? 0);

        for (const p of purchases) {
          if (p.isPaid || p.isVoid || p.status === 'draft' || p.status === 'cancelled') continue;
          const baseDate = p.date?.toDate ? p.date.toDate() : null;
          if (!baseDate) continue;
          const termDays = termsByPartyId.get(p.supplierId) ?? 0;
          const due = new Date(baseDate);
          due.setDate(due.getDate() + termDays);
          const days = this.daysBetween(due, today);
          this.accumulate(map, p.supplierId, p.supplierName, p.supplierRuc, days, p.total);
        }
      }

      this.rows.set([...map.values()].sort((a, b) => b.total - a.total));
      this.loaded.set(true);
    } catch (err: any) {
      this.notifications.error('Error generando antigüedad de cartera: ' + (err?.message ?? err));
    } finally {
      this.loading.set(false);
    }
  }

  private accumulate(
    map: Map<string, AgingPartyRow>,
    partyId: string, partyName: string, partyTaxId: string,
    daysOverdue: number, amount: number
  ): void {
    let row = map.get(partyId);
    if (!row) {
      row = {
        partyId, partyName, partyTaxId,
        current: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0,
        total: 0, documentCount: 0
      };
      map.set(partyId, row);
    }
    switch (this.bucketFor(daysOverdue)) {
      case 'current':  row.current  += amount; break;
      case 'b0_30':    row.b0_30    += amount; break;
      case 'b31_60':   row.b31_60   += amount; break;
      case 'b61_90':   row.b61_90   += amount; break;
      case 'b90_plus': row.b90_plus += amount; break;
    }
    row.total += amount;
    row.documentCount += 1;
  }

  private bucketFor(daysOverdue: number): AgingBucket {
    if (daysOverdue <= 0)  return 'current';
    if (daysOverdue <= 30) return 'b0_30';
    if (daysOverdue <= 60) return 'b31_60';
    if (daysOverdue <= 90) return 'b61_90';
    return 'b90_plus';
  }

  private daysBetween(due: Date, today: Date): number {
    return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  printReport(): void { window.print(); }

  round2(n: number): number { return Math.round(n * 100) / 100; }
  trackByParty(_: number, item: AgingPartyRow): string { return item.partyId; }
}
