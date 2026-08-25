import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, where, limit, writeBatch, Timestamp,
  increment
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService }  from '../../../core/services/tenant.service';
import { AuthService }    from '../../../core/services/auth.service';
import {
  BankStatement,
  BankTransaction,
  ParsedBankRow
} from '../models/bank-reconciliation.interface';

@Injectable({ providedIn: 'root' })
export class BankReconciliationService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get stmtPath(): string  { return `companies/${this.companyId}/bank_statements`; }

  private txPath(statementId: string): string {
    return `${this.stmtPath}/${statementId}/transactions`;
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

  // ─── Statements ───────────────────────────────────────────────────────────

  getStatements(bankAccountId?: string): Observable<BankStatement[]> {
    return new Observable<BankStatement[]>(observer => {
      const ref         = collection(this.firestore, this.stmtPath);
      // limit(50): máx ~4 años de extractos mensuales por cuenta. Ver FIREBASE_PAGINATION_GUIDELINES.md
      const constraints: any[] = [orderBy('createdAt', 'desc'), limit(50)];
      if (bankAccountId) constraints.unshift(where('bankAccountId', '==', bankAccountId));

      return onSnapshot(query(ref, ...constraints), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as BankStatement))),
        error: err  => { console.error('[BankReconciliationService] getStatements error:', err); observer.error(err); }
      });
    });
  }

  // ─── Transactions ─────────────────────────────────────────────────────────

  getTransactions(statementId: string): Observable<BankTransaction[]> {
    return new Observable<BankTransaction[]>(observer => {
      const ref = collection(this.firestore, this.txPath(statementId));
      // limit(1000): scoped a un extracto; ningún estado de cuenta real supera esto. Ver FIREBASE_PAGINATION_GUIDELINES.md
      return onSnapshot(query(ref, orderBy('date', 'asc'), limit(1000)), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as BankTransaction))),
        error: err  => { console.error('[BankReconciliationService] getTransactions error:', err); observer.error(err); }
      });
    });
  }

  // ─── Create statement + transactions in a single batch ───────────────────

  async createStatement(
    input: Omit<BankStatement, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>,
    rows: ParsedBankRow[]
  ): Promise<string> {
    const userId  = this.authService.user()?.uid ?? 'unknown';
    const now     = Timestamp.now();
    const batch   = writeBatch(this.firestore);

    // Statement document
    const stmtRef = doc(collection(this.firestore, this.stmtPath));
    const stmt: Omit<BankStatement, 'id'> = {
      ...input,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };
    batch.set(stmtRef, this.cleanDoc(stmt));

    // Transaction sub-documents
    const txColRef = collection(this.firestore, this.txPath(stmtRef.id));
    for (const row of rows) {
      const txRef = doc(txColRef);
      const tx: Omit<BankTransaction, 'id'> = {
        statementId:  stmtRef.id,
        date:         Timestamp.fromDate(row.date),
        description:  row.description,
        reference:    row.reference || undefined,
        debit:        row.debit,
        credit:       row.credit,
        balance:      row.balance || undefined,
        status:       'unmatched',
        createdAt:    now
      };
      batch.set(txRef, this.cleanDoc(tx));
    }

    await batch.commit();
    return stmtRef.id;
  }

  // ─── Match transaction to a GL entry ─────────────────────────────────────

  async matchTransaction(
    statementId:   string,
    txId:          string,
    entryId:       string,
    entryLineId:   string,
    description:   string
  ): Promise<void> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const batch  = writeBatch(this.firestore);

    const txRef   = doc(this.firestore, `${this.txPath(statementId)}/${txId}`);
    const stmtRef = doc(this.firestore, `${this.stmtPath}/${statementId}`);

    batch.update(txRef, this.cleanDoc({
      status:              'matched',
      matchedEntryId:      entryId,
      matchedEntryLineId:  entryLineId,
      matchedDescription:  description
    }));

    batch.update(stmtRef, {
      reconciledCount: increment(1),
      status:          'in_progress',
      updatedAt:       now()
    });

    await batch.commit();
  }

  // ─── Unmatch transaction ──────────────────────────────────────────────────

  async unmatchTransaction(
    statementId:   string,
    txId:          string,
    wasReconciled: boolean
  ): Promise<void> {
    const batch   = writeBatch(this.firestore);
    const txRef   = doc(this.firestore, `${this.txPath(statementId)}/${txId}`);
    const stmtRef = doc(this.firestore, `${this.stmtPath}/${statementId}`);

    batch.update(txRef, {
      status:             'unmatched',
      matchedEntryId:     null,
      matchedEntryLineId: null,
      matchedDescription: null
    });

    if (wasReconciled) {
      batch.update(stmtRef, {
        reconciledCount: increment(-1),
        updatedAt:       now()
      });
    }

    await batch.commit();
  }

  // ─── Ignore transaction ───────────────────────────────────────────────────

  async ignoreTransaction(statementId: string, txId: string): Promise<void> {
    const txRef = doc(this.firestore, `${this.txPath(statementId)}/${txId}`);
    await updateDoc(txRef, { status: 'ignored' });
  }

  // ─── Mark statement as reconciled ────────────────────────────────────────

  async markReconciled(statementId: string): Promise<void> {
    const stmtRef = doc(this.firestore, `${this.stmtPath}/${statementId}`);
    await updateDoc(stmtRef, { status: 'reconciled', updatedAt: now() });
  }

  // ─── Delete statement + all transactions ─────────────────────────────────

  async deleteStatement(statementId: string): Promise<void> {
    // Delete all transactions in the subcollection first
    const txSnap = await getDocs(
      query(collection(this.firestore, this.txPath(statementId)))
    );

    const batchSize = 450;
    for (let i = 0; i < txSnap.docs.length; i += batchSize) {
      const batch = writeBatch(this.firestore);
      txSnap.docs.slice(i, i + batchSize).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete the statement document
    await deleteDoc(doc(this.firestore, `${this.stmtPath}/${statementId}`));
  }
}

function now(): Timestamp { return Timestamp.now(); }
