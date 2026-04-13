import { Injectable, inject } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { where } from '@angular/fire/firestore';
import { FirestoreService } from './firestore.service';
import { PluginPackage, PluginPackageInput } from '../interfaces/permission.interface';

/**
 * PluginPackagesService — manages the platform plugin package catalog in /plugin-packages.
 *
 * ROOT-level collection (not tenant-scoped), managed by super_admin.
 *
 * A PluginPackage is a commercial bundle of modules offered as a single unit.
 * Companies activate packages; their individual modules are derived automatically.
 *
 * Extensible: adding a new vertical (accounting, automotive, pharmacy…) is just
 * creating a new document here — no code changes needed in guards or nav.
 */
@Injectable({ providedIn: 'root' })
export class PluginPackagesService {
  private fs = inject(FirestoreService);

  // ─── Read ─────────────────────────────────────────────────────────────────

  getPackages(activeOnly = true): Observable<PluginPackage[]> {
    if (activeOnly) {
      return from(
        this.fs.getRootCollectionQuery<PluginPackage>('plugin-packages', where('state', '==', true))
      ).pipe(map(pkgs => pkgs.sort((a, b) => a.order - b.order)));
    }
    return this.fs.getRootCollection<PluginPackage>('plugin-packages').pipe(
      map(pkgs => pkgs.sort((a, b) => a.order - b.order))
    );
  }

  // ─── Write (super_admin only) ─────────────────────────────────────────────

  async createPackage(data: PluginPackageInput): Promise<string> {
    const payload: Omit<PluginPackage, 'id'> = {
      code:          data.code,
      name:          data.name,
      description:   data.description   ?? '',
      modules:       data.modules        ?? [],
      dependencies:  data.dependencies   ?? [],
      price:         data.price          ?? 0,
      currency:      data.currency       ?? 'USD',
      billingPeriod: data.billingPeriod  ?? 'monthly',
      icon:          data.icon           ?? 'cil-puzzle',
      color:         data.color          ?? 'primary',
      isSystem:      data.isSystem       ?? false,
      order:         data.order          ?? 99,
      state:         data.state          ?? true
    };
    return this.fs.addRootDocument('plugin-packages', payload);
  }

  async updatePackage(id: string, data: Partial<PluginPackageInput>): Promise<void> {
    return this.fs.updateRootDocument<PluginPackage>('plugin-packages', id, data as Partial<PluginPackage>);
  }

  async deletePackage(id: string): Promise<void> {
    const { deleteDoc, doc, getFirestore } = await import('@angular/fire/firestore');
    await deleteDoc(doc(getFirestore(), `plugin-packages/${id}`));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Given a set of active package codes and the full catalog,
   * returns the union of all modules they activate.
   * Used by CompanyPluginsComponent and TenantService.
   */
  resolveModules(activePackageCodes: string[], catalog: PluginPackage[]): string[] {
    const active = catalog.filter(p => activePackageCodes.includes(p.code));
    return [...new Set(active.flatMap(p => p.modules))];
  }

  /**
   * Returns all package codes that depend on a given package.
   * Used when deactivating to cascade-deactivate dependents.
   */
  getDependents(packageCode: string, allPackages: PluginPackage[]): string[] {
    return allPackages
      .filter(p => p.dependencies.includes(packageCode))
      .map(p => p.code);
  }
}
