import {
  Component,
  OnInit,
  inject,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  CardModule,
  ButtonModule,
  GridModule,
  BadgeModule,
  SpinnerModule,
  FormModule,
  AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { combineLatest, take } from 'rxjs';
import { PermissionsService } from '../../../../core/services/permissions.service';
import { RolesService } from '../../../../core/services/roles.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ModulesService } from '../../../../core/services/modules.service';
import { ActionsService } from '../../../../core/services/actions.service';
import {
  Role,
  Permission,
  PermissionString,
  Module
} from '../../../../core/interfaces/permission.interface';

function getModuleCode(p: Permission): string {
  if (p.module && typeof p.module === 'object') return p.module.code;
  return p.code.split('.')[0];
}

function getActionCode(p: Permission): string {
  if (p.action && typeof p.action === 'object') return (p.action as any).code;
  return p.code.split('.')[1] || '';
}

interface MatrixAction { code: string; name: string; }
interface MatrixRow {
  module: string;
  moduleName: string;
  moduleIcon: string;
  moduleLevel: number;
  cells: Record<string, { permCode: string; exists: boolean }>;
}

@Component({
  selector: 'app-profile-form',
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
    FormModule,
    AlertModule,
    IconModule
  ],
  templateUrl: './profile-form.component.html',
  styleUrl: './profile-form.component.scss'
})
export class ProfileFormComponent implements OnInit {
  private fb                 = inject(FormBuilder);
  private permissionsService = inject(PermissionsService);
  private rolesSvc           = inject(RolesService);
  private authService        = inject(AuthService);
  private notification       = inject(NotificationService);
  private router             = inject(Router);
  private route              = inject(ActivatedRoute);
  private modulesSvc         = inject(ModulesService);
  private actionsSvc         = inject(ActionsService);

  // State
  isEditMode    = false;
  roleId: string | null = null;
  loadingData   = signal(true);
  saving        = signal(false);
  allPermissions = signal<Permission[]>([]);
  selectedPermissions = signal<PermissionString[]>([]);

  // Auth
  isSuperAdmin = computed(() => this.authService.isSuperAdmin());

  // Form
  profileForm!: FormGroup;

  readonly iconOptions = [
    { value: 'cilUser',          label: 'Usuario' },
    { value: 'cilPeople',        label: 'Personas' },
    { value: 'cilShieldAlt',     label: 'Escudo' },
    { value: 'cilBriefcase',     label: 'Maletín' },
    { value: 'cilTruck',         label: 'Camión' },
    { value: 'cilSettings',      label: 'Configuración' },
    { value: 'cilScreenDesktop', label: 'Monitor' },
    { value: 'cilCart',          label: 'Carrito' },
    { value: 'cilCash',          label: 'Caja' },
    { value: 'cilSpreadsheet',   label: 'Contador' },
    { value: 'cilLockLocked',    label: 'Candado' },
    { value: 'cilStar',          label: 'Estrella' },
  ];

  // ── Matrix computed ───────────────────────────────────────────────────────

