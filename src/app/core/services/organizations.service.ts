import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, forkJoin } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiBaseService } from './api-base.service';
import {
  Organization,
  OrganizationFilters,
  OrganizationStats,
  OrganizationLimits,
  OrganizationUsage,
  OrganizationPlanHistory,
  OrganizationCreateInput,
  OrganizationUpdateInput,
  OrganizationDashboard,
  OrganizationPlan,
  ApiResponse,
  PaginationParams
} from '../interfaces';

/**
 * Organizations Service - Multi-tenant SaaS Management
 *
 * Handles all operations related to organization management:
 * - CRUD operations for organizations
 * - Plan and subscription management
 * - Usage and limits tracking
 * - Statistics and dashboard data
 * - API key management
 */
@Injectable({
  providedIn: 'root'
})
export class OrganizationsService extends ApiBaseService<Organization> {
  protected override endpoint = 'organizations';

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  /**
   * Get organizations with filters and pagination
   */
  getOrganizations(
    filters?: OrganizationFilters,
    pagination?: PaginationParams
  ): Observable<ApiResponse<Organization[]>> {
    const query: Record<string, unknown> = { ...pagination };

    // Apply filters
    if (filters?.is_active !== undefined) {
      query['is_active'] = filters.is_active;
    }

    if (filters?.is_verified !== undefined) {
      query['is_verified'] = filters.is_verified;
    }

    if (filters?.plan) {
      query['plan'] = filters.plan;
    }

    if (filters?.country) {
      query['country'] = filters.country;
    }

    if (filters?.search) {
      query['$or'] = [
        { name: { $like: `%${filters.search}%` } },
        { email: { $like: `%${filters.search}%` } },
        { tax_document: { $like: `%${filters.search}%` } }
      ];
    }

    if (filters?.created_after) {
      query['created_at'] = { $gte: filters.created_after };
    }

    if (filters?.created_before) {
      query['created_at'] = { ...query['created_at'] as object, $lte: filters.created_before };
    }

    return this.find(query);
  }

  /**
   * Get single organization with all relations
   */
  getOrganizationDetails(id: number): Observable<Organization> {
    return this.http.get<Organization>(`${this.baseUrl}/${this.endpoint}/${id}`, {
      params: {
        $populate: 'city,subscription'
      }
    });
  }

  /**
   * Create new organization
   */
  createOrganization(data: OrganizationCreateInput): Observable<Organization> {
    return this.create(data as Partial<Organization>);
  }

  /**
   * Update organization
   */
  updateOrganization(id: number, data: OrganizationUpdateInput): Observable<Organization> {
    return this.patch(id, data as Partial<Organization>);
  }

  /**
   * Soft delete organization (deactivate)
   */
  deactivateOrganization(id: number, reason?: string): Observable<Organization> {
    return this.patch(id, {
      is_active: false,
      internal_notes: reason ? `Desactivada: ${reason}` : undefined
    });
  }

  /**
   * Reactivate organization
   */
  reactivateOrganization(id: number): Observable<Organization> {
    return this.patch(id, { is_active: true });
  }

  // ==========================================================================
  // PLAN MANAGEMENT
  // ==========================================================================

  /**
   * Update organization plan
   */
  updatePlan(
    organizationId: number,
    plan: OrganizationPlan,
    customLimits?: Partial<{
      max_devices: number;
      max_users: number;
      max_api_calls_per_month: number;
    }>
  ): Observable<Organization> {
    const data: Partial<Organization> = {
      plan,
      plan_started_at: new Date().toISOString()
    };

    if (customLimits) {
      Object.assign(data, customLimits);
    }

    return this.patch(organizationId, data);
  }

  /**
   * Set plan expiration date
   */
  setPlanExpiration(organizationId: number, expiresAt: string): Observable<Organization> {
    return this.patch(organizationId, { plan_expires_at: expiresAt });
  }

  /**
   * Get plan change history
   */
  getPlanHistory(organizationId: number): Observable<OrganizationPlanHistory[]> {
    return this.http.get<ApiResponse<OrganizationPlanHistory[]>>(
      `${this.baseUrl}/organization-plan-history`,
      {
        params: {
          organization_id: organizationId.toString(),
          '$sort[created_at]': '-1'
        }
      }
    ).pipe(map(response => response.data || []));
  }

