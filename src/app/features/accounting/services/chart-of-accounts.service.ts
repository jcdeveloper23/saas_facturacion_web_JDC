import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc, getDocs,
  query, orderBy, where, writeBatch, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  Account, AccountType, AccountNature,
  levelFromCode, parentCodeFromCode, defaultNatureForType,
  ECUADOR_CHART_OF_ACCOUNTS_SEED
} from '../models/account.interface';

export type AccountCreateInput = Omit<Account,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy'
>;

@Injectable({ providedIn: 'root' })
export class ChartOfAccountsService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/chart_of_accounts`; }

  // ─── List ─────────────────────────────────────────────────────────────────

  getAccounts(): Observable<Account[]> {
    return new Observable<Account[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('code', 'asc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account))),
        error: err  => { console.error('[ChartOfAccountsService] getAccounts error:', err); observer.error(err); }
      });
    });
  }

  getActiveMovementAccounts(): Observable<Account[]> {
    return new Observable<Account[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref, where('allowsMovement', '==', true), where('isActive', '==', true), orderBy('code', 'asc')),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account))),
          error: err  => observer.error(err)
        }
      );
    });
  }

  getAccount(id: string): Observable<Account | null> {
    return new Observable<Account | null>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as Account : null),
        error: err  => observer.error(err)
      });
    });
  }

  // ─── Firestore safe serialization ─────────────────────────────────────────

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

  // ─── Create ───────────────────────────────────────────────────────────────

  async createAccount(input: AccountCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();
    const level  = levelFromCode(input.code);
    const parentCode = parentCodeFromCode(input.code);

    const account: Omit<Account, 'id'> = {
      ...input,
      level,
      parentCode,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(account));
    return ref.id;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateAccount(id: string, changes: Partial<Omit<Account, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);

    const payload: any = { ...changes, updatedAt: Timestamp.now(), updatedBy: userId };

    // Recalculate level and parentCode if code changed
    if (changes.code) {
      payload.level      = levelFromCode(changes.code);
      payload.parentCode = parentCodeFromCode(changes.code);
    }

    await updateDoc(ref, this.cleanDoc(payload));
  }

  // ─── Toggle active ────────────────────────────────────────────────────────

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    await this.updateAccount(id, { isActive });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteAccount(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.colPath}/${id}`));
  }

  // ─── Check if code exists ─────────────────────────────────────────────────

  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const snap = await getDocs(
      query(collection(this.firestore, this.colPath), where('code', '==', code))
    );
    return snap.docs.some(d => d.id !== excludeId);
  }

  // ─── Seed Ecuador chart of accounts ──────────────────────────────────────

  async seedChartOfAccounts(): Promise<void> {
    const userId  = this.authService.user()?.uid ?? 'unknown';
    const now     = Timestamp.now();
    const batch   = writeBatch(this.firestore);
    const colRef  = collection(this.firestore, this.colPath);

    for (const entry of ECUADOR_CHART_OF_ACCOUNTS_SEED) {
      const docRef = doc(colRef);
      const account: Omit<Account, 'id'> = {
        code:           entry.code,
        name:           entry.name,
        type:           entry.type,
        nature:         entry.nature,
        level:          levelFromCode(entry.code),
        parentCode:     parentCodeFromCode(entry.code),
        isActive:       true,
        isAuxiliary:    entry.allowsMovement,
        allowsMovement: entry.allowsMovement,
        createdBy:      userId,
        createdAt:      now,
        updatedAt:      now
      };
      batch.set(docRef, this.cleanDoc(account));
    }

    await batch.commit();
  }

  // ─── Import from array (CSV/Excel parsed externally) ──────────────────────

  async importAccounts(entries: { code: string; name: string; type: AccountType; nature: AccountNature; allowsMovement: boolean }[]): Promise<{ created: number; skipped: number }> {
    const userId   = this.authService.user()?.uid ?? 'unknown';
    const now      = Timestamp.now();
    let created    = 0;
    let skipped    = 0;

    // Process in batches of 450 (Firestore limit is 500 per batch)
    const batchSize = 450;
    for (let i = 0; i < entries.length; i += batchSize) {
      const chunk  = entries.slice(i, i + batchSize);
      const batch  = writeBatch(this.firestore);
      const colRef = collection(this.firestore, this.colPath);

      for (const entry of chunk) {
        if (!entry.code || !entry.name) { skipped++; continue; }
        const docRef  = doc(colRef);
        const account: Omit<Account, 'id'> = {
          code:           entry.code,
          name:           entry.name,
          type:           entry.type,
          nature:         entry.nature || defaultNatureForType(entry.type),
          level:          levelFromCode(entry.code),
          parentCode:     parentCodeFromCode(entry.code),
          isActive:       true,
          isAuxiliary:    entry.allowsMovement,
          allowsMovement: entry.allowsMovement,
          createdBy:      userId,
          createdAt:      now,
          updatedAt:      now
        };
        batch.set(docRef, this.cleanDoc(account));
        created++;
      }

      await batch.commit();
    }

    return { created, skipped };
  }
}
