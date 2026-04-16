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
  Task, TaskCreateInput, TaskStatus, TaskComment
} from '../models/task.interface';

@Injectable({ providedIn: 'root' })
export class TasksService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/tm-tasks`; }

  // ─── List ──────────────────────────────────────────────────────────────────

  getAll(): Observable<Task[]> {
    return new Observable<Task[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('createdAt', 'desc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Task)),
        error: err  => observer.error(err),
      });
    });
  }

  getByProject(projectId: string): Observable<Task[]> {
    return new Observable<Task[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('projectId', '==', projectId), orderBy('priority', 'desc')), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Task)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getByStatus(status: TaskStatus): Observable<Task[]> {
    return new Observable<Task[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('status', '==', status), orderBy('dueDate', 'asc')), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Task)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getByAssignee(userId: string): Observable<Task[]> {
    return new Observable<Task[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('assigneeIds', 'array-contains', userId), orderBy('dueDate', 'asc')), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Task)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getById(id: string): Observable<Task | undefined> {
    return new Observable<Task | undefined>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as Task : undefined),
        error: err  => observer.error(err),
      });
    });
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(input: TaskCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();
    const payload: Omit<Task, 'id'> = {
      ...input,
      loggedHours: 0,
      createdBy:   userId,
      updatedBy:   userId,
      createdAt:   now,
      updatedAt:   now,
      isActive:    true,
    };
    const ref = await addDoc(collection(this.firestore, this.colPath), payload);
    return ref.id;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    id: string,
    changes: Partial<Omit<Task, 'id' | 'createdAt' | 'createdBy'>>
  ): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, { ...changes, updatedAt: Timestamp.now(), updatedBy: userId } as any);
  }

  // ─── Status transition ─────────────────────────────────────────────────────

  async changeStatus(id: string, status: TaskStatus): Promise<void> {
    const changes: Partial<Task> = { status };
    if (status === 'done')        changes.completedAt = Timestamp.now();
    if (status === 'in_progress') changes.startedAt   = Timestamp.now();
    await this.update(id, changes);
  }

  // ─── Comments ──────────────────────────────────────────────────────────────

  async addComment(
    taskId: string,
    comment: Omit<TaskComment, 'id' | 'createdAt'>
  ): Promise<void> {
    const userId  = this.authService.user()?.uid ?? 'unknown';
    const newComment: TaskComment = {
      ...comment,
      id:        crypto.randomUUID(),
      createdAt: Timestamp.now(),
    };
    const ref = doc(this.firestore, `${this.colPath}/${taskId}`);
    await updateDoc(ref, {
      comments:  arrayUnion(newComment),
      updatedAt: Timestamp.now(),
      updatedBy: userId,
    } as any);
  }

  // ─── Soft delete ───────────────────────────────────────────────────────────

  async softDelete(id: string): Promise<void> {
    await this.update(id, { isActive: false } as any);
  }
}
