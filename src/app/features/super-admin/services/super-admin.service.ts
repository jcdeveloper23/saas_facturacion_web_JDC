import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { orderBy, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { FirestoreService } from '../../../core/services/firestore.service';
import { Plan, PlanFormData } from '../models/plan.interface';
import { Company, CompanyFormData } from '../models/company.interface';

@Injectable({ providedIn: 'root' })
export class SuperAdminService {
  private fs = inject(FirestoreService);
  private functions = inject(Functions);

  // ─── Plans ───────────────────────────────────────────────────────────────

  getPlans(): Observable<Plan[]> {
    return this.fs.getRootCollection<Plan>('plans');
  }

  async createPlan(data: PlanFormData): Promise<string> {
    return this.fs.addRootDocument<PlanFormData>('plans', data);
  }

  async updatePlan(id: string, data: Partial<PlanFormData>): Promise<void> {
    return this.fs.updateRootDocument<Plan>('plans', id, data);
  }

  async deactivatePlan(id: string): Promise<void> {
    return this.fs.updateRootDocument<Plan>('plans', id, { isActive: false } as any);
  }

  // ─── Companies ───────────────────────────────────────────────────────────

  getCompanies(): Observable<Company[]> {
    return this.fs.getRootCollection<Company>('companies');
  }

  getCompany(id: string): Observable<Company | undefined> {
    return this.fs.getRootDocument<Company>('companies', id);
  }

  /**
   * Creates a company and triggers the setupCompany Cloud Function,
   * which creates default warehouses, tax rates, payment terms, and series.
   */
  async createCompany(data: CompanyFormData): Promise<string> {
    const setupCompany = httpsCallable<CompanyFormData, { companyId: string }>(
      this.functions,
      'setupCompany'
    );
    const result = await setupCompany(data);
    return result.data.companyId;
  }

  async updateCompany(id: string, data: Partial<CompanyFormData>): Promise<void> {
    return this.fs.updateRootDocument<Company>('companies', id, data);
  }

  async setCompanyStatus(id: string, status: Company['status']): Promise<void> {
    return this.fs.updateRootDocument<Company>('companies', id, { status } as any);
  }

  /**
   * Assigns custom claims to a user (companyId + role).
   * Used by super-admin to bootstrap first admin of a new company.
   */
  async setUserCustomClaims(targetUid: string, companyId: string, role: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'setUserCustomClaims');
    await fn({ targetUid, companyId, role });
  }

  async assignPlanToCompany(companyId: string, planId: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'assignPlanToCompany');
    await fn({ companyId, planId });
  }
}
