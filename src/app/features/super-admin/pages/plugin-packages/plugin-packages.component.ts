import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule,
  TooltipModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';

import { PluginPackagesService } from '../../../../core/services/plugin-packages.service';
import { ModulesService } from '../../../../core/services/modules.service';
import { SuperAdminService }  from '../../services/super-admin.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { PluginPackage, PluginPackageInput, Module } from '../../../../core/interfaces/permission.interface';
import { PLUGIN_PACKAGES_SEED } from '../../../../core/seed/plugin-packages-seed';

const COREUI_COLORS = ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'dark'];

const MODULE_GROUPS: { label: string; icon: string; codes: string[] }[] = [
  { label: 'Ventas',        icon: 'cil-cart',        codes: ['personas','products','invoices','quotes','orders','proformas','pos'] },
  { label: 'SRI',           icon: 'cil-file',        codes: ['sri','debitNotes','retentions'] },
  { label: 'Compras',       icon: 'cil-basket',      codes: ['suppliers','purchase_invoices','purchase_orders','purchase_proformas'] },
  { label: 'Almacén',       icon: 'cil-storage',     codes: ['stock'] },
  { label: 'Contabilidad',  icon: 'cil-calculator',  codes: ['accounting'] },
  { label: 'Informes',      icon: 'cil-chart-pie',   codes: ['report_invoices','report_products','report_orders'] },
  { label: 'Config',        icon: 'cil-settings',    codes: ['dashboard','settings','div','currencies','users'] },
];

export interface SyncStatus {
  status: 'ok' | 'outdated' | 'seed_only' | 'custom';
  diffs: string[];
}

export interface Notification {
  id: number;
  type: 'success' | 'danger' | 'warning' | 'info';
  message: string;
}

@Component({
  selector: 'app-plugin-packages',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, TableModule, FormModule,
    TooltipModule, AlertModule, IconModule
  ],
  templateUrl: './plugin-packages.component.html'
})
export class PluginPackagesComponent implements OnInit {
  private packagesService = inject(PluginPackagesService);
  private modulesService  = inject(ModulesService);
  private adminService    = inject(SuperAdminService);
  private fb              = inject(FormBuilder);
  private notifSvc        = inject(NotificationService);

  packages      = signal<PluginPackage[]>([]);
  allModules    = signal<Module[]>([]);
  isLoading     = signal(false);
  seeding       = signal(false);
  notifications = signal<Notification[]>([]);
  notifCounter  = 0;

  companyUsage  = signal<Map<string, number>>(new Map());
  usageLoading  = signal(false);

  showPanel      = signal(false);
  editingPackage = signal<PluginPackage | null>(null);
  showDepsTree   = signal(true);
  showGuide      = signal(true);

  // ─── Form-derived reactive signals for live preview ──────────────────────
  formModules = signal<string[]>([]);
  formDeps    = signal<string[]>([]);
  formPreview = signal<{ name: string; icon: string; color: string; price: number; billingPeriod: string; isSystem: boolean; state: boolean }>({
    name: '', icon: 'cil-puzzle', color: 'primary', price: 0, billingPeriod: 'monthly', isSystem: false, state: true
  });

  form!: FormGroup;
  readonly colors = COREUI_COLORS;

  // ─── Computed ─────────────────────────────────────────────────────────────

  packagesByCode = computed(() => new Map(this.packages().map(p => [p.code, p])));

  moduleOptions = computed(() => this.allModules().filter(m => !m.isTitle));

  seedByCode = computed(() => new Map(PLUGIN_PACKAGES_SEED.map(s => [s.code, s])));

  /** Modules grouped by category for the visual picker */
  moduleGroups = computed<{ label: string; icon: string; modules: Module[] }[]>(() => {
    const mods = this.moduleOptions();
    const placed = new Set<string>();
    const result = MODULE_GROUPS
      .map(g => ({
        label: g.label,
        icon: g.icon,
        modules: mods.filter(m => g.codes.includes(m.code)).map(m => { placed.add(m.code); return m; })
      }))
      .filter(g => g.modules.length > 0);

    const other = mods.filter(m => !placed.has(m.code));
    if (other.length) result.push({ label: 'Otros', icon: 'cil-puzzle', modules: other });
    return result;
  });

  /** Packages available as dependencies for the one being edited */
  availableDependencies = computed<PluginPackage[]>(() => {
    const editing = this.editingPackage();
    return this.packages().filter(p => !editing || p.code !== editing.code);
  });

