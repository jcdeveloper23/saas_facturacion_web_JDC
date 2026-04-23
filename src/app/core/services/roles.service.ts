import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp
} from '@angular/fire/firestore';
import { Role, PermissionString } from '../interfaces/permission.interface';

/**
 * Roles de PLATAFORMA — se siembran en /roles (colección raíz).
 * Solo super_admin y admin: son los únicos roles de sistema global.
 * El resto de roles son de empresa y se gestionan por cada compañía.
 *
 * Doc ID = role.code para idempotencia y O(1) lookup.
 */
export const DEFAULT_SYSTEM_ROLES: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    code: 'super_admin',
    name: 'Super Administrador',
    description: 'Acceso total a la plataforma. Gestiona compañías, planes y configuración raíz.',
    type: 'system',
    level: 0,
    color: '#dc3545',
    icon: 'cilShieldAlt',
    isDefault: true,
    state: true,
    permissions: [
      // Plataforma
      'companies.view', 'companies.create', 'companies.edit', 'companies.delete',
      'plans.view', 'plans.create', 'plans.edit', 'plans.delete',
      'users.view', 'users.create', 'users.edit', 'users.delete',
      'settings.view', 'settings.create', 'settings.edit', 'settings.delete',
      'team_management.view', 'team_management.create', 'team_management.edit', 'team_management.delete',
      // Empresa — super_admin nunca tiene menos permisos que admin
      'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
      'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete',
      'products.view', 'products.create', 'products.edit', 'products.delete',
      'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete',
      'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.delete',
      'orders.view', 'orders.create', 'orders.edit', 'orders.delete',
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete',
      'stock.view', 'stock.create', 'stock.edit', 'stock.delete',
      'pos.view', 'pos.create', 'pos.edit', 'pos.delete',
      'sri.view', 'sri.create', 'sri.edit', 'sri.delete',
      'personas.view', 'personas.create', 'personas.edit', 'personas.delete',
      'retentions.view', 'retentions.create', 'retentions.edit', 'retentions.delete',
      'debit_notes.view', 'debit_notes.create', 'debit_notes.edit', 'debit_notes.delete',
      'accounting.view', 'accounting.create', 'accounting.edit', 'accounting.delete',
    ] as PermissionString[]
  },
  {
    code: 'admin',
    name: 'Administrador',
    description: 'Administra la empresa: usuarios, módulos, configuración y todas las operaciones.',
    type: 'system',
    level: 1,
    color: '#0d6efd',
    icon: 'cilUser',
    isDefault: true,
    state: true,
    permissions: [
      'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
      'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete',
      'products.view', 'products.create', 'products.edit', 'products.delete',
      'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete',
      'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.delete',
      'orders.view', 'orders.create', 'orders.edit', 'orders.delete',
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete',
      'stock.view', 'stock.create', 'stock.edit', 'stock.delete',
      'pos.view', 'pos.create', 'pos.edit', 'pos.delete',
      'sri.view', 'sri.create', 'sri.edit', 'sri.delete',
      'personas.view', 'personas.create', 'personas.edit', 'personas.delete',
      'retentions.view', 'retentions.create', 'retentions.edit', 'retentions.delete',
      'debit_notes.view', 'debit_notes.create', 'debit_notes.edit', 'debit_notes.delete',
      'accounting.view', 'accounting.create', 'accounting.edit', 'accounting.delete',
      'settings.view', 'settings.create', 'settings.edit', 'settings.delete',
      'users.view', 'users.create', 'users.edit', 'users.delete',
      'team_management.view', 'team_management.create', 'team_management.edit', 'team_management.delete',
    ] as PermissionString[]
  },
];

/**
 * Roles de EMPRESA — se siembran en companies/{companyId}/roles cuando se crea
 * una empresa nueva (setupCompany CF). Cada empresa los puede personalizar después.
 *
 * NO se incluyen en /roles global. Son propiedad de la empresa.
 */