  /** Unique action columns, ordered by frequency of appearance */
  matrixActions = computed<MatrixAction[]>(() => {
    const perms = this.allPermissions();
    const actionMap = new Map<string, string>(); // code -> name
    const order = ['view', 'create', 'edit', 'delete', 'export', 'approve'];

    perms.forEach(p => {
      const ac = getActionCode(p);
      if (ac && !actionMap.has(ac)) {
        const name = (p.action && typeof p.action === 'object')
          ? (p.action as any).name
          : this.actionLabel(ac);
        actionMap.set(ac, name);
      }
    });

    // Sort by predefined order, then alphabetically for unknowns
    return Array.from(actionMap.entries())
      .sort(([a], [b]) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
      .map(([code, name]) => ({ code, name }));
  });

  /** Matrix rows: one per functional module, ordered by flattenModules tree order */
  matrixRows = computed<MatrixRow[]>(() => {
    const perms = this.allPermissions(); // already ordered by getModulesFlat

    // Use Map to preserve insertion order (= flattenModules DFS order)
    const grouped = new Map<string, { mPerms: Permission[]; mod: Module | undefined }>();
    perms.forEach(p => {
      const mc = getModuleCode(p);
      if (!grouped.has(mc)) grouped.set(mc, { mPerms: [], mod: p.module as Module | undefined });
      grouped.get(mc)!.mPerms.push(p);
    });

    return Array.from(grouped.values()).map(({ mPerms, mod }) => {
      const cells: Record<string, { permCode: string; exists: boolean }> = {};
      mPerms.forEach(p => {
        const ac = getActionCode(p);
        if (ac) cells[ac] = { permCode: p.code, exists: true };
      });
      return {
        module:      mod?.code || getModuleCode(mPerms[0]),
        moduleName:  mod?.name || getModuleCode(mPerms[0]),
        moduleIcon:  mod?.icon || 'cilFolder',
        moduleLevel: mod?._level ?? 0,
        cells
      };
    });
  });

  // ── Selection helpers ─────────────────────────────────────────────────────

  selectedCount = computed(() => this.selectedPermissions().length);
  totalPermissions = computed(() => this.allPermissions().length);
  allSelected = computed(() =>
    this.totalPermissions() > 0 && this.selectedCount() === this.totalPermissions()
  );
  someSelected = computed(() =>
    this.selectedCount() > 0 && this.selectedCount() < this.totalPermissions()
  );
  progressPercent = computed(() =>
    this.totalPermissions() === 0 ? 0 : Math.round(this.selectedCount() / this.totalPermissions() * 100)
  );

  isCellSelected(permCode: string): boolean {
    return this.selectedPermissions().includes(permCode);
  }

  toggleCell(permCode: string): void {
    const cur = this.selectedPermissions();
    this.selectedPermissions.set(
      cur.includes(permCode) ? cur.filter(p => p !== permCode) : [...cur, permCode]
    );
  }

  isRowSelected(row: MatrixRow): 'all' | 'some' | 'none' {
    const existing = Object.values(row.cells).filter(c => c.exists).map(c => c.permCode);
    if (existing.length === 0) return 'none';
    const selCount = existing.filter(c => this.selectedPermissions().includes(c)).length;
    if (selCount === existing.length) return 'all';
    if (selCount > 0) return 'some';
    return 'none';
  }

  toggleRow(row: MatrixRow, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const codes = Object.values(row.cells).filter(c => c.exists).map(c => c.permCode);
    const cur = new Set(this.selectedPermissions());
    if (checked) { codes.forEach(c => cur.add(c as PermissionString)); }
    else         { codes.forEach(c => cur.delete(c as PermissionString)); }
    this.selectedPermissions.set(Array.from(cur));
  }

  isColumnSelected(actionCode: string): 'all' | 'some' | 'none' {
    const codes = this.matrixRows()
      .filter(r => r.cells[actionCode]?.exists)
      .map(r => r.cells[actionCode].permCode);
    if (codes.length === 0) return 'none';
    const sel = codes.filter(c => this.selectedPermissions().includes(c)).length;
    if (sel === codes.length) return 'all';
    if (sel > 0) return 'some';
    return 'none';
  }

  toggleColumn(actionCode: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const codes = this.matrixRows()
      .filter(r => r.cells[actionCode]?.exists)
      .map(r => r.cells[actionCode].permCode);
    const cur = new Set(this.selectedPermissions());
    if (checked) { codes.forEach(c => cur.add(c as PermissionString)); }
    else         { codes.forEach(c => cur.delete(c as PermissionString)); }
    this.selectedPermissions.set(Array.from(cur));
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selectedPermissions.set([]);
    } else {
      this.selectedPermissions.set(this.allPermissions().map(p => p.code));
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.initForm();
    this.loadPermissions();

    this.route.params.subscribe(params => {
      if (params['id']) {
        this.isEditMode = true;
        this.roleId = params['id'];
        this.loadRole(this.roleId!);
      } else {
        this.loadingData.set(false);
      }
    });
  }

  private initForm(): void {
    this.profileForm = this.fb.group({
      name:        ['', Validators.required],
      code:        ['', [Validators.required, Validators.pattern(/^[a-z_]+$/)]],
      description: [''],
      level:       [25, [Validators.required, Validators.min(1), Validators.max(100)]],
      color:       ['#0d6efd'],
      icon:        ['cilUser']
    });
  }

  private loadPermissions(): void {
    combineLatest([
      this.modulesSvc.getModulesFlat(false),   // all modules, pre-ordered with _level
      this.actionsSvc.getActions()
    ]).pipe(take(1)).subscribe({
      next: ([modules, actions]) => {
        // Exclude section title modules — they're UI separators, not functional modules
        const functionalModules = modules.filter(m => !m.isTitle);

        const perms: Permission[] = [];
        const actionOrder = ['view', 'create', 'edit', 'delete', 'export', 'print', 'approve'];
        const sortedActions = [...actions].sort((a, b) => {
          const ia = actionOrder.indexOf(a.code);
          const ib = actionOrder.indexOf(b.code);
          if (ia === -1 && ib === -1) return a.code.localeCompare(b.code);
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });
        for (const mod of functionalModules) {
          for (const act of sortedActions) {
            perms.push({
              id:        `${mod.code}.${act.code}`,
              module_id: mod.code,
              action_id: act.code,
              code:      `${mod.code}.${act.code}`,
              name:      `${act.name} ${mod.name}`,
              isSystem:  true,
              state:     true,
              module:    mod,
              action:    act,
            });
          }
        }
        this.allPermissions.set(perms);
      },
      error: err => {
        console.error('[ProfileForm] Error loading modules/actions', err);
        this.allPermissions.set(this.permissionsService.getAllPermissions());
      }
    });
  }

  private loadRole(id: string): void {
    const companyId = this.authService.user()?.companyId;
    const src$ = this.isSuperAdmin()
      ? this.permissionsService.getRoles()
      : companyId ? this.rolesSvc.getCompanyRoles(companyId) : null;

    if (!src$) { this.loadingData.set(false); return; }

    const sub = src$.subscribe({
      next: roles => {
        const role = roles.find(r => r.id === id);
        if (role) {
          this.profileForm.patchValue({
            name:        role.name,
            code:        role.code,
            description: role.description || '',
            level:       role.level,
            color:       role.color || '#0d6efd',
            icon:        role.icon || 'cilUser'
          });
          this.profileForm.get('code')?.disable();
          this.selectedPermissions.set(
            role.permissions.map((p: any) => typeof p === 'string' ? p : p.code)
          );
          this.loadingData.set(false);
          sub.unsubscribe();
        }
      },
      error: err => { console.error('Error loading role:', err); this.loadingData.set(false); }
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  onSubmit(): void {
    if (!this.profileForm.valid || this.selectedPermissions().length === 0) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const selectedCodes = this.selectedPermissions();

    const formValue = this.profileForm.getRawValue();
    const roleData: any = {
      code:        formValue.code,
      name:        formValue.name,
      description: formValue.description,
      type:        'custom',
      permissions: selectedCodes,
      level:       formValue.level,
      color:       formValue.color,
      icon:        formValue.icon,
      state:       true
    };

    this.saving.set(true);
    const companyId = this.authService.user()?.companyId;

    const op$ = this.isSuperAdmin()
      ? (this.isEditMode
          ? this.permissionsService.updateRole(this.roleId!, roleData)
          : this.permissionsService.createRole(roleData))
      : (companyId
          ? (this.isEditMode
              ? this.rolesSvc.updateCompanyRole(companyId, this.roleId!, roleData)
              : this.rolesSvc.createCompanyRole(companyId, roleData))
          : null);

    if (!op$) {
      this.notification.error('No se pudo determinar la empresa del usuario.');
      this.saving.set(false);
      return;
    }

    op$.subscribe({
      next: () => {
        this.notification.success(
          this.isEditMode ? 'Perfil actualizado correctamente.' : 'Perfil creado correctamente.'
        );
        this.goBack();
      },
      error: (err: any) => {
        console.error('Error saving profile:', err);
        this.notification.error('Error al guardar el perfil.');
        this.saving.set(false);
      }
    });
  }

  goBack(): void {
    const base = this.isSuperAdmin() ? '/super-admin/profiles' : '/profiles';
    this.router.navigate([base]);
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  getLevelLabel(level: number): string {
    if (level <= 1)  return 'Administrador';
    if (level <= 10) return 'Alta';
    if (level <= 30) return 'Media-Alta';
    if (level <= 50) return 'Media';
    if (level <= 70) return 'Media-Baja';
    return 'Baja';
  }

  actionLabel(code: string): string {
    const map: Record<string, string> = {
      view: 'Ver', create: 'Crear', edit: 'Editar',
      delete: 'Eliminar', export: 'Exportar', approve: 'Aprobar'
    };
    return map[code] || code;
  }

  isFieldInvalid(field: string): boolean {
    const ctrl = this.profileForm.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }
}
