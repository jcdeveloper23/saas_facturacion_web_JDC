import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot, addDoc, updateDoc,
  query, where, orderBy, Timestamp, limit
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import {
  SchoolAccessory, AccessoryStatus, AccessoryStatusEntry, AccessoryType
} from '../models/school-accessory.interface';

@Injectable({ providedIn: 'root' })
export class SchoolAccessoryService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath():   string { return `companies/${this.companyId}/school_accessories`; }

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

  // ─── Queries ──────────────────────────────────────────────────────────────

  /** Accesorios pendientes de configurar — panel admin */
  getPendingAccessories(): Observable<SchoolAccessory[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref,
          where('companyId', '==', this.companyId),
          where('status', 'in', ['requested', 'paid']),
          orderBy('status'),
          orderBy('createdAt', 'asc')
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolAccessory)),
          error: err  => { console.error('[SchoolAccessoryService] getPendingAccessories:', err); observer.error(err); }
        }
      );
    });
  }

  /** Accesorios de un estudiante — panel representante */
  getAccessoriesByStudent(studentId: string): Observable<SchoolAccessory[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref,
          where('studentId', '==', studentId),
          orderBy('createdAt', 'desc')
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolAccessory)),
          error: err  => { console.error('[SchoolAccessoryService] getAccessoriesByStudent:', err); observer.error(err); }
        }
      );
    });
  }

  getAccessory(id: string): Observable<SchoolAccessory | null> {
    return new Observable(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as SchoolAccessory : null),
        error: err  => { console.error('[SchoolAccessoryService] getAccessory:', err); observer.error(err); }
      });
    });
  }

  // ─── Create (solicitud del representante) ─────────────────────────────────

  async requestAccessory(data: {
    type:            AccessoryType;
    unitPrice:       number;
    requestedBy:     string;
    requestedByName: string;
    studentId:       string;
    studentName:     string;
    paymentMethod:   'card' | 'transfer';
    proofUrl?:       string;
    paymentRef?:     string;
  }): Promise<string> {
    const now     = Timestamp.now();
    const typeName: Record<AccessoryType, string> = {
      nfc_card:     'Tarjeta NFC',
      nfc_bracelet: 'Manilla NFC',
      nfc_keyring:  'Llavero NFC'
    };
    const firstEntry: AccessoryStatusEntry = { status: 'requested', changedAt: now };
    const accessory: Omit<SchoolAccessory, 'id'> = {
      ...data,
      companyId:       this.companyId,
      typeName:        typeName[data.type],
      currency:        'USD',
      status:          'requested',
      statusHistory:   [firstEntry],
      paymentStatus:   'pending',
      createdAt:       now,
      updatedAt:       now
    };
    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(accessory));
    return ref.id;
  }

  // ─── Status transitions (admin) ───────────────────────────────────────────

  private async pushStatus(id: string, status: AccessoryStatus, extra: Record<string, any> = {}): Promise<void> {
    const { arrayUnion } = await import('@angular/fire/firestore');
    const userId = this.authService.user()?.uid;
    const entry: AccessoryStatusEntry = { status, changedAt: Timestamp.now(), changedBy: userId };
    await updateDoc(
      doc(this.firestore, `${this.colPath}/${id}`),
      this.cleanDoc({ status, statusHistory: arrayUnion(entry), updatedAt: Timestamp.now(), ...extra })
    );
  }

  async confirmPayment(id: string, paymentRef?: string): Promise<void> {
    await this.pushStatus(id, 'paid', { paymentStatus: 'confirmed', paymentRef, paymentConfirmedAt: Timestamp.now() });
  }

  /** Admin registra el UID NFC del chip físico y lo asocia al alumno */
  async configureNfc(id: string, nfcUid: string): Promise<void> {
    const userId = this.authService.user()?.uid;
    await this.pushStatus(id, 'configured', { nfcUid, configuredBy: userId, configuredAt: Timestamp.now() });
  }

  /** Admin marca el accesorio como entregado — lo activa en el perfil del alumno */
  async markDelivered(id: string): Promise<void> {
    const userId = this.authService.user()?.uid;
    await this.pushStatus(id, 'delivered', { deliveredBy: userId, deliveredAt: Timestamp.now() });
  }

  /** Representante reporta pérdida — revoca inmediatamente */
  async reportLost(id: string): Promise<void> {
    await this.pushStatus(id, 'lost', {
      revokedAt:     Timestamp.now(),
      revokedReason: 'Pérdida reportada por el representante'
    });
  }
}