export const COMPANY_DEFAULT_ROLES: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    code: 'seller',
    name: 'Vendedor',
    description: 'Gestiona clientes, facturas, cotizaciones y pedidos. Sin acceso a eliminación ni configuración.',
    type: 'system',
    level: 2,
    color: '#0dcaf0',
    icon: 'cilCart',
    isDefault: true,
    state: true,
    permissions: [
      'customers.view', 'customers.create', 'customers.edit',
      'suppliers.view', 'suppliers.create', 'suppliers.edit',
      'products.view', 'products.create', 'products.edit',
      'invoices.view', 'invoices.create', 'invoices.edit',
      'quotes.view', 'quotes.create', 'quotes.edit',
      'orders.view', 'orders.create', 'orders.edit',
      'purchases.view', 'purchases.create', 'purchases.edit',
      'stock.view', 'stock.create', 'stock.edit',
      'personas.view', 'personas.create', 'personas.edit',
      'sri.view',
      'settings.view',
      'team_management.view', 'team_management.create', 'team_management.edit',
    ] as PermissionString[]
  },
  {
    code: 'accountant',
    name: 'Contador',
    description: 'Gestiona documentos fiscales (retenciones, notas de débito, compras) y contabilidad.',
    type: 'system',
    level: 2,
    color: '#6f42c1',
    icon: 'cilSpreadsheet',
    isDefault: true,
    state: true,
    permissions: [
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete',
      'retentions.view', 'retentions.create', 'retentions.edit', 'retentions.delete',
      'debit_notes.view', 'debit_notes.create', 'debit_notes.edit', 'debit_notes.delete',
      'accounting.view', 'accounting.create', 'accounting.edit',
      'invoices.view',
      'customers.view',
      'suppliers.view',
      'products.view',
      'sri.view',
      'settings.view',
    ] as PermissionString[]
  },
  {
    code: 'cashier',
    name: 'Cajero',
    description: 'Opera el punto de venta, emite facturas y consulta inventario.',
    type: 'system',
    level: 3,
    color: '#198754',
    icon: 'cilCash',
    isDefault: true,
    state: true,
    permissions: [
      'customers.view',
      'products.view',
      'invoices.view', 'invoices.create',
      'pos.view', 'pos.create',
      'stock.view',
      'settings.view',
      'team_management.view',
    ] as PermissionString[]
  },
  {
    code: 'read_only',
    name: 'Solo Lectura',
    description: 'Acceso de consulta a todos los módulos habilitados. No puede crear ni modificar datos.',
    type: 'system',
    level: 4,
    color: '#6c757d',
    icon: 'cilLockLocked',
    isDefault: true,
    state: true,
    permissions: [
      'customers.view', 'suppliers.view', 'products.view',
      'invoices.view', 'quotes.view', 'orders.view',
      'purchases.view', 'stock.view', 'pos.view',
      'sri.view', 'settings.view', 'team_management.view',
    ] as PermissionString[]
  },
];

/**
 * RolesService — CRUD de roles en Firestore /roles (colección raíz).
 * Gestionado por super_admin. Un rol es un perfil de permisos asignable a usuarios.
 * Equivale a fs_roles del sistema legacy PHP.
 *
 * Migrado de REST API (FeathersJS) → Firestore.
 */
@Injectable({ providedIn: 'root' })
export class RolesService {
  private firestore = inject(Firestore);

