import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, query, where, orderBy, getDocs, Timestamp
} from '@angular/fire/firestore';
import { TenantService } from '../../../core/services/tenant.service';
import { PosSale, PosCartItem } from '../../pos/models/pos.interface';
import { Invoice, InvoiceLine } from '../../invoices/models/invoice.interface';
import {
  ProfitCalculationResult,
  ProfitLineDetail,
  ProfitPeriodType
} from '../models/benefit.interface';

function round2(n: number): number { return Math.round(n * 100) / 100; }

@Injectable({ providedIn: 'root' })
export class ProfitCalculatorService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);

  async calculate(
    startDate: Date,
    endDate: Date,
    warehouseCode?: string,
    familyId?: string
  ): Promise<ProfitCalculationResult> {

    const [posSales, invoices] = await Promise.all([
      this.queryPosSales(startDate, endDate),
      this.queryInvoices(startDate, endDate)
    ]);

    const lines: ProfitLineDetail[] = [];

    // Procesar POS sales
    for (const sale of posSales) {
      // Factor para distribuir el descuento global a nivel de linea (sobre PVP con IVA)
      const grossTotal = sale.lines.reduce((s, l) => s + l.lineTotal, 0);
      const factor = grossTotal > 0 ? sale.total / grossTotal : 1;

      for (const line of sale.lines) {
        if (warehouseCode && sale.warehouseCode !== warehouseCode) continue;
        lines.push(this.buildPosLineDetail(sale, line, factor));
      }
    }

    // Procesar Invoices
    for (const invoice of invoices) {
      // Factor para distribuir el descuento global a nivel de linea (sobre PVP con IVA)
      const grossTotal = invoice.lines.reduce((s: number, l: InvoiceLine) => s + l.total, 0);
      const factor = grossTotal > 0 ? (invoice as any).total / grossTotal : 1;

      for (const line of invoice.lines) {
        if (warehouseCode && invoice.warehouseCode !== warehouseCode) continue;
        lines.push(this.buildInvoiceLineDetail(invoice, line, factor));
      }
    }

    // Filtrar por familia si se especifica (requiere que la linea tenga familyId)
    const filteredLines = familyId
      ? lines.filter(l => l.familyId === familyId)
      : lines;

    return this.aggregateLines(filteredLines, startDate, endDate, posSales.length, invoices.length);
  }

  private buildPosLineDetail(
    sale: PosSale,
    line: PosCartItem,
    discountFactor: number
  ): ProfitLineDetail {
    const averageCost  = line.averageCost ?? 0;
    const quantity     = line.quantity;
    const revenue      = round2(line.lineTotal * discountFactor);
    const cogs         = round2(averageCost * quantity);
    const grossProfit  = round2(revenue - cogs);
    const margin       = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0;

    return {
      sourceType:     'pos_sale',
      sourceId:       sale.id,
      sourceNumber:   String(sale.ticketNumber),
      date:           (sale.createdAt as Timestamp).toDate(),
      productId:      line.productId ?? '',
      productSku:     line.productSku ?? '',
      productName:    line.productName ?? '',
      warehouseCode:  (sale as any).warehouseCode ?? '',
      quantity,
      salePrice:      line.salePrice,
      averageCost,
      revenue,
      cogs,
      grossProfit,
      grossMarginPct: margin,
      hasCost:        averageCost > 0
    };
  }

  private buildInvoiceLineDetail(
    invoice: Invoice,
    line: InvoiceLine,
    discountFactor: number
  ): ProfitLineDetail {
    const averageCost  = (line as any).averageCost ?? 0;
    const quantity     = line.quantity;
    const revenue      = round2(line.total * discountFactor);
    const cogs         = round2(averageCost * quantity);
    const grossProfit  = round2(revenue - cogs);
    const margin       = revenue > 0 ? round2((grossProfit / revenue) * 100) : 0;

    return {
      sourceType:     'invoice',
      sourceId:       invoice.id,
      sourceNumber:   (invoice as any).fullNumber ?? '',
      date:           ((invoice as any).createdAt as Timestamp).toDate(),
      productId:      line.productId ?? '',
      productSku:     line.productSku ?? '',
      productName:    line.description ?? '',
      warehouseCode:  line.warehouseCode ?? (invoice as any).warehouseCode ?? '',
      quantity,
      salePrice:      line.unitPrice,
      averageCost,
      revenue,
      cogs,
      grossProfit,
      grossMarginPct: margin,
      hasCost:        averageCost > 0
    };
  }

  private aggregateLines(
    lines: ProfitLineDetail[],
    startDate: Date,
    endDate: Date,
    posSalesCount: number,
    invoicesCount: number
  ): ProfitCalculationResult {
    const totalRevenue = round2(lines.reduce((s, l) => s + l.revenue, 0));
    const totalCogs    = round2(lines.reduce((s, l) => s + l.cogs, 0));
    const grossProfit  = round2(totalRevenue - totalCogs);
    const margin       = totalRevenue > 0 ? round2((grossProfit / totalRevenue) * 100) : 0;
    const noGap        = lines.filter(l => !l.hasCost);

    return {
      periodType:         'custom' as ProfitPeriodType,
      periodLabel:        '',
      startDate,
      endDate,
      posSalesCount,
      invoicesCount,
      totalRevenue,
      totalCogs,
      grossProfit,
      grossMarginPct:     margin,
      linesWithoutCost:   noGap.length,
      revenueWithoutCost: round2(noGap.reduce((s, l) => s + l.revenue, 0)),
      lineBreakdown:      lines
    };
  }

  private async queryPosSales(start: Date, end: Date): Promise<PosSale[]> {
    const ref = collection(
      this.firestore,
      `companies/${this.tenantService.companyId}/pos-sales`
    );
    const q = query(
      ref,
      where('status', '==', 'completed'),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end)),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    // Filtrar en memoria las ventas que ya tienen factura vinculada (evitar doble conteo)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }) as PosSale)
      .filter(d => !d.hasLinkedInvoice);
  }

  private async queryInvoices(start: Date, end: Date): Promise<Invoice[]> {
    const ref = collection(
      this.firestore,
      `companies/${this.tenantService.companyId}/invoices`
    );
    // 2 queries paralelas: issued y paid (Firestore no soporta OR con rango de fecha)
    const q1 = query(ref,
      where('status', '==', 'issued'),
      where('isCreditNote', '==', false),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end)),
      orderBy('date', 'asc')
    );
    const q2 = query(ref,
      where('status', '==', 'paid'),
      where('isCreditNote', '==', false),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end)),
      orderBy('date', 'asc')
    );
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const all = [...snap1.docs, ...snap2.docs];
    return all.map(d => ({ id: d.id, ...d.data() }) as Invoice);
  }
}