  // ==========================================================================
  // LIMITS MANAGEMENT
  // ==========================================================================

  /**
   * Get organization custom limits
   */
  getOrganizationLimits(organizationId: number): Observable<OrganizationLimits | null> {
    return this.http.get<ApiResponse<OrganizationLimits[]>>(
      `${this.baseUrl}/organization-limits`,
      {
        params: { organization_id: organizationId.toString() }
      }
    ).pipe(
      map(response => response.data?.[0] || null)
    );
  }

  /**
   * Update or create organization custom limits
   */
  setOrganizationLimits(
    organizationId: number,
    limits: Partial<OrganizationLimits>
  ): Observable<OrganizationLimits> {
    return this.getOrganizationLimits(organizationId).pipe(
      map(existing => {
        if (existing?.id) {
          return this.http.patch<OrganizationLimits>(
            `${this.baseUrl}/organization-limits/${existing.id}`,
            { ...limits, applied_at: new Date().toISOString() }
          );
        } else {
          return this.http.post<OrganizationLimits>(
            `${this.baseUrl}/organization-limits`,
            {
              organization_id: organizationId,
              ...limits,
              applied_at: new Date().toISOString()
            }
          );
        }
      }),
      // Flatten the nested Observable
      map(obs => obs as unknown as OrganizationLimits)
    );
  }

  /**
   * Toggle feature flag for organization
   */
  toggleFeature(
    organizationId: number,
    feature: keyof Pick<OrganizationLimits,
      'feature_real_time_tracking' | 'feature_geofences' | 'feature_alerts' |
      'feature_reports' | 'feature_api_access' | 'feature_white_label' |
      'feature_custom_integrations'
    >,
    enabled: boolean
  ): Observable<OrganizationLimits> {
    return this.setOrganizationLimits(organizationId, { [feature]: enabled });
  }

  // ==========================================================================
  // USAGE & STATISTICS
  // ==========================================================================

  /**
   * Get organization statistics
   */
  getStats(organizationId: number): Observable<OrganizationStats> {
    return this.get(organizationId).pipe(
      map(org => {
        const devicesPercent = org.max_devices > 0
          ? Math.round((org.devices_count / org.max_devices) * 100)
          : 0;
        const usersPercent = org.max_users > 0
          ? Math.round((org.users_count / org.max_users) * 100)
          : 0;
        const apiPercent = org.max_api_calls_per_month > 0
          ? Math.round((org.api_calls_this_month / org.max_api_calls_per_month) * 100)
          : 0;

        return {
          total_devices: org.devices_count || 0,
          active_devices: org.devices_count || 0,
          total_users: org.users_count || 0,
          active_users: org.users_count || 0,
          total_geofences: 0,
          total_alerts: 0,
          devices_usage_percent: devicesPercent,
          users_usage_percent: usersPercent,
          api_usage_percent: apiPercent,
          storage_usage_percent: 0,
          api_calls_this_month: org.api_calls_this_month || 0,
          positions_this_month: 0,
          alerts_this_month: 0,
          devices_trend: 0,
          users_trend: 0,
          api_calls_trend: 0,
          health_score: org.health_score || 100,
          days_until_limit: this.calculateDaysUntilLimit(org)
        };
      })
    );
  }

  /**
   * Get usage history for organization
   */
  getUsageHistory(
    organizationId: number,
    months: number = 12
  ): Observable<OrganizationUsage[]> {
    return this.http.get<ApiResponse<OrganizationUsage[]>>(
      `${this.baseUrl}/organization-usage`,
      {
        params: {
          organization_id: organizationId.toString(),
          '$sort[year]': '-1',
          '$sort[month]': '-1',
          '$limit': months.toString()
        }
      }
    ).pipe(map(response => response.data || []));
  }

  /**
   * Get full dashboard data for organization
   */
  getDashboard(organizationId: number): Observable<OrganizationDashboard> {
    return forkJoin({
      organization: this.getOrganizationDetails(organizationId),
      limits: this.getOrganizationLimits(organizationId),
      stats: this.getStats(organizationId),
      usage_history: this.getUsageHistory(organizationId, 6),
      plan_history: this.getPlanHistory(organizationId)
    }).pipe(
      map(data => ({
        organization: data.organization,
        subscription: data.organization.subscription,
        limits: data.limits || this.getDefaultLimits(organizationId),
        stats: data.stats,
        usage_history: data.usage_history,
        recent_invoices: [],  // TODO: Implement invoices service
        plan_history: data.plan_history
      }))
    );
  }

