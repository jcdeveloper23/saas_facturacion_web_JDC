import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, limit,
  query, orderBy, where, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  TeamMember, TeamMemberCreateInput
} from '../models/team-member.interface';

@Injectable({ providedIn: 'root' })
export class TeamMembersService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/tm-members`; }

  // ─── List ──────────────────────────────────────────────────────────────────

  getAll(): Observable<TeamMember[]> {
    return new Observable<TeamMember[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('displayName', 'asc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TeamMember)),
        error: err  => observer.error(err),
      });
    });
  }

  getActive(): Observable<TeamMember[]> {
    return new Observable<TeamMember[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('status', '==', 'active'), orderBy('displayName', 'asc')), {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TeamMember)),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getByUserId(userId: string): Observable<TeamMember | undefined> {
    return new Observable<TeamMember | undefined>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('userId', '==', userId), limit(1)), {
          next:  snap => observer.next(
            snap.empty ? undefined : { id: snap.docs[0].id, ...snap.docs[0].data() } as TeamMember
          ),
          error: err  => observer.error(err),
        }
      );
    });
  }

  getById(id: string): Observable<TeamMember | undefined> {
    return new Observable<TeamMember | undefined>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as TeamMember : undefined),
        error: err  => observer.error(err),
      });
    });
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(input: TeamMemberCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();
    const payload: Omit<TeamMember, 'id'> = {
      ...input,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
      isActive:  true,
    };
    const ref = await addDoc(collection(this.firestore, this.colPath), payload);
    return ref.id;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    id: string,
    changes: Partial<Omit<TeamMember, 'id' | 'createdAt' | 'createdBy'>>
  ): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    await updateDoc(ref, { ...changes, updatedAt: Timestamp.now(), updatedBy: userId } as any);
  }

  // ─── Workload ──────────────────────────────────────────────────────────────

  async updateWorkload(memberId: string, projectIds: string[]): Promise<void> {
    await this.update(memberId, { activeProjectIds: projectIds });
  }
}
