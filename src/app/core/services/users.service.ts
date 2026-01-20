import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiBaseService } from './api-base.service';
import { User, UserFilters, UserRole } from '../interfaces';

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
    } else {
      query['state'] = true;
    }
    if (filters?.role !== undefined) {
      query['userCurrentRole'] = filters.role;
    }
    if (filters?.organizationId) {
      query['organization_id'] = filters.organizationId;
    }
    if (filters?.search) {
      query['$or'] = [
        { userFullName: { $like: `%${filters.search}%` } },
        { userEmail: { $like: `%${filters.search}%` } }
      ];
    }

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
   * Update user role
   */
  updateRole(userId: number, role: UserRole): Observable<User> {
    return this.patch(userId, { userCurrentRole: role });
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
   * Search users
   */
  search(term: string, role?: UserRole, limit: number = 20): Observable<User[]> {
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
