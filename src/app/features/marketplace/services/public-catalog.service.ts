import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  getDoc
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { PublicCatalog, PublicProduct } from '../models/catalog.interface';

/**
 * PublicCatalogService — reads /public-catalogs/{slug} and its products subcollection.
 * Does NOT require authentication — uses Firestore directly without tenant context.
 */
@Injectable({ providedIn: 'root' })
export class PublicCatalogService {
  private firestore = inject(Firestore);

  /**
   * Streams a single public catalog document by its URL slug.
   * Returns null if the document does not exist.
   */
  getCatalogBySlug(slug: string): Observable<PublicCatalog | null> {
    return new Observable<PublicCatalog | null>(observer => {
      const ref = doc(this.firestore, `public-catalogs/${slug}`);
      return onSnapshot(ref, {
        next: snap => observer.next(snap.exists() ? ({ ...snap.data() } as PublicCatalog) : null),
        error: err => observer.error(err)
      });
    });
  }

  /**
   * Streams active public products for a catalog slug.
   * Filters: isActive == true, ordered by name, limit 200.
   */
  getPublicProducts(slug: string): Observable<PublicProduct[]> {
    return new Observable<PublicProduct[]>(observer => {
      const ref = collection(this.firestore, `public-catalogs/${slug}/products`);
      const q = query(
        ref,
        where('isActive', '==', true),
        orderBy('name'),
        limit(1000)
      );
      return onSnapshot(q, {
        next: snap => observer.next(
          snap.docs.map(d => ({ id: d.id, ...d.data() }) as PublicProduct)
        ),
        error: err => observer.error(err)
      });
    });
  }

  /**
   * Streams like counts for all products in a catalog.
   * Path: public-catalogs/{slug}/product-likes/{productId}  →  { count: number }
   */
  getLikesForCatalog(slug: string): Observable<Record<string, number>> {
    return new Observable<Record<string, number>>(observer => {
      const ref = collection(this.firestore, `public-catalogs/${slug}/product-likes`);
      return onSnapshot(ref, {
        next: snap => {
          const counts: Record<string, number> = {};
          snap.docs.forEach(d => { counts[d.id] = (d.data()['count'] as number) ?? 0; });
          observer.next(counts);
        },
        error: err => observer.error(err)
      });
    });
  }

  /**
   * Increments or decrements the like counter for a product.
   * delta: +1 (like) | -1 (unlike)
   * Creates the document if it doesn't exist yet.
   */
  async toggleProductLike(slug: string, productId: string, delta: 1 | -1): Promise<void> {
    const ref = doc(this.firestore, `public-catalogs/${slug}/product-likes/${productId}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { count: Math.max(0, delta), updatedAt: serverTimestamp() });
    } else {
      const current = (snap.data()['count'] as number) ?? 0;
      await updateDoc(ref, {
        count: increment(current + delta < 0 ? -current : delta),
        updatedAt: serverTimestamp()
      });
    }
  }
}
