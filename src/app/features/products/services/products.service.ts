import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData,
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
    const ref = collection(this.firestore, `${this.colPath(productId)}/stocks`);
    return collectionData(ref) as Observable<ProductStock[]>;
  }

  async upsertStock(productId: string, stock: ProductStock): Promise<void> {
    const ref = doc(this.firestore, `${this.colPath(productId)}/stocks/${stock.warehouseCode}`);
    await updateDoc(ref, { ...stock, lastUpdatedAt: Timestamp.now() }).catch(async () => {
      await setDoc(ref, { ...stock, lastUpdatedAt: Timestamp.now() });
    });
  }

  /**
   * Manual stock adjustment — atomically updates in a single batch:
   *   1. Stock subcollection doc (new qty, location)
   *   2. Product aggregate fields (stockQty, stockAvailable) via increment()
   *   3. Movement record in stock-movements collection
   */
  async adjustStock(
    productId:     string,
    productSku:    string,
    productName:   string,
    stock:         ProductStock,
    newQty:        number,
    newLocation:   string,
    reason:        string,
    userId:        string
  ): Promise<void> {
    const delta = newQty - stock.qty;
    const batch = writeBatch(this.firestore);

    // 1. Update stock subcollection document
    const stockRef = doc(this.firestore, `${this.colPath(productId)}/stocks/${stock.warehouseCode}`);
    batch.set(stockRef, {
      ...stock,
      qty:            newQty,
      available:      Math.max(0, newQty - (stock.reserved ?? 0)),
      location:       newLocation,
      lastUpdatedAt:  Timestamp.now(),
      lastUpdatedQty: stock.qty
    });

    // 2. Update product aggregate stockQty / stockAvailable atomically
    const productRef = doc(this.firestore, this.colPath(productId));
    batch.update(productRef, {
      stockQty:       increment(delta),
      stockAvailable: increment(delta),
      updatedAt:      Timestamp.now()
    });

    // 3. Write movement record
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

  /** All stock movements for a product, newest first.  Pass warehouseCode to filter by warehouse. */
  getMovements(productId: string, warehouseCode?: string, maxResults = 200): Observable<StockMovement[]> {
    const ref = collection(this.firestore, `companies/${this.companyId}/stock-movements`);
    const constraints = warehouseCode
      ? query(ref, where('productId', '==', productId), where('warehouseCode', '==', warehouseCode), orderBy('createdAt', 'desc'), limit(maxResults))
      : query(ref, where('productId', '==', productId), orderBy('createdAt', 'desc'), limit(maxResults));
    return collectionData(constraints, { idField: 'id' }) as Observable<StockMovement[]>;
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