  /** Per-package sync status vs seed */
  syncStatusMap = computed<Map<string, SyncStatus>>(() => {
    const map = new Map<string, SyncStatus>();
    const seedMap = this.seedByCode();
    for (const pkg of this.packages()) {
      const seed = seedMap.get(pkg.code);
      if (!seed) { map.set(pkg.code, { status: 'custom', diffs: [] }); continue; }
      const diffs: string[] = [];
      if (JSON.stringify([...pkg.modules].sort()) !== JSON.stringify([...seed.modules].sort()))      diffs.push('módulos');
      if (JSON.stringify([...pkg.dependencies].sort()) !== JSON.stringify([...seed.dependencies].sort())) diffs.push('dependencias');
      if (pkg.price !== seed.price) diffs.push('precio');
      if (pkg.name  !== seed.name)  diffs.push('nombre');
      map.set(pkg.code, { status: diffs.length ? 'outdated' : 'ok', diffs });
    }
    for (const seed of PLUGIN_PACKAGES_SEED) {
      if (!this.packagesByCode().has(seed.code))
        map.set(seed.code, { status: 'seed_only', diffs: [] });
    }
    return map;
  });

  outdatedCount = computed(() => {
    let n = 0;
    for (const s of this.syncStatusMap().values())
      if (s.status === 'outdated' || s.status === 'seed_only') n++;
    return n;
  });

  dependencyLevels = computed<PluginPackage[][]>(() => {
    const pkgs = this.packages();
    if (!pkgs.length) return [];
    const levels: PluginPackage[][] = [];
    const placed = new Set<string>();
    const l0 = pkgs.filter(p => p.dependencies.length === 0);
    if (l0.length) { levels.push(l0); l0.forEach(p => placed.add(p.code)); }
    let remaining = pkgs.filter(p => !placed.has(p.code));
    let safety = 10;
    while (remaining.length && safety-- > 0) {
      const next = remaining.filter(p => p.dependencies.every(d => placed.has(d)));
      if (!next.length) { levels.push(remaining); break; }
      levels.push(next);
      next.forEach(p => placed.add(p.code));
      remaining = remaining.filter(p => !placed.has(p.code));
    }
    return levels;
  });

  /** Resolved modules shown in the preview: own (direct) + inherited from deps */
  resolvedPreview = computed<{ own: string[]; fromDeps: string[] }>(() => {
    const byCode   = this.packagesByCode();
    const fromDeps = new Set<string>();
    for (const depCode of this.formDeps()) {
      byCode.get(depCode)?.modules.forEach(m => fromDeps.add(m));
    }
    const own = this.formModules().filter(m => !fromDeps.has(m));
    return { own, fromDeps: [...fromDeps] };
  });

