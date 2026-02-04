import { Role } from './permission.interface';
import { Organization } from './organization.interface';


/**
 * User Module - Simplified module for navigation menu
 * Comes from login response based on user's role permissions
 */
export interface UserModule {
  code: string;
  name: string;
  url?: string;
  icon: string;
  isTitle: boolean;
  showInMenu: boolean;
  badgeText?: string | null;
  badgeColor?: string | null;
  order: number;
  parent_id?: number | null;
  children?: UserModule[];
}

/**
 * User Interface - Represents a system user
 */
export interface User {
  id?: number;
  userEmail: string;
  userPassword?: string;
  userFullName?: string;
  userLastName?: string;
  userPhone?: string;
  userPhoneEmergency?: string;
  userEmailEmergency?: string;
  userCity?: number;
  userImageProfile?: string;
  userUuid?: string;
  userCurrentRole?: UserRoleNumeric; // Legacy numeric role
  roleId?: number; // New role system - foreign key to Role table
  userSettingId?: number;

  // Notification preferences
  userReceiveNotifications?: boolean | number; // Backend returns 0/1
  userMuteNotifications?: boolean | number; // Backend returns 0/1

  // Organization (backend uses snake_case)
  organization_id?: number; // Backend field name
  organizationId?: number; // Alias for compatibility
  organizationName?: string;
  organization?: Organization; // Populated organization object from backend

  // Driver-specific (role 9)
  userLastLocationLatitude?: number;
  userLastLocationLongitude?: number;
  userLastLocationDate?: string;

  role?: Role; // Nested role object from backend (already populated)
  permissions?: string[]; // Effective permissions for this user
  modules?: UserModule[]; // Modules accessible by this user based on role

  state: boolean | number; // Backend returns 0/1
  createdAt?: string;
  updatedAt?: string;
}

// Legacy numeric role type (for compatibility with old backend)
export type UserRoleNumeric = 0 | 1 | 9; // 0: Admin, 1: User, 9: Driver

export interface UserFilters {
  role?: UserRoleNumeric;
  roleId?: number;
  organizationId?: number;
  state?: boolean | number;
  search?: string;
}

export interface UserPreferences {
  id?: number;
  userId: number;
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  timezone?: string;
  mapType?: string;
  defaultZoom?: number;
  refreshInterval?: number;
}

export interface UserStats {
  total: number;
  admins: number;
  active: number;
  inactive: number;
}

export interface AuthUser {
  user: User;
  accessToken: string;
}
