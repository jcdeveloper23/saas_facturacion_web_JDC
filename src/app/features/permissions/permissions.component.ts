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

import { PermissionsService } from '../../core/services/permissions.service';
import { ModulesService } from '../../core/services/modules.service';
import { ActionsService } from '../../core/services/actions.service';
import {
    Permission,
    PermissionInput,
    PermissionGroup,
    Module,
    ModuleInput,
    Action,
    ActionInput
} from '../../core/interfaces/permission.interface';
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
    private permissionsService = inject(PermissionsService);
    private modulesService = inject(ModulesService);
    private actionsService = inject(ActionsService);
    private fb = inject(FormBuilder);

    // Active tab
    activeTab = signal<ActiveTab>('permissions');

    // Data
    permissions = signal<Permission[]>([]);
    modules = signal<Module[]>([]);
    actions = signal<Action[]>([]);

    // Loading states
    isLoading = signal(false);
    isLoadingModules = signal(false);
    isLoadingActions = signal(false);

    // Modal states
    showPermissionModal = signal(false);
    showModuleModal = signal(false);
    showActionModal = signal(false);

    // Editing items
    editingPermission = signal<Permission | null>(null);
    editingModule = signal<Module | null>(null);
    editingAction = signal<Action | null>(null);

    // Forms
    permissionForm!: FormGroup;
    moduleForm!: FormGroup;
    actionForm!: FormGroup;

    // Computed: Group permissions by module
    groupedPermissions = computed(() => {
        const perms = this.permissions();
        const mods = this.modules();

        const grouped = new Map<number, Permission[]>();

        perms.forEach(p => {
            const moduleId = p.module_id;
            const current = grouped.get(moduleId) || [];
            current.push(p);
            grouped.set(moduleId, current);
        });

        const result: PermissionGroup[] = [];

        mods.forEach(mod => {
            const modulePerms = grouped.get(mod.id) || [];
            if (modulePerms.length > 0) {
                result.push({
                    module: mod,
                    moduleName: mod.name,
                    moduleIcon: mod.icon,
                    permissions: modulePerms.sort((a, b) => a.code.localeCompare(b.code))
                });
            }
        });

        return result.sort((a, b) => {
            const modA = a.module as Module;
            const modB = b.module as Module;
            return modA.order - modB.order;
        });
    });

    ngOnInit(): void {
        this.initForms();
        this.loadAllData();
    }

    initForms(): void {
        // Permission form
        this.permissionForm = this.fb.group({
            module_id: ['', Validators.required],
            action_id: ['', Validators.required],
            name: ['', Validators.required],
            description: [''],
            isSystem: [false]
        });

        // Module form
        this.moduleForm = this.fb.group({
            code: ['', [Validators.required, Validators.pattern(/^[a-z_]+$/)]],
            name: ['', Validators.required],
            description: [''],
            url: [''],
            icon: ['cil-settings'],
            isTitle: [false],
            parent_id: [null],
            badgeText: [''],
            badgeColor: [''],
            showInMenu: [true],
            order: [99, [Validators.required, Validators.min(1)]],
            state: [true]
        });

        // Action form
        this.actionForm = this.fb.group({
            code: ['', [Validators.required, Validators.pattern(/^[a-z_]+$/)]],
            name: ['', Validators.required],
            description: [''],
            state: [true]
        });
    }

    loadAllData(): void {
        this.isLoading.set(true);

        forkJoin({
            modules: this.modulesService.getModulesFlat(false),
            actions: this.actionsService.getActions(false),
            permissions: this.permissionsService.getPermissionsCatalog()
        }).subscribe({
            next: ({ modules, actions, permissions }) => {
                console.log(`modules ${JSON.stringify(modules, null, 3)} `);
                
                this.modules.set(modules);
                this.actions.set(actions);
                this.permissions.set(permissions);
                this.isLoading.set(false);
            },
            error: (err) => {
                console.error('Error loading data', err);
                this.isLoading.set(false);
            }
        });
    }

    // ============================================================================
    // TAB NAVIGATION
    // ============================================================================

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
                module_id: permission.module_id,
                action_id: permission.action_id,
                name: permission.name,
                description: permission.description,
                isSystem: permission.isSystem
            });
            // Disable module/action if editing (can't change code)
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

    savePermission(): void {
        if (this.permissionForm.invalid) return;

        const formValue = this.permissionForm.getRawValue();
        const data: PermissionInput = {
            module_id: formValue.module_id,
            action_id: formValue.action_id,
            name: formValue.name,
            description: formValue.description,
            isSystem: formValue.isSystem
        };

        const editing = this.editingPermission();

        if (editing) {
            this.permissionsService.updatePermission(editing.id!, { name: data.name, description: data.description }).subscribe({
                next: () => {
                    this.loadAllData();
                    this.closePermissionModal();
                },
                error: (err) => console.error('Error updating permission:', err)
            });
        } else {
            this.permissionsService.createPermission(data).subscribe({
                next: () => {
                    this.loadAllData();
                    this.closePermissionModal();
                },
                error: (err) => console.error('Error creating permission:', err)
            });
        }
    }

    deletePermission(permission: Permission): void {
        if (permission.isSystem) {
            alert('No se pueden eliminar permisos del sistema.');
            return;
        }

        if (confirm(`¿Estás seguro de eliminar el permiso "${permission.name}"?`)) {
            this.permissionsService.deletePermission(permission.id!).subscribe({
                next: () => this.loadAllData(),
                error: (err) => console.error('Error deleting permission:', err)
            });
        }
    }

    // ============================================================================
    // MODULES CRUD
    // ============================================================================

    openModuleModal(module?: Module): void {
        if (module) {
            this.editingModule.set(module);
            this.moduleForm.patchValue({
                code: module.code,
                name: module.name,
                description: module.description,
                url: module.url || '',
                icon: module.icon,
                isTitle: module.isTitle,
                parent_id: module.parent_id || null,
                badgeText: module.badgeText || '',
                badgeColor: module.badgeColor || '',
                showInMenu: module.showInMenu,
                order: module.order,
                state: module.state
            });
            this.moduleForm.get('code')?.disable();
        } else {
            this.editingModule.set(null);
            this.moduleForm.reset({
                icon: 'cil-settings',
                order: 99,
                state: true,
                isTitle: false,
                showInMenu: true,
                parent_id: null
            });
            this.moduleForm.get('code')?.enable();
        }
        this.showModuleModal.set(true);
    }

    closeModuleModal(): void {
        this.showModuleModal.set(false);
        this.editingModule.set(null);
    }

    saveModule(): void {
        if (this.moduleForm.invalid) return;

        const formValue = this.moduleForm.getRawValue();
        const data: ModuleInput = {
            code: formValue.code,
            name: formValue.name,
            description: formValue.description,
            url: formValue.url || null,
            icon: formValue.icon,
            isTitle: formValue.isTitle,
            parent_id: formValue.parent_id || null,
            badgeText: formValue.badgeText || null,
            badgeColor: formValue.badgeColor || null,
            showInMenu: formValue.showInMenu,
            order: formValue.order,
            state: formValue.state
        };

        const editing = this.editingModule();

        if (editing) {
            this.modulesService.updateModule(editing.id, data).subscribe({
                next: () => {
                    this.loadAllData();
                    this.closeModuleModal();
                },
                error: (err) => console.error('Error updating module:', err)
            });
        } else {
            this.modulesService.createModule(data).subscribe({
                next: () => {
                    this.loadAllData();
                    this.closeModuleModal();
                },
                error: (err) => console.error('Error creating module:', err)
            });
        }
    }

    deleteModule(module: Module): void {
        if (confirm(`¿Estás seguro de eliminar el módulo "${module.name}"? Esto fallará si tiene permisos asociados.`)) {
            this.modulesService.deleteModule(module.id).subscribe({
                next: () => this.loadAllData(),
                error: (err) => {
                    console.error('Error deleting module:', err);
                    alert('No se puede eliminar el módulo. Puede que tenga permisos asociados.');
                }
            });
        }
    }

    // ============================================================================
    // ACTIONS CRUD
    // ============================================================================

    openActionModal(action?: Action): void {
        if (action) {
            this.editingAction.set(action);
            this.actionForm.patchValue({
                code: action.code,
                name: action.name,
                description: action.description,
                state: action.state
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

    saveAction(): void {
        if (this.actionForm.invalid) return;

        const formValue = this.actionForm.getRawValue();
        const data: ActionInput = {
            code: formValue.code,
            name: formValue.name,
            description: formValue.description,
            state: formValue.state
        };

        const editing = this.editingAction();

        if (editing) {
            this.actionsService.updateAction(editing.id, data).subscribe({
                next: () => {
                    this.loadAllData();
                    this.closeActionModal();
                },
                error: (err) => console.error('Error updating action:', err)
            });
        } else {
            this.actionsService.createAction(data).subscribe({
                next: () => {
                    this.loadAllData();
                    this.closeActionModal();
                },
                error: (err) => console.error('Error creating action:', err)
            });
        }
    }

    deleteAction(action: Action): void {
        if (confirm(`¿Estás seguro de eliminar la acción "${action.name}"? Esto fallará si tiene permisos asociados.`)) {
            this.actionsService.deleteAction(action.id).subscribe({
                next: () => this.loadAllData(),
                error: (err) => {
                    console.error('Error deleting action:', err);
                    alert('No se puede eliminar la acción. Puede que tenga permisos asociados.');
                }
            });
        }
    }

    // ============================================================================
    // HELPERS
    // ============================================================================

    getModuleName(moduleId: number): string {
        const mod = this.modules().find(m => m.id === moduleId);
        return mod?.name || 'Desconocido';
    }

    getActionName(actionId: number): string {
        const act = this.actions().find(a => a.id === actionId);
        return act?.name || 'Desconocido';
    }
}
