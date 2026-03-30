import { Injectable, inject, computed } from '@angular/core';
import { AuthService, UserRole } from './auth.service';

type Action = 'read' | 'create' | 'update' | 'delete';
type ModulePermissions = Partial<Record<Action, boolean>>;

const ROLE_MATRIX: Record<UserRole, Record<string, ModulePermissions>> = {
  super_admin: {
    companies: { read: true, create: true, update: true, delete: true },
    plans:     { read: true, create: true, update: true, delete: true },
    users:     { read: true, create: true, update: true, delete: true }
  },
  admin: {
    customers: { read: true, create: true, update: true, delete: true },
    suppliers: { read: true, create: true, update: true, delete: true },
    products:  { read: true, create: true, update: true, delete: true },
    invoices:  { read: true, create: true, update: true, delete: true },
    quotes:    { read: true, create: true, update: true, delete: true },
    orders:    { read: true, create: true, update: true, delete: true },
    stock:     { read: true, create: true, update: true, delete: true },
    pos:       { read: true, create: true, update: true, delete: true },
    settings:  { read: true, create: true, update: true, delete: true },
    users:     { read: true, create: true, update: true, delete: true },
    sri:       { read: true, create: true, update: true, delete: true }
  },
  seller: {
    customers: { read: true, create: true, update: true },
    suppliers: { read: true, create: true, update: true },
    products:  { read: true, create: true, update: true },
    invoices:  { read: true, create: true, update: true },
    quotes:    { read: true, create: true, update: true },
    orders:    { read: true, create: true, update: true },
    stock:     { read: true, create: true, update: true },
    settings:  { read: true },
    sri:       { read: true }
  },
  cashier: {
    customers: { read: true },
    products:  { read: true },
    invoices:  { read: true, create: true },
    pos:       { read: true, create: true },
    stock:     { read: true },
    settings:  { read: true }
  },
  read_only: {
    customers: { read: true },
    suppliers: { read: true },
    products:  { read: true },
    invoices:  { read: true },
    quotes:    { read: true },
    orders:    { read: true },
    stock:     { read: true },
    pos:       { read: true },
    settings:  { read: true },
    sri:       { read: true }
  }
};

/**
 * PermissionsService — role-based access derived from Firebase Auth custom claims.
 * Source of truth: AuthService.user().role (no API calls needed).
 */
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private authService = inject(AuthService);

  readonly role = computed(() => this.authService.user()?.role ?? null);

  can(module: string, action: Action): boolean {
    const role = this.role();
    if (!role) return false;
    return ROLE_MATRIX[role]?.[module]?.[action] ?? false;
  }

  canRead(module: string): boolean   { return this.can(module, 'read'); }
  canCreate(module: string): boolean { return this.can(module, 'create'); }
  canUpdate(module: string): boolean { return this.can(module, 'update'); }
  canDelete(module: string): boolean { return this.can(module, 'delete'); }

  canAccessModule(module: string): boolean { return this.canRead(module); }
}
