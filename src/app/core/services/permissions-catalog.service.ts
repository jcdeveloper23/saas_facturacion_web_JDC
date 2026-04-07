import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, map, from } from 'rxjs';
import { where } from '@angular/fire/firestore';
import { FirestoreService } from './firestore.service';
import { Permission, PermissionInput, Module, Action } from '../interfaces/permission.interface';

/**
 * PermissionsCatalogService — manages the permission catalog in Firestore /permissions.
 *
 * ROOT-level collection (not tenant-scoped), managed by super_admin.
 * A permission = module × action combination: { module_id: 'customers', action_id: 'view' }
 *   → code: 'customers.view', name: 'Ver Clientes'
 *
 * This service handles CRUD of the catalog.
 * Runtime permission CHECKS (role matrix) are in PermissionsService.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsCatalogService {
  private fs = inject(FirestoreService);

  // ─── Read ─────────────────────────────────────────────────────────────────

  getPermissionsCatalog(activeOnly = false): Observable<Permission[]> {
    if (activeOnly) {
      return from(
        this.fs.getRootCollectionQuery<Permission>('permissions', where('state', '==', true))
      ).pipe(map(perms => perms.sort((a, b) => a.code.localeCompare(b.code))));
    }
    return this.fs.getRootCollection<Permission>('permissions').pipe(
      map(perms => perms.sort((a, b) => a.code.localeCompare(b.code)))
    );
  }

  /**
   * Returns permissions enriched with their Module and Action objects.
   * Used by PermissionsComponent to display grouped permissions.
   */
  getPermissionsWithRelations(
    modules$: Observable<Module[]>,
    actions$: Observable<Action[]>
  ): Observable<Permission[]> {
    return combineLatest([this.getPermissionsCatalog(), modules$, actions$]).pipe(
      map(([perms, modules, actions]) =>
        perms.map(p => ({
          ...p,
          module: modules.find(m => m.id === p.module_id),
          action: actions.find(a => a.id === p.action_id)
        }))
      )
    );
  }

  // ─── Write (super_admin only) ─────────────────────────────────────────────

  async createPermission(data: PermissionInput): Promise<string> {
    const payload: Omit<Permission, 'id'> = {
      module_id:   data.module_id,
      action_id:   data.action_id,
      code:        `${data.module_id}.${data.action_id}`,
      name:        data.name,
      description: data.description ?? '',
      isSystem:    data.isSystem    ?? false,
      state:       data.state       ?? true
    };
    return this.fs.addRootDocument('permissions', payload);
  }

  async updatePermission(id: string, data: Partial<PermissionInput>): Promise<void> {
    return this.fs.updateRootDocument<Permission>('permissions', id, data as Partial<Permission>);
  }

  async deletePermission(id: string): Promise<void> {
    const { deleteDoc, doc, getFirestore } = await import('@angular/fire/firestore');
    await deleteDoc(doc(getFirestore(), `permissions/${id}`));
  }
}
