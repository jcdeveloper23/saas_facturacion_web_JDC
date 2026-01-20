import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, map, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, AuthUser, UserRole } from '../interfaces';

interface LoginPayload {
  strategy: 'local';
  userEmail: string;
  userPassword: string;
}

interface LoginResponse {
  accessToken: string;
  user: User;
}

/**
 * Auth Service - Handles authentication with JWT tokens
 * Uses Angular 21 signals for reactive state
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly apiUrl = `${environment.apiGpsUrl}/authentication`;

  // Reactive state with signals
  private currentUser = signal<User | null>(this.loadUserFromStorage());
  private token = signal<string | null>(this.loadTokenFromStorage());

  readonly user = computed(() => this.currentUser());
  readonly isAuthenticated = computed(() => !!this.token());
  readonly userRole = computed(() => this.currentUser()?.userCurrentRole);

  login(email: string, password: string): Observable<AuthUser> {
    const payload: LoginPayload = {
      strategy: 'local',
      userEmail: email,
      userPassword: password
    };

    return this.http.post<LoginResponse>(this.apiUrl, payload).pipe(
      tap(response => {
        if (!response.user.state) {
          throw new Error('Usuario inactivo');
        }
        this.setSession(response);
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

  logout(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('infoUser');
    this.currentUser.set(null);
    this.token.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this.token();
  }

  getDefaultRoute(): string {
    const role = this.userRole();
    if (role === 0) {
      return '/admin-panel';
    }
    return '/monitor';
  }

  isAdmin(): boolean {
    return this.userRole() === 0;
  }

  isDriver(): boolean {
    return this.userRole() === 9;
  }

  hasRole(role: UserRole): boolean {
    return this.userRole() === role;
  }

  private setSession(response: LoginResponse): void {
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('infoUser', JSON.stringify(response.user));
    this.token.set(response.accessToken);
    this.currentUser.set(response.user);
  }

  private loadUserFromStorage(): User | null {
    const userStr = localStorage.getItem('infoUser');
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
    return null;
  }

  private loadTokenFromStorage(): string | null {
    return localStorage.getItem('accessToken');
  }
}
