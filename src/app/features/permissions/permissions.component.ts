import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
    CardModule,
    ButtonModule,
    GridModule,
    BadgeModule,
    SpinnerModule,
    TableModule,
    FormModule,
    ModalModule,
    TooltipModule,
    AlertModule,
    NavModule,
    TabsModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';

import { ModulesService } from '../../core/services/modules.service';
import { ActionsService } from '../../core/services/actions.service';
import { PermissionsCatalogService } from '../../core/services/permissions-catalog.service';
import {
    Permission,
    PermissionInput,
    PermissionGroup,
    Module,
    ModuleInput,
    Action,
    ActionInput
} from '../../core/interfaces/permission.interface';
import { MODULES_SEED, ACTIONS_SEED }  from '../../core/seed/modules-seed';
import { NotificationService }         from '../../core/services/notification.service';

type ActiveTab = 'permissions' | 'modules' | 'actions';

@Component({
    selector: 'app-permissions',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        CardModule,
        ButtonModule,
        GridModule,
        BadgeModule,
        SpinnerModule,
        TableModule,
        FormModule,
        ModalModule,
        TooltipModule,
        AlertModule,
        NavModule,
        TabsModule,
        IconModule
    ],
    templateUrl: './permissions.component.html',
    styleUrl: './permissions.component.scss'
})
export class PermissionsComponent implements OnInit {
    private modulesService      = inject(ModulesService);
    private actionsService      = inject(ActionsService);
    private permCatalogService  = inject(PermissionsCatalogService);
    private fb                  = inject(FormBuilder);
    private notifications       = inject(NotificationService);

    activeTab = signal<ActiveTab>('permissions');

    permissions = signal<Permission[]>([]);
    modules     = signal<Module[]>([]);
    actions     = signal<Action[]>([]);

    isLoading = signal(false);
    seeding   = signal(false);
    seedLog   = signal<string[]>([]);

    showPermissionModal = signal(false);
    showModuleModal     = signal(false);
    showActionModal     = signal(false);

    editingPermission = signal<Permission | null>(null);
    editingModule     = signal<Module | null>(null);
    editingAction     = signal<Action | null>(null);

    permissionForm!: FormGroup;
    moduleForm!: FormGroup;
    actionForm!: FormGroup;

    // Group permissions by module for the permissions tab
    groupedPermissions = computed((): PermissionGroup[] => {
        const perms = this.permissions();
        const mods  = this.modules();

        const byModule = new Map<string, Permission[]>();
        perms.forEach(p => {
            const list = byModule.get(p.module_id) ?? [];
            list.push(p);
            byModule.set(p.module_id, list);
        });

        return mods
            .filter(m => byModule.has(m.id))
            .map(m => ({
                module:      m,
                moduleName:  m.name,
                moduleIcon:  m.icon,
                permissions: (byModule.get(m.id) ?? []).sort((a, b) => a.code.localeCompare(b.code))
            }))
            .sort((a, b) => a.module.order - b.module.order);
    });

    // Available module codes for dependencies multi-select
    moduleCodes = computed(() => this.modules().filter(m => !m.isTitle));

    ngOnInit(): void {
        this.initForms();
        this.loadAllData();
    }

    initForms(): void {
        this.permissionForm = this.fb.group({
            module_id:   ['', Validators.required],
            action_id:   ['', Validators.required],
            name:        ['', Validators.required],
            description: [''],
            isSystem:    [false]
        });

        this.moduleForm = this.fb.group({
            code:         ['', [Validators.required, Validators.pattern(/^[a-z_]+$/)]],
            name:         ['', Validators.required],
            description:  [''],
            dependencies: [[]],
            url:          [''],
            icon:         ['cil-puzzle'],
            isTitle:      [false],
            parent_id:    [null],
            badgeText:    [''],
            badgeColor:   [''],
            showInMenu:   [true],
            order:        [99, [Validators.required, Validators.min(1)]],
            state:        [true]
        });

        this.actionForm = this.fb.group({
            code:        ['', [Validators.required, Validators.pattern(/^[a-z_]+$/)]],
            name:        ['', Validators.required],
            description: [''],
            state:       [true]
        });
    }

