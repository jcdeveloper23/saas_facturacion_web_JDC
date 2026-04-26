import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, addDoc, updateDoc, onSnapshot,
  query, where, orderBy, limit, Timestamp, runTransaction, getDocs
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  PosTerminal, PosSession, PosCashMovement,
  CashMovementType
} from '../models/pos.interface';

@Injectable({ providedIn: 'root' })
export class PosCashService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get terminalsPath(): string { return `companies/${this.companyId}/pos-terminals`; }
  private get sessionsPath():  string { return `companies/${this.companyId}/pos-sessions`; }
  private get movementsPath(): string { return `companies/${this.companyId}/pos-cash-movements`; }

  // ─── Terminals ─────────────────────────────────────────────────────────────

  getTerminals(): Observable<PosTerminal[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.terminalsPath);
      return onSnapshot(query(ref, where('isActive', '==', true), orderBy('name')), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PosTerminal)),
        error: err  => observer.error(err)
      });
    });
  }

  getTerminal(id: string): Observable<PosTerminal | null> {
    return new Observable(observer => {
      const ref = doc(this.firestore, `${this.terminalsPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as PosTerminal : null),
        error: err  => observer.error(err)
      });
    });
  }

  async createTerminal(data: Omit<PosTerminal, 'id' | 'createdAt' | 'updatedAt' | 'numTickets'>): Promise<string> {
    const now = Timestamp.now();
    const ref = await addDoc(collection(this.firestore, this.terminalsPath), {
      ...data, numTickets: 0, createdAt: now, updatedAt: now
    });
    return ref.id;
  }

  async updateTerminal(id: string, data: Partial<PosTerminal>): Promise<void> {
    await updateDoc(doc(this.firestore, `${this.terminalsPath}/${id}`), {
      ...data, updatedAt: Timestamp.now()
    });
  }

  // ─── Sessions ──────────────────────────────────────────────────────────────

  getSessions(terminalId?: string, limitN = 30): Observable<PosSession[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.sessionsPath);
      const constraints: any[] = [orderBy('openedAt', 'desc'), limit(limitN)];
      if (terminalId) constraints.unshift(where('terminalId', '==', terminalId));
      return onSnapshot(query(ref, ...constraints), {
        next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PosSession)),
        error: err  => observer.error(err)
      });
    });
  }

  getOpenSession(terminalId: string): Observable<PosSession | null> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.sessionsPath);
      return onSnapshot(
        query(ref, where('terminalId', '==', terminalId), where('status', '==', 'open'), limit(1)),
        {
          next:  snap => observer.next(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as PosSession),
          error: err  => observer.error(err)
        }
      );
    });
  }

  /** Abre una nueva sesión de caja (arqueo) */
  async openSession(terminalId: string, terminalName: string, openingBalance: number, notes?: string): Promise<PosSession> {
    const user = this.authService.user();
    const now  = Timestamp.now();

    const sessionData: Omit<PosSession, 'id'> = {
      terminalId,
      terminalName,
      userId:       user?.uid ?? '',
      userName:     user?.displayName ?? user?.email ?? '',
      userEmail:    user?.email ?? '',
      openedAt:     now,
      openingBalance,
      openingNotes: notes ?? null,
      status:       'open',
      totalSales:       0,
      totalSalesCount:  0,
      totalCash:        0,
      totalCard:        0,
      totalTransfer:    0,
      totalRefunds:     0,
      totalCashIn:      0,
      totalCashOut:     0,
      createdAt: now,
      updatedAt: now,
    };

    // Usa transacción para marcar terminal como ocupado
    const sessionRef = doc(collection(this.firestore, this.sessionsPath));
    const terminalRef = doc(this.firestore, `${this.terminalsPath}/${terminalId}`);

    await runTransaction(this.firestore, async tx => {
      const termSnap = await tx.get(terminalRef);
      if (!termSnap.exists()) throw new Error('Terminal no encontrado');
      const term = termSnap.data() as PosTerminal;
      if (term.currentSessionId) throw new Error('El terminal ya tiene una sesión abierta');

      tx.set(sessionRef, sessionData);
      tx.update(terminalRef, {
        currentSessionId: sessionRef.id,
        currentUserId:    user?.uid ?? '',
        currentUserName:  user?.displayName ?? user?.email ?? '',
        updatedAt:        now
      });
    });

    return { id: sessionRef.id, ...sessionData };
  }

  /** Cierra la sesión de caja */
  async closeSession(
    sessionId: string,
    terminalId: string,
    closingBalance: number,
    notes?: string
  ): Promise<{ expectedBalance: number; difference: number }> {
    const now         = Timestamp.now();
    const sessionRef  = doc(this.firestore, `${this.sessionsPath}/${sessionId}`);
    const terminalRef = doc(this.firestore, `${this.terminalsPath}/${terminalId}`);

    let result = { expectedBalance: 0, difference: 0 };

    await runTransaction(this.firestore, async tx => {
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists()) throw new Error('Sesión no encontrada');
      const session = { id: sessionSnap.id, ...sessionSnap.data() } as PosSession;

      const expectedBalance = round2(
        session.openingBalance + session.totalCash + session.totalCashIn - session.totalCashOut
      );
      const difference = round2(closingBalance - expectedBalance);

      result = { expectedBalance, difference };

      tx.update(sessionRef, {
        status:          'closed',
        closedAt:        now,
        closingBalance,
        expectedBalance,
        difference,
        closingNotes:    notes ?? null,
        updatedAt:       now,
      });

      tx.update(terminalRef, {
        currentSessionId: null,
        currentUserId:    null,
        currentUserName:  null,
        updatedAt:        now,
      });
    });

    return result;
  }

  // ─── Cash Movements ────────────────────────────────────────────────────────

  getMovements(sessionId: string): Observable<PosCashMovement[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.movementsPath);
      return onSnapshot(
        query(ref, where('sessionId', '==', sessionId), orderBy('createdAt', 'desc')),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PosCashMovement)),
          error: err  => observer.error(err)
        }
      );
    });
  }

  async addCashMovement(
    sessionId: string,
    terminalId: string,
    type: CashMovementType,
    amount: number,
    reason: string
  ): Promise<void> {
    const user = this.authService.user();
    const now  = Timestamp.now();

    const movData: Omit<PosCashMovement, 'id'> = {
      sessionId, terminalId,
      userId: user?.uid ?? '',
      type, amount, reason,
      createdAt: now
    };

    const sessionRef  = doc(this.firestore, `${this.sessionsPath}/${sessionId}`);
    const movRef      = doc(collection(this.firestore, this.movementsPath));

    await runTransaction(this.firestore, async tx => {
      const snap = await tx.get(sessionRef);
      if (!snap.exists()) throw new Error('Sesión no encontrada');
      const session = snap.data() as PosSession;

      const update: Partial<PosSession> = { updatedAt: now };
      if (type === 'cash_in')  update.totalCashIn  = round2((session.totalCashIn  ?? 0) + amount);
      if (type === 'cash_out') update.totalCashOut = round2((session.totalCashOut ?? 0) + amount);

      tx.set(movRef, movData);
      tx.update(sessionRef, update);
    });
  }

  // ─── Update session totals after sale (called by PosSalesService) ──────────

  async updateSessionAfterSale(
    sessionId: string,
    totals: { total: number; cash: number; card: number; transfer: number }
  ): Promise<void> {
    const sessionRef = doc(this.firestore, `${this.sessionsPath}/${sessionId}`);
    const now        = Timestamp.now();

    await runTransaction(this.firestore, async tx => {
      const snap = await tx.get(sessionRef);
      if (!snap.exists()) return;
      const s = snap.data() as PosSession;
      tx.update(sessionRef, {
        totalSales:      round2(s.totalSales + totals.total),
        totalSalesCount: s.totalSalesCount + 1,
        totalCash:       round2(s.totalCash + totals.cash),
        totalCard:       round2(s.totalCard + totals.card),
        totalTransfer:   round2(s.totalTransfer + totals.transfer),
        updatedAt:       now,
      });
    });
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