  companiesUsingEditing = computed<number>(() => {
    const pkg = this.editingPackage();
    return pkg ? (this.companyUsage().get(pkg.code) ?? 0) : 0;
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.initForm();
    this.loadData();
  }

  private initForm(): void {
    this.form = this.fb.group({
      code:          ['', [Validators.required, Validators.pattern(/^pkg_[a-z_]+$/)]],
      name:          ['', Validators.required],
      description:   [''],
      modules:       [[]],
      dependencies:  [[]],
      price:         [0, [Validators.required, Validators.min(0)]],
      billingPeriod: ['monthly', Validators.required],
      icon:          ['cil-puzzle'],
      color:         ['primary'],
      isSystem:      [false],
      order:         [99, [Validators.required, Validators.min(1)]],
      state:         [true]
    });

    // Sync form values → signals so computed() can react
    this.form.valueChanges.subscribe(() => this.syncFormSignals());
  }

  private syncFormSignals(): void {
    const v = this.form.getRawValue();
    this.formModules.set(v.modules ?? []);
    this.formDeps.set(v.dependencies ?? []);
    this.formPreview.set({
      name:          v.name          || 'Nuevo paquete',
      icon:          v.icon          || 'cil-puzzle',
      color:         v.color         || 'primary',
      price:         v.price         ?? 0,
      billingPeriod: v.billingPeriod || 'monthly',
      isSystem:      !!v.isSystem,
      state:         !!v.state
    });
  }

  private loadData(): void {
    this.isLoading.set(true);
    forkJoin({
      packages: this.packagesService.getPackages(false).pipe(take(1)),
      modules:  this.modulesService.getModules(true).pipe(take(1))
    }).subscribe({
      next: ({ packages, modules }) => {
        this.packages.set(packages);
        this.allModules.set(modules);
        this.isLoading.set(false);
        this.loadCompanyUsage();
      },
      error: err => {
        console.error('[PluginPackages] Load error:', err);
        this.isLoading.set(false);
        this.addNotification('danger', 'Error al cargar los paquetes.');
      }
    });
  }

  private loadCompanyUsage(): void {
    this.usageLoading.set(true);
    this.adminService.getCompanies().pipe(take(1)).subscribe({
      next: companies => {
        const map = new Map<string, number>();
        for (const c of companies) {
          for (const code of ((c as any).enabledPackages ?? []))
            map.set(code, (map.get(code) ?? 0) + 1);
        }
        this.companyUsage.set(map);
        this.usageLoading.set(false);
      },
      error: () => this.usageLoading.set(false)
    });
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  addNotification(type: Notification['type'], message: string): void {
    const id = ++this.notifCounter;
    this.notifications.update(n => [...n, { id, type, message }]);
    setTimeout(() => this.dismissNotification(id), 6000);
  }

  dismissNotification(id: number): void {
    this.notifications.update(n => n.filter(x => x.id !== id));
  }

  // ─── Modal ────────────────────────────────────────────────────────────────

  openModal(pkg?: PluginPackage): void {
    if (pkg) {
      this.editingPackage.set(pkg);
      this.form.patchValue({
        code: pkg.code, name: pkg.name, description: pkg.description,
        modules: [...pkg.modules], dependencies: [...pkg.dependencies],
        price: pkg.price, billingPeriod: pkg.billingPeriod,
        icon: pkg.icon, color: pkg.color, isSystem: pkg.isSystem,
        order: pkg.order, state: pkg.state
      });
      this.form.get('code')?.disable();
    } else {
      this.editingPackage.set(null);
      this.form.reset({
        modules: [], dependencies: [], price: 0, billingPeriod: 'monthly',
        icon: 'cil-puzzle', color: 'primary', isSystem: false, order: 99, state: true
      });
      this.form.get('code')?.enable();
    }
    this.syncFormSignals();
    this.showPanel.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  closeModal(): void {
    this.showPanel.set(false);
    this.editingPackage.set(null);
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const data: PluginPackageInput = {
      code: v.code, name: v.name, description: v.description,
      modules: v.modules ?? [], dependencies: v.dependencies ?? [],
      price: v.price, billingPeriod: v.billingPeriod, icon: v.icon,
      color: v.color, isSystem: v.isSystem, order: v.order, state: v.state
    };
    const editing = this.editingPackage();
    try {
      if (editing) {
        await this.packagesService.updatePackage(editing.id, data);
        this.addNotification('success', `Paquete "${data.name}" actualizado.`);
      } else {
        await this.packagesService.createPackage(data);
        this.addNotification('success', `Paquete "${data.name}" creado.`);
      }
      this.loadData();
      this.closeModal();
    } catch (err: any) {
      this.addNotification('danger', `Error al guardar: ${err?.message ?? err}`);
    }
  }

  async deletePackage(pkg: PluginPackage): Promise<void> {
    if (pkg.isSystem) { this.addNotification('warning', 'Los paquetes del sistema no pueden eliminarse.'); return; }
    const usage = this.companyUsage().get(pkg.code) ?? 0;
    const warnText = usage > 0 ? `${usage} empresa${usage > 1 ? 's tienen' : ' tiene'} este paquete activo.` : undefined;
    const ok = await this.notifSvc.confirm({
      title: `¿Eliminar el paquete "${pkg.name}"?`,
      text: warnText,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    try {
      await this.packagesService.deletePackage(pkg.id);
      this.addNotification('success', `Paquete "${pkg.name}" eliminado.`);
      this.loadData();
    } catch (err: any) {
      this.addNotification('danger', `Error al eliminar: ${err?.message ?? err}`);
    }
  }

  // ─── Seed & Sync ──────────────────────────────────────────────────────────

  async syncPackages(): Promise<void> {
    const n = this.outdatedCount();
    const syncTitle = n > 0
      ? `¿Actualizar ${n} paquete${n > 1 ? 's' : ''} con los datos del seed?`
      : '¿Forzar sincronización de todos los paquetes?';
    const syncText = n > 0 ? undefined : 'Todo está sincronizado. Se sobreescribirán igualmente.';
    const ok = await this.notifSvc.confirm({
      title: syncTitle,
      text: syncText,
      confirmText: 'Sí, sincronizar',
      cancelText: 'Cancelar',
      icon: 'question'
    });
    if (!ok) return;
    this.seeding.set(true);
    let created = 0, updated = 0, errors = 0;
    try {
      const byCode = new Map(this.packages().map(p => [p.code, p]));
      for (const seed of PLUGIN_PACKAGES_SEED) {
        try {
          if (byCode.has(seed.code)) { await this.packagesService.updatePackage(byCode.get(seed.code)!.id, seed); updated++; }
          else { await this.packagesService.createPackage(seed); created++; }
        } catch { errors++; }
      }
      const parts = [updated && `${updated} actualizados`, created && `${created} creados`, errors && `${errors} errores`].filter(Boolean);
      this.addNotification(errors ? 'warning' : 'success', `Sincronización: ${parts.join(', ')}.`);
      this.loadData();
    } catch (err: any) {
      this.addNotification('danger', `Error: ${err?.message ?? err}`);
    } finally {
      this.seeding.set(false);
    }
  }

  async seedDefaults(): Promise<void> {
    const existing = new Set(this.packages().map(p => p.code));
    const toInsert = PLUGIN_PACKAGES_SEED.filter(p => !existing.has(p.code));
    if (!toInsert.length) { this.addNotification('info', 'Todos los paquetes ya están registrados. Usa "Sincronizar" para actualizar existentes.'); return; }
    const seedOk = await this.notifSvc.confirm({
      title: `¿Crear ${toInsert.length} paquete${toInsert.length > 1 ? 's' : ''} desde el seed?`,
      confirmText: 'Sí, crear',
      cancelText: 'Cancelar',
      icon: 'question'
    });
    if (!seedOk) return;
    this.seeding.set(true);
    let ok = 0;
    try {
      for (const pkg of toInsert) { await this.packagesService.createPackage(pkg); ok++; }
      this.addNotification('success', `${ok} paquete${ok > 1 ? 's' : ''} creado${ok > 1 ? 's' : ''}.`);
      this.loadData();
    } catch (err: any) {
      this.addNotification('danger', `Error: ${err?.message ?? err}`);
    } finally {
      this.seeding.set(false);
    }
  }

  // ─── Module / Dependency toggle helpers ──────────────────────────────────

  isModuleSelected(code: string): boolean {
    return this.formModules().includes(code);
  }

  toggleModule(code: string): void {
    const ctrl = this.form.get('modules')!;
    const cur: string[] = ctrl.value ?? [];
    ctrl.setValue(cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code]);
  }

  isDependencySelected(code: string): boolean {
    return this.formDeps().includes(code);
  }

  toggleDependency(code: string): void {
    const ctrl = this.form.get('dependencies')!;
    const cur: string[] = ctrl.value ?? [];
    ctrl.setValue(cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code]);
  }

  setColor(color: string): void {
    this.form.get('color')!.setValue(color);
  }

  groupSelectedCount(modules: Module[]): number {
    const selected = this.formModules();
    return modules.filter(m => selected.includes(m.code)).length;
  }

  isGroupAllSelected(modules: Module[]): boolean {
    const selected = this.formModules();
    return modules.length > 0 && modules.every(m => selected.includes(m.code));
  }

  toggleGroupAll(modules: Module[]): void {
    const ctrl = this.form.get('modules')!;
    const cur: string[] = ctrl.value ?? [];
    const codes = modules.map(m => m.code);
    if (this.isGroupAllSelected(modules)) {
      ctrl.setValue(cur.filter(c => !codes.includes(c)));
    } else {
      const merged = [...new Set([...cur, ...codes])];
      ctrl.setValue(merged);
    }
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────

  getSyncBadge(code: string): { color: string; label: string } {
    switch (this.syncStatusMap().get(code)?.status) {
      case 'ok':        return { color: 'success',   label: 'Sincronizado' };
      case 'outdated':  return { color: 'warning',   label: 'Desactualizado' };
      case 'seed_only': return { color: 'info',      label: 'Solo en semilla' };
      default:          return { color: 'secondary', label: 'Personalizado' };
    }
  }

  getUsageLabel(code: string): string {
    const n = this.companyUsage().get(code) ?? 0;
    return n === 0 ? 'Sin uso' : `${n} empresa${n > 1 ? 's' : ''}`;
  }

  billingLabel(period: string): string {
    return period === 'monthly' ? '/mes' : period === 'yearly' ? '/año' : ' único';
  }
}
