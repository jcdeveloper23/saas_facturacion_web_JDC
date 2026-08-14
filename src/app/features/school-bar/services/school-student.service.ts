import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot, addDoc, updateDoc,
  query, where, orderBy, Timestamp, writeBatch, getDoc
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import { SchoolStudent, StudentIdentifier } from '../models/school-student.interface';

export interface QrScanResult {
  studentId:    string;
  fullName:     string;
  code:         string;
  gradeId:      string;
  gradeName:    string;
  section:      string;
  walletBalance: number;
}

export type SchoolStudentCreateInput = Omit<SchoolStudent,
  'id' | 'walletBalance' | 'qrCode' | 'qrCodeUrl' | 'identifiers'
  | 'totalSpentMonth' | 'totalSpentWeek' | 'totalTransactions'
  | 'createdAt' | 'updatedAt'
>;

@Injectable({ providedIn: 'root' })
export class SchoolStudentService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);
  private functions     = inject(Functions);

  private get companyId(): string { return this.tenantService.companyId; }
  private get colPath():   string { return `companies/${this.companyId}/school_students`; }

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

  // ─── List ─────────────────────────────────────────────────────────────────

  getStudents(): Observable<SchoolStudent[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref,
          where('companyId', '==', this.companyId),
          where('state', '==', true),
          orderBy('fullName', 'asc')
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolStudent)),
          error: err  => { console.error('[SchoolStudentService] getStudents:', err); observer.error(err); }
        }
      );
    });
  }

  getStudentsByGrade(gradeId: string): Observable<SchoolStudent[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref,
          where('companyId', '==', this.companyId),
          where('gradeId', '==', gradeId),
          where('state', '==', true),
          orderBy('fullName', 'asc')
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolStudent)),
          error: err  => { console.error('[SchoolStudentService] getStudentsByGrade:', err); observer.error(err); }
        }
      );
    });
  }

  /** Estudiantes donde el representante (parentId) está vinculado */
  getStudentsByParent(parentId: string): Observable<SchoolStudent[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.colPath);
      return onSnapshot(
        query(ref,
          where('parentIds', 'array-contains', parentId),
          where('state', '==', true)
        ),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolStudent)),
          error: err  => { console.error('[SchoolStudentService] getStudentsByParent:', err); observer.error(err); }
        }
      );
    });
  }

  getStudent(id: string): Observable<SchoolStudent | null> {
    return new Observable(observer => {
      const ref = doc(this.firestore, `${this.colPath}/${id}`);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? { id: snap.id, ...snap.data() } as SchoolStudent : null),
        error: err  => { console.error('[SchoolStudentService] getStudent:', err); observer.error(err); }
      });
    });
  }

  /** Lectura puntual — para el POS al buscar por studentId directo */
  async getStudentOnce(id: string): Promise<SchoolStudent | null> {
    const snap = await getDoc(doc(this.firestore, `${this.colPath}/${id}`));
    return snap.exists() ? { id: snap.id, ...snap.data() } as SchoolStudent : null;
  }

  /**
   * Valida un token QR firmado llamando a la Cloud Function schoolScanQr.
   * Usar cuando el input del POS proviene de un escáner QR (contiene '.').
   */
  async scanQr(token: string): Promise<QrScanResult> {
    const fn = httpsCallable<{ token: string; companyId: string }, QrScanResult>(
      this.functions, 'schoolScanQr'
    );
    const result = await fn({ token, companyId: this.companyId });
    return result.data;
  }

  /** True si el string tiene el formato de un token QR firmado (payload.sig) */
  isQrToken(input: string): boolean {
    return input.includes('.');
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async createStudent(input: SchoolStudentCreateInput): Promise<string> {
    const now = Timestamp.now();
    const studentData: Omit<SchoolStudent, 'id'> = {
      ...input,
      companyId:          this.companyId,   // always stamped by service
      walletBalance:      0,
      qrCode:             '',       // llenado por CF schoolGenerateStudentQr
      qrCodeUrl:          '',       // llenado por CF schoolGenerateStudentQr
      identifiers:        [],
      totalSpentMonth:    0,
      totalSpentWeek:     0,
      totalTransactions:  0,
      createdAt:          now,
      updatedAt:          now
    };
    const ref = await addDoc(collection(this.firestore, this.colPath), this.cleanDoc(studentData));
    return ref.id;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateStudent(id: string, changes: Partial<Omit<SchoolStudent, 'id' | 'createdAt' | 'walletBalance'>>): Promise<void> {
    await updateDoc(
      doc(this.firestore, `${this.colPath}/${id}`),
      this.cleanDoc({ ...changes, updatedAt: Timestamp.now() })
    );
  }

  async updateStudentByParent(id: string, changes: {
    photoUrl?: string;
    allergyNotes?: string;
    allowedCategories?: string[];
    spendLimits?: SchoolStudent['spendLimits'];
  }): Promise<void> {
    await updateDoc(
      doc(this.firestore, `${this.colPath}/${id}`),
      this.cleanDoc({ ...changes, updatedAt: Timestamp.now() })
    );
  }

  // ─── Identifiers (NFC) ────────────────────────────────────────────────────

  async addIdentifier(studentId: string, identifier: StudentIdentifier): Promise<void> {
    const studentRef  = doc(this.firestore, `${this.colPath}/${studentId}`);
    const snap        = await getDoc(studentRef);
    if (!snap.exists()) throw new Error('Estudiante no encontrado');
    const current     = snap.data() as SchoolStudent;
    const identifiers = [...(current.identifiers ?? []), identifier];
    await updateDoc(studentRef, this.cleanDoc({ identifiers, updatedAt: Timestamp.now() }));
  }

  async revokeIdentifier(studentId: string, nfcUid: string, reason: string): Promise<void> {
    const studentRef  = doc(this.firestore, `${this.colPath}/${studentId}`);
    const snap        = await getDoc(studentRef);
    if (!snap.exists()) throw new Error('Estudiante no encontrado');
    const current     = snap.data() as SchoolStudent;
    const identifiers = current.identifiers.map(id =>
      id.nfcUid === nfcUid
        ? { ...id, status: 'revoked' as const, revokedAt: Timestamp.now(), revokedReason: reason }
        : id
    );
    await updateDoc(studentRef, this.cleanDoc({ identifiers, updatedAt: Timestamp.now() }));
  }

  // ─── Deactivate ───────────────────────────────────────────────────────────

  async deactivateStudent(id: string): Promise<void> {
    await updateDoc(
      doc(this.firestore, `${this.colPath}/${id}`),
      { state: false, updatedAt: Timestamp.now() }
    );
  }
}
