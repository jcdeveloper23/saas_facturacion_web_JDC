import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { Plan, ApiResponse, PaginationParams } from '../interfaces';

/**
 * Plans Service - Manage subscription plans catalog
 *
 * Provides CRUD operations for plans and helper methods
 * for plan selection and comparison.
 */
@Injectable({
  providedIn: 'root'
})
export class PlansService extends ApiBaseService<Plan> {
  protected override endpoint = 'plans';

  /**
   * Get all active plans (for public display)
   */
  getActivePlans(): Observable<Plan[]> {
    return this.find({
      is_active: true,
      is_public: true,
      '$sort[sort_order]': 1
    }).pipe(
      map(response => response.data || [])
    );
  }

  /**
   * Get all plans (including inactive, for admin)
   */
  getAllPlans(pagination?: PaginationParams): Observable<ApiResponse<Plan[]>> {
    return this.find({
      ...pagination,
      '$sort[sort_order]': 1
    });
  }

  /**
   * Get plan by code (e.g., 'free', 'business')
   */
  getByCode(code: string): Observable<Plan | null> {
    return this.find({ code }).pipe(
      map(response => response.data?.[0] || null)
    );
  }

  /**
   * Create a new plan
   */
  createPlan(data: Partial<Plan>): Observable<Plan> {
    return this.create(data);
  }

  /**
   * Update a plan
   */
  updatePlan(id: number, data: Partial<Plan>): Observable<Plan> {
    return this.patch(id, data);
  }

  /**
   * Toggle plan active status
   */
  toggleActive(id: number, isActive: boolean): Observable<Plan> {
    return this.patch(id, { is_active: isActive });
  }

  /**
   * Toggle plan public visibility
   */
  togglePublic(id: number, isPublic: boolean): Observable<Plan> {
    return this.patch(id, { is_public: isPublic });
  }

  /**
   * Set plan as popular (badge)
   */
  setPopular(id: number, isPopular: boolean): Observable<Plan> {
    return this.patch(id, { is_popular: isPopular });
  }

  /**
   * Update sort order
   */
  updateSortOrder(id: number, sortOrder: number): Observable<Plan> {
    return this.patch(id, { sort_order: sortOrder });
  }

  /**
   * Get default features for a new plan
   */
  getDefaultFeatures(): Plan['features'] {
    return {
      real_time_tracking: true,
      geofences: true,
      alerts: true,
      reports: true,
      api_access: false,
      white_label: false,
      custom_integrations: false,
      priority_support: false,
      dedicated_account_manager: false,
      sla_guarantee: undefined
    };
  }

  /**
   * Get default limits for a new plan
   */
  getDefaultLimits(): Partial<Plan> {
    return {
      max_devices: 5,
      max_users: 3,
      max_geofences: 10,
      max_routes: 50,
      max_alerts: 100,
      max_api_calls_per_month: 10000,
      max_storage_gb: 1,
      data_retention_days: 30,
      trial_days: 14
    };
  }

  /**
   * Compare two plans (for upgrade/downgrade logic)
   */
  comparePlans(planA: Plan, planB: Plan): 'upgrade' | 'downgrade' | 'same' {
    const scoreA = this.calculatePlanScore(planA);
    const scoreB = this.calculatePlanScore(planB);

    if (scoreB > scoreA) return 'upgrade';
    if (scoreB < scoreA) return 'downgrade';
    return 'same';
  }

  /**
   * Calculate plan score for comparison
   */
  private calculatePlanScore(plan: Plan): number {
    return (
      plan.max_devices * 10 +
      plan.max_users * 5 +
      plan.max_api_calls_per_month / 1000 +
      plan.price_monthly * 100
    );
  }

  /**
   * Format price for display
   */
  formatPrice(amount: number, currency: string, cycle: 'monthly' | 'yearly' = 'monthly'): string {
    const formatter = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency
    });
    const formatted = formatter.format(amount);
    return cycle === 'monthly' ? `${formatted}/mes` : `${formatted}/año`;
  }
}
