import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { Organization, OrganizationFilters, OrganizationStats } from '../interfaces';

/**
 * Organizations Service - Manages companies/organizations
 */
@Injectable({
  providedIn: 'root'
})
export class OrganizationsService extends ApiBaseService<Organization> {
  protected endpoint = 'organizations';

  /**
   * Get organizations with optional filters
   */
  getOrganizations(filters?: OrganizationFilters): Observable<Organization[]> {
    const query: Record<string, unknown> = {};

    if (filters?.state !== undefined) {
      query['state'] = filters.state;
    } else {
      query['state'] = true;
    }
    if (filters?.plan) {
      query['plan'] = filters.plan;
    }
    if (filters?.search) {
      query['organizationName'] = { $like: `%${filters.search}%` };
    }

    return this.find(query).pipe(map(response => response.data));
  }

  /**
   * Generate a new API key for an organization
   */
  generateApiKey(organizationId: number): Observable<Organization> {
    const apiKey = this.createApiKey();
    return this.patch(organizationId, { apiKey, apiEnabled: true });
  }

  /**
   * Disable API access for an organization
   */
  disableApi(organizationId: number): Observable<Organization> {
    return this.patch(organizationId, { apiEnabled: false });
  }

  /**
   * Update organization plan
   */
  updatePlan(
    organizationId: number,
    plan: Organization['plan'],
    limits?: { maxDevices?: number; maxUsers?: number; maxGeofences?: number }
  ): Observable<Organization> {
    return this.patch(organizationId, { plan, ...limits });
  }

  /**
   * Get organization statistics
   * This would need integration with devices and users services
   */
  getStats(organizationId: number): Observable<OrganizationStats> {
    // This is a placeholder - in real implementation,
    // you'd aggregate data from devices and users
    return this.get(organizationId).pipe(
      map(org => ({
        totalDevices: 0,
        totalUsers: 0,
        totalGeofences: 0,
        activeDevices: 0
      }))
    );
  }

  private createApiKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'gps_';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }
}
