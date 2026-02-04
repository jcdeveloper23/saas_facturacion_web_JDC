import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { User, UserFilters, UserRoleNumeric } from '../interfaces';

/**
 * Users Service - Manages system users
 */
@Injectable({
  providedIn: 'root'
})
export class UsersService extends ApiBaseService<User> {
  protected endpoint = 'users';

  /**
   * Get users with optional filters
   */
  getUsers(filters?: UserFilters): Observable<User[]> {
    const query: Record<string, unknown> = {};

    if (filters?.state !== undefined) {
      query['state'] = filters.state;
    }
    if (filters?.role !== undefined) {
      query['userCurrentRole'] = filters.role;
    }
    if (filters?.roleId !== undefined) {
      query['roleId'] = filters.roleId;
    }
    if (filters?.organizationId) {
      query['organization_id'] = filters.organizationId; // Backend uses snake_case
    }
    if (filters?.search) {
      query['$or'] = [
        { userFullName: { $like: `%${filters.search}%` } },
        { userEmail: { $like: `%${filters.search}%` } }
      ];
    }

    console.log(`getUsers query: ${JSON.stringify(query, null, 2)}`);
    

    return this.find(query).pipe(map(response => response.data));
  }

  /**
   * Get user by email
   */
  getByEmail(email: string): Observable<User | null> {
    return this.find({ userEmail: email }).pipe(
      map(response => response.data[0] || null)
    );
  }

  /**
   * Get drivers (role 9) with location data
   */
  getActiveDrivers(): Observable<User[]> {
    return this.find({
      userCurrentRole: 9,
      state: true
    }).pipe(map(response => response.data));
  }

  /**
   * Get users by organization
   */
  getByOrganization(organizationId: number): Observable<User[]> {
    return this.getUsers({ organizationId });
  }

  /**
   * Get admins (role 0)
   */
  getAdmins(): Observable<User[]> {
    return this.getUsers({ role: 0 });
  }

  /**
   * Update user state (activate/deactivate)
   */
  updateState(userId: number, state: boolean): Observable<User> {
    return this.patch(userId, { state });
  }

  /**
   * Update user role (legacy numeric)
   */
  updateRole(userId: number, role: UserRoleNumeric): Observable<User> {
    return this.patch(userId, { userCurrentRole: role });
  }

  /**
   * Assign role by ID (new role system)
   */
  assignRole(userId: number, roleId: number): Observable<User> {
    return this.patch(userId, { roleId });
  }

  /**
   * Update driver location
   */
  updateDriverLocation(userId: number, lat: number, lng: number): Observable<User> {
    return this.patch(userId, {
      userLastLocationLatitude: lat,
      userLastLocationLongitude: lng,
      userLastLocationDate: new Date().toISOString()
    });
  }

  /**
   * Change user password
   */
  changePassword(userId: number, password: string): Observable<User> {
    return this.patch(userId, { userPassword: password });
  }

  /**
   * Search users
   */
  search(term: string, role?: UserRoleNumeric, limit: number = 20): Observable<User[]> {
    const query: Record<string, unknown> = {
      state: true,
      $limit: limit,
      $or: [
        { userFullName: { $like: `%${term}%` } },
        { userEmail: { $like: `%${term}%` } }
      ]
    };

    if (role !== undefined) {
      query['userCurrentRole'] = role;
    }

    return this.find(query).pipe(map(response => response.data));
  }
}
