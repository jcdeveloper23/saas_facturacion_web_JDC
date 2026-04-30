import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import {
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
} from '@angular/fire/storage';
import { Observable } from 'rxjs';

import {
  CatalogOrder,
  CatalogOrderStatus,
  CatalogPaymentStatus,
  CreateOrderInput,
  OrderStatusEntry,
  calcOrderTotals,
  cartItemsToOrderItems,
} from '../models/catalog-order.interface';

@Injectable({ providedIn: 'root' })
export class CatalogOrderService {
  private firestore = inject(Firestore);
  private storage   = inject(Storage);

  // ─── Crear orden ────────────────────────────────────────────────────────────

  async createOrder(input: CreateOrderInput): Promise<CatalogOrder> {
    const { slug, companyId, customer, items, paymentMethod } = input;

    const totals     = calcOrderTotals(items);
    const orderItems = cartItemsToOrderItems(items);
    const orderNumber = this._buildOrderNumber(slug);
    const localNow   = Timestamp.now();

    // Payload para Firestore — usa serverTimestamp() para los timestamps del doc
    // pero Timestamp.now() para el historial (valor local inmediato)
    const firestorePayload = {
      slug,
      companyId,
      customer,
      items: orderItems,
      subtotal:  totals.subtotal,
      taxAmount: totals.taxAmount,
      total:     totals.total,
      paymentMethod,
      paymentStatus: 'pending' as CatalogPaymentStatus,
      status:        'new'     as CatalogOrderStatus,
      statusHistory: [
        { status: 'new' as CatalogOrderStatus, changedAt: localNow, note: 'Orden creada' }
      ] as OrderStatusEntry[],
      orderNumber,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const colRef = collection(this.firestore, `public-catalogs/${slug}/orders`);
    const docRef = await addDoc(colRef, firestorePayload);

    // Retornar con Timestamp.now() como aproximación local (la real viene del servidor)
    const order: CatalogOrder = {
      id:            docRef.id,
      slug,
      companyId,
      customer,
      items:         orderItems,
      subtotal:      totals.subtotal,
      taxAmount:     totals.taxAmount,
      total:         totals.total,
      paymentMethod,
      paymentStatus: 'pending',
      status:        'new',
      statusHistory: [{ status: 'new', changedAt: localNow, note: 'Orden creada' }],
      orderNumber,
      createdAt:     localNow,
      updatedAt:     localNow,
    };

    return order;
  }

  // ─── Subir comprobante de pago (transferencia) ──────────────────────────────

  async uploadPaymentProof(
    slug: string,
    orderId: string,
    file: File
  ): Promise<{ url: string; storagePath: string }> {
    const ext         = file.name.split('.').pop() ?? 'jpg';
    const storagePath = `catalog-orders/${slug}/${orderId}/payment-proof.${ext}`;
    const storageRef  = ref(this.storage, storagePath);

    await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(storageRef);

    const orderRef = doc(this.firestore, `public-catalogs/${slug}/orders/${orderId}`);
    await updateDoc(orderRef, {
      paymentProofUrl:         url,
      paymentProofStoragePath: storagePath,
      paymentStatus:           'proof_uploaded' as CatalogPaymentStatus,
      updatedAt:               serverTimestamp(),
    });

    return { url, storagePath };
  }

  // ─── Leer una orden por ID (stream) ─────────────────────────────────────────

  getOrderById(slug: string, orderId: string): Observable<CatalogOrder | null> {
    return new Observable(observer => {
      const orderRef = doc(this.firestore, `public-catalogs/${slug}/orders/${orderId}`);
      return onSnapshot(orderRef, {
        next: snap => observer.next(
          snap.exists() ? ({ id: snap.id, ...snap.data() } as CatalogOrder) : null
        ),
        error: err => observer.error(err),
      });
    });
  }

  // ─── Leer una orden por ID (one-shot) ───────────────────────────────────────

  async getOrderOnce(slug: string, orderId: string): Promise<CatalogOrder | null> {
    const orderRef = doc(this.firestore, `public-catalogs/${slug}/orders/${orderId}`);
    const snap = await getDoc(orderRef);
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as CatalogOrder) : null;
  }

  // ─── Listar órdenes del catálogo (admin, requiere auth) ─────────────────────

  getOrdersBySlug(
    slug: string,
    filters?: { status?: CatalogOrderStatus; paymentStatus?: CatalogPaymentStatus }
  ): Observable<CatalogOrder[]> {
    return new Observable(observer => {
      const colRef = collection(this.firestore, `public-catalogs/${slug}/orders`);
      let q = query(colRef, orderBy('createdAt', 'desc'));

      if (filters?.status) {
        q = query(q, where('status', '==', filters.status));
      }
      if (filters?.paymentStatus) {
        q = query(q, where('paymentStatus', '==', filters.paymentStatus));
      }

      return onSnapshot(q, {
        next: snap => observer.next(
          snap.docs.map(d => ({ id: d.id, ...d.data() }) as CatalogOrder)
        ),
        error: err => observer.error(err),
      });
    });
  }

  // ─── Cambiar estado del pedido (admin) ──────────────────────────────────────

  async updateOrderStatus(
    slug: string,
    orderId: string,
    status: CatalogOrderStatus,
    note?: string
  ): Promise<void> {
    const orderRef = doc(this.firestore, `public-catalogs/${slug}/orders/${orderId}`);
    const snap     = await getDoc(orderRef);
    if (!snap.exists()) throw new Error('Orden no encontrada');

    const current = snap.data() as CatalogOrder;
    const entry: OrderStatusEntry = {
      status,
      changedAt: Timestamp.now(),
      ...(note ? { note } : {}),
    };

    await updateDoc(orderRef, {
      status,
      statusHistory: [...(current.statusHistory ?? []), entry],
      updatedAt: serverTimestamp(),
    });
  }

  // ─── Confirmar pago (admin) ─────────────────────────────────────────────────

  async confirmPayment(slug: string, orderId: string): Promise<void> {
    const orderRef = doc(this.firestore, `public-catalogs/${slug}/orders/${orderId}`);
    await updateDoc(orderRef, {
      paymentStatus: 'confirmed' as CatalogPaymentStatus,
      updatedAt:     serverTimestamp(),
    });
  }

  // ─── Rechazar pago (admin) ──────────────────────────────────────────────────

  async rejectPayment(slug: string, orderId: string, reason: string): Promise<void> {
    const orderRef = doc(this.firestore, `public-catalogs/${slug}/orders/${orderId}`);
    await updateDoc(orderRef, {
      paymentStatus:              'rejected' as CatalogPaymentStatus,
      'customer.rejectionReason': reason,
      updatedAt:                  serverTimestamp(),
    });
  }

  // ─── Helper: número de orden legible ────────────────────────────────────────

  private _buildOrderNumber(slug: string): string {
    const now    = new Date();
    const date   = now.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 9000 + 1000);
    const prefix = slug.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return `ORD-${prefix}-${date}-${random}`;
  }
}
