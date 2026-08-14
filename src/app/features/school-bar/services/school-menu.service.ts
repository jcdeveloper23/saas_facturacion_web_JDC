import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { SchoolMenu, MenuItem } from '../models/school-menu.interface';

@Injectable({ providedIn: 'root' })
export class SchoolMenuService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath():   string { return `companies/${this.companyId}/school_menus`; }

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

  /** Menús del tenant ordenados por fecha desc */
  getMenus(limitDays = 14): Observable<SchoolMenu[]> {
    return new Observable(observer => {
      const ref   = collection(this.firestore, this.colPath);
      const today = new Date();
      today.setDate(today.getDate() - limitDays);
      const fromDate = today.toISOString().split('T')[0]; // "YYYY-MM-DD"
      return onSnapshot(
        query(ref,
          where('companyId', '==', this.companyId),
          where('date', '>=', fromDate),
          orderBy('date', 'desc')
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolMenu)),
          error: err  => { console.error('[SchoolMenuService] getMenus:', err); observer.error(err); }
        }
      );
    });
  }

  /** Menú publicado de una fecha específica — para el representante y el POS */
  getPublishedMenuForDate(date: string): Observable<SchoolMenu | null> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref,
          where('companyId', '==', this.companyId),
          where('date', '==', date),
          where('published', '==', true)
        ),
        {
          next:  snap => observer.next(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as SchoolMenu),
          error: err  => { console.error('[SchoolMenuService] getPublishedMenuForDate:', err); observer.error(err); }
        }
      );
    });
  }

  getMenu(id: string): Observable<SchoolMenu | null> {
    return new Observable(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as SchoolMenu : null),
        error: err  => { console.error('[SchoolMenuService] getMenu:', err); observer.error(err); }
      });
    });
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async createMenu(data: Omit<SchoolMenu, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = Timestamp.now();
    const ref = await addDoc(
      collection(this.firestore, this.colPath),
      this.cleanDoc({ ...data, companyId: this.companyId, createdAt: now, updatedAt: now })
    );
    return ref.id;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateMenu(id: string, changes: Partial<Omit<SchoolMenu, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(
      doc(this.firestore, `${this.colPath}/${id}`),
      this.cleanDoc({ ...changes, updatedAt: Timestamp.now() })
    );
  }

  /** Publica el menú del día — activa la visibilidad para representantes */
  async publishMenu(id: string, orderCutoff: Timestamp): Promise<void> {
    await updateDoc(
      doc(this.firestore, `${this.colPath}/${id}`),
      { published: true, publishedAt: Timestamp.now(), orderCutoff, updatedAt: Timestamp.now() }
    );
  }

  /** Marca un item del menú como agotado */
  async markItemUnavailable(menuId: string, itemId: string): Promise<void> {
    const { getDoc } = await import('@angular/fire/firestore');
    const menuRef    = doc(this.firestore, `${this.colPath}/${menuId}`);
    const snap       = await getDoc(menuRef);
    if (!snap.exists()) return;
    const menu  = snap.data() as SchoolMenu;
    const items = menu.items.map(i => i.id === itemId ? { ...i, available: false } : i);
    await updateDoc(menuRef, this.cleanDoc({ items, updatedAt: Timestamp.now() }));
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteMenu(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.colPath}/${id}`));
  }
}
