import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, where, orderBy, limit, startAfter,
  Timestamp, runTransaction, QueryDocumentSnapshot, QueryConstraint
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { PageResult } from '../../../core/types/pagination.types';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import { AccountingPeriodsService } from './accounting-periods.service';
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
  private periodsSvc    = inject(AccountingPeriodsService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath(): string   { return `companies/${this.companyId}/journal_entries`; }

  // ─── List ─────────────────────────────────────────────────────────────────

  /**
   * Stream en tiempo real — usar SOLO para reportes que necesitan datos siempre
   * frescos (ej. Libro Diario export) con filtros que acotan bien el resultado.
   * Para listas interactivas usar `getEntriesPage()`.
   */
  getEntries(filters: JournalEntryFilters = {}): Observable<JournalEntry[]> {
    return new Observable<JournalEntry[]>(observer => {
      const ref = collection(this.firestore, this.colPath);
      const constraints: any[] = [orderBy('date', 'desc'), orderBy('number', 'desc')];

      if (filters.periodId) constraints.unshift(where('periodId',   '==', filters.periodId));
      if (filters.year)     constraints.unshift(where('periodYear', '==', filters.year));
      if (filters.type)     constraints.unshift(where('type',       '==', filters.type));
      if (filters.status)   constraints.unshift(where('status',     '==', filters.status));

      return onSnapshot(query(ref, ...constraints), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() } as JournalEntry))),
        error: err  => { console.error('[JournalEntriesService] getEntries error:', err); observer.error(err); }
      });
    });
  }

  /**
   * Carga una página de asientos con cursor-based pagination (getDocs, one-shot).
   * Usar en lugar de `getEntries()` para todas las vistas de lista interactivas.
   * Ver: docs/FIREBASE_PAGINATION_GUIDELINES.md
   */
  async getEntriesPage(
    filters: JournalEntryFilters,
    pageSize = 50,
    cursor?: QueryDocumentSnapshot
  ): Promise<PageResult<JournalEntry>> {
    const ref = collection(this.firestore, this.colPath);
    const constraints: QueryConstraint[] = [];

    if (filters.periodId) constraints.push(where('periodId',   '==', filters.periodId));
    if (filters.year)     constraints.push(where('periodYear', '==', filters.year));
    if (filters.type)     constraints.push(where('type',       '==', filters.type));
    if (filters.status)   constraints.push(where('status',     '==', filters.status));

    constraints.push(orderBy('date', 'desc'), orderBy('number', 'desc'));
    constraints.push(limit(pageSize + 1)); // +1 para detectar si hay más

    if (cursor) constraints.push(startAfter(cursor));

    const snap    = await getDocs(query(ref, ...constraints));
    const hasMore = snap.docs.length > pageSize;
    const items   = snap.docs
      .slice(0, pageSize)
      .map(d => ({ id: d.id, ...d.data() } as JournalEntry));

    return { items, hasMore, nextCursor: hasMore ? snap.docs[pageSize - 1] : null };
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

  /**
   * `periodId` es obligatorio cuando se conoce (libro-mayor-page, conciliación).
   * Sin periodId la query escanea todos los asientos posted — evitar cuando sea posible.
   * La búsqueda por accountCode se aplica en memoria sobre el resultado ya acotado por período.
   * Límite de 500 docs: ningún período debería superarlo en una PyME.
   */
  async getLibroMayor(accountCode: string, periodId?: string, costCenterId?: string): Promise<LibroMayorLine[]> {
    const ref = collection(this.firestore, this.colPath);
    const constraints: QueryConstraint[] = [
      where('status', '==', 'posted'),
      orderBy('date', 'asc'),
      orderBy('number', 'asc'),
      limit(500)
    ];
    if (periodId) constraints.unshift(where('periodId', '==', periodId));

    const snap   = await getDocs(query(ref, ...constraints));
    const result: LibroMayorLine[] = [];
    let   balance = 0;

    for (const d of snap.docs) {
      const entry = { id: d.id, ...d.data() } as JournalEntry;
      for (const line of entry.lines) {
        if (line.accountCode !== accountCode) continue;
        if (costCenterId && line.costCenterId !== costCenterId) continue;

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

    return result;
  }

  // ─── Integrity check: ¿alguna línea usa esta cuenta? ──────────────────────
  // Usado por ChartOfAccountsService.deleteAccount() antes de borrar — evita
  // dejar líneas de journal_entries apuntando a una cuenta que ya no existe.
  //
  // Estrategia dual para manejar la migración gradual del campo accountCodes:
  //   1. Fast path: array-contains sobre accountCodes (entradas nuevas)
  //   2. Slow path: scan acotado a 500 para entradas sin el campo (entradas viejas)

  async hasMovementsForAccount(accountCode: string): Promise<boolean> {
    const ref = collection(this.firestore, this.colPath);

    // 1. Fast path — entries con campo accountCodes populado
    const fastSnap = await getDocs(query(ref,
      where('status', '==', 'posted'),
      where('accountCodes', 'array-contains', accountCode),
      limit(1)
    ));
    if (!fastSnap.empty) return true;

    // 2. Slow path — entries legacy sin campo accountCodes (scan acotado)
    const legacySnap = await getDocs(query(ref,
      where('status', '==', 'posted'),
      limit(500)
    ));
    return legacySnap.docs
      .filter(d => !(d.data() as any).accountCodes)
      .some(d => ((d.data() as JournalEntry).lines ?? []).some(l => l.accountCode === accountCode));
  }

  // ─── Cierre mensual: bloquea crear/editar/eliminar en meses cerrados ──────
  // Validación centralizada aquí (en vez de en cada caller: journal-entry-form,
  // bank-movement-modal, advances.service, petty-cash.service, etc.) porque
  // todos esos flujos terminan llamando a createEntry/updateEntry/deleteEntry.
  // Igual que la validación de cuadre (calcEntryTotals), es una regla de
  // negocio aplicada en el service layer, no en firestore.rules.

  private async assertDateNotLocked(date: Timestamp): Promise<void> {
    const year   = date.toDate().getFullYear();
    const period = await this.periodsSvc.getPeriodForYear(year);
    if (period?.monthlyCloseEnabled && period.monthlyCloseCutoff &&
        date.toMillis() <= period.monthlyCloseCutoff.toMillis()) {
      const cutoffStr = period.monthlyCloseCutoff.toDate().toLocaleDateString('es-EC');
      throw new Error(
        `El período está cerrado hasta ${cutoffStr}. No se pueden crear, editar ni eliminar asientos con fecha en meses ya cerrados.`
      );
    }
  }

  private async getEntryDate(id: string): Promise<Timestamp> {
    const snap = await getDoc(doc(this.firestore, `${this.colPath}/${id}`));
    if (!snap.exists()) throw new Error('Asiento no encontrado');
    return (snap.data() as JournalEntry).date;
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
    await this.assertDateNotLocked(input.date);

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
      accountCodes: [...new Set(input.lines.map(l => l.accountCode))],
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };

    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(entry));
    return ref.id;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateEntry(id: string, changes: Partial<Omit<JournalEntry, 'id' | 'createdAt' | 'createdBy' | 'number'>>): Promise<void> {
    const currentDate = await this.getEntryDate(id);
    await this.assertDateNotLocked(currentDate);
    if (changes.date && changes.date.toMillis() !== currentDate.toMillis()) {
      await this.assertDateNotLocked(changes.date);
    }

    const userId  = this.authService.user()?.uid ?? 'unknown';
    const ref     = doc(this.firestore, `${this.colPath}/${id}`);
    const payload: any = { ...changes, updatedAt: Timestamp.now(), updatedBy: userId };

    // Recalculate totals and denormalized accountCodes when lines change
    if (changes.lines !== undefined) {
      const totals = calcEntryTotals(changes.lines);
      if (!totals.isBalanced) {
        throw new Error(`El asiento no está balanceado. Débitos: ${totals.totalDebit}, Créditos: ${totals.totalCredit}`);
      }
      Object.assign(payload, totals);
      payload.accountCodes = [...new Set(changes.lines.map(l => l.accountCode))];
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
    const ref   = doc(this.firestore, `${this.colPath}/${id}`);
    const sSnap = await getDoc(ref);

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
    const currentDate = await this.getEntryDate(id);
    await this.assertDateNotLocked(currentDate);
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
