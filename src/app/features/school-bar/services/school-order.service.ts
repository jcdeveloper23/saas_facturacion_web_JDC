import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot, addDoc, updateDoc,
  query, where, orderBy, Timestamp, limit
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService }   from '../../../core/services/tenant.service';
import { AuthService }     from '../../../core/services/auth.service';
import { ProductsService } from '../../products/services/products.service';
import {
  SchoolOrder, SchoolOrderStatus, SchoolOrderItem,
  SchoolDeliveryType, SchoolOrderType, OrderStatusEntry,
  calcOrderTotal
} from '../models/school-order.interface';

export type SchoolOrderCreateInput = Omit<SchoolOrder,
  'id' | 'subtotal' | 'total' | 'statusHistory'
  | 'walletTransactionId' | 'amountCharged'
  | 'createdAt' | 'updatedAt'
>;

@Injectable({ providedIn: 'root' })
export class SchoolOrderService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);
  private productsSvc   = inject(ProductsService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath():   string { return `companies/${this.companyId}/school_orders`; }

  private cleanDoc<T>(obj: T): T {
    if (obj === undefined) return null as T;
    if (obj === null)      return null as T;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(i => this.cleanDoc(i)) as unknown as T;
    if ((obj as any).constructor !== Object) return obj;
    const result: any = {};
    for (const key of Object.keys(obj as object)) {
      result[key] = this.cleanDoc((obj as any)[key]);
    }
    return result as T;
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  /** Órdenes del día — para el panel del bar */
  getOrdersForDate(date: string): Observable<SchoolOrder[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref,
          where('companyId', '==', this.companyId),
          where('scheduledFor', '>=', Timestamp.fromDate(new Date(`${date}T00:00:00`))),
          where('scheduledFor', '<=', Timestamp.fromDate(new Date(`${date}T23:59:59`))),
          orderBy('scheduledFor', 'asc')
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolOrder)),
          error: err  => { console.error('[SchoolOrderService] getOrdersForDate:', err); observer.error(err); }
        }
      );
    });
  }

  /** Órdenes activas de un estudiante — para el representante */
  getActiveOrdersByStudent(studentId: string): Observable<SchoolOrder[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref,
          where('studentId', '==', studentId),
          where('status', 'not-in', ['delivered', 'undelivered', 'cancelled', 'refunded']),
          orderBy('status'),
          orderBy('scheduledFor', 'desc'),
          limit(10)
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolOrder)),
          error: err  => { console.error('[SchoolOrderService] getActiveOrdersByStudent:', err); observer.error(err); }
        }
      );
    });
  }

  /** Historial de órdenes de un estudiante */
  getOrderHistoryByStudent(studentId: string, limitN = 30): Observable<SchoolOrder[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref,
          where('studentId', '==', studentId),
          orderBy('createdAt', 'desc'),
          limit(limitN)
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolOrder)),
          error: err  => { console.error('[SchoolOrderService] getOrderHistoryByStudent:', err); observer.error(err); }
        }
      );
    });
  }

  getOrder(id: string): Observable<SchoolOrder | null> {
    return new Observable(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as SchoolOrder : null),
        error: err  => { console.error('[SchoolOrderService] getOrder:', err); observer.error(err); }
      });
    });
  }

  // ─── Create ───────────────────────────────────────────────────────────────
  // IMPORTANTE: El descuento del wallet se hace mediante Cloud Function (schoolProcessPurchase).
  // El frontend crea la orden en estado 'pending'; la CF la confirma y descuenta el saldo.

  async createAdvanceOrder(input: SchoolOrderCreateInput): Promise<string> {
    const now   = Timestamp.now();
    const total = calcOrderTotal(input.items);
    const firstEntry: OrderStatusEntry = { status: 'pending', changedAt: now };

    const orderData: Omit<SchoolOrder, 'id'> = {
      ...input,
      companyId:           this.companyId,
      subtotal:            total,
      total,
      statusHistory:       [firstEntry],
      walletTransactionId: '',       // llenado por CF schoolProcessPurchase
      amountCharged:       0,        // llenado por CF schoolProcessPurchase
      createdAt:           now,
      updatedAt:           now
    };
    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(orderData));
    return ref.id;
  }

  // ─── Status transitions ────────────────────────────────────────────────────

  private async pushStatus(id: string, status: SchoolOrderStatus, note?: string): Promise<void> {
    const { arrayUnion } = await import('@angular/fire/firestore');
    const entry: OrderStatusEntry = { status, changedAt: Timestamp.now(), note,
      changedBy: this.authService.user()?.uid };
    await updateDoc(
      doc(this.firestore, `${this.colPath}/${id}`),
      this.cleanDoc({
        status,
        statusHistory: arrayUnion(entry),
        updatedAt: Timestamp.now()
      })
    );
  }

  async confirmOrder(id: string):           Promise<void> { await this.pushStatus(id, 'confirmed'); }
  async markPreparing(id: string):          Promise<void> { await this.pushStatus(id, 'preparing'); }
  async markReady(id: string):              Promise<void> { await this.pushStatus(id, 'ready'); }

  async markDelivered(order: SchoolOrder): Promise<void> {
    const userId = this.authService.user()?.uid ?? '';
    const { arrayUnion } = await import('@angular/fire/firestore');

    // Decrement catalog stock for each linked item
    const warehouseCode = order.warehouseCode ?? 'PRINCIPAL';
    for (const item of order.items) {
      if (item.productId && item.productSku) {
        await this.productsSvc.recordSale({
          productId:    item.productId,
          productSku:   item.productSku,
          productName:  item.name,
          warehouseCode,
          qty:          item.quantity,
          sourceDocId:  order.id,
          sourceDocType: 'invoice',
          userId
        });
      }
    }

    const entry: OrderStatusEntry = { status: 'delivered', changedAt: Timestamp.now(), changedBy: userId };
    await updateDoc(
      doc(this.firestore, `${this.colPath}/${order.id!}`),
      this.cleanDoc({
        status:              'delivered',
        statusHistory:       arrayUnion(entry),
        dispatchedBy:        userId,
        dispatchedAt:        Timestamp.now(),
        deliveryConfirmedAt: Timestamp.now(),
        updatedAt:           Timestamp.now()
      })
    );
  }

  async markUndelivered(id: string, note?: string): Promise<void> {
    await this.pushStatus(id, 'undelivered', note ?? 'Alumno ausente');
  }

  async cancelOrder(id: string): Promise<void> { await this.pushStatus(id, 'cancelled'); }
}
