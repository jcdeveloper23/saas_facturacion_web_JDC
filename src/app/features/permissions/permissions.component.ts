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

type ActiveTab = 'permissions' | 'modules' | 'actions' | 'menu_preview' | 'organizar';

interface OrganizerItem {
    module: Module;
    children: Module[];
}

interface OrganizerSection {
    title: Module | null;
    items: OrganizerItem[];
}

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

    // ── Drag & drop ──────────────────────────────────────────────────────────────
    draggedModule  = signal<Module | null>(null);
    dragOverModule = signal<Module | null>(null);
    dragOverPos    = signal<'before' | 'after' | 'inside'>('before');
    savingOrder    = signal(false);

    // ── Organizer DnD ─────────────────────────────────────────────────────────────
    dzActive          = signal<string | null>(null);
    orgExpanded       = signal<Set<string>>(new Set());
    collapsedSections = signal<Set<string>>(new Set());
    private _hoverExpandTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Menu preview ─────────────────────────────────────────────────────────────
    menuPreviewExpanded = signal<Set<string>>(new Set());

    menuPreviewTree = computed(() => {
        const mods = this.modules().filter(m => m.showInMenu !== false && m.state);
        const childrenMap = new Map<string, Module[]>();
        for (const m of mods) {
            if (m.parent_id) {
                const arr = childrenMap.get(m.parent_id) ?? [];
                arr.push(m);
                childrenMap.set(m.parent_id, arr);
            }
        }
        const getChildren = (mod: Module): Module[] =>
            [...(childrenMap.get(mod.id) ?? []), ...(childrenMap.get(mod.code) ?? [])]
                .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i)
                .sort((a, b) => a.order - b.order);

        return mods
            .filter(m => !m.parent_id)
            .sort((a, b) => a.order - b.order)
            .map(mod => ({ module: mod, children: getChildren(mod) }));
    });

    organizerSections = computed((): OrganizerSection[] => {
        const mods = this.modules();

        const childrenMap = new Map<string, Module[]>();
        for (const m of mods) {
            if (m.parent_id) {
                const arr = childrenMap.get(m.parent_id) ?? [];
                arr.push(m);
                childrenMap.set(m.parent_id, arr);
            }
        }

        const getChildren = (mod: Module): Module[] =>
            [...(childrenMap.get(mod.id) ?? []), ...(childrenMap.get(mod.code) ?? [])]
                .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i)
                .sort((a, b) => a.order - b.order);

        const roots = mods
            .filter(m => !m.parent_id)
            .sort((a, b) => a.order - b.order);

        const sections: OrganizerSection[] = [];
        let current: OrganizerSection = { title: null, items: [] };

        for (const mod of roots) {
            if (mod.isTitle) {
                sections.push(current);
                current = { title: mod, items: [] };
            } else {
                current.items.push({ module: mod, children: getChildren(mod) });
            }
        }
        sections.push(current);

        return sections.filter(s => s.title !== null || s.items.length > 0 || sections.length === 1);
    });

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

    /** Grupos colapsados (por code del módulo padre). Empieza todo colapsado. */
    collapsedGroups = signal<Set<string>>(new Set());

    /** Set de codes que tienen al menos un hijo directo. */
    parentCodes = computed<Set<string>>(() => {
        const s = new Set<string>();
        for (const m of this.modules()) {
            if (m._parentCode) s.add(m._parentCode);
        }
        return s;
    });

    /** Mapa code → número de hijos directos (para el badge de grupo colapsado). */
    childCountMap = computed<Map<string, number>>(() => {
        const map = new Map<string, number>();
        for (const m of this.modules()) {
            if (m._parentCode) {
                map.set(m._parentCode, (map.get(m._parentCode) ?? 0) + 1);
            }
        }
        return map;
    });

    /** Módulos visibles según el estado de colapso. */
    visibleModules = computed<Module[]>(() => {
        const collapsed = this.collapsedGroups();
        return this.modules().filter(m => !m._parentCode || !collapsed.has(m._parentCode));
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
                const parents = new Set(modules.filter(m => m._parentCode).map(m => m._parentCode!));
                this.collapsedGroups.set(parents);
                this.isLoading.set(false);
                console.log(JSON.stringify({
                    event: 'super-admin/catalog:read',
                    timestamp: new Date().toISOString(),
                    counts: { modules: modules.length, actions: actions.length, permissions: permissions.length },
                    modules: modules.map(m => ({ id: m.id, code: m.code, name: m.name, order: m.order, state: m.state, parent_id: m.parent_id ?? null })),
                    actions: actions.map(a => ({ id: a.id, code: a.code, name: a.name, state: a.state })),
                    permissions: permissions.map(p => ({ id: p.id, name: p.name, module_id: p.module_id, action_id: p.action_id }))
                }, null, 2));
            },
            error: err => {
                console.error('[PermissionsComponent] Error loading data:', err);
                this.isLoading.set(false);
            }
        });
    }

    /** Promise-based reload for use inside async methods. */
    private loadAllDataAsync(): Promise<void> {
        return new Promise((resolve, reject) => {
            forkJoin({
                modules:     this.modulesService.getModulesFlat(false).pipe(take(1)),
                actions:     this.actionsService.getActions(false).pipe(take(1)),
                permissions: this.permCatalogService.getPermissionsCatalog().pipe(take(1))
            }).subscribe({
                next: ({ modules, actions, permissions }) => {
                    this.modules.set(modules);
                    this.actions.set(actions);
                    this.permissions.set(permissions);
                    const parents = new Set(modules.filter(m => m._parentCode).map(m => m._parentCode!));
                    this.collapsedGroups.set(parents);
                    console.log(JSON.stringify({
                        event: 'super-admin/catalog:read',
                        timestamp: new Date().toISOString(),
                        counts: { modules: modules.length, actions: actions.length, permissions: permissions.length },
                        modules: modules.map(m => ({ id: m.id, code: m.code, name: m.name, order: m.order, state: m.state, parent_id: m.parent_id ?? null })),
                        actions: actions.map(a => ({ id: a.id, code: a.code, name: a.name, state: a.state })),
                        permissions: permissions.map(p => ({ id: p.id, name: p.name, module_id: p.module_id, action_id: p.action_id }))
                    }, null, 2));
                    resolve();
                },
                error: reject
            });
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

    toggleGroup(code: string): void {
        this.collapsedGroups.update(s => {
            const next = new Set(s);
            if (next.has(code)) next.delete(code); else next.add(code);
            return next;
        });
    }

    // ============================================================================
    // DRAG & DROP
    // ============================================================================

    onDragStart(mod: Module, event: DragEvent): void {
        this.draggedModule.set(mod);
        event.dataTransfer?.setData('text/plain', mod.id);
        event.dataTransfer!.effectAllowed = 'move';
    }

    onDragOver(target: Module, event: DragEvent): void {
        event.preventDefault();
        const dragged = this.draggedModule();
        if (!dragged || dragged.id === target.id) return;

        const tr = (event.target as Element).closest('tr');
        if (!tr) return;

        const { top, height } = tr.getBoundingClientRect();
        const relY = (event.clientY - top) / height;

        if (this.isDescendantOrSelf(target, dragged.code)) {
            // Never allow dropping into own subtree
            event.dataTransfer!.dropEffect = 'none';
            this.dragOverModule.set(null);
            return;
        }

        event.dataTransfer!.dropEffect = 'move';

        if (target.isTitle) {
            // Titles: only before/after
            this.dragOverPos.set(relY < 0.5 ? 'before' : 'after');
        } else {
            // Non-title: three zones — before / inside / after
            if (relY < 0.3)      this.dragOverPos.set('before');
            else if (relY > 0.7) this.dragOverPos.set('after');
            else                 this.dragOverPos.set('inside');
        }
        this.dragOverModule.set(target);
    }

    onDragLeave(event: DragEvent): void {
        const rel = event.relatedTarget as Element | null;
        if (!rel?.closest('tr[draggable]')) this.dragOverModule.set(null);
    }

    onDragEnd(): void {
        this.draggedModule.set(null);
        this.dragOverModule.set(null);
    }

    async onDrop(target: Module, event: DragEvent): Promise<void> {
        event.preventDefault();
        const dragged = this.draggedModule();
        const pos     = this.dragOverPos();
        this.draggedModule.set(null);
        this.dragOverModule.set(null);

        if (!dragged || dragged.id === target.id) return;
        // Titles can only be reordered (before/after), never nested inside
        if (target.isTitle && pos === 'inside') return;
        if (this.isDescendantOrSelf(target, dragged.code)) return;

        this.savingOrder.set(true);
        try {
            if (pos === 'inside') {
                // ── Nest dragged inside target ──────────────────────────────────
                // Compute new order: last child's order + 10
                const existingChildren = this.modules()
                    .filter(m => (m.parent_id ?? null) === (target.code ?? null))
                    .sort((a, b) => a.order - b.order);
                const newOrder = existingChildren.length > 0
                    ? existingChildren[existingChildren.length - 1].order + 10
                    : 10;

                await this.modulesService.updateModule(dragged.id, {
                    parent_id: target.code,
                    order:     newOrder
                });

                // Expand the target group so the child is visible
                this.collapsedGroups.update(s => {
                    const next = new Set(s);
                    next.delete(target.code);
                    return next;
                });

            } else {
                // ── Reorder: place dragged before/after target, adopting target's parent ──
                // This also handles "unparent": dragging a child next to a root module
                // sets parent_id = target.parent_id (null for root).
                const newParentId = target.parent_id ?? null;
                const parentChanged = (dragged.parent_id ?? null) !== newParentId;

                // All siblings at the target's level (include titles so order is preserved)
                const siblings = this.modules()
                    .filter(m => (m.parent_id ?? null) === newParentId)
                    .sort((a, b) => a.order - b.order);

                const withoutDragged = siblings.filter(m => m.id !== dragged.id);
                const targetIdx = withoutDragged.findIndex(m => m.id === target.id);

                if (targetIdx === -1) {
                    console.warn('[DnD] target not found in siblings — aborting', target.code);
                    return;
                }

                const insertAt = pos === 'before' ? targetIdx : targetIdx + 1;
                withoutDragged.splice(insertAt, 0, dragged);

                const updates = withoutDragged.map((m, i) => ({ id: m.id, order: (i + 1) * 10 }));

                // If parent changed, update parent_id on the dragged module first
                if (parentChanged) {
                    await this.modulesService.updateModule(dragged.id, {
                        parent_id: newParentId,
                        order: (insertAt + 1) * 10
                    });
                }

                await Promise.all(
                    updates
                        .filter(u => parentChanged ? u.id !== dragged.id : true)
                        .map(u => this.modulesService.updateModule(u.id, { order: u.order }))
                );
            }

            await this.loadAllDataAsync();
            this.notifications.success('Orden actualizado.');
        } catch (err) {
            console.error('[DnD] Error:', err);
            this.notifications.error('Error al guardar el orden.');
        } finally {
            this.savingOrder.set(false);
        }
    }

    // ── Organizer Drag & Drop ─────────────────────────────────────────────────────

    onOrgDragStart(mod: Module, event: DragEvent): void {
        this.draggedModule.set(mod);
        event.dataTransfer?.setData('text/plain', mod.id);
        event.dataTransfer!.effectAllowed = 'move';
    }

    onOrgDragEnd(): void {
        this.draggedModule.set(null);
        this.dzActive.set(null);
        if (this._hoverExpandTimer) { clearTimeout(this._hoverExpandTimer); this._hoverExpandTimer = null; }
    }

    onDzDragOver(dzId: string, event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const dragged = this.draggedModule();
        if (!dragged) return;

        if (dzId.startsWith('dz-inside-')) {
            const parentCode = dzId.replace('dz-inside-', '');
            const parentMod  = this.modules().find(m => m.code === parentCode);
            if (parentMod && this.isDescendantOrSelf(parentMod, dragged.code)) {
                event.dataTransfer!.dropEffect = 'none';
                return;
            }
            // Hover-to-expand: open collapsed group after 600ms of hovering
            if (!this.orgExpanded().has(parentCode)) {
                if (this.dzActive() !== dzId) {
                    // New zone — start timer
                    if (this._hoverExpandTimer) { clearTimeout(this._hoverExpandTimer); }
                    this._hoverExpandTimer = setTimeout(() => {
                        this.orgExpanded.update(s => { const n = new Set(s); n.add(parentCode); return n; });
                        this._hoverExpandTimer = null;
                    }, 600);
                }
            }
        } else {
            // Not hovering over an inside zone — clear any pending expand timer
            if (this._hoverExpandTimer) { clearTimeout(this._hoverExpandTimer); this._hoverExpandTimer = null; }
        }

        event.dataTransfer!.dropEffect = 'move';
        this.dzActive.set(dzId);
    }

    onDzDragLeave(dzId: string, event: DragEvent): void {
        const rel = event.relatedTarget as Element | null;
        if (!rel?.closest(`[data-dzid="${dzId}"]`)) {
            if (this.dzActive() === dzId) this.dzActive.set(null);
            // Cancel expand timer when leaving the inside zone
            if (dzId.startsWith('dz-inside-')) {
                if (this._hoverExpandTimer) { clearTimeout(this._hoverExpandTimer); this._hoverExpandTimer = null; }
            }
        }
    }

    async onDzDrop(dzId: string, event: DragEvent): Promise<void> {
        event.preventDefault();
        event.stopPropagation();
        const dragged = this.draggedModule();
        this.draggedModule.set(null);
        this.dzActive.set(null);
        if (!dragged) return;

        this.savingOrder.set(true);
        try {
            const allMods = this.modules();

            if (dzId.startsWith('dz-before-')) {
                const targetId = dzId.replace('dz-before-', '');
                const target   = allMods.find(m => m.id === targetId || m.code === targetId);
                if (!target) return;
                if (this.isDescendantOrSelf(target, dragged.code)) return;

                const newParentId   = target.parent_id ?? null;
                const parentChanged = (dragged.parent_id ?? null) !== newParentId;
                // Match siblings: same parent_id value (could be code or doc id)
                const siblings = allMods
                    .filter(m => (m.parent_id ?? null) === newParentId)
                    .sort((a, b) => a.order - b.order);
                // Guard: if target is not found among root siblings (happens when
                // modules use parent_id = docId but target.parent_id is a code),
                // try to find siblings using the parent module's code/id cross-match
                let withoutDragged = siblings.filter(m => m.id !== dragged.id);
                let targetIdx      = withoutDragged.findIndex(m => m.id === target.id);
                if (targetIdx === -1 && newParentId) {
                    // Fallback: find all modules whose parent_id matches either the
                    // code or the id of the parent module
                    const parentMod = allMods.find(m => m.code === newParentId || m.id === newParentId);
                    if (parentMod) {
                        const fallbackSiblings = allMods
                            .filter(m => (m.parent_id ?? null) === parentMod.code ||
                                         (m.parent_id ?? null) === parentMod.id)
                            .sort((a, b) => a.order - b.order);
                        withoutDragged = fallbackSiblings.filter(m => m.id !== dragged.id);
                        targetIdx      = withoutDragged.findIndex(m => m.id === target.id);
                    }
                }
                if (targetIdx === -1) return;

                withoutDragged.splice(targetIdx, 0, dragged);

                if (parentChanged) {
                    await this.modulesService.updateModule(dragged.id, {
                        parent_id: newParentId,
                        order: targetIdx * 10
                    });
                }
                await Promise.all(
                    withoutDragged
                        .filter(m => parentChanged ? m.id !== dragged.id : true)
                        .map((m, i) => this.modulesService.updateModule(m.id, { order: (i + 1) * 10 }))
                );

            } else if (dzId.startsWith('dz-section-end-')) {
                const titleKey = dzId.replace('dz-section-end-', '');
                const section  = this.organizerSections().find(s =>
                    titleKey === 'root' ? s.title === null : s.title?.code === titleKey
                );
                if (!section) return;
                // Base: use title's own order so the dropped module lands AFTER
                // the title separator. Falls back to 0 for the implicit root section.
                const titleOrder = section.title?.order ?? 0;
                const lastOrder  = section.items.length > 0
                    ? Math.max(...section.items.map(i => i.module.order))
                    : titleOrder;   // empty section → start right after its title
                await this.modulesService.updateModule(dragged.id, {
                    parent_id: null,
                    order: lastOrder + 10
                });

            } else if (dzId.startsWith('dz-inside-')) {
                const parentCode = dzId.replace('dz-inside-', '');
                const parent     = allMods.find(m => m.code === parentCode);
                if (!parent || parent.isTitle) return;
                if (this.isDescendantOrSelf(parent, dragged.code)) return;

                const existingChildren = allMods
                    .filter(m => (m.parent_id ?? null) === parentCode)
                    .sort((a, b) => a.order - b.order);
                const newOrder = existingChildren.length > 0
                    ? existingChildren[existingChildren.length - 1].order + 10
                    : 10;

                await this.modulesService.updateModule(dragged.id, {
                    parent_id: parentCode,
                    order: newOrder
                });

                this.orgExpanded.update(s => { const n = new Set(s); n.add(parentCode); return n; });
            }

            await this.loadAllDataAsync();
            this.notifications.success('Orden actualizado.');
        } catch (err) {
            console.error('[OrgDnD]', err);
            this.notifications.error('Error al guardar el orden.');
        } finally {
            this.savingOrder.set(false);
        }
    }

    toggleOrgExpanded(code: string): void {
        this.orgExpanded.update(s => {
            const n = new Set(s);
            if (n.has(code)) n.delete(code); else n.add(code);
            return n;
        });
    }

    toggleSection(key: string): void {
        this.collapsedSections.update(s => {
            const n = new Set(s);
            if (n.has(key)) n.delete(key); else n.add(key);
            return n;
        });
    }

    /** Returns true if `mod` is `ancestorCode` itself or a descendant of it. */
    private isDescendantOrSelf(mod: Module, ancestorCode: string): boolean {
        if (mod.code === ancestorCode) return true;
        const parentCode = mod.parent_id ?? null;
        if (!parentCode) return false;
        const parent = this.modules().find(m => m.code === parentCode || m.id === parentCode);
        if (!parent) return false;
        return this.isDescendantOrSelf(parent, ancestorCode);
    }

    // ============================================================================
    // HELPERS
    // ============================================================================

    toggleMenuPreviewGroup(code: string): void {
        this.menuPreviewExpanded.update(s => {
            const next = new Set(s);
            if (next.has(code)) next.delete(code); else next.add(code);
            return next;
        });
    }

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
