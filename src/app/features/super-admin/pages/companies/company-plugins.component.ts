import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, AlertModule, TooltipModule, CollapseModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';

import { SuperAdminService } from '../../services/super-admin.service';
import { ModulesService } from '../../../../core/services/modules.service';
import { PluginPackagesService } from '../../../../core/services/plugin-packages.service';
import { Module, PluginPackage } from '../../../../core/interfaces/permission.interface';
import { Company } from '../../models/company.interface';

interface PackageRow {
  pkg: PluginPackage;
  enabled: boolean;
  canEnable: boolean;
  missingDeps: string[];      // package names of missing dependencies
  willDisable: string[];      // package names that cascade-disable
  modulesEnabled: number;     // how many of its modules are currently enabled
}

interface ModuleRow {
  module: Module;
  enabled: boolean;
  canEnable: boolean;
  missingDeps: string[];
  willDisable: string[];
}

@Component({
  selector: 'app-company-plugins',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, AlertModule, TooltipModule, CollapseModule, IconModule
  ],
  templateUrl: './company-plugins.component.html'
})
export class CompanyPluginsComponent implements OnInit {
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);
  private superAdmin      = inject(SuperAdminService);
  private modulesService  = inject(ModulesService);
  private packagesService = inject(PluginPackagesService);

  companyId    = signal<string>('');
  company      = signal<Company | null>(null);
  allModules   = signal<Module[]>([]);
  allPackages  = signal<PluginPackage[]>([]);
  enabledPkgs  = signal<Set<string>>(new Set());
  enabledMods  = signal<Set<string>>(new Set());
  saving       = signal<string | null>(null);
  isLoading    = signal(true);
  error        = signal<string | null>(null);
  showAdvanced = signal(false);

  // ─── Package rows ─────────────────────────────────────────────────────────

  packageRows = computed<PackageRow[]>(() => {
    const pkgs    = this.allPackages();
    const active  = this.enabledPkgs();
    const mods    = this.enabledMods();

    return pkgs.map(pkg => {
      const missingDepCodes = pkg.dependencies.filter(d => !active.has(d));
      const missingDeps = missingDepCodes.map(c =>
        pkgs.find(p => p.code === c)?.name ?? c
      );
      const canEnable = missingDeps.length === 0;
      const willDisable = active.has(pkg.code)
        ? this.packagesService.getDependents(pkg.code, pkgs)
            .filter(c => active.has(c))
            .map(c => pkgs.find(p => p.code === c)?.name ?? c)
        : [];
      const modulesEnabled = pkg.modules.filter(m => mods.has(m)).length;

      return { pkg, enabled: active.has(pkg.code), canEnable, missingDeps, willDisable, modulesEnabled };
    });
  });

  // ─── Individual module rows (advanced section) ────────────────────────────

  moduleRows = computed<ModuleRow[]>(() => {
    const mods   = this.allModules().filter(m => !m.isTitle);
    const active = this.enabledMods();

    return mods.map(mod => {
      const missingDeps = (mod.dependencies ?? []).filter(dep => !active.has(dep));
      const canEnable   = missingDeps.length === 0;
      const willDisable = active.has(mod.code)
        ? this.modulesService.getDependents(mod.code, mods).filter(c => active.has(c))
        : [];
      return { module: mod, enabled: active.has(mod.code), canEnable, missingDeps, willDisable };
    });
  });

  moduleSections = computed(() => {
    const all  = this.allModules();
    const rows = this.moduleRows();
    const sections: { title: string; rows: ModuleRow[] }[] = [];
    let current = { title: 'General', rows: [] as ModuleRow[] };

    all.forEach(mod => {
      if (mod.isTitle) {
        if (current.rows.length) sections.push(current);
        current = { title: mod.name, rows: [] };
      } else {
        const row = rows.find(r => r.module.code === mod.code);
        if (row) current.rows.push(row);
      }
    });
    if (current.rows.length) sections.push(current);
    return sections;
  });

  // ─── Init ─────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.companyId.set(id);

    forkJoin({
      modules:  this.modulesService.getModules(true).pipe(take(1)),
      packages: this.packagesService.getPackages(true).pipe(take(1)),
      company:  this.superAdmin.getCompany(id).pipe(take(1))
    }).subscribe({
      next: ({ modules, packages, company }) => {
        this.allModules.set(modules);
        this.allPackages.set(packages);
        this.enabledPkgs.set(new Set<string>(company?.enabledPackages ?? []));
        this.enabledMods.set(new Set<string>(company?.enabledModules  ?? []));
        this.company.set(company ?? null);
        this.isLoading.set(false);
      },
      error: err => {
        console.error('[CompanyPlugins] Load error:', err);
        this.error.set('Error cargando datos. Intenta de nuevo.');
        this.isLoading.set(false);
      }
    });
  }

  // ─── Package toggle ───────────────────────────────────────────────────────

  async togglePackage(row: PackageRow): Promise<void> {
    if (this.saving()) return;
    if (row.pkg.isSystem) return;

    const pkgCode  = row.pkg.code;
    const pkgs     = this.allPackages();
    const activePkgs = new Set(this.enabledPkgs());

    if (row.enabled) {
      // DISABLE — check cascade dependents
      const cascadeNames = row.willDisable;
      if (cascadeNames.length) {
        if (!confirm(`Desactivar "${row.pkg.name}" también desactivará: ${cascadeNames.join(', ')}\n\n¿Continuar?`)) return;
        this.packagesService.getDependents(pkgCode, pkgs)
          .filter(c => activePkgs.has(c))
          .forEach(c => activePkgs.delete(c));
      }
      activePkgs.delete(pkgCode);
    } else {
      // ENABLE — check missing dependencies
      if (!row.canEnable) {
        const missingNames = row.missingDeps;
        if (!confirm(`Para activar "${row.pkg.name}" también se activarán sus dependencias:\n${missingNames.join(', ')}\n\n¿Continuar?`)) return;
        row.pkg.dependencies.forEach(d => activePkgs.add(d));
      }
      activePkgs.add(pkgCode);
    }

    // Resolve new enabledModules from all active packages
    const newModules = this.packagesService.resolveModules(Array.from(activePkgs), pkgs);
    await this.persistChanges(activePkgs, new Set(newModules), pkgCode);
  }

  // ─── Individual module toggle (advanced) ─────────────────────────────────

  async toggleModule(row: ModuleRow): Promise<void> {
    if (this.saving()) return;

    const code   = row.module.code;
    const active = new Set(this.enabledMods());
    const mods   = this.allModules().filter(m => !m.isTitle);

    if (row.enabled) {
      const cascades = this.modulesService.getDependents(code, mods).filter(c => active.has(c));
      if (cascades.length) {
        const names = cascades.map(c => mods.find(m => m.code === c)?.name ?? c).join(', ');
        if (!confirm(`Desactivar "${row.module.name}" también desactivará: ${names}\n\n¿Continuar?`)) return;
        cascades.forEach(c => active.delete(c));
      }
      active.delete(code);
    } else {
      if (!row.canEnable) {
        alert(`Primero activa las dependencias: ${row.missingDeps.join(', ')}`);
        return;
      }
      active.add(code);
    }

    // Keep enabledPackages in sync — don't recalculate, just persist module change as override
    await this.persistChanges(this.enabledPkgs(), active, code);
  }

  // ─── Persist ──────────────────────────────────────────────────────────────

  private async persistChanges(
    pkgs: Set<string>,
    mods: Set<string>,
    savingKey: string
  ): Promise<void> {
    this.saving.set(savingKey);
    try {
      await this.superAdmin.updateCompany(this.companyId(), {
        enabledPackages: Array.from(pkgs),
        enabledModules:  Array.from(mods)
      } as any);
      this.enabledPkgs.set(pkgs);
      this.enabledMods.set(mods);
    } catch (err) {
      console.error('[CompanyPlugins] Save error:', err);
      this.error.set('Error guardando cambios.');
    } finally {
      this.saving.set(null);
    }
  }

  back(): void {
    this.router.navigate(['/super-admin/companies']);
  }
}
