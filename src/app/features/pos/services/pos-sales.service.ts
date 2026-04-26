import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, addDoc, updateDoc, onSnapshot,
  query, where, orderBy, limit, Timestamp, runTransaction, increment
} from '@angular/fire/firestore';

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
import { Observable } from 'rxjs';

import { TenantService }     from '../../../core/services/tenant.service';
import { AuthService }       from '../../../core/services/auth.service';
import { PosCashService }    from './pos-cash.service';
import { PosSessionService } from './pos-session.service';
import {
  PosSale, PosPayment, PosCartState, PosCartItem
} from '../models/pos.interface';

export interface CompleteSaleInput {
  cartState:    PosCartState;
  payments:     PosPayment[];
  totalPaid:    number;
  change:       number;
  sessionId:    string;
  terminalId:   string;
  terminalName: string;
  seriesCode:   string;
  generateInvoice: boolean;
}

@Injectable({ providedIn: 'root' })
export class PosSalesService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);
  private cashService   = inject(PosCashService);

  private get companyId():      string { return this.tenantService.companyId; }
  private get salesPath():      string { return `companies/${this.companyId}/pos-sales`; }
  private get sessionsPath():   string { return `companies/${this.companyId}/pos-sessions`; }
  private get terminalsPath():  string { return `companies/${this.companyId}/pos-terminals`; }

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

  // ─── Complete a sale ───────────────────────────────────────────────────────

  async completeSale(input: CompleteSaleInput): Promise<PosSale> {
    const user      = this.authService.user();
    const now       = Timestamp.now();
    const { cartState, payments, totalPaid, change } = input;

    // Calcular totales de pago por método
    const cashTotal     = payments.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
    const cardTotal     = payments.filter(p => p.method === 'card').reduce((s, p) => s + p.amount, 0);
    const transferTotal = payments.filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0);

    // Obtener correlativo del ticket (num_tickets del terminal, incremento atómico)
    const ticketNumber = await this.getNextTicketNumber(input.terminalId);

    const saleData: Omit<PosSale, 'id'> = {
      sessionId:        input.sessionId,
      terminalId:       input.terminalId,
      terminalName:     input.terminalName,
      seriesCode:       input.seriesCode,
      userId:           user?.uid ?? '',
      userName:         user?.displayName ?? user?.email ?? '',
      customerId:       cartState.customerId,
      customerName:     cartState.customerName,
      customerTaxId:    cartState.customerTaxId,
      customerTaxIdType: cartState.customerTaxIdType,
      lines:            cartState.items,
      subtotal:         cartState.subtotal,
      globalDiscountPct: cartState.globalDiscountPct,
      discountAmount:   cartState.discountAmount,
      vatAmount:        cartState.vatAmount,
      total:            cartState.total,
      payments,
      totalPaid,
      change,
      generateInvoice:  input.generateInvoice,
      status:           'completed',
      ticketNumber,
      createdAt:        now,
    };

    // Guardar venta (stripUndefined previene el rechazo de Firestore por campos undefined)
    const saleRef = await addDoc(collection(this.firestore, this.salesPath), stripUndefined(saleData));

    // Actualizar totales de sesión
    await this.cashService.updateSessionAfterSale(input.sessionId, {
      total:    cartState.total,
      cash:     cashTotal,
      card:     cardTotal,
      transfer: transferTotal,
    });

    return { id: saleRef.id, ...saleData };
  }

  async voidSale(saleId: string): Promise<void> {
    await updateDoc(doc(this.firestore, `${this.salesPath}/${saleId}`), {
      status: 'void'
    });
  }

  // ─── Ticket number ─────────────────────────────────────────────────────────

  // Incrementa numTickets en el terminal atómicamente (num_tickets de FacturaScripts)
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
