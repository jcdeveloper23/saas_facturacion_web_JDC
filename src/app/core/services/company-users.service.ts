import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
  Timestamp
} from '@angular/fire/firestore';
import { TenantService } from './tenant.service';
import { CompanyUser } from '../interfaces/company-user.interface';

/**
 * CompanyUsersService — gestiona usuarios de la empresa en Firestore.
 * Colección: companies/{companyId}/company-users/{uid}
 * Doc ID = Firebase Auth UID → O(1) lookup por UID.
 *
 * Implementa Fase 3 del plan de usuarios (PLAN_USERS_PERMISSIONS_SYSTEM.md).
 * Desbloquea member-form (Fase 4) y el puente REST ↔ Firestore.
 */
@Injectable({ providedIn: 'root' })
export class CompanyUsersService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);

  private get collPath(): string {
    const cId = this.tenantService.companyId;
    if (!cId) throw new Error('[CompanyUsersService] No active company. User must be logged in.');
    return `companies/${cId}/company-users`;
  }

  /** Escucha en tiempo real todos los usuarios de la empresa. */
  getCompanyUsers(): Observable<CompanyUser[]> {
    return new Observable<CompanyUser[]>(observer => {
      const ref = collection(this.firestore, this.collPath);
      return onSnapshot(ref, {
        next: snap => observer.next(
          snap.docs.map(d => ({ uid: d.id, ...d.data() }) as CompanyUser)
        ),
        error: err => observer.error(err)
      });
    });
  }

  /** Escucha en tiempo real un usuario específico por su Firebase UID. */
  getCompanyUser(uid: string): Observable<CompanyUser | null> {
    return new Observable<CompanyUser | null>(observer => {
      const ref = doc(this.firestore, `${this.collPath}/${uid}`);
      return onSnapshot(ref, {
        next: snap => observer.next(
          snap.exists() ? ({ uid: snap.id, ...snap.data() } as CompanyUser) : null
        ),
        error: err => observer.error(err)
      });
    });
  }

  /**
   * Crea o actualiza un CompanyUser (upsert por UID).
   * Usado en doble escritura al crear/editar usuario desde UserFormComponent.
   */
  async upsertCompanyUser(uid: string, data: Partial<Omit<CompanyUser, 'uid'>>): Promise<void> {
    const ref = doc(this.firestore, `${this.collPath}/${uid}`);
    await setDoc(ref, { ...data, updatedAt: Timestamp.now() }, { merge: true });
  }

  /** Desactiva un usuario (soft delete — no elimina el documento). */
  async deactivateCompanyUser(uid: string): Promise<void> {
    await this.upsertCompanyUser(uid, { isActive: false });
  }

  /** Reactiva un usuario previamente desactivado. */
  async activateCompanyUser(uid: string): Promise<void> {
    await this.upsertCompanyUser(uid, { isActive: true });
  }

  /** Vincula un CompanyUser con su Persona (empleado) en Firestore. */
  async linkToPersona(uid: string, personaId: string): Promise<void> {
    await this.upsertCompanyUser(uid, { personaId });
  }
}
