import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc,
  query, orderBy, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import { BankAccount }   from '../models/bank-account.interface';

export type BankAccountCreateInput = Omit<BankAccount,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy'
>;

@Injectable({ providedIn: 'root' })
export class BankAccountsService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/bank_accounts`; }

  // ─── List ─────────────────────────────────────────────────────────────────

  getBankAccounts(): Observable<BankAccount[]> {
    return new Observable<BankAccount[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(query(ref, orderBy('bankName', 'asc')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as BankAccount))),
        error: err  => { console.error('[BankAccountsService] getBankAccounts error:', err); observer.error(err); }
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

  async createBankAccount(input: BankAccountCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();

    const account: Omit<BankAccount, 'id'> = {
      ...input,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(account));
    return ref.id;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateBankAccount(id: string, changes: Partial<BankAccount>): Promise<void> {
    const userId  = this.authService.user()?.uid ?? 'unknown';
    const ref     = doc(this.firestore, `${this.colPath}/${id}`);
    const payload = { ...changes, updatedAt: Timestamp.now(), updatedBy: userId };
    await updateDoc(ref, this.cleanDoc(payload));
  }

  // ─── Toggle active ────────────────────────────────────────────────────────

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    await this.updateBankAccount(id, { isActive });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async deleteBankAccount(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.colPath}/${id}`));
  }
}