    loadAllData(): void {
        this.isLoading.set(true);
        forkJoin({
            modules:     this.modulesService.getModulesFlat(false).pipe(take(1)),
            actions:     this.actionsService.getActions(false).pipe(take(1)),
            permissions: this.permCatalogService.getPermissionsCatalog().pipe(take(1))
        }).subscribe({
            next: ({ modules, actions, permissions }) => {
                this.modules.set(modules);
                this.actions.set(actions);
                this.permissions.set(permissions);
                this.isLoading.set(false);
            },
            error: err => {
                console.error('[PermissionsComponent] Error loading data:', err);
                this.isLoading.set(false);
            }
        });
    }

    setActiveTab(tab: ActiveTab): void {
        this.activeTab.set(tab);
    }

    // ============================================================================
    // PERMISSIONS CRUD
    // ============================================================================

    openPermissionModal(permission?: Permission): void {
        if (permission) {
            this.editingPermission.set(permission);
            this.permissionForm.patchValue({
                module_id:   permission.module_id,
                action_id:   permission.action_id,
                name:        permission.name,
                description: permission.description,
                isSystem:    permission.isSystem
            });
            this.permissionForm.get('module_id')?.disable();
            this.permissionForm.get('action_id')?.disable();
        } else {
            this.editingPermission.set(null);
            this.permissionForm.reset({ isSystem: false });
            this.permissionForm.get('module_id')?.enable();
            this.permissionForm.get('action_id')?.enable();
        }
        this.showPermissionModal.set(true);
    }

    closePermissionModal(): void {
        this.showPermissionModal.set(false);
        this.editingPermission.set(null);
    }

    async savePermission(): Promise<void> {
        if (this.permissionForm.invalid) return;
        const v = this.permissionForm.getRawValue();
        const data: PermissionInput = {
            module_id:   v.module_id,
            action_id:   v.action_id,
            name:        v.name,
            description: v.description,
            isSystem:    v.isSystem
        };
        const editing = this.editingPermission();
        try {
            if (editing) {
                await this.permCatalogService.updatePermission(editing.id!, { name: data.name, description: data.description });
            } else {
                await this.permCatalogService.createPermission(data);
            }
            this.loadAllData();
            this.closePermissionModal();
        } catch (err) {
            console.error('[PermissionsComponent] Error saving permission:', err);
        }
    }

    async deletePermission(permission: Permission): Promise<void> {
        if (permission.isSystem) {
            alert('No se pueden eliminar permisos del sistema.');
            return;
        }
        const ok = await this.notifications.confirm({
            title: `¿Eliminar el permiso "${permission.name}"?`,
            confirmText: 'Sí, eliminar',
            cancelText: 'Cancelar',
            icon: 'warning',
            danger: true
        });
        if (!ok) return;
        try {
            await this.permCatalogService.deletePermission(permission.id!);
            this.loadAllData();
        } catch (err) {
            console.error('[PermissionsComponent] Error deleting permission:', err);
        }
    }

    // ============================================================================
    // MODULES CRUD
    // ============================================================================

    openModuleModal(module?: Module): void {
        if (module) {
            this.editingModule.set(module);
            this.moduleForm.patchValue({
                code:         module.code,
                name:         module.name,
                description:  module.description ?? '',
                dependencies: module.dependencies ?? [],
                url:          module.url ?? '',
                icon:         module.icon,
                isTitle:      module.isTitle,
                parent_id:    module.parent_id ?? null,
                badgeText:    module.badgeText ?? '',
                badgeColor:   module.badgeColor ?? '',
                showInMenu:   module.showInMenu,
                order:        module.order,
                state:        module.state
            });
            this.moduleForm.get('code')?.disable();
        } else {
            this.editingModule.set(null);
            this.moduleForm.reset({
                icon:         'cil-puzzle',
                order:        99,
                state:        true,
                isTitle:      false,
                showInMenu:   true,
                parent_id:    null,
                dependencies: []
            });
            this.moduleForm.get('code')?.enable();
        }
        this.showModuleModal.set(true);
    }

    closeModuleModal(): void {
        this.showModuleModal.set(false);
        this.editingModule.set(null);
    }

    async saveModule(): Promise<void> {
        if (this.moduleForm.invalid) return;
        const v = this.moduleForm.getRawValue();
        const data: ModuleInput = {
            code:         v.code,
            name:         v.name,
            description:  v.description,
            dependencies: v.dependencies ?? [],
            url:          v.url || null,
            icon:         v.icon,
            isTitle:      v.isTitle,
            parent_id:    v.parent_id || null,
            badgeText:    v.badgeText || null,
            badgeColor:   v.badgeColor || null,
            showInMenu:   v.showInMenu,
            order:        v.order,
            state:        v.state
        };
        const editing = this.editingModule();
        try {
            if (editing) {
                await this.modulesService.updateModule(editing.id, data);
            } else {
                await this.modulesService.createModule(data);
            }
            this.loadAllData();
            this.closeModuleModal();
        } catch (err) {
            console.error('[PermissionsComponent] Error saving module:', err);
        }
    }

