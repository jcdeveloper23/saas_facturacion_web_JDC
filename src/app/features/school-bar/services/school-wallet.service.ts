import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot, addDoc,
  query, where, orderBy, Timestamp, limit
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  SchoolTransaction, SchoolRecharge, RechargeMethod, RechargeStatus
} from '../models/school-wallet.interface';

@Injectable({ providedIn: 'root' })
export class SchoolWalletService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId():    string { return this.tenantService.companyId; }
  private get txPath():       string { return `companies/${this.companyId}/school_transactions`; }
  private get rechargePath(): string { return `companies/${this.companyId}/school_recharges`; }

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

  // ─── Transactions (read-only desde el frontend) ───────────────────────────

  /** Historial de transacciones de un estudiante */
  getTransactions(studentId: string, limitN = 50): Observable<SchoolTransaction[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.txPath);
      return onSnapshot(
        query(ref,
          where('studentId', '==', studentId),
          orderBy('createdAt', 'desc'),
          limit(limitN)
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolTransaction)),
          error: err  => { console.error('[SchoolWalletService] getTransactions:', err); observer.error(err); }
        }
      );
    });
  }

  // ─── Recharges ────────────────────────────────────────────────────────────

  getPendingRecharges(): Observable<SchoolRecharge[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.rechargePath);
      return onSnapshot(
        query(ref,
          where('companyId', '==', this.companyId),
          where('paymentStatus', '==', 'pending'),
          orderBy('createdAt', 'asc')
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolRecharge)),
          error: err  => { console.error('[SchoolWalletService] getPendingRecharges:', err); observer.error(err); }
        }
      );
    });
  }

  getRechargesByStudent(studentId: string, limitN = 20): Observable<SchoolRecharge[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.rechargePath);
      return onSnapshot(
        query(ref,
          where('studentId', '==', studentId),
          orderBy('createdAt', 'desc'),
          limit(limitN)
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolRecharge)),
          error: err  => { console.error('[SchoolWalletService] getRechargesByStudent:', err); observer.error(err); }
        }
      );
    });
  }

  /**
   * Crea una solicitud de recarga en estado 'pending'.
   * La confirmación (y el crédito al wallet) la hace la Cloud Function schoolConfirmRecharge.
   */
  async requestRecharge(data: {
    studentId:   string;
    studentName: string;
    gradeId:     string;
    gradeName:   string;
    parentId:    string;
    parentName:  string;
    amount:      number;
    method:      RechargeMethod;
    proofUrl?:   string;
    paymentRef?: string;
  }): Promise<string> {
    const now = Timestamp.now();
    const recharge: Omit<SchoolRecharge, 'id'> = {
      ...data,
      companyId:     this.companyId,
      methodLabel:   data.method === 'card' ? 'Tarjeta' : data.method === 'transfer' ? 'Transferencia' : 'Efectivo',
      balanceBefore: 0,  // llenado por CF al confirmar
      balanceAfter:  0,  // llenado por CF al confirmar
      paymentStatus: 'pending',
      createdAt:     now,
      updatedAt:     now
    };
    const ref = await addDoc(collection(this.firestore, this.rechargePath), this.cleanDoc(recharge));
    return ref.id;
  }

  /**
   * Admin confirma una recarga por transferencia o efectivo.
   * Dispara la Cloud Function schoolConfirmRecharge que acredita el wallet.
   */
  async confirmRecharge(id: string, note?: string): Promise<void> {
    const { updateDoc } = await import('@angular/fire/firestore');
    const userId = this.authService.user()?.uid;
    await updateDoc(
      doc(this.firestore, `${this.rechargePath}/${id}`),
      this.cleanDoc({
        paymentStatus:    'confirmed',
        confirmedBy:      userId,
        confirmedAt:      Timestamp.now(),
        confirmationNote: note,
        updatedAt:        Timestamp.now()
      })
    );
  }

  async rejectRecharge(id: string): Promise<void> {
    const { updateDoc } = await import('@angular/fire/firestore');
    await updateDoc(
      doc(this.firestore, `${this.rechargePath}/${id}`),
      { paymentStatus: 'failed' as RechargeStatus, updatedAt: Timestamp.now() }
    );
  }
}
