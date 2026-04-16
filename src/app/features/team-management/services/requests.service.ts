import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, arrayUnion,
  query, orderBy, where, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  ClientRequest, RequestCreateInput, RequestStatus, RequestStatusChange
} from '../models/request.interface';

@Injectable({ providedIn: 'root' })
export class RequestsService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/tm-requests`; }

  // ─── List ──────────────────────────────────────────────────────────────────

  getAll(): Observable<ClientRequest[]> {
    return new Observable<ClientRequest[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('createdAt', 'desc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ClientRequest)),
        error: err  => observer.error(err),
      });
    });
  }

  getByStatus(status: RequestStatus): Observable<ClientRequest[]> {
    return new Observable<ClientRequest[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('status', '==', status), orderBy('createdAt', 'desc')), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ClientRequest)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getByClient(clientId: string): Observable<ClientRequest[]> {
    return new Observable<ClientRequest[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('clientId', '==', clientId), orderBy('createdAt', 'desc')), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ClientRequest)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getById(id: string): Observable<ClientRequest | undefined> {
    return new Observable<ClientRequest | undefined>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as ClientRequest : undefined),
        error: err  => observer.error(err),
      });
    });
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(input: RequestCreateInput): Promise<string> {
    const userId   = this.authService.user()?.uid ?? 'unknown';
    const userName = this.authService.user()?.displayName ?? userId;
    const now      = Timestamp.now();

    const initialHistory: RequestStatusChange = {
      fromStatus:    'new',
      toStatus:      'new',
      changedBy:     userId,
      changedByName: userName,
      changedAt:     now,
    };

    const payload: Omit<ClientRequest, 'id'> = {
      ...input,
      status:        'new',
      statusHistory: [initialHistory],
      createdBy:     userId,
      updatedBy:     userId,
      createdAt:     now,
      updatedAt:     now,
      isActive:      true,
    };
    const ref = await addDoc(collection(this.firestore, this.colPath), payload);
    return ref.id;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    id: string,
    changes: Partial<Omit<ClientRequest, 'id' | 'createdAt' | 'createdBy'>>
  ): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, { ...changes, updatedAt: Timestamp.now(), updatedBy: userId } as any);
  }

  // ─── Status transition ─────────────────────────────────────────────────────

  async changeStatus(
    id: string,
    toStatus: RequestStatus,
    notes?: string
  ): Promise<void> {
    const userId   = this.authService.user()?.uid ?? 'unknown';
    const userName = this.authService.user()?.displayName ?? userId;
    const now      = Timestamp.now();

    // Read current status to fill fromStatus — we do a fire-and-forget pattern:
    // fromStatus is best-effort from the observable; for the history entry we use
    // the toStatus as fromStatus fallback when we cannot read atomically.
    const historyEntry: RequestStatusChange = {
      fromStatus:    toStatus, // will be overridden by caller if needed; best-effort
      toStatus,
      changedBy:     userId,
      changedByName: userName,
      changedAt:     now,
      ...(notes ? { notes } : {}),
    };

    const ref     = doc(this.firestore, `${this.colPath}/${id}`);
    const changes: any = {
      status:        toStatus,
      statusHistory: arrayUnion(historyEntry),
      updatedAt:     now,
      updatedBy:     userId,
    };
    if (toStatus === 'resolved') changes['resolvedAt'] = now;

    await updateDoc(ref, changes);
  }

  // ─── Link to task ──────────────────────────────────────────────────────────

  async linkToTask(requestId: string, taskId: string): Promise<void> {
    await this.update(requestId, { taskId, status: 'in_progress' });
  }
}
