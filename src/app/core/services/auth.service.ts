import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, map, catchError, throwError, switchMap, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, AuthUser, UserModule } from '../interfaces';
import { Role, PermissionString, SYSTEM_ROLES } from '../interfaces/permission.interface';
import { PermissionsService } from './permissions.service';
import { SecureStorageService } from './secure-storage.service';
import { NavigationService } from './navigation.service';

interface LoginPayload {
  strategy: 'local';
  userEmail: string;
  userPassword: string;
}

interface LoginResponse {
  accessToken: string;
  user: User & {
    role?: Role;
    permissions?: PermissionString[];
    modules?: UserModule[];
  };
}

/**
 * Auth Service - Handles authentication with JWT tokens
 * Integrates with PermissionsService for RBAC
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private permissionsService = inject(PermissionsService);
  private secureStorage = inject(SecureStorageService);
  private navigationService = inject(NavigationService);

  private readonly apiUrl = `${environment.apiGpsUrl}/authentication`;

  // Reactive state with signals
  private currentUser = signal<User | null>(this.loadUserFromStorage());
  private token = signal<string | null>(this.loadTokenFromStorage());

  readonly user = computed(() => this.currentUser());
  readonly isAuthenticated = computed(() => !!this.token());
  readonly currentRole = computed(() => this.permissionsService.role());

  /**
   * Login with email and password
   * After successful auth, loads user permissions
   */
  login(email: string, password: string): Observable<AuthUser> {
    const payload: LoginPayload = {
      strategy: 'local',
      userEmail: email,
      userPassword: password
    };

    return this.http.post<LoginResponse>(this.apiUrl, payload).pipe(
      tap(response => {
        console.log(`Login response: ${JSON.stringify(response, null, 2)}`);

        if (!response.user.state) {
          throw new Error('Usuario inactivo');
        }
        this.setSession(response);
      }),
      // Load permissions and modules after login
      switchMap(response => {
        // Load modules into navigation service
        if (response.user.modules) {
          this.navigationService.setModulesFromUser(response.user.modules);
        }

        // If backend returns permissions directly, use them and persist to storage
        if (response.user.permissions && response.user.role) {
          this.permissionsService.setPermissions(
            response.user.permissions,
            response.user.role
          );
          // Persist permissions to storage for session recovery on refresh
          this.secureStorage.setItem('userPermissions', {
            permissions: response.user.permissions,
            role: response.user.role
          });
          return of(response);
        }

        // Otherwise, load permissions from API
        return this.loadPermissionsForUser(response.user.id!).pipe(
          map(() => response)
        );
      }),
      map(response => ({
        user: response.user,
        accessToken: response.accessToken
      })),
      catchError(error => {
        console.error('Login error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Logout - clears session, permissions and navigation
   */
  logout(): void {
    this.secureStorage.removeItem('accessToken');
    this.secureStorage.removeItem('infoUser');
    this.secureStorage.removeItem('userPermissions');
    this.currentUser.set(null);
    this.token.set(null);
    this.permissionsService.clearPermissions();
    this.navigationService.clearNavigation();
    this.router.navigate(['/login']);
  }

  /**
   * Get current JWT token
   */
  getToken(): string | null {
    return this.token();
  }

  /**
   * Get default route based on user role
   */
  getDefaultRoute(): string {
    const role = this.permissionsService.role();

    if (!role) return '/monitor';

    switch (role.code) {
      case 'super_admin':
        return '/organizations';
      case 'org_admin':
      case 'org_manager':
        return '/monitor';
      case 'driver':
        return '/monitor';
      default:
        return '/monitor';
    }
  }

  /**
   * Check if user is super admin
   */
  isSuperAdmin(): boolean {
    return this.permissionsService.isAdmin();
  }

  /**
   * Check if user is organization admin
   */
  isOrgAdmin(): boolean {
    const role = this.permissionsService.role();
    return role?.code === 'org_admin';
  }

  /**
   * Initialize session from storage (called on app startup)
   */
  initializeSession(): Observable<boolean> {
    const user = this.currentUser();
    const token = this.token();

    console.log('[AuthService] Initializing session...', { hasUser: !!user, hasToken: !!token });

    if (!user || !token) {
      console.log('[AuthService] No user or token found in storage');
      return of(false);
    }

    // Load modules from stored user data
    if (user.modules) {
      console.log('[AuthService] Loading modules from stored user:', user.modules.length);
      this.navigationService.setModulesFromUser(user.modules);
    }

    // Load permissions from storage or API
    const storedPermissions = this.loadPermissionsFromStorage();
    if (storedPermissions) {
      console.log('[AuthService] Restoring permissions from storage:', storedPermissions.role?.code);
      this.permissionsService.setPermissions(
        storedPermissions.permissions,
        storedPermissions.role
      );
      return of(true);
    }

    // Load from API if not in storage
    console.log('[AuthService] No stored permissions, loading from API...');
    return this.loadPermissionsForUser(user.id!).pipe(
      map(() => true),
      catchError((error) => {
        console.error('[AuthService] Failed to load permissions from API:', error);
        return of(false);
      })
    );
  }

  /**
   * Load permissions for a user from API
   */
  private loadPermissionsForUser(userId: number): Observable<PermissionString[]> {
    return this.permissionsService.loadUserPermissions(userId).pipe(
      tap(permissions => {
        // Store in localStorage for persistence
        const role = this.permissionsService.role();
        this.secureStorage.setItem('userPermissions', { permissions, role });
      })
    );
  }

  /**
   * Set session data after login
   */
  private setSession(response: LoginResponse): void {
    this.secureStorage.setItem('accessToken', response.accessToken);
    this.secureStorage.setItem('infoUser', response.user);
    this.token.set(response.accessToken);
    this.currentUser.set(response.user);
  }

  /**
   * Load user from localStorage
   */
  private loadUserFromStorage(): User | null {
    return this.secureStorage.getItem<User>('infoUser');
  }

  /**
   * Load token from localStorage
   */
  private loadTokenFromStorage(): string | null {
    // Some libraries might expect raw token string, but here we decrypt it
    return this.secureStorage.getItem<string>('accessToken') || null;
  }

  /**
   * Load permissions from localStorage
   */
  private loadPermissionsFromStorage(): { permissions: PermissionString[]; role: Role } | null {
    return this.secureStorage.getItem<{ permissions: PermissionString[]; role: Role }>('userPermissions');
  }

  // ============================================================================
  // TEMPORARY: Mock permissions for development
  // Remove this when backend supports permissions API
  // ============================================================================

  /**
   * Set mock permissions for development
   * Call this after login if backend doesn't return permissions yet
   */
  setMockPermissions(roleCode: string = 'org_admin'): void {
    const role = SYSTEM_ROLES.find(r => r.code === roleCode);
    if (role) {
      this.permissionsService.setPermissions(role.permissions, role as Role);
      this.secureStorage.setItem('userPermissions', {
        permissions: role.permissions,
        role
      });
    }
  }
}

