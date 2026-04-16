import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, query, orderBy, where, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  Project, ProjectCreateInput, ProjectStatus
} from '../models/project.interface';

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/tm-projects`; }

  // ─── List ──────────────────────────────────────────────────────────────────

  getAll(): Observable<Project[]> {
    return new Observable<Project[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('createdAt', 'desc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Project)),
        error: err  => observer.error(err),
      });
    });
  }

  getActive(): Observable<Project[]> {
    return new Observable<Project[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('status', '==', 'active'), orderBy('dueDate', 'asc')), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Project)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getById(id: string): Observable<Project | undefined> {
    return new Observable<Project | undefined>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as Project : undefined),
        error: err  => observer.error(err),
      });
    });
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(input: ProjectCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();
    const payload: Omit<Project, 'id'> = {
      ...input,
      loggedHours:   0,
      completionPct: 0,
      createdBy:  userId,
      updatedBy:  userId,
      createdAt:  now,
      updatedAt:  now,
      isActive:   true,
    };
    const ref = await addDoc(collection(this.firestore, this.colPath), payload);
    return ref.id;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    id: string,
    changes: Partial<Omit<Project, 'id' | 'createdAt' | 'createdBy'>>
  ): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, { ...changes, updatedAt: Timestamp.now(), updatedBy: userId } as any);
  }

  // ─── Status transition ─────────────────────────────────────────────────────

  async changeStatus(id: string, status: ProjectStatus): Promise<void> {
    const changes: Partial<Project> = { status };
    if (status === 'completed') changes.completedAt = Timestamp.now();
    await this.update(id, changes);
  }

  // ─── Soft delete ───────────────────────────────────────────────────────────

  async softDelete(id: string): Promise<void> {
    await this.update(id, { isActive: false } as any);
  }
}
