import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp, runTransaction
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  DebitNote, DebitNoteStatus, buildDebitNoteFullNumber, calcDebitNoteTotals
} from '../models/debit-note.interface';

export type DebitNoteCreateInput = Omit<DebitNote,
  'id' | 'number' | 'fullNumber' | 'createdAt' | 'updatedAt' | 'createdBy'
  | 'totalSinImpuestos' | 'vatAmount' | 'total'
>;

@Injectable({ providedIn: 'root' })
export class DebitNotesService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/debitNotes`; }

  // ─── List ─────────────────────────────────────────────────────────────────

  getDebitNotes(filters: { year?: string; status?: DebitNoteStatus } = {}): Observable<DebitNote[]> {
    return new Observable<DebitNote[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      const constraints: any[] = [orderBy('date', 'desc')];
      if (filters.year)   constraints.unshift(where('fiscalYear', '==', filters.year));
      if (filters.status) constraints.unshift(where('status',    '==', filters.status));
      return onSnapshot(query(ref, ...constraints), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as DebitNote))),
        error: err  => observer.error(err),
      });
    });
  }

  getDebitNote(id: string): Observable<DebitNote | null> {
    return new Observable<DebitNote | null>(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as DebitNote : null),
        error: err  => observer.error(err),
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

  async createDebitNote(input: DebitNoteCreateInput): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const number = await this.nextNumber(input.seriesEstablishment, input.seriesEmissionPoint, input.fiscalYear);
    const fullNumber = buildDebitNoteFullNumber(
      input.seriesEstablishment, input.seriesEmissionPoint, number
    );
    const totals = calcDebitNoteTotals(input.motivos, input.vatPct);
    const now    = Timestamp.now();

    const debitNote: Omit<DebitNote, 'id'> = {
      ...input,
      number,
      fullNumber,
      ...totals,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      updatedBy: userId,
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(debitNote));
    return ref.id;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateDebitNote(
    id: string,
    changes: Partial<Omit<DebitNote, 'id' | 'createdAt' | 'createdBy'>>
  ): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const ref    = doc(this.firestore, `${this.colPath}/${id}`);
    const payload: any = { ...changes, updatedAt: Timestamp.now(), updatedBy: userId };

    if (changes.motivos !== undefined || changes.vatPct !== undefined) {
      const snap    = await (await import('@angular/fire/firestore')).getDoc(ref);
      const current = snap.data() as DebitNote;
      const motivos = changes.motivos ?? current.motivos;
      const vatPct  = changes.vatPct  ?? current.vatPct;
      Object.assign(payload, calcDebitNoteTotals(motivos, vatPct));
    }

    await updateDoc(ref, this.cleanDoc(payload));
  }

  // ─── Status transitions ───────────────────────────────────────────────────

  async markIssued(id: string): Promise<void> {
    await this.updateDebitNote(id, { status: 'issued', isVoid: false });
  }

  async markVoid(id: string): Promise<void> {
    await this.updateDebitNote(id, {
      status: 'void', isVoid: true, voidedAt: Timestamp.now()
    });
  }

  // ─── Delete (draft only) ─────────────────────────────────────────────────

  async deleteDebitNote(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.colPath}/${id}`));
  }

  // ─── Auto-increment counter (atomic) ─────────────────────────────────────

  private async nextNumber(estab: string, pto: string, fiscalYear: string): Promise<number> {
    const key        = `${estab}_${pto}_${fiscalYear}`;
    const counterRef = doc(this.firestore, `companies/${this.companyId}/counters/debitNotes`);

    return runTransaction(this.firestore, async tx => {
      const snap    = await tx.get(counterRef);
      const current = (snap.data()?.[key] as number) ?? 0;
      const next    = current + 1;
      tx.set(counterRef, { [key]: next }, { merge: true });
      return next;
    });
  }
}
