import { Injectable, inject } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { where } from '@angular/fire/firestore';
import { FirestoreService } from './firestore.service';
import { Module, ModuleInput } from '../interfaces/permission.interface';

/**
 * ModulesService — manages the platform plugin catalog stored in Firestore /modules.
 *
 * ROOT-level collection (not tenant-scoped), managed by super_admin.
 * Angular equivalent of FacturaScripts fs_pages table:
 *   - Each module = a plugin with nav properties + dependency list
 *   - super_admin creates/edits modules here
 *   - Companies activate modules via company.enabledModules (see TenantService)
 */
@Injectable({ providedIn: 'root' })
export class ModulesService {
  private fs = inject(FirestoreService);

  // ─── Read ─────────────────────────────────────────────────────────────────

  getModules(activeOnly = true): Observable<Module[]> {
    if (activeOnly) {
      return from(
        this.fs.getRootCollectionQuery<Module>('modules', where('state', '==', true))
      ).pipe(map(modules => modules.sort((a, b) => a.order - b.order)));
    }
    return this.fs.getRootCollection<Module>('modules').pipe(
      map(modules => modules.sort((a, b) => a.order - b.order))
    );
  }

  getModulesFlat(activeOnly = true): Observable<Module[]> {
    return this.getModules(activeOnly).pipe(
      map(modules => this.flattenModules(modules))
    );
  }

  // ─── Write (super_admin only) ─────────────────────────────────────────────

  async createModule(data: ModuleInput): Promise<string> {
    const payload = {
      code:         data.code,
      name:         data.name,
      description:  data.description  ?? '',
      dependencies: data.dependencies  ?? [],
      url:          data.url           ?? null,
      icon:         data.icon          ?? 'cil-puzzle',
      isTitle:      data.isTitle       ?? false,
      parent_id:    data.parent_id     ?? null,
      badgeText:    data.badgeText     ?? null,
      badgeColor:   data.badgeColor    ?? null,
      showInMenu:   data.showInMenu    ?? true,
      order:        data.order         ?? 99,
      state:        data.state         ?? true
    };
    return this.fs.addRootDocument('modules', payload);
  }

  async updateModule(id: string, data: Partial<ModuleInput>): Promise<void> {
    return this.fs.updateRootDocument<Module>('modules', id, data as Partial<Module>);
  }

  async deleteModule(id: string): Promise<void> {
    const { deleteDoc, doc, getFirestore } = await import('@angular/fire/firestore');
    await deleteDoc(doc(getFirestore(), `modules/${id}`));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Flatten hierarchical modules into a single array for table display.
   * Adds _level and _parentName for UI hierarchy rendering.
   * Equivalent to FacturaScripts admin_home.all_pages() scan logic.
   */
  flattenModules(modules: Module[]): Module[] {
    const result: Module[] = [];

    // Mapa parent_id → hijos (compatible con doc ID y code, igual que el nav builder)
    const childrenMap = new Map<string, Module[]>();
    for (const m of modules) {
      if (m.parent_id) {
        const arr = childrenMap.get(m.parent_id) ?? [];
        arr.push(m);
        childrenMap.set(m.parent_id, arr);
      }
    }

    const getChildren = (mod: Module): Module[] => {
      return [
        ...(childrenMap.get(mod.id)   ?? []),
        ...(childrenMap.get(mod.code) ?? [])
      ]
        .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i)
        .sort((a, b) => a.order - b.order);
    };

    const process = (module: Module, level: number, parentName: string | null, parentCode: string | null, isLast: boolean) => {
      result.push({
        ...module,
        _level:       level,
        _parentName:  parentName,
        _parentCode:  parentCode,
        _isLastChild: isLast
      } as Module);
      const children = getChildren(module);
      children.forEach((child, i) =>
        process(child, level + 1, module.name, module.code, i === children.length - 1)
      );
    };

    const roots = modules
      .filter(m => !m.parent_id)
      .sort((a, b) => a.order - b.order);

    roots.forEach((m, i) => process(m, 0, null, null, i === roots.length - 1));
    return result;
  }

  /**
   * Returns all module codes that depend on a given module.
   * Used when disabling a module to cascade-disable dependents.
   * Equivalent to FacturaScripts disable_plugin() cascade logic.
   */
  getDependents(moduleCode: string, allModules: Module[]): string[] {
    return allModules
      .filter(m => m.dependencies?.includes(moduleCode))
      .map(m => m.code);
  }
}
