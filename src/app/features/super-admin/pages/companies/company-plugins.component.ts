import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, AlertModule, TooltipModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';

import { SuperAdminService } from '../../services/super-admin.service';
import { ModulesService } from '../../../../core/services/modules.service';
import { Module } from '../../../../core/interfaces/permission.interface';
import { Company } from '../../models/company.interface';

interface ModuleRow {
  module: Module;
  enabled: boolean;
  canEnable: boolean;      // false si faltan dependencias
  missingDeps: string[];   // nombres de deps faltantes
  willDisable: string[];   // módulos que se desactivarían en cascada al desactivar este
}

@Component({
  selector: 'app-company-plugins',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, AlertModule, TooltipModule, IconModule
  ],
  templateUrl: './company-plugins.component.html'
})
export class CompanyPluginsComponent implements OnInit {
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private superAdmin     = inject(SuperAdminService);
  private modulesService = inject(ModulesService);

  companyId = signal<string>('');
  company   = signal<Company | null>(null);
  allModules = signal<Module[]>([]);
  enabled   = signal<Set<string>>(new Set());
  saving    = signal<string | null>(null);   // moduleCode being toggled
  isLoading = signal(true);
  error     = signal<string | null>(null);

  // Build rows with dependency/cascade info
  rows = computed<ModuleRow[]>(() => {
    const mods    = this.allModules().filter(m => !m.isTitle);
    const active  = this.enabled();

    return mods.map(mod => {
      const missingDeps = (mod.dependencies ?? []).filter(dep => !active.has(dep));
      const canEnable   = missingDeps.length === 0;
      const willDisable = active.has(mod.code)
        ? this.modulesService.getDependents(mod.code, mods).filter(c => active.has(c))
        : [];

      return { module: mod, enabled: active.has(mod.code), canEnable, missingDeps, willDisable };
    });
  });

  // Modules grouped by folder/section (isTitle modules as separators)
  sectioned = computed(() => {
    const all = this.allModules();
    const rows = this.rows();
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

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.companyId.set(id);

    forkJoin({
      modules: this.modulesService.getModules(true).pipe(take(1)),
      company: this.superAdmin.getCompany(id).pipe(take(1))
    }).subscribe({
      next: ({ modules, company }) => {
        this.allModules.set(modules);
        const enabledSet = new Set<string>(company?.enabledModules ?? []);
        this.enabled.set(enabledSet);
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

  async toggle(row: ModuleRow): Promise<void> {
    if (this.saving()) return;

    const code    = row.module.code;
    const active  = new Set(this.enabled());
    const mods    = this.allModules().filter(m => !m.isTitle);

    if (row.enabled) {
      // DISABLE — check cascade
      const cascades = this.modulesService.getDependents(code, mods).filter(c => active.has(c));
      if (cascades.length) {
        const names = cascades.map(c => mods.find(m => m.code === c)?.name ?? c).join(', ');
        if (!confirm(`Desactivar "${row.module.name}" también desactivará: ${names}\n\n¿Continuar?`)) return;
        cascades.forEach(c => active.delete(c));
      }
      active.delete(code);
    } else {
      // ENABLE — check dependencies
      if (!row.canEnable) {
        alert(`Primero activa las dependencias: ${row.missingDeps.join(', ')}`);
        return;
      }
      active.add(code);
    }

    this.saving.set(code);
    try {
      await this.superAdmin.updateCompany(this.companyId(), {
        enabledModules: Array.from(active)
      } as any);
      this.enabled.set(active);
    } catch (err) {
      console.error('[CompanyPlugins] Toggle error:', err);
      this.error.set('Error guardando cambios.');
    } finally {
      this.saving.set(null);
    }
  }

  back(): void {
    this.router.navigate(['/super-admin/companies']);
  }
}
