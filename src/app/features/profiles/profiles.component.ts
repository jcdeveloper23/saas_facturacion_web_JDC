import {
  Component,
  OnInit,
  inject,
  signal,
  computed
} from '@angular/core';
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
  AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PermissionsService } from '../../core/services/permissions.service';
import { RolesService } from '../../core/services/roles.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  Role,
  Permission,
  PermissionGroup,
  PermissionString,
  MODULE_METADATA
} from '../../core/interfaces/permission.interface';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

// Helper to get module code from permission
function getModuleCode(p: Permission): string {
  // If module relation is loaded, use it
  if (p.module && typeof p.module === 'object') {
    return p.module.code;
  }
  // Fallback: extract from permission code (e.g., "users.view" -> "users")
  return p.code.split('.')[0];
}

@Component({
  selector: 'app-profiles',
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
    IconModule,
    HasPermissionDirective
  ],
  templateUrl: './profiles.component.html',
  styleUrl: './profiles.component.scss'
})
export class ProfilesComponent implements OnInit {
  private permissionsService = inject(PermissionsService);
  private rolesSvc = inject(RolesService);
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private fb = inject(FormBuilder);

  // State
  roles = signal<Role[]>([]);
  allPermissions = signal<Permission[]>([]);
  isLoading = signal(false);
  isSeeding = signal(false);
  showModal = signal(false);
  showViewModal = signal(false);
  editingRole = signal<Role | null>(null);
  viewingRole = signal<Role | null>(null);
  selectedPermissions = signal<PermissionString[]>([]);

  // Auth helpers
  isSuperAdmin = computed(() => this.authService.isSuperAdmin());
  canManageRoles = computed(() => this.authService.isAdmin() || this.authService.isSuperAdmin());

  // Form
  roleForm!: FormGroup;

  // Computed
  permissionGroups = computed(() => {
    // Group dynamically loaded permissions
    const permissions = this.allPermissions();
    if (permissions.length === 0) {
      return this.permissionsService.getPermissionsGrouped(); // Fallback
    }

    const grouped = new Map<string, Permission[]>();
    permissions.forEach(p => {
      const moduleCode = getModuleCode(p);
      const current = grouped.get(moduleCode) || [];
      current.push(p);
      grouped.set(moduleCode, current);
    });

    const meta = MODULE_METADATA;

    return Array.from(grouped.entries())
      .map(([moduleCode, perms]) => ({
        module: moduleCode,
        moduleName: meta[moduleCode]?.name || moduleCode,
        moduleIcon: meta[moduleCode]?.icon || 'cil-settings',
        permissions: perms
      })).sort((a, b) => {
        const orderA = meta[a.module as string]?.order || 99;
        const orderB = meta[b.module as string]?.order || 99;
        return orderA - orderB;
      });
  });

  ngOnInit(): void {
    this.initForm();
    this.loadRoles();
    this.loadPermissions();
  }

  initForm(): void {
    this.roleForm = this.fb.group({
      name: ['', Validators.required],
      code: ['', [Validators.required, Validators.pattern(/^[a-z_]+$/)]],
      description: [''],
      level: [25, [Validators.required, Validators.min(1), Validators.max(100)]],
      color: ['#007bff'],
      icon: ['cilUser']
    });
  }

  seedDefaultRoles(): void {
    if (!this.isSuperAdmin()) return;
    this.isSeeding.set(true);
    this.rolesSvc.seedDefaultRoles()
      .then(({ created, skipped }) => {
        if (created > 0) {
          this.notification.success(`${created} rol(es) creado(s) correctamente.${skipped > 0 ? ` ${skipped} ya existían.` : ''}`);
          this.loadRoles();
        } else {
          this.notification.info('Todos los roles del sistema ya estaban configurados.');
        }
      })
      .catch(err => {
        console.error('Error seeding roles:', err);
        this.notification.error('Error al sembrar los roles. Verifica los permisos de Firestore.');
      })
      .finally(() => this.isSeeding.set(false));
  }

  loadPermissions(): void {
    this.permissionsService.getPermissionsCatalog().subscribe({
      next: (perms) => {
        this.allPermissions.set(perms);
      },
      error: (err) => console.error('Error loading permissions catalog', err)
    });
  }

  loadRoles(): void {
    this.isLoading.set(true);

    this.permissionsService.getRoles().subscribe({
      next: (allRoles) => {
        // Map backend permissions (objects) to strings if needed for frontend logic
        const processedRoles = allRoles.map(role => ({
          ...role,
          permissions: role.permissions.map((p: any) => typeof p === 'string' ? p : p.code)
        }));

        this.roles.set(processedRoles.sort((a, b) => a.level - b.level));
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading roles', err);
        this.isLoading.set(false);
      }
    });
  }

  openCreateModal(): void {
    this.editingRole.set(null);
    this.selectedPermissions.set([]);
    this.roleForm.reset({
      level: 25,
      color: '#007bff',
      icon: 'cilUser'
    });
    this.roleForm.get('code')?.enable();
    this.showModal.set(true);
  }

