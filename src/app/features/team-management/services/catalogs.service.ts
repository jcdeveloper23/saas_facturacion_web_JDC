import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, onSnapshot,
  addDoc, updateDoc, deleteDoc,
  query, orderBy, Timestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { TenantService } from '../../../core/services/tenant.service';
import { AuthService }   from '../../../core/services/auth.service';
import { TmSpecialty, TmPosition } from '../models/catalog.interface';

@Injectable({ providedIn: 'root' })
export class CatalogsService {
  private firestore     = inject(Firestore);
  private tenantService = inject(TenantService);
  private authService   = inject(AuthService);

  private get companyId(): string { return this.tenantService.companyId; }

  // ══════════════════════════════════════════════════════════════════════════════
  // ESPECIALIDADES  /companies/{cId}/tm-specialties
  // ══════════════════════════════════════════════════════════════════════════════

  private get specPath(): string { return `companies/${this.companyId}/tm-specialties`; }

  getSpecialties(): Observable<TmSpecialty[]> {
    return new Observable<TmSpecialty[]>(observer => {
      const ref = collection(this.firestore, this.specPath);
      return onSnapshot(query(ref, orderBy('name', 'asc')), {
        next:  snap => observer.next(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }) as TmSpecialty)
            .filter(s => s.isActive !== false)
        ),
        error: err => observer.error(err),
      });
    });
  }

  async addSpecialty(name: string): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();
    const ref    = await addDoc(collection(this.firestore, this.specPath), {
      name:      name.trim(),
      isActive:  true,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    return ref.id;
  }

  async updateSpecialty(id: string, name: string): Promise<void> {
    const ref = doc(this.firestore, `${this.specPath}/${id}`);
    await updateDoc(ref, { name: name.trim(), updatedAt: Timestamp.now() });
  }

  async deleteSpecialty(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.specPath}/${id}`);
    await updateDoc(ref, { isActive: false, updatedAt: Timestamp.now() });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CARGOS / POSICIONES  /companies/{cId}/tm-positions
  // ══════════════════════════════════════════════════════════════════════════════

  private get posPath(): string { return `companies/${this.companyId}/tm-positions`; }

  getPositions(): Observable<TmPosition[]> {
    return new Observable<TmPosition[]>(observer => {
      const ref = collection(this.firestore, this.posPath);
      return onSnapshot(query(ref, orderBy('name', 'asc')), {
        next:  snap => observer.next(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }) as TmPosition)
            .filter(p => p.isActive !== false)
        ),
        error: err => observer.error(err),
      });
    });
  }

  async addPosition(name: string, department?: string): Promise<string> {
    const userId = this.authService.user()?.uid ?? 'unknown';
    const now    = Timestamp.now();
    const payload: any = {
      name:      name.trim(),
      isActive:  true,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };
    if (department?.trim()) payload['department'] = department.trim();
    const ref = await addDoc(collection(this.firestore, this.posPath), payload);
    return ref.id;
  }

  async updatePosition(id: string, name: string, department?: string): Promise<void> {
    const ref     = doc(this.firestore, `${this.posPath}/${id}`);
    const changes: any = { name: name.trim(), updatedAt: Timestamp.now() };
    if (department !== undefined) changes['department'] = department.trim() || null;
    await updateDoc(ref, changes);
  }

  async deletePosition(id: string): Promise<void> {
    const ref = doc(this.firestore, `${this.posPath}/${id}`);
    await updateDoc(ref, { isActive: false, updatedAt: Timestamp.now() });
  }
}
