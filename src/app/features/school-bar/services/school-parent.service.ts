import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot, addDoc, updateDoc,
  query, where, orderBy, Timestamp, getDocs, limit
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import { SchoolParent }  from '../models/school-parent.interface';

@Injectable({ providedIn: 'root' })
export class SchoolParentService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath():   string { return `companies/${this.companyId}/school_parents`; }

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

  // ─── Get or create parent on first Google login ───────────────────────────

  /**
   * Llamado al primer login con Google.
   * Si el representante ya existe en este tenant, lo devuelve. Si no, lo crea.
   */
  async getOrCreateParent(): Promise<SchoolParent> {
    const user = this.authService.user();
    if (!user) throw new Error('Usuario no autenticado');

    const ref  = collection(this.firestore, this.colPath);
    const snap = await getDocs(
      query(ref, where('userId', '==', user.uid), where('companyId', '==', this.companyId), limit(1))
    );

    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as SchoolParent;
    }

    // Crear nuevo perfil de representante desde el token Google
    const now = Timestamp.now();
    const nameParts = (user.displayName ?? '').split(' ');
    const newParent: Omit<SchoolParent, 'id'> = {
      userId:              user.uid,
      companyId:           this.companyId,
      firstName:           nameParts[0] ?? '',
      lastName:            nameParts.slice(1).join(' '),
      fullName:            user.displayName ?? user.email ?? '',
      email:               user.email ?? '',
      photoUrl:            user.photoURL ?? undefined,
      studentIds:          [],
      notifyOnPurchase:    true,
      notifyOnLowBalance:  true,
      lowBalanceThreshold: 2.00,
      notifyOnOrderReady:  true,
      notifyOnDelivery:    true,
      state:               true,
      createdAt:           now,
      updatedAt:           now
    };

    const docRef = await addDoc(ref, this.cleanDoc(newParent));
    return { id: docRef.id, ...newParent };
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  getParent(id: string): Observable<SchoolParent | null> {
    return new Observable(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as SchoolParent : null),
        error: err  => { console.error('[SchoolParentService] getParent:', err); observer.error(err); }
      });
    });
  }

  /** Escucha en tiempo real el perfil del representante actual */
  getCurrentParent(): Observable<SchoolParent | null> {
    const user = this.authService.user();
    return new Observable(observer => {
      if (!user) { observer.next(null); return; }
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('userId', '==', user.uid), where('companyId', '==', this.companyId), limit(1)),
        {
          next:  snap => observer.next(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as SchoolParent),
          error: err  => { console.error('[SchoolParentService] getCurrentParent:', err); observer.error(err); }
        }
      );
    });
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateParent(id: string, changes: Partial<Omit<SchoolParent, 'id' | 'userId' | 'createdAt'>>): Promise<void> {
    await updateDoc(
      doc(this.firestore, `${this.colPath}/${id}`),
      this.cleanDoc({ ...changes, updatedAt: Timestamp.now() })
    );
  }

  /** Vincula un hijo al representante (agrega studentId a studentIds[]) */
  async linkStudent(parentId: string, studentId: string, isPrimary: boolean): Promise<void> {
    const parentRef = doc(this.firestore, `${this.colPath}/${parentId}`);
    const { arrayUnion } = await import('@angular/fire/firestore');
    const update: any = {
      studentIds: arrayUnion(studentId),
      updatedAt:  Timestamp.now()
    };
    if (isPrimary) update['primaryStudentId'] = studentId;
    await updateDoc(parentRef, update);
  }
}
