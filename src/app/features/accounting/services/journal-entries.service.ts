import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc, getDocs,
  query, where, orderBy, Timestamp, runTransaction
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  JournalEntry, JournalEntryLine, JournalEntryType, JournalEntryStatus,
  calcEntryTotals, LibroMayorLine
} from '../models/journal-entry.interface';

export type JournalEntryCreateInput = Omit<JournalEntry,
  'id' | 'number' | 'createdAt' | 'updatedAt' | 'createdBy'
  | 'totalDebit' | 'totalCredit' | 'isBalanced'
>;

export interface JournalEntryFilters {
  periodId?:  string;
  year?:      number;
  type?:      JournalEntryType;
  status?:    JournalEntryStatus;
  dateFrom?:  string;
  dateTo?:    string;
}

@Injectable({ providedIn: 'root' })
export class JournalEntriesService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/journal_entries`; }

  // ─── List ─────────────────────────────────────────────────────────────────

  getEntries(filters: JournalEntryFilters = {}): Observable<JournalEntry[]> {
    return new Observable<JournalEntry[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      const constraints: any[] = [orderBy('date', 'desc'), orderBy('number', 'desc')];

      if (filters.periodId) constraints.unshift(where('periodId',    '==', filters.periodId));
      if (filters.year)     constraints.unshift(where('periodYear',   '==', filters.year));
      if (filters.type)     constraints.unshift(where('type',         '==', filters.type));
      if (filters.status)   constraints.unshift(where('status',       '==', filters.status));

      return onSnapshot(query(ref, ...constraints), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as JournalEntry))),
        error: err  => { console.error('[JournalEntriesService] getEntries error:', err); observer.error(err); }
      });
    });
  }

  getEntry(id: string): Observable<JournalEntry | null> {
    return new Observable<JournalEntry | null>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as JournalEntry : null),
        error: err  => observer.error(err)
      });
    });
  }

  // ─── Libro Mayor: all entries for a given account code ───────────────────

  async getLibroMayor(accountCode: string, periodId?: string): Promise<LibroMayorLine[]> {
    const ref = collection(this.firestore, this.colPath);
    const constraints: any[] = [where('status', '==', 'posted'), orderBy('date', 'asc'), orderBy('number', 'asc')];
    if (periodId) constraints.unshift(where('periodId', '==', periodId));

    const snap   = await getDocs(query(ref, ...constraints));
    const result: LibroMayorLine[] = [];
    let   balance = 0;

    for (const d of snap.docs) {
      const entry = { id: d.id, ...d.data() } as JournalEntry;
      for (const line of entry.lines) {
        if (line.accountCode === accountCode) {
          balance += (line.debit ?? 0) - (line.credit ?? 0);
          result.push({
            entryId:     entry.id,
            entryNumber: entry.number,
            date:        entry.date,
            description: entry.description,
            reference:   entry.reference ?? '',
            debit:       line.debit,
            credit:      line.credit,
            balance:     Math.round(balance * 100) / 100,
            type:        entry.type
          });
        }
      }
    }

    return result;
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

  async createEntry(input: JournalEntryCreateInput): Promise<string> {
    const userId  = this.authService.user()?.uid ?? 'unknown';
    const now     = Timestamp.now();
    const number  = await this.nextNumber(input.periodYear);
    const totals  = calcEntryTotals(input.lines);

    if (!totals.isBalanced) {
      throw new Error(`El asiento no está balanceado. Débitos: ${totals.totalDebit}, Créditos: ${totals.totalCredit}`);
    }

    const entry: Omit<JournalEntry, 'id'> = {
      ...input,
      number,
      ...totals,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(entry));
    return ref.id;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateEntry(id: string, changes: Partial<Omit<JournalEntry, 'id' | 'createdAt' | 'createdBy' | 'number'>>): Promise<void> {
    const userId  = this.authService.user()?.uid ?? 'unknown';
    const ref     = doc(this.firestore, `${this.colPath}/${id}`);
    const payload: any = { ...changes, updatedAt: Timestamp.now(), updatedBy: userId };

    // Recalculate totals when lines change
    if (changes.lines !== undefined) {
      const totals = calcEntryTotals(changes.lines);
      if (!totals.isBalanced) {
        throw new Error(`El asiento no está balanceado. Débitos: ${totals.totalDebit}, Créditos: ${totals.totalCredit}`);
      }
      Object.assign(payload, totals);
    }

    await updateDoc(ref, this.cleanDoc(payload));
  }

  // ─── Post (contabilizar) ─────────────────────────────────────────────────

  async postEntry(id: string): Promise<void> {
    await this.updateEntry(id, { status: 'posted' });
  }

  // ─── Cancel ──────────────────────────────────────────────────────────────

  async cancelEntry(id: string, reason: string): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    await this.updateEntry(id, {
      status:       'cancelled',
      cancelledAt:  Timestamp.now(),
      cancelledBy:  userId,
      cancelReason: reason
    });
  }

  // ─── Duplicate ────────────────────────────────────────────────────────────

  async duplicateEntry(id: string): Promise<string> {
    const snap  = await getDocs(query(collection(this.firestore, this.colPath), where('__name__', '==', id)));
    const ref   = doc(this.firestore, `${this.colPath}/${id}`);
    const sSnap = await (await import('@angular/fire/firestore')).getDoc(ref);

    if (!sSnap.exists()) throw new Error('Asiento no encontrado');

    const original = { id: sSnap.id, ...sSnap.data() } as JournalEntry;
    const lines    = original.lines.map(l => ({ ...l, id: crypto.randomUUID() }));

    const input: JournalEntryCreateInput = {
      date:        Timestamp.now(),
      description: `[COPIA] ${original.description}`,
      periodId:    original.periodId,
      periodYear:  original.periodYear,
      type:        'manual',
      status:      'draft',
      reference:   original.reference,
      referenceId: original.referenceId,
      lines
    };

    return this.createEntry(input);
  }

  // ─── Delete (draft only) ─────────────────────────────────────────────────

  async deleteEntry(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.colPath}/${id}`));
  }

  // ─── Auto-increment number per year (atomic) ──────────────────────────────

  private async nextNumber(year: number): Promise<number> {
    const key        = `journal_${year}`;
    const counterRef = doc(this.firestore, `companies/${this.companyId}/counters/journal_entries`);

    return runTransaction(this.firestore, async tx => {
      const snap    = await tx.get(counterRef);
      const current = (snap.data()?.[key] as number) ?? 0;
      const next    = current + 1;
      tx.set(counterRef, { [key]: next }, { merge: true });
      return next;
    });
  }
}
