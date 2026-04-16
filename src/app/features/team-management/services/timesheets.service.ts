import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc,
  query, orderBy, where, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  TimesheetEntry, TimesheetCreateInput
} from '../models/timesheet.interface';

@Injectable({ providedIn: 'root' })
export class TimesheetsService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/tm-timesheets`; }

  // ─── List ──────────────────────────────────────────────────────────────────

  getAll(): Observable<TimesheetEntry[]> {
    return new Observable<TimesheetEntry[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('date', 'desc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TimesheetEntry)),
        error: err  => observer.error(err),
      });
    });
  }

  getByUser(userId: string): Observable<TimesheetEntry[]> {
    return new Observable<TimesheetEntry[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('userId', '==', userId), orderBy('date', 'desc')), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TimesheetEntry)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getByProject(projectId: string): Observable<TimesheetEntry[]> {
    return new Observable<TimesheetEntry[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('projectId', '==', projectId), orderBy('date', 'desc')), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TimesheetEntry)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getByWeek(
    userId: string,
    weekStart: Timestamp,
    weekEnd: Timestamp
  ): Observable<TimesheetEntry[]> {
    return new Observable<TimesheetEntry[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(
          ref,
          where('userId', '==', userId),
          where('date', '>=', weekStart),
          where('date', '<=', weekEnd)
        ), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TimesheetEntry)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getAllByDateRange(start: Timestamp, end: Timestamp): Observable<TimesheetEntry[]> {
    return new Observable<TimesheetEntry[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(
          ref,
          where('date', '>=', start),
          where('date', '<=', end),
          orderBy('date', 'desc')
        ), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TimesheetEntry)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(input: TimesheetCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();
    const payload: Omit<TimesheetEntry, 'id'> = {
      ...input,
      approved:  false,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
      isActive:  true,
    };
    const ref = await addDoc(collection(this.firestore, this.colPath), payload);
    return ref.id;
  }

  // ─── Approve ───────────────────────────────────────────────────────────────

  async approve(id: string): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, {
      approved:   true,
      approvedBy: userId,
      approvedAt: now,
      updatedAt:  now,
      updatedBy:  userId,
    });
  }

  // NOTE: No delete method — timesheets are an immutable audit trail.
}