  // ==========================================================================
  // API KEY MANAGEMENT
  // ==========================================================================

  /**
   * Generate new API key for organization
   */
  generateApiKey(organizationId: number): Observable<Organization> {
    return this.http.post<Organization>(
      `${this.baseUrl}/${this.endpoint}/${organizationId}/generate-api-key`,
      {}
    );
  }

  /**
   * Regenerate API key (rotates existing key)
   */
  rotateApiKey(organizationId: number): Observable<Organization> {
    const newApiKey = this.createApiKey();
    const newApiSecret = this.createApiSecret();

    return this.patch(organizationId, {
      api_key: newApiKey,
      api_secret: newApiSecret
    });
  }

  /**
   * Revoke API access
   */
  revokeApiAccess(organizationId: number): Observable<Organization> {
    return this.patch(organizationId, {
      api_key: undefined,
      api_secret: undefined
    });
  }

  /**
   * Update webhook URL
   */
  updateWebhook(organizationId: number, webhookUrl: string): Observable<Organization> {
    return this.patch(organizationId, { webhook_url: webhookUrl });
  }

  // ==========================================================================
  // VERIFICATION & STATUS
  // ==========================================================================

  /**
   * Mark organization as verified
   */
  verifyOrganization(organizationId: number): Observable<Organization> {
    return this.patch(organizationId, {
      is_verified: true,
      verified_at: new Date().toISOString()
    });
  }

  /**
   * Suspend organization
   */
  suspendOrganization(organizationId: number, reason: string): Observable<Organization> {
    return this.patch(organizationId, {
      is_active: false,
      internal_notes: `Suspendida: ${reason} (${new Date().toISOString()})`
    });
  }

  // ==========================================================================
  // BULK OPERATIONS
  // ==========================================================================

  /**
   * Get organizations summary (for dashboard widgets)
   */
  getSummary(): Observable<{
    total: number;
    active: number;
    trial: number;
    by_plan: Record<OrganizationPlan, number>;
  }> {
    return this.find({ $limit: 0 }).pipe(
      map(() => ({
        total: 0,
        active: 0,
        trial: 0,
        by_plan: {
          free: 0,
          starter: 0,
          business: 0,
          enterprise: 0
        }
      }))
    );
  }

  /**
   * Get organizations approaching limits
   */
  getOrganizationsNearLimits(threshold: number = 80): Observable<Organization[]> {
    return this.getOrganizations({ is_active: true }).pipe(
      map(response => response.data.filter(org => {
        const devicesPercent = org.max_devices > 0
          ? (org.devices_count / org.max_devices) * 100
          : 0;
        const usersPercent = org.max_users > 0
          ? (org.users_count / org.max_users) * 100
          : 0;
        return devicesPercent >= threshold || usersPercent >= threshold;
      }))
    );
  }

  /**
   * Get organizations with expiring plans
   */
  getExpiringOrganizations(daysAhead: number = 30): Observable<Organization[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return this.getOrganizations({
      is_active: true,
      created_before: futureDate.toISOString()
    }).pipe(
      map(response => response.data.filter(org =>
        org.plan_expires_at &&
        new Date(org.plan_expires_at) <= futureDate
      ))
    );
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private createApiKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'gps_live_';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }

  private createApiSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let secret = '';
    for (let i = 0; i < 64; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  private calculateDaysUntilLimit(org: Organization): number | undefined {
    const devicesPercent = org.max_devices > 0
      ? (org.devices_count / org.max_devices) * 100
      : 0;
    const usersPercent = org.max_users > 0
      ? (org.users_count / org.max_users) * 100
      : 0;

    const maxPercent = Math.max(devicesPercent, usersPercent);

    if (maxPercent >= 90) return 0;
    if (maxPercent >= 80) return 7;
    if (maxPercent >= 70) return 14;
    return undefined;
  }

  private getDefaultLimits(organizationId: number): OrganizationLimits {
    return {
      organization_id: organizationId,
      feature_real_time_tracking: true,
      feature_geofences: true,
      feature_alerts: true,
      feature_reports: true,
      feature_api_access: false,
      feature_white_label: false,
      feature_custom_integrations: false
    };
  }
}
