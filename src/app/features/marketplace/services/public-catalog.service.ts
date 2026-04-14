import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
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
        limit(200)
      );
      return onSnapshot(q, {
        next: snap => observer.next(
          snap.docs.map(d => ({ id: d.id, ...d.data() }) as PublicProduct)
        ),
        error: err => observer.error(err)
      });
    });
  }
}