    async deleteModule(module: Module): Promise<void> {
        const ok = await this.notifications.confirm({
            title: `¿Eliminar el módulo "${module.name}"?`,
            text: 'Fallará si tiene permisos asociados.',
            confirmText: 'Sí, eliminar',
            cancelText: 'Cancelar',
            icon: 'warning',
            danger: true
        });
        if (!ok) return;
        try {
            await this.modulesService.deleteModule(module.id);
            this.loadAllData();
        } catch (err) {
            console.error('[PermissionsComponent] Error deleting module:', err);
            alert('No se puede eliminar el módulo. Puede que tenga permisos asociados.');
        }
    }

    // ============================================================================
    // ACTIONS CRUD
    // ============================================================================

    openActionModal(action?: Action): void {
        if (action) {
            this.editingAction.set(action);
            this.actionForm.patchValue({
                code:        action.code,
                name:        action.name,
                description: action.description,
                state:       action.state
            });
            this.actionForm.get('code')?.disable();
        } else {
            this.editingAction.set(null);
            this.actionForm.reset({ state: true });
            this.actionForm.get('code')?.enable();
        }
        this.showActionModal.set(true);
    }

    closeActionModal(): void {
        this.showActionModal.set(false);
        this.editingAction.set(null);
    }

    async saveAction(): Promise<void> {
        if (this.actionForm.invalid) return;
        const v = this.actionForm.getRawValue();
        const data: ActionInput = { code: v.code, name: v.name, description: v.description, state: v.state };
        const editing = this.editingAction();
        try {
            if (editing) {
                await this.actionsService.updateAction(editing.id, data);
            } else {
                await this.actionsService.createAction(data);
            }
            this.loadAllData();
            this.closeActionModal();
        } catch (err) {
            console.error('[PermissionsComponent] Error saving action:', err);
        }
    }

    async deleteAction(action: Action): Promise<void> {
        const ok = await this.notifications.confirm({
            title: `¿Eliminar la acción "${action.name}"?`,
            confirmText: 'Sí, eliminar',
            cancelText: 'Cancelar',
            icon: 'warning',
            danger: true
        });
        if (!ok) return;
        try {
            await this.actionsService.deleteAction(action.id);
            this.loadAllData();
        } catch (err) {
            console.error('[PermissionsComponent] Error deleting action:', err);
            alert('No se puede eliminar la acción. Puede que tenga permisos asociados.');
        }
    }

    // ============================================================================
    // SEED — Registrar módulos y acciones por defecto
    // ============================================================================

    /**
     * Sincroniza el catálogo de módulos con MODULES_SEED:
     *  - Si existe por code → actualiza todos los campos.
     *  - Caso especial 'customers' → 'personas': renombra el documento existente.
     *  - Si no existe → crea.
     */
    async syncModules(): Promise<void> {
        const ok = await this.notifications.confirm({
            title: '¿Actualizar todos los módulos del catálogo con los datos del seed?',
            confirmText: 'Sí, sincronizar',
            cancelText: 'Cancelar',
            icon: 'question'
        });
        if (!ok) return;

        this.seeding.set(true);
        this.seedLog.set([]);
        const log = (msg: string) => this.seedLog.update(l => [...l, msg]);

        try {
            const existing = this.modules();
            const byCode = new Map(existing.map(m => [m.code, m]));

            for (const seed of MODULES_SEED) {
                const data: ModuleInput = {
                    code:         seed.code,
                    name:         seed.name,
                    description:  seed.description,
                    dependencies: seed.dependencies,
                    ...(seed.url       != null ? { url:       seed.url }       : {}),
                    ...(seed.parent_id != null ? { parent_id: seed.parent_id } : {}),
                    icon:         seed.icon,
                    isTitle:      seed.isTitle,
                    showInMenu:   seed.showInMenu,
                    order:        seed.order,
                    state:        seed.state
                };

                if (byCode.has(seed.code)) {
                    // Exact match — update
                    const mod = byCode.get(seed.code)!;
                    await this.modulesService.updateModule(mod.id, data);
                    log(`↻ Actualizado: ${seed.name} (${seed.code})`);
                } else if (seed.code === 'personas' && byCode.has('customers')) {
                    // Rename: customers → personas
                    const old = byCode.get('customers')!;
                    await this.modulesService.updateModule(old.id, data);
                    log(`↻ Renombrado: customers → personas (${old.id})`);
                } else {
                    // New module
                    await this.modulesService.createModule(data);
                    log(`✓ Creado: ${seed.name} (${seed.code})`);
                }
            }

            log('\n✅ Sincronización completada.');
            this.loadAllData();
        } catch (err: any) {
            log(`❌ Error: ${err?.message ?? err}`);
            console.error('[SyncModules] Error:', err);
        } finally {
            this.seeding.set(false);
        }
    }

