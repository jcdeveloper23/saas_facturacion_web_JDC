import { Injectable, inject, signal, computed } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User as FirebaseUser,
  IdTokenResult
} from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Router } from '@angular/router';
import { TenantService } from './tenant.service';

export type UserRole = 'admin' | 'seller' | 'cashier' | 'read_only' | 'super_admin' | 'accountant';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  companyId: string;
  role: UserRole;
}

/**
 * AuthService — Firebase Auth with custom claims.
 * Custom claims set by Cloud Function: { companyId: string, role: UserRole }
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth          = inject(Auth);
  private functions     = inject(Functions);
  private router        = inject(Router);
  private tenantService = inject(TenantService);

  private _currentUser = signal<AuthUser | null>(null);
  private _isReady = signal(false);

  readonly user = computed(() => this._currentUser());
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly isReady = computed(() => this._isReady());

  constructor() {
    this.initializeAuthListener();
  }

  private initializeAuthListener(): void {
    onAuthStateChanged(this.auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const authUser = await this.buildAuthUser(firebaseUser);
          this._currentUser.set(authUser);
          this.tenantService.setCompanyId(authUser.companyId);
          this.tenantService.setUid(authUser.uid);
        } catch (error) {
          console.error('[AuthService] Error building auth user:', error);
          this._currentUser.set(null);
        }
      } else {
        this._currentUser.set(null);
      }
      this._isReady.set(true);
    });
  }

  /**
   * Resolves once Firebase has determined the initial auth state.
   * Used in APP_INITIALIZER to block navigation until auth is known.
   */
  waitForAuthReady(): Promise<void> {
    if (this._isReady()) return Promise.resolve();
    
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(this.auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            const authUser = await this.buildAuthUser(firebaseUser);
            this._currentUser.set(authUser);
            this.tenantService.setCompanyId(authUser.companyId);
            this.tenantService.setUid(authUser.uid);
          } catch (error) {
            console.error('[AuthService] Error during init:', error);
          }
        } else {
          this._currentUser.set(null);
        }
        this._isReady.set(true);
        unsubscribe();
        resolve();
      });
    });
  }

  async login(email: string, password: string): Promise<void> {
    const credential = await signInWithEmailAndPassword(this.auth, email, password);
    const authUser = await this.buildAuthUser(credential.user);
    this._currentUser.set(authUser);
    this.tenantService.setCompanyId(authUser.companyId);
    this.tenantService.setUid(authUser.uid);
    this.router.navigate([this.getDefaultRoute()]);
  }

  /**
   * Cambia la empresa activa del usuario (multi-empresa).
   * Llama la CF switchActiveCompany, fuerza el refresh del token
   * y reinicia TenantService con el nuevo companyId.
   */
  async switchCompany(targetCompanyId: string): Promise<void> {
    const firebaseUser = this.auth.currentUser;
    if (!firebaseUser) return;

    this.tenantService.setSwitching(true);
    try {
      const fn = httpsCallable(this.functions, 'switchActiveCompany');
      await fn({ targetCompanyId });

      // Forzar refresh del token para obtener los nuevos custom claims
      await firebaseUser.getIdToken(true);

      const authUser = await this.buildAuthUser(firebaseUser);
      this._currentUser.set(authUser);
      this.tenantService.setCompanyId(authUser.companyId);
    } finally {
      this.tenantService.setSwitching(false);
    }
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this._currentUser.set(null);
    this.router.navigate(['/login']);
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  getDefaultRoute(): string {
    const user = this._currentUser();
    if (!user) return '/login';
    return user.role === 'super_admin' ? '/super-admin' : '/dashboard';
  }

  hasRole(...roles: UserRole[]): boolean {
    const user = this._currentUser();
    return user ? roles.includes(user.role) : false;
  }

  isAdmin(): boolean {
    return this.hasRole('admin');
  }

  isSuperAdmin(): boolean {
    return this.hasRole('super_admin');
  }

  canWrite(): boolean {
    return this.hasRole('admin', 'seller', 'cashier');
  }

  private async buildAuthUser(firebaseUser: FirebaseUser): Promise<AuthUser> {
    const tokenResult: IdTokenResult = await firebaseUser.getIdTokenResult();
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      displayName: firebaseUser.displayName ?? firebaseUser.email ?? '',
      companyId: (tokenResult.claims['companyId'] as string) ?? '',
      role: (tokenResult.claims['role'] as UserRole) ?? 'read_only'
    };
  }
}