  editRole(role: Role): void {
    this.editingRole.set(role);
    this.selectedPermissions.set([...role.permissions]);
    this.roleForm.patchValue({
      name: role.name,
      code: role.code,
      description: role.description,
      level: role.level,
      color: role.color || '#007bff',
      icon: role.icon || 'cilUser'
    });
    this.roleForm.get('code')?.disable();
    this.showModal.set(true);
  }

  viewPermissions(role: Role): void {
    this.viewingRole.set(role);
    this.showViewModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingRole.set(null);
  }

  saveRole(): void {
    if (!this.roleForm.valid || this.selectedPermissions().length === 0) return;

    // Map selection codes back to IDs
    const currentPermissions = this.allPermissions();
    const selectedCodes = this.selectedPermissions();

    // Find IDs for selected codes
    const permissionIds = currentPermissions
      .filter(p => selectedCodes.includes(p.code))
      .map(p => p.id!) // Ensure ID exists
      .filter(id => !!id);

    const formValue = this.roleForm.getRawValue();
    const roleData: any = { // Using any mostly to bypass strict typing on 'permissions' field which might expect strings but we send IDs
      code: formValue.code,
      name: formValue.name,
      description: formValue.description,
      type: 'custom',
      permissions: permissionIds, // SENDING IDs NOW
      organizationId: this.authService.user()?.companyId,
      level: formValue.level,
      color: formValue.color,
      icon: formValue.icon,
      state: true
    };

    if (this.editingRole()) {
      this.permissionsService.updateRole(this.editingRole()!.id!, roleData).subscribe({
        next: () => {
          this.loadRoles();
          this.closeModal();
        },
        error: (err) => console.error('Error updating role:', err)
      });
    } else {
      this.permissionsService.createRole(roleData).subscribe({
        next: () => {
          this.loadRoles();
          this.closeModal();
        },
        error: (err) => console.error('Error creating role:', err)
      });
    }
  }

  confirmDelete(role: Role): void {
    if (confirm(`¿Estás seguro de eliminar el rol "${role.name}"?`)) {
      this.permissionsService.deleteRole(role.id!).subscribe({
        next: () => this.loadRoles(),
        error: (err) => console.error('Error deleting role:', err)
      });
    }
  }

  isPermissionSelected(code: PermissionString): boolean {
    return this.selectedPermissions().includes(code);
  }

  togglePermission(code: PermissionString): void {
    const current = this.selectedPermissions();
    if (current.includes(code)) {
      this.selectedPermissions.set(current.filter(p => p !== code));
    } else {
      this.selectedPermissions.set([...current, code]);
    }
  }

  isModuleFullySelected(module: string): boolean {
    // Filter from ALL available permissions
    const modulePerms = this.allPermissions()
      .filter(p => getModuleCode(p) === module);

    if (modulePerms.length === 0) return false;

    return modulePerms.every(p => this.selectedPermissions().includes(p.code));
  }

  isModulePartiallySelected(module: string): boolean {
    const modulePerms = this.allPermissions()
      .filter(p => getModuleCode(p) === module);

    if (modulePerms.length === 0) return false;

    const selectedCount = modulePerms.filter(p => this.selectedPermissions().includes(p.code)).length;
    return selectedCount > 0 && selectedCount < modulePerms.length;
  }

  toggleModule(module: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;

    const modulePerms = this.allPermissions()
      .filter(p => getModuleCode(p) === module);
    const permCodes = modulePerms.map(p => p.code);

    if (checked) {
      const current = new Set(this.selectedPermissions());
      permCodes.forEach(code => current.add(code as PermissionString));
      this.selectedPermissions.set(Array.from(current));
    } else {
      this.selectedPermissions.set(
        this.selectedPermissions().filter(p => !permCodes.includes(p))
      );
    }
  }

  // Helper to get module code as string from PermissionGroup
  getModuleCodeFromGroup(module: string | any): string {
    if (typeof module === 'string') return module;
    return module?.code || '';
  }

  getPermissionsGroupedForRole(role: Role): { module: string; moduleName: string; moduleIcon: string; permissions: Permission[] }[] {
    // This is for viewing permissions in read-only modal
    // We can use the generic service grouper or our dynamic one

    // Simple grouping logic
    const rolePerms = new Set(role.permissions);

    // Group all catalog permissions that are in the role
    const grouped = new Map<string, Permission[]>();

    // Use allPermissions if loaded, otherwise fallback to catalog
    const catalog = this.allPermissions().length > 0 ? this.allPermissions() : this.permissionsService.getAllPermissions();

    catalog.forEach(p => {
      if (rolePerms.has(p.code)) {
        const moduleCode = getModuleCode(p);
        const current = grouped.get(moduleCode) || [];
        current.push(p);
        grouped.set(moduleCode, current);
      }
    });

    return Array.from(grouped.entries())
      .map(([moduleCode, perms]) => ({
        module: moduleCode,
        moduleName: MODULE_METADATA[moduleCode]?.name || moduleCode,
        moduleIcon: MODULE_METADATA[moduleCode]?.icon || 'cil-folder',
        permissions: perms
      }));
  }
}
