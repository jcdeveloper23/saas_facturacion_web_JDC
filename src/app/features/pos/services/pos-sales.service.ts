import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, addDoc, updateDoc, getDoc, onSnapshot,
  query, where, orderBy, limit, Timestamp, runTransaction
} from '@angular/fire/firestore';
import { firstValueFrom, Observable } from 'rxjs';

/** Elimina recursivamente todos los campos `undefined` para que Firestore no los rechace. */
function stripUndefined(obj: any): any {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Timestamp)) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    );
  }
  return obj;
}

import { TenantService }   from '../../../core/services/tenant.service';
import { AuthService }     from '../../../core/services/auth.service';
import { PosCashService }  from './pos-cash.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { SettingsService } from '../../settings/services/settings.service';
import { InvoiceLine, SriDocumentStatus } from '../../invoices/models/invoice.interface';
import { PosSale, PosPayment, PosCartState } from '../models/pos.interface';

export interface CompleteSaleInput {
  cartState:     PosCartState;
  payments:      PosPayment[];
  totalPaid:     number;
  change:        number;
  sessionId:     string;
  terminalId:    string;
  terminalName:  string;
  seriesCode:    string;
  warehouseCode: string;
  generateInvoice: boolean;
}

@Injectable({ providedIn: 'root' })
export class PosSalesService {
  private firestore       = inject(Firestore);
  private tenantService   = inject(TenantService);
  private authService     = inject(AuthService);
  private cashService     = inject(PosCashService);
  private invoicesService = inject(InvoicesService);
  private settingsService = inject(SettingsService);

  private get companyId():     string { return this.tenantService.companyId; }
  private get salesPath():     string { return `companies/${this.companyId}/pos-sales`; }
  private get terminalsPath(): string { return `companies/${this.companyId}/pos-terminals`; }

  // ─── Queries ───────────────────────────────────────────────────────────────