  getRoles(): Observable<Role[]> {
    return new Observable<Role[]>(observer => {
      const ref = collection(this.firestore, 'roles');
      return onSnapshot(ref, {
        next: snap => observer.next(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }) as Role)
            .sort((a, b) => (a.level ?? 99) - (b.level ?? 99))
        ),
        error: err => observer.error(err)
      });
    });
  }

  createRole(data: Partial<Role>): Observable<Role> {
    const ref = collection(this.firestore, 'roles');
    const now = Timestamp.now();
    return from(
      addDoc(ref, { ...data, createdAt: now, updatedAt: now })
        .then(docRef => ({ id: docRef.id, ...data } as Role))
    );
  }

  updateRole(id: string | number, data: Partial<Role>): Observable<Role> {
    const ref = doc(this.firestore, `roles/${id}`);
    return from(
      updateDoc(ref, { ...data, updatedAt: Timestamp.now() } as any)
        .then(() => ({ id, ...data } as Role))
    );
  }

  deleteRole(id: string | number): Observable<Role> {
    const ref = doc(this.firestore, `roles/${id}`);
    return from(
      deleteDoc(ref).then(() => ({ id } as Role))
    );
  }

  /**
   * Siembra los roles del sistema en Firestore /roles.
   * Solo crea los roles que no existen — operación idempotente.
   * Doc ID = role.code para garantizar unicidad y O(1) lookup.
   * Solo debe llamarse desde super_admin.
   *
   * @returns { created, skipped } — cuántos roles se crearon vs ya existían.
   */
  async seedDefaultRoles(): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;
    const now = Timestamp.now();

    for (const roleData of DEFAULT_SYSTEM_ROLES) {
      const ref = doc(this.firestore, `roles/${roleData.code}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { ...roleData, createdAt: now, updatedAt: now });
        created++;
      } else {
        skipped++;
      }
    }

    return { created, skipped };
  }

  /**
   * Filtra los roles que el usuario actual puede asignar.
   * Un usuario solo puede asignar roles con nivel MAYOR al suyo.
   * super_admin (level=0) puede asignar todos.
   */
  getAssignableRoles(allRoles: Role[], currentUserLevel: number): Role[] {
    return allRoles.filter(r => r.level > currentUserLevel);
  }

  /**
   * Roles de plataforma asignables (super_admin únicamente).
   * Consulta /roles con where('level', '>', currentUserLevel).
   */
  getRolesAssignableTo(currentUserLevel: number): Observable<Role[]> {
    return new Observable<Role[]>(observer => {
      const ref = collection(this.firestore, 'roles');
      const q   = query(ref, where('level', '>', currentUserLevel), orderBy('level', 'asc'));
      return onSnapshot(q, {
        next: snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Role)),
        error: err => observer.error(err),
      });
    });
  }

  // ── Company roles ─────────────────────────────────────────────────────────

  /** Todos los roles de una empresa (companies/{companyId}/roles). */
  getCompanyRoles(companyId: string): Observable<Role[]> {
    return new Observable<Role[]>(observer => {
      const ref = collection(this.firestore, `companies/${companyId}/roles`);
      return onSnapshot(ref, {
        next: snap => observer.next(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }) as Role)
            .sort((a, b) => (a.level ?? 99) - (b.level ?? 99))
        ),
        error: err => observer.error(err),
      });
    });
  }

  /**
   * Roles de empresa asignables: level > currentUserLevel.
   * Usar en el formulario de creación/edición de usuarios de empresa.
   */
  getCompanyRolesAssignableTo(companyId: string, currentUserLevel: number): Observable<Role[]> {
    return new Observable<Role[]>(observer => {
      const ref = collection(this.firestore, `companies/${companyId}/roles`);
      const q   = query(ref, where('level', '>', currentUserLevel), orderBy('level', 'asc'));
      return onSnapshot(q, {
        next: snap => observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Role)),
        error: err => observer.error(err),
      });
    });
  }

  /** Crea un rol personalizado en la empresa. */
  createCompanyRole(companyId: string, data: Partial<Role>): Observable<Role> {
    const now = Timestamp.now();
    const code = (data as any).code as string;
    const ref = doc(this.firestore, `companies/${companyId}/roles/${code}`);
    return from(
      setDoc(ref, { ...data, createdAt: now, updatedAt: now })
        .then(() => ({ id: code, ...data } as Role))
    );
  }

  /** Actualiza un rol de empresa existente. */
  updateCompanyRole(companyId: string, id: string, data: Partial<Role>): Observable<Role> {
    const ref = doc(this.firestore, `companies/${companyId}/roles/${id}`);
    return from(
      updateDoc(ref, { ...data, updatedAt: Timestamp.now() } as any)
        .then(() => ({ id, ...data } as Role))
    );
  }

  /** Elimina un rol de empresa. */
  deleteCompanyRole(companyId: string, id: string): Observable<void> {
    const ref = doc(this.firestore, `companies/${companyId}/roles/${id}`);
    return from(deleteDoc(ref));
  }

  /**
   * Siembra los roles de empresa por defecto en companies/{companyId}/roles.
   * Idempotente: solo crea los que no existen (doc ID = role.code).
   * Llamado por setupCompany CF al crear una empresa nueva.
   */
  async seedCompanyDefaultRoles(companyId: string): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;
    const now = Timestamp.now();

    for (const roleData of COMPANY_DEFAULT_ROLES) {
      const ref  = doc(this.firestore, `companies/${companyId}/roles/${roleData.code}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { ...roleData, createdAt: now, updatedAt: now });
        created++;
      } else {
        skipped++;
      }
    }

    return { created, skipped };
  }
}
