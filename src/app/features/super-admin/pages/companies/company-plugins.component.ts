import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, AlertModule, TooltipModule, CollapseModule,
  ModalModule, FormModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { FormsModule } from '@angular/forms';
import { switchMap, forkJoin, of, map } from 'rxjs';
import { take } from 'rxjs/operators';

import { SuperAdminService } from '../../services/super-admin.service';
import { ModulesService } from '../../../../core/services/modules.service';
import { PluginPackagesService } from '../../../../core/services/plugin-packages.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Module, PluginPackage } from '../../../../core/interfaces/permission.interface';
import { Company } from '../../models/company.interface';
import { Plan } from '../../models/plan.interface';

interface PackageRow {
  pkg: PluginPackage;
  enabled: boolean;
  isFromPlan: boolean;         // true = included in company's current plan (locked)
  isAddon: boolean;            // true = active as paid add-on
  addonPrice?: number;         // price recorded at activation
  canEnable: boolean;
  missingDeps: string[];
  willDisable: string[];
  modulesEnabled: number;
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
    CommonModule, CurrencyPipe, RouterLink, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, AlertModule, TooltipModule, CollapseModule,
    ModalModule, FormModule, IconModule
  ],
  templateUrl: './company-plugins.component.html'
})
export class CompanyPluginsComponent implements OnInit {
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);
  private superAdmin      = inject(SuperAdminService);
  private modulesService  = inject(ModulesService);
  private packagesService = inject(PluginPackagesService);
  private auth            = inject(AuthService);

  companyId    = signal<string>('');
  company      = signal<Company | null>(null);
  currentPlan  = signal<Plan | null>(null);
  allModules   = signal<Module[]>([]);
  allPackages  = signal<PluginPackage[]>([]);
  enabledPkgs  = signal<Set<string>>(new Set());
  enabledMods  = signal<Set<string>>(new Set());
  planPackages = signal<Set<string>>(new Set());   // codes from plan.includedPackages
  saving       = signal<string | null>(null);
  isLoading    = signal(true);
  error        = signal<string | null>(null);
  showAdvanced = signal(false);

  // ─── Add-on modal state ──────────────────────────────────────────────────

  showAddonModal   = signal(false);
  pendingAddonPkg  = signal<PluginPackage | null>(null);
  addonAgreedPrice = signal<number>(0);
  addonNotes       = signal<string>('');
  isAddonAction    = signal<'activate' | 'deactivate'>('activate');

  // ─── Package rows ─────────────────────────────────────────────────────────

  packageRows = computed<PackageRow[]>(() => {
    const pkgs    = this.allPackages();
    const active  = this.enabledPkgs();
    const mods    = this.enabledMods();
    const plan    = this.planPackages();
    const addons  = this.company()?.addonPackages ?? [];

    return pkgs.map(pkg => {
      const isFromPlan  = plan.has(pkg.code) || pkg.isSystem;
      const addonRecord = addons.find(a => a.packageCode === pkg.code);
      const isAddon     = !!addonRecord;
      const addonPrice  = addonRecord?.priceAtActivation;

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

      return {
        pkg, enabled: active.has(pkg.code),
        isFromPlan, isAddon, addonPrice,
        canEnable, missingDeps, willDisable, modulesEnabled
      };
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

    this.superAdmin.getCompany(id).pipe(
      take(1),
      switchMap(company => {
        if (!company) {
          return of({ modules: [] as Module[], packages: [] as PluginPackage[], plan: null as Plan | null | undefined, company });
        }
        return forkJoin({
          modules:  this.modulesService.getModules(true).pipe(take(1)),
          packages: this.packagesService.getPackages(true).pipe(take(1)),
          plan:     company.planId
            ? this.superAdmin.getPlan(company.planId).pipe(take(1))
            : of(null as Plan | null | undefined)
        }).pipe(
          map(data => ({ ...data, company }))
        );
      })
    ).subscribe({
      next: ({ modules, packages, plan, company }) => {
        this.allModules.set(modules ?? []);
        this.allPackages.set(packages ?? []);
        this.enabledPkgs.set(new Set<string>(company?.enabledPackages ?? []));
        this.enabledMods.set(new Set<string>(company?.enabledModules  ?? []));
        this.planPackages.set(new Set<string>((plan as Plan | null)?.includedPackages ?? []));
        this.currentPlan.set((plan as Plan | null) ?? null);
        this.company.set(company ?? null);
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
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
    if (row.isFromPlan) return;   // plan packages are locked — cannot toggle manually

    if (row.enabled) {
      // DEACTIVATE add-on: confirm cascade then show deactivate modal
      if (row.willDisable.length) {
        if (!confirm(`Desactivar "${row.pkg.name}" también desactivará: ${row.willDisable.join(', ')}\n\n¿Continuar?`)) return;
      }
      this.pendingAddonPkg.set(row.pkg);
      this.isAddonAction.set('deactivate');
      this.showAddonModal.set(true);
    } else {
      if (!row.canEnable) {
        alert(`Primero activa las dependencias: ${row.missingDeps.join(', ')}`);
        return;
      }
      // ACTIVATE add-on: prefill price suggestion and open modal
      this.pendingAddonPkg.set(row.pkg);
      this.addonAgreedPrice.set(row.pkg.price ?? 0);
      this.addonNotes.set('');
      this.isAddonAction.set('activate');
      this.showAddonModal.set(true);
    }
  }

  cancelAddon(): void {
    this.showAddonModal.set(false);
    this.pendingAddonPkg.set(null);
    this.addonAgreedPrice.set(0);
    this.addonNotes.set('');
  }

  async confirmAddon(): Promise<void> {
    const pkg = this.pendingAddonPkg();
    if (!pkg) return;

    const uid = this.auth.user()?.uid ?? 'unknown';
    const pkgCode = pkg.code;
    const allPkgs = this.allPackages();
    const activePkgs = new Set(this.enabledPkgs());

    this.saving.set(pkgCode);
    this.showAddonModal.set(false);

    try {
      if (this.isAddonAction() === 'activate') {
        // Auto-add missing dependencies
        pkg.dependencies.forEach(d => activePkgs.add(d));
        activePkgs.add(pkgCode);
        const newModules = this.packagesService.resolveModules(Array.from(activePkgs), allPkgs);

        await this.superAdmin.activateAddonPackage(
          this.companyId(),
          pkg,
          Array.from(activePkgs),
          newModules,
          this.addonAgreedPrice(),
          this.addonNotes(),
          uid
        );
        this.enabledPkgs.set(activePkgs);
        this.enabledMods.set(new Set(newModules));
        // Refresh company to pick up updated addonPackages[]
        this.refreshCompany();
      } else {
        // DEACTIVATE — cascade dependents
        this.packagesService.getDependents(pkgCode, allPkgs)
          .filter(c => activePkgs.has(c))
          .forEach(c => activePkgs.delete(c));
        activePkgs.delete(pkgCode);
        const newModules = this.packagesService.resolveModules(Array.from(activePkgs), allPkgs);

        await this.superAdmin.deactivateAddonPackage(
          this.companyId(),
          pkgCode,
          Array.from(activePkgs),
          newModules,
          this.company()?.addonPackages
        );
        this.enabledPkgs.set(activePkgs);
        this.enabledMods.set(new Set(newModules));
        this.refreshCompany();
      }
    } catch (err) {
      console.error('[CompanyPlugins] Addon error:', err);
      this.error.set('Error guardando cambios.');
    } finally {
      this.saving.set(null);
      this.pendingAddonPkg.set(null);
    }
  }

  private refreshCompany(): void {
    this.superAdmin.getCompany(this.companyId()).pipe(take(1)).subscribe(c => {
      if (c) this.company.set(c);
    });
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

    await this.persistModuleOverride(active, code);
  }

  private async persistModuleOverride(mods: Set<string>, savingKey: string): Promise<void> {
    this.saving.set(savingKey);
    try {
      await this.superAdmin.updateCompany(this.companyId(), {
        enabledModules: Array.from(mods)
      } as any);
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
