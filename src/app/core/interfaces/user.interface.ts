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
  userCurrentRole: UserRole;
  userSettingId?: number;

  // Notification preferences
  userReceiveNotifications?: boolean;
  userMuteNotifications?: boolean;

  // Organization
  organizationId?: number;
  organizationName?: string;

  // Driver-specific (role 9)
  userLastLocationLatitude?: number;
  userLastLocationLongitude?: number;
  userLastLocationDate?: string;

  state: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type UserRole = 0 | 1 | 9; // 0: Admin, 1: User, 9: Driver

export interface UserFilters {
  role?: UserRole;
  organizationId?: number;
  state?: boolean;
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

export interface AuthUser {
  user: User;
  accessToken: string;
}
