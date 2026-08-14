import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot, setDoc,
  addDoc, updateDoc, deleteDoc, query, where, orderBy, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { SchoolBarSettings, SchoolGrade } from '../models/school-institution.interface';

@Injectable({ providedIn: 'root' })
export class SchoolInstitutionService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);

  private get companyId():    string { return this.tenantService.companyId; }
  private get settingsPath(): string { return `companies/${this.companyId}/settings/school_bar`; }
  private get gradesPath():   string { return `companies/${this.companyId}/school_grades`; }

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

  // ─── Bar Settings (single document per tenant) ────────────────────────────

  getSettings(): Observable<SchoolBarSettings | null> {
    return new Observable(observer => {
      const ref = doc(this.firestore, this.settingsPath);
      return onSnapshot(ref, {
        next:  snap => observer.next(snap.exists() ? snap.data() as SchoolBarSettings : null),
        error: err  => { console.error('[SchoolInstitutionService] getSettings:', err); observer.error(err); }
      });
    });
  }

  async saveSettings(data: Partial<SchoolBarSettings>): Promise<void> {
    await setDoc(
      doc(this.firestore, this.settingsPath),
      this.cleanDoc({ ...data, updatedAt: Timestamp.now() }),
      { merge: true }
    );
  }

  // ─── Grades ───────────────────────────────────────────────────────────────

  getGrades(): Observable<SchoolGrade[]> {
    return new Observable(observer => {
      const ref = collection(this.firestore, this.gradesPath);
      return onSnapshot(
        query(ref, where('companyId', '==', this.companyId), orderBy('level', 'asc')),
        {
          next:  snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as SchoolGrade)),
          error: err  => { console.error('[SchoolInstitutionService] getGrades:', err); observer.error(err); }
        }
      );
    });
  }

  async createGrade(data: Omit<SchoolGrade, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = Timestamp.now();
    const ref = await addDoc(
      collection(this.firestore, this.gradesPath),
      this.cleanDoc({ ...data, companyId: this.companyId, createdAt: now, updatedAt: now })
    );
    return ref.id;
  }

  async updateGrade(id: string, changes: Partial<Omit<SchoolGrade, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(
      doc(this.firestore, `${this.gradesPath}/${id}`),
      this.cleanDoc({ ...changes, updatedAt: Timestamp.now() })
    );
  }

  async deleteGrade(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, `${this.gradesPath}/${id}`));
  }
}
