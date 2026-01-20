/**
 * Organization Interface - Represents a company/organization
 */
export interface Organization {
  id?: number;
  organizationName: string;
  organizationDescription?: string;
  organizationEmail?: string;
  organizationPhone?: string;
  organizationAddress?: string;
  organizationLogo?: string;

  // Plan and limits
  plan: OrganizationPlan;
  maxDevices?: number;
  maxUsers?: number;
  maxGeofences?: number;

  // API access
  apiKey?: string;
  apiEnabled?: boolean;

  // Contact
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;

  state: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type OrganizationPlan = 'free' | 'basic' | 'business' | 'enterprise';

export interface OrganizationStats {
  totalDevices: number;
  totalUsers: number;
  totalGeofences: number;
  activeDevices: number;
}

export interface OrganizationFilters {
  plan?: OrganizationPlan;
  state?: boolean;
  search?: string;
}
