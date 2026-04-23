import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { UserRole } from './auth.service';

export interface CreateCompanyUserPayload {
  email:        string;
  password:     string;
  displayName:  string;
  platformRole: UserRole;
  companyId:    string;
  personaId?:   string;
}

export interface CreateCompanyUserResult {
  uid:          string;
  email:        string;
  displayName:  string;
  platformRole: UserRole;
}

export interface UpdateCompanyUserPayload {
  uid:           string;
  companyId:     string;
  displayName?:  string;
  platformRole?: UserRole;
  isActive?:     boolean;
  personaId?:    string;
}

export interface DeleteCompanyUserPayload {
  uid:       string;
  companyId: string;
}

/**
 * UserManagementService — invoca las Cloud Functions de gestión de usuarios.
 *
 * createCompanyUser → crea Firebase Auth user + custom claims + Firestore doc
 * updateCompanyUser → actualiza displayName, role (claims) e isActive
 * deleteCompanyUser → elimina Auth user + Firestore doc (solo super_admin)
 *
 * Las Cloud Functions usan Admin SDK para operaciones que no están
 * disponibles en el cliente (crear usuarios sin loguearse, setCustomUserClaims).
 */
@Injectable({ providedIn: 'root' })
export class UserManagementService {
  private functions = inject(Functions);

  async createCompanyUser(payload: CreateCompanyUserPayload): Promise<CreateCompanyUserResult> {
    const fn = httpsCallable<CreateCompanyUserPayload, CreateCompanyUserResult>(
      this.functions,
      'createCompanyUser'
    );
    const result = await fn(payload);
    return result.data;
  }

  async updateCompanyUser(payload: UpdateCompanyUserPayload): Promise<void> {
    const fn = httpsCallable<UpdateCompanyUserPayload, { success: boolean }>(
      this.functions,
      'updateCompanyUser'
    );
    await fn(payload);
  }

  async deleteCompanyUser(payload: DeleteCompanyUserPayload): Promise<void> {
    const fn = httpsCallable<DeleteCompanyUserPayload, { success: boolean }>(
      this.functions,
      'deleteCompanyUser'
    );
    await fn(payload);
  }
}
