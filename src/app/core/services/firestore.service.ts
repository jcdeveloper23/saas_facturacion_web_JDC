import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  getDocs,
  writeBatch,
  runTransaction,
  Timestamp,
  QueryConstraint,
  onSnapshot
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { TenantService } from './tenant.service';

/**
 * FirestoreService — multi-tenant aware generic Firestore service.
 * All operations are scoped to the active company: /companies/{companyId}/{collection}
 */
@Injectable({ providedIn: 'root' })
export class FirestoreService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);

  // ─── Path helpers ────────────────────────────────────────────────────────

  private companyPath(collectionName: string): string {
    const companyId = this.tenantService.companyId;
    if (!companyId) throw new Error('No active company. User must be logged in.');
    return `companies/${companyId}/${collectionName}`;
  }

  private docRef(collectionName: string, id: string) {
    return doc(this.firestore, `${this.companyPath(collectionName)}/${id}`);
  }

  // ─── Read (realtime) ─────────────────────────────────────────────────────

  getCollection<T>(collectionName: string): Observable<T[]> {
    return new Observable<T[]>(observer => {
      const ref = collection(this.firestore, this.companyPath(collectionName));
      return onSnapshot(ref, {
        next: (snap) => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as T)),
        error: (err) => observer.error(err)
      });
    });
  }

  getCollectionQuery<T>(
    collectionName: string,
    ...constraints: QueryConstraint[]
  ): Observable<T[]> {
    return new Observable<T[]>(observer => {
      const ref = collection(this.firestore, this.companyPath(collectionName));
      const q = query(ref, ...constraints);
      return onSnapshot(q, {
        next: (snap) => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as T)),
        error: (err) => observer.error(err)
      });
    });
  }

  getDocument<T>(collectionName: string, id: string): Observable<T | undefined> {
    return new Observable<T | undefined>(observer => {
      const ref = this.docRef(collectionName, id);
      return onSnapshot(ref, {
        next: (snap) => observer.next(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : undefined),
        error: (err) => observer.error(err)
      });
    });
  }

  // ─── Read (one-time) ─────────────────────────────────────────────────────

  async queryOnce<T>(
    collectionName: string,
    ...constraints: QueryConstraint[]
  ): Promise<T[]> {
    const ref = collection(this.firestore, this.companyPath(collectionName));
    const q = query(ref, ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as T);
  }

  async getDocumentOnce<T>(collectionName: string, id: string): Promise<T | null> {
    const { getDoc } = await import('@angular/fire/firestore');
    const snap = await getDoc(this.docRef(collectionName, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
  }

  // ─── Write ───────────────────────────────────────────────────────────────

  async addDocument<T extends object>(collectionName: string, data: T): Promise<string> {
    const ref = collection(this.firestore, this.companyPath(collectionName));
    const now = Timestamp.now();
    const docRef = await addDoc(ref, { ...data, createdAt: now, updatedAt: now, isActive: true });
    return docRef.id;
  }

  async updateDocument<T extends object>(
    collectionName: string,
    id: string,
    data: Partial<T>
  ): Promise<void> {
    await updateDoc(this.docRef(collectionName, id), {
      ...data,
      updatedAt: Timestamp.now()
    } as any);
  }

  async softDelete(collectionName: string, id: string): Promise<void> {
    await this.updateDocument(collectionName, id, { isActive: false } as any);
  }

  async hardDelete(collectionName: string, id: string): Promise<void> {
    await deleteDoc(this.docRef(collectionName, id));
  }

  // ─── Batch / Transaction ─────────────────────────────────────────────────

  getBatch() {
    return writeBatch(this.firestore);
  }

  runTransaction<T>(fn: Parameters<typeof runTransaction<T>>[1]): Promise<T> {
    return runTransaction(this.firestore, fn);
  }

  // ─── Root-level access (super-admin only) ────────────────────────────────

  getRootCollection<T>(collectionName: string): Observable<T[]> {
    return new Observable<T[]>(observer => {
      const ref = collection(this.firestore, collectionName);
      return onSnapshot(ref, {
        next: (snap) => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as T)),
        error: (err) => observer.error(err)
      });
    });
  }

  getRootCollectionQuery<T>(
    collectionName: string,
    ...constraints: QueryConstraint[]
  ): Promise<T[]> {
    const ref = collection(this.firestore, collectionName);
    const q = query(ref, ...constraints);
    return getDocs(q).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }) as T));
  }

  getRootDocument<T>(collectionName: string, id: string): Observable<T | undefined> {
    return new Observable<T | undefined>(observer => {
      const ref = doc(this.firestore, `${collectionName}/${id}`);
      return onSnapshot(ref, {
        next: (snap) => observer.next(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : undefined),
        error: (err) => observer.error(err)
      });
    });
  }

  async addRootDocument<T extends object>(collectionName: string, data: T): Promise<string> {
    const ref = collection(this.firestore, collectionName);
    const now = Timestamp.now();
    const docRef = await addDoc(ref, { ...data, createdAt: now, updatedAt: now });
    return docRef.id;
  }

  async updateRootDocument<T extends object>(
    collectionName: string,
    id: string,
    data: Partial<T>
  ): Promise<void> {
    const ref = doc(this.firestore, `${collectionName}/${id}`);
    await updateDoc(ref, { ...data, updatedAt: Timestamp.now() } as any);
  }
}