  getSales(sessionId?: string, limitN = 50): Observable<PosSale[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.salesPath);
      const constraints: any[] = [orderBy('createdAt', 'desc'), limit(limitN)];
      if (sessionId) constraints.unshift(where('sessionId', '==', sessionId));
      return onSnapshot(query(ref, ...constraints), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PosSale)),
        error: err  => observer.error(err)
      });
    });
  }

  getSale(id: string): Observable<PosSale | null> {
    return new Observable(observer => {
      const ref = doc(this.firestore, `${this.salesPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as PosSale : null),
        error: err  => observer.error(err)
      });
    });
  }

  getSalesWithInvoiceError(limitN = 20): Observable<PosSale[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.salesPath);
      const q   = query(ref, where('invoiceError', '!=', null), orderBy('invoiceError'), orderBy('createdAt', 'desc'), limit(limitN));
      return onSnapshot(q, {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PosSale)),
        error: err  => observer.error(err)
      });
    });
  }

  // ─── Complete a sale ───────────────────────────────────────────────────────

  async completeSale(input: CompleteSaleInput): Promise<PosSale> {
    const user = this.authService.user();
    const now  = Timestamp.now();
    const { cartState, payments, totalPaid, change } = input;

    const cashTotal     = payments.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
    const cardTotal     = payments.filter(p => p.method === 'card').reduce((s, p) => s + p.amount, 0);
    const transferTotal = payments.filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0);

    const ticketNumber = await this.getNextTicketNumber(input.terminalId);

    const saleData: Omit<PosSale, 'id'> = {
      sessionId:         input.sessionId,
      terminalId:        input.terminalId,
      terminalName:      input.terminalName,
      seriesCode:        input.seriesCode,
      warehouseCode:     input.warehouseCode,
      userId:            user?.uid ?? '',
      userName:          user?.displayName ?? user?.email ?? '',
      customerId:        cartState.customerId,
      customerName:      cartState.customerName,
      customerTaxId:     cartState.customerTaxId,
      customerTaxIdType: cartState.customerTaxIdType,
      lines:             cartState.items,
      subtotal:          cartState.subtotal,
      globalDiscountPct: cartState.globalDiscountPct,
      discountAmount:    cartState.discountAmount,
      vatAmount:         cartState.vatAmount,
      total:             cartState.total,
      payments,
      totalPaid,
      change,
      generateInvoice:   input.generateInvoice,
      status:            'completed',
      ticketNumber,
      createdAt:         now,
    };

    const saleRef = await addDoc(collection(this.firestore, this.salesPath), stripUndefined(saleData));
    const saleId  = saleRef.id;
    const sale: PosSale = { id: saleId, ...saleData };

    // Actualizar totales de sesión
    await this.cashService.updateSessionAfterSale(input.sessionId, {
      total:    cartState.total,
      cash:     cashTotal,
      card:     cardTotal,
      transfer: transferTotal,
    });

    // ── Factura — se crea siempre (igual que invoices/new → Emitir) ───────────
    // Stock lo maneja la CF onInvoiceStock al detectar status → 'issued'
    try {
      const fiscalYear = new Date().getFullYear().toString();
      const [seriesList, paymentTerms] = await Promise.all([
        firstValueFrom(this.settingsService.getDocumentSeries()),
        firstValueFrom(this.settingsService.getPaymentTerms()),
      ]);
      const series          = seriesList.find(s => s.documentType === 'invoice' && s.isActive);
      const paymentTermCode = paymentTerms.find(t => t.isActive)?.code ?? '';

      if (series) {
        const lines: InvoiceLine[] = cartState.items.map((item, idx) => ({
          id:          `${saleId}-${idx + 1}`,
          productId:   item.productId,
          productSku:  item.productSku,
          description: item.productName,
          quantity:    item.quantity,
          unitPrice:   item.salePrice,
          discountPct: item.discountPct,
          subtotal:    item.subtotal,
          vatPct:      item.vatPct,
          vatAmount:   item.vatAmount,
          total:       item.lineTotal,
          sriTaxCode:  item.vatCode,
          averageCost: item.averageCost,
        }));

        // Mismo patrón que invoice-form: si SRI no está habilitado → marcar not_required
        const sriEnabled = this.tenantService.isSriEnabled();
        const sriStatus: SriDocumentStatus | undefined = sriEnabled ? undefined : 'not_required';

        const invoiceId = await this.invoicesService.createInvoice({
          seriesCode:          series.code,
          seriesEstablishment: series.establishment,
          seriesEmissionPoint: series.emissionPoint,
          fiscalYear,
          date:                now,
          dueDate:             now,
          customerId:          cartState.customerId,
          customerCode:        '',
          customerName:        cartState.customerName,
          customerTaxId:       cartState.customerTaxId,
          customerTaxIdType:   cartState.customerTaxIdType,
          warehouseCode:       input.warehouseCode,
          paymentTermCode,
          currency:            'USD',
          exchangeRate:        1,
          globalDiscountPct:   cartState.globalDiscountPct,
          lines,
          status:              'issued',
          ...(sriStatus ? { sriStatus } : {}),
          isPaid:              true,
          isVoid:              false,
          isCreditNote:        false,
          paymentMethods:      payments.map(p => ({
            code:   p.sriCode ?? '20',
            name:   p.methodLabel,
            amount: p.amount,
          })),
        });

        await updateDoc(doc(this.firestore, `${this.salesPath}/${saleId}`), { invoiceId, hasLinkedInvoice: true });
        sale.invoiceId = invoiceId;
      }
    } catch (err: any) {
      console.error('[POS] Invoice creation failed:', err);
      const invoiceError = err?.message ?? 'Error al crear factura';
      await updateDoc(doc(this.firestore, `${this.salesPath}/${saleId}`), { invoiceError });
      sale.invoiceError = invoiceError;
    }

    return sale;
  }

  // ─── Void a sale ──────────────────────────────────────────────────────────

  async voidSale(saleId: string): Promise<void> {
    const saleSnap = await getDoc(doc(this.firestore, `${this.salesPath}/${saleId}`));
    if (!saleSnap.exists()) throw new Error('Ticket no encontrado');
    const sale = { id: saleSnap.id, ...saleSnap.data() } as PosSale;

    if (sale.status === 'void') throw new Error('El ticket ya está anulado');

    // Marcar ticket como anulado
    await updateDoc(doc(this.firestore, `${this.salesPath}/${saleId}`), { status: 'void' });

    // Anular factura vinculada — la CF onInvoiceStock revierte el stock automáticamente
    if (sale.invoiceId) {
      await this.invoicesService.markVoid(sale.invoiceId)
        .catch(err => console.error('[POS] markVoid failed for invoice', sale.invoiceId, err));
    }
  }

  // ─── Ticket number ─────────────────────────────────────────────────────────

  private async getNextTicketNumber(terminalId: string): Promise<number> {
    const terminalRef = doc(this.firestore, `${this.terminalsPath}/${terminalId}`);
    let ticketNumber = 1;

    await runTransaction(this.firestore, async tx => {
      const snap = await tx.get(terminalRef);
      if (!snap.exists()) return;
      ticketNumber = (snap.data()['numTickets'] ?? 0) + 1;
      tx.update(terminalRef, { numTickets: ticketNumber });
    });

    return ticketNumber;
  }
}
