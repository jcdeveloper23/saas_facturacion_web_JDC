import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData, onSnapshot,
  addDoc, updateDoc, deleteDoc, getDocs, setDoc,
  query, where, orderBy, limit, Timestamp, writeBatch, increment
} from '@angular/fire/firestore';
import { Observable, from, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';

import { FirestoreService } from '../../../core/services/firestore.service';
import { TenantService }    from '../../../core/services/tenant.service';
import {
  Product, ProductStock, ProductSupplier, ProductVariant, StockMovement, StockMovementType
} from '../models/product.interface';

export type ProductCreateInput = Omit<Product,
  'id' | 'createdAt' | 'updatedAt' | 'averageCost' |
  'stockQty' | 'stockReserved' | 'stockAvailable'
>;

/** Payload used when a sale or purchase modifies stock levels. */
export interface StockTransactionPayload {
  productId:    string;
  productSku:   string;
  productName:  string;
  warehouseCode: string;
  warehouseName?: string;
  qty: number;          // always positive; direction determined by type
  unitCost?: number;
  sourceDocId?: string;
  sourceDocType?: 'invoice' | 'purchase';
  userId: string;
}
export type ProductUpdateInput = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>;

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private fs            = inject(FirestoreService);
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);

  private get companyId(): string {
    return this.tenantService.companyId;
  }

  private colPath(sub?: string): string {
    const base = `companies/${this.companyId}/products`;
    return sub ? `${base}/${sub}` : base;
  }

  // ─── Products ─────────────────────────────────────────────────────────────

  getProducts(): Observable<Product[]> {
    return this.fs.getCollection<Product>('products');
  }

  getActiveProducts(): Observable<Product[]> {
    return this.fs.getCollectionQuery<Product>(
      'products',
      where('isActive', '==', true)
    );
  }

  async getProduct(id: string): Promise<Product | null> {
    return this.fs.getDocumentOnce<Product>('products', id);
  }

  getProduct$(id: string): Observable<Product | undefined> {
    return this.fs.getDocument<Product>('products', id);
  }

  async skuExists(sku: string, excludeId?: string): Promise<boolean> {
    const ref  = collection(this.firestore, this.colPath());
    const q    = query(ref, where('sku', '==', sku.trim().toUpperCase()));
    const snap = await getDocs(q);
    if (snap.empty) return false;
    if (excludeId) return snap.docs.some(d => d.id !== excludeId);
    return true;
  }

  async createProduct(data: ProductCreateInput): Promise<string> {
    const now = Timestamp.now();
    const payload = {
      ...this.clean(data),
      sku:            data.sku.trim().toUpperCase(),
      averageCost:    data.costPrice ?? 0,
      stockQty:       0,
      stockReserved:  0,
      stockAvailable: 0,
      isActive:       data.isActive ?? true,
      createdAt:      now,
      updatedAt:      now
    };
    const ref    = collection(this.firestore, this.colPath());
    const docRef = await addDoc(ref, payload);
    return docRef.id;
  }

  async updateProduct(id: string, data: ProductUpdateInput): Promise<void> {
    return this.fs.updateDocument<Product>('products', id, this.clean(data) as any);
  }

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    return this.fs.updateDocument<Product>('products', id, { isActive } as any);
  }

  async deleteProduct(id: string): Promise<void> {
    return this.fs.softDelete('products', id);
  }

  // ─── Stock subcollection ──────────────────────────────────────────────────

  getStocks(productId: string): Observable<ProductStock[]> {
    return new Observable<ProductStock[]>(observer => {
      const ref = collection(this.firestore, `${this.colPath(productId)}/stocks`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.docs.map(d => d.data() as ProductStock)),
        error: err  => { console.error('[getStocks] error:', err); observer.error(err); }
      });
    });
  }

  async upsertStock(productId: string, stock: ProductStock): Promise<void> {
    const ref = doc(this.firestore, `${this.colPath(productId)}/stocks/${stock.warehouseCode}`);
    await updateDoc(ref, { ...stock, lastUpdatedAt: Timestamp.now() }).catch(async () => {
      await setDoc(ref, { ...stock, lastUpdatedAt: Timestamp.now() });
    });
  }

  /**
   * Manual stock adjustment — atomically updates in a single batch:
   *   1. Stock subcollection doc (new qty, available, location)
   *   2. Product aggregate fields (stockQty, stockAvailable) as exact values
   *   3. Movement record in stock-movements collection
   *
   * stockAvailable is always stored as stockQty - stockReserved (never recalculated in UI).
   * available per warehouse can be negative to expose real deficit.
   */
  async adjustStock(
    productId:       string,
    productSku:      string,
    productName:     string,
    stock:           ProductStock,
    newQty:          number,
    newLocation:     string,
    reason:          string,
    userId:          string,
    currentStockQty: number,   // product.stockQty before this adjustment
    stockReserved:   number    // product.stockReserved (unchanged by this operation)
  ): Promise<void> {
    const delta           = newQty - stock.qty;
    const newStockQty     = currentStockQty + delta;
    const newStockAvail   = newStockQty - stockReserved;          // exact formula, stored in DB
    const newWarehouseAvail = newQty - (stock.reserved ?? 0);     // per-warehouse, can be negative

    const batch = writeBatch(this.firestore);

    // 1. Update stock subcollection document — available can be negative (real deficit)
    const stockRef = doc(this.firestore, `${this.colPath(productId)}/stocks/${stock.warehouseCode}`);
    batch.set(stockRef, {
      ...stock,
      qty:            newQty,
      available:      newWarehouseAvail,
      location:       newLocation,
      lastUpdatedAt:  Timestamp.now(),
      lastUpdatedQty: stock.qty
    });

    // 2. Persist exact aggregate values — never recomputed in the UI
    const productRef = doc(this.firestore, this.colPath(productId));
    batch.update(productRef, {
      stockQty:       newStockQty,
      stockAvailable: newStockAvail,
      updatedAt:      Timestamp.now()
    });

    // 3. Write movement record (admin client write; rules allow isAdmin)
    const movRef = doc(collection(this.firestore, `companies/${this.companyId}/stock-movements`));
    batch.set(movRef, {
      type:           'adjustment' as StockMovementType,
      productId,
      productSku,
      productName,
      warehouseCode:  stock.warehouseCode,
      warehouseName:  stock.warehouseName ?? '',
      qtyBefore:      stock.qty,
      qtyAfter:       newQty,
      qtyDelta:       delta,
      reason:         reason || '',
      sourceDocType:  'adjustment',
      userId,
      createdAt:      Timestamp.now()
    } as Omit<StockMovement, 'id'>);

    await batch.commit();
  }

  /**
   * Records a stock exit due to a sale (invoice).
   * Decrements stockQty (stockFis) and stockAvailable atomically.
   * stockReserved is decremented if items were previously reserved.
   */
  async recordSale(payload: StockTransactionPayload, stockReservedWas: boolean = false): Promise<void> {
    const stockSnap = await getDocs(
      query(collection(this.firestore, `${this.colPath(payload.productId)}/stocks`),
        where('warehouseCode', '==', payload.warehouseCode))
    );
    const currentWh: ProductStock | null = stockSnap.empty
      ? null
      : (stockSnap.docs[0].data() as ProductStock);

    const batch      = writeBatch(this.firestore);
    const delta      = -payload.qty;   // exit → negative
    const resDecrement = stockReservedWas ? payload.qty : 0;

    // 1. Update warehouse stock
    if (currentWh) {
      const stockRef = doc(this.firestore, `${this.colPath(payload.productId)}/stocks/${payload.warehouseCode}`);
      batch.update(stockRef, {
        qty:           increment(delta),
        available:     increment(delta + resDecrement),  // delta already negative; release reservation
        reserved:      increment(-resDecrement),
        lastUpdatedAt: Timestamp.now(),
        lastUpdatedQty: currentWh.qty
      });
    }

    // 2. Update product aggregate — stockAvailable accounts for released reservation
    const productRef = doc(this.firestore, this.colPath(payload.productId));
    batch.update(productRef, {
      stockQty:       increment(delta),
      stockReserved:  increment(-resDecrement),
      stockAvailable: increment(delta + resDecrement),
      updatedAt:      Timestamp.now()
    });

    // 3. Write movement
    const movRef = doc(collection(this.firestore, `companies/${this.companyId}/stock-movements`));
    batch.set(movRef, {
      type:           'sale' as StockMovementType,
      productId:      payload.productId,
      productSku:     payload.productSku,
      productName:    payload.productName,
      warehouseCode:  payload.warehouseCode,
      warehouseName:  payload.warehouseName ?? '',
      qtyBefore:      currentWh?.qty ?? 0,
      qtyAfter:       (currentWh?.qty ?? 0) + delta,
      qtyDelta:       delta,
      unitCost:       payload.unitCost,
      sourceDocId:    payload.sourceDocId,
      sourceDocType:  'invoice',
      userId:         payload.userId,
      createdAt:      Timestamp.now()
    } as Omit<StockMovement, 'id'>);

    await batch.commit();
  }

  /**
   * Records a stock entry due to a purchase order receipt.
   * Increments stockQty (stockFis) and stockAvailable atomically.
   * Updates averageCost (weighted average) when unitCost is provided.
   */
  async recordPurchase(payload: StockTransactionPayload, currentStockQty: number, currentAvgCost: number): Promise<void> {
    const stockSnap = await getDocs(
      query(collection(this.firestore, `${this.colPath(payload.productId)}/stocks`),
        where('warehouseCode', '==', payload.warehouseCode))
    );
    const currentWh: ProductStock | null = stockSnap.empty
      ? null
      : (stockSnap.docs[0].data() as ProductStock);

    const batch = writeBatch(this.firestore);
    const delta = payload.qty;   // entry → positive

    // Weighted average cost: (currentQty * currentAvgCost + incomingQty * unitCost) / newTotalQty
    const newTotalQty = currentStockQty + delta;
    const newAvgCost  = payload.unitCost != null && newTotalQty > 0
      ? Math.round(((currentStockQty * currentAvgCost) + (delta * payload.unitCost)) / newTotalQty * 10000) / 10000
      : currentAvgCost;

    // 1. Update warehouse stock
    if (currentWh) {
      const stockRef = doc(this.firestore, `${this.colPath(payload.productId)}/stocks/${payload.warehouseCode}`);
      batch.update(stockRef, {
        qty:           increment(delta),
        available:     increment(delta),
        lastUpdatedAt: Timestamp.now(),
        lastUpdatedQty: currentWh.qty
      });
    } else {
      const stockRef = doc(this.firestore, `${this.colPath(payload.productId)}/stocks/${payload.warehouseCode}`);
      batch.set(stockRef, {
        warehouseCode:  payload.warehouseCode,
        warehouseName:  payload.warehouseName ?? '',
        qty:            delta,
        available:      delta,
        reserved:       0,
        pendingReceive: 0,
        stockMin:       0,
        stockMax:       0,
        lastUpdatedAt:  Timestamp.now(),
        lastUpdatedQty: 0
      } as ProductStock);
    }

    // 2. Update product aggregate + averageCost
    const productRef = doc(this.firestore, this.colPath(payload.productId));
    batch.update(productRef, {
      stockQty:       increment(delta),
      stockAvailable: increment(delta),
      averageCost:    newAvgCost,
      updatedAt:      Timestamp.now()
    });

    // 3. Write movement
    const movRef = doc(collection(this.firestore, `companies/${this.companyId}/stock-movements`));
    batch.set(movRef, {
      type:           'purchase' as StockMovementType,
      productId:      payload.productId,
      productSku:     payload.productSku,
      productName:    payload.productName,
      warehouseCode:  payload.warehouseCode,
      warehouseName:  payload.warehouseName ?? '',
      qtyBefore:      currentWh?.qty ?? 0,
      qtyAfter:       (currentWh?.qty ?? 0) + delta,
      qtyDelta:       delta,
      unitCost:       payload.unitCost,
      sourceDocId:    payload.sourceDocId,
      sourceDocType:  'purchase',
      userId:         payload.userId,
      createdAt:      Timestamp.now()
    } as Omit<StockMovement, 'id'>);

    await batch.commit();
  }

  /** All stock movements for a product, newest first.  Pass warehouseCode to filter by warehouse. */
  getMovements(productId: string, warehouseCode?: string, maxResults = 200): Observable<StockMovement[]> {
    return new Observable<StockMovement[]>(observer => {
      const ref = collection(this.firestore, `companies/${this.companyId}/stock-movements`);
      const q = warehouseCode
        ? query(ref, where('productId', '==', productId), where('warehouseCode', '==', warehouseCode), orderBy('createdAt', 'desc'), limit(maxResults))
        : query(ref, where('productId', '==', productId), orderBy('createdAt', 'desc'), limit(maxResults));
      return onSnapshot(q, {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as StockMovement)),
        error: err  => { console.error('[getMovements] error:', err); observer.error(err); }
      });
    });
  }

  // ─── Suppliers subcollection ──────────────────────────────────────────────

  getSuppliers(productId: string): Observable<ProductSupplier[]> {
    const ref = collection(this.firestore, `${this.colPath(productId)}/suppliers`);
    return collectionData(ref, { idField: 'id' }) as Observable<ProductSupplier[]>;
  }

  async saveSupplier(productId: string, data: Omit<ProductSupplier, 'id'>, id?: string): Promise<string> {
    const subRef = collection(this.firestore, `${this.colPath(productId)}/suppliers`);
    if (id) {
      await updateDoc(doc(subRef, id), { ...data });
      return id;
    }
    const docRef = await addDoc(subRef, { ...data });
    return docRef.id;
  }

  async deleteSupplier(productId: string, supplierId: string): Promise<void> {
    const ref = doc(this.firestore, `${this.colPath(productId)}/suppliers/${supplierId}`);
    await deleteDoc(ref);
  }

  // ─── Variants subcollection ───────────────────────────────────────────────

  getVariants(productId: string): Observable<ProductVariant[]> {
    const ref = collection(this.firestore, `${this.colPath(productId)}/variants`);
    return collectionData(ref, { idField: 'id' }) as Observable<ProductVariant[]>;
  }

  async saveVariant(productId: string, data: Omit<ProductVariant, 'id'>, id?: string): Promise<string> {
    const subRef = collection(this.firestore, `${this.colPath(productId)}/variants`);
    if (id) {
      await updateDoc(doc(subRef, id), { ...data });
      return id;
    }
    const docRef = await addDoc(subRef, { ...data });
    return docRef.id;
  }

  async deleteVariant(productId: string, variantId: string): Promise<void> {
    const ref = doc(this.firestore, `${this.colPath(productId)}/variants/${variantId}`);
    await deleteDoc(ref);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private clean<T extends object>(obj: T): Partial<T> {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' && value.trim() === '') continue;
      result[key] = value;
    }
    return result as Partial<T>;
  }
}