    /**
     * Registra el catálogo inicial de módulos y acciones en Firestore.
     * Omite los que ya existen (compara por code).
     * Sigue la estructura definida en modules-seed.ts (derivada de fs_pages del sistema PHP).
     */
    async seedDefaults(): Promise<void> {
        const existingModules = this.modules();
        const existingActions = this.actions();

        const existingModuleCodes = new Set(existingModules.map(m => m.code));
        const existingActionCodes = new Set(existingActions.map(a => a.code));

        const modulesToInsert = MODULES_SEED.filter(m => !existingModuleCodes.has(m.code));
        const actionsToInsert = ACTIONS_SEED.filter(a => !existingActionCodes.has(a.code));

        if (modulesToInsert.length === 0 && actionsToInsert.length === 0) {
            alert('El catálogo ya está completo. No hay datos nuevos que registrar.');
            return;
        }

        const msg = [
            modulesToInsert.length ? `${modulesToInsert.length} módulos nuevos` : '',
            actionsToInsert.length ? `${actionsToInsert.length} acciones nuevas` : ''
        ].filter(Boolean).join(' y ');

        const seedOk = await this.notifications.confirm({
            title: `¿Registrar ${msg}?`,
            text: 'Los registros existentes no se modificarán.',
            confirmText: 'Sí, registrar',
            cancelText: 'Cancelar',
            icon: 'question'
        });
        if (!seedOk) return;

        this.seeding.set(true);
        this.seedLog.set([]);

        const log = (msg: string) => this.seedLog.update(l => [...l, msg]);

        try {
            // ── Acciones ───────────────────────────────────────────────
            for (const action of actionsToInsert) {
                await this.actionsService.createAction({
                    code:        action.code,
                    name:        action.name,
                    description: action.description,
                    state:       action.state
                });
                log(`✓ Acción: ${action.name} (${action.code})`);
            }

            // ── Módulos ────────────────────────────────────────────────
            for (const mod of modulesToInsert) {
                await this.modulesService.createModule({
                    code:         mod.code,
                    name:         mod.name,
                    description:  mod.description,
                    dependencies: mod.dependencies,
                    ...(mod.url       != null ? { url:       mod.url }       : {}),
                    ...(mod.parent_id != null ? { parent_id: mod.parent_id } : {}),
                    icon:         mod.icon,
                    isTitle:      mod.isTitle,
                    showInMenu:   mod.showInMenu,
                    order:        mod.order,
                    state:        mod.state
                });
                log(`✓ Módulo: ${mod.name} (${mod.code})`);
            }

            log(`\n✅ Seed completado: ${actionsToInsert.length} acciones, ${modulesToInsert.length} módulos.`);
            this.loadAllData();

        } catch (err: any) {
            log(`❌ Error: ${err?.message ?? err}`);
            console.error('[Seed] Error:', err);
        } finally {
            this.seeding.set(false);
        }
    }

    // ============================================================================
    // HELPERS
    // ============================================================================

    getModuleName(moduleId: string): string {
        return this.modules().find(m => m.id === moduleId)?.name ?? 'Desconocido';
    }

    getActionName(actionId: string): string {
        return this.actions().find(a => a.id === actionId)?.name ?? 'Desconocido';
    }

    isDependencySelected(code: string): boolean {
        return (this.moduleForm.get('dependencies')?.value ?? []).includes(code);
    }

    toggleDependency(code: string): void {
        const ctrl = this.moduleForm.get('dependencies')!;
        const current: string[] = ctrl.value ?? [];
        ctrl.setValue(
            current.includes(code)
                ? current.filter(c => c !== code)
                : [...current, code]
        );
    }
}
