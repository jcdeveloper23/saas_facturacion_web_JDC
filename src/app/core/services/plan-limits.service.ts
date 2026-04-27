import { Injectable, inject, signal } from '@angular/core';
import { Firestore, doc, onSnapshot } from '@angular/fire/firestore';
import { Company } from '../../features/super-admin/models/company.interface';
import { MonthlyUsage } from '../../features/super-admin/models/monthly-usage.interface';
import { PlanFeatureFlags } from '../../features/super-admin/models/plan.interface';

export type LimitedResource = 'invoices' | 'retentions' | 'debitNotes' | 'purchases' | 'personas' | 'products' | 'users';

@Injectable({ providedIn: 'root' })
export class PlanLimitsService {
  private firestore = inject(Firestore);

  readonly companyDoc = signal<Company | null>(null);
  readonly currentUsage = signal<MonthlyUsage | null>(null);

  private unsubCompany: (() => void) | null = null;
  private unsubUsage: (() => void) | null = null;

  init(companyId: string): void {
    this.unsubCompany?.();
    this.unsubUsage?.();

    const companyRef = doc(this.firestore, 'companies/' + companyId);
    this.unsubCompany = onSnapshot(companyRef, {
      next: snap => this.companyDoc.set(snap.exists() ? ({ id: snap.id, ...snap.data() } as Company) : null),
      error: err => console.error('[PlanLimitsService] company snapshot error:', err)
    });

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const period = `${year}-${month}`;

    const usageRef = doc(this.firestore, `companies/${companyId}/usage/${period}`);
    this.unsubUsage = onSnapshot(usageRef, {
      next: snap => this.currentUsage.set(snap.exists() ? (snap.data() as MonthlyUsage) : null),
      error: err => console.error('[PlanLimitsService] usage snapshot error:', err)
    });
  }

  getLimit(resource: LimitedResource): number {
    const limits = this.companyDoc()?.planLimits;
    if (!limits) return -1;
    switch (resource) {
      case 'invoices':    return limits.sri.invoicesPerMonth;
      case 'retentions':  return limits.sri.retentionsPerMonth;
      case 'debitNotes':  return limits.sri.debitNotesPerMonth;
      case 'purchases':   return limits.sri.purchasesPerMonth;
      case 'personas':    return limits.masterData.personasTotal;
      case 'products':    return limits.masterData.productsTotal;
      case 'users':       return limits.users.activeUsersPerCompany;
    }
  }

  getUsed(resource: LimitedResource): number {
    const usage = this.currentUsage();
    const company = this.companyDoc();
    switch (resource) {
      case 'invoices':    return usage?.invoicesEmitted ?? 0;
      case 'retentions':  return usage?.retentionsEmitted ?? 0;
      case 'debitNotes':  return usage?.debitNotesEmitted ?? 0;
      case 'purchases':   return usage?.purchasesCreated ?? 0;
      case 'personas':    return company?.totalPersonasActive ?? 0;
      case 'products':    return company?.totalProductsActive ?? 0;
      case 'users':       return company?.totalUsersActive ?? 0;
    }
  }

  usagePercent(resource: LimitedResource): number {
    const limit = this.getLimit(resource);
    if (limit === -1 || limit === 0) return 0;
    const used = this.getUsed(resource);
    return Math.round((used / limit) * 100);
  }

  isNearLimit(resource: LimitedResource): boolean {
    return this.usagePercent(resource) >= 80;
  }

  isOverLimit(resource: LimitedResource): boolean {
    return this.usagePercent(resource) >= 100;
  }

  canCreate(resource: LimitedResource): boolean {
    const limit = this.getLimit(resource);
    if (limit === -1) return true;
    return this.usagePercent(resource) < 100;
  }

  /**
   * Verifica síncronamente si un feature flag del plan está habilitado.
   * Se lee desde el snapshot del company document (desnormalizado desde el plan).
   * Retorna true si planFeatures aún no cargó (evita bloqueos en arranque).
   */
  isFeatureEnabled(flag: keyof PlanFeatureFlags): boolean {
    const features = this.companyDoc()?.planFeatures;
    if (!features) return true;
    return features[flag] === true;
  }
}
