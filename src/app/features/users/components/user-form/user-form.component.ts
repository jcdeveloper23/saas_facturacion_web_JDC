import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import {
    ReactiveFormsModule,
    FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors
} from '@angular/forms';
import {
    CardModule, GridModule, ButtonModule, FormModule,
    UtilitiesModule, SpinnerModule, AlertModule, BadgeModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { Subscription } from 'rxjs';

import { UserManagementService } from '../../../../core/services/user-management.service';
import { CompanyUsersService }   from '../../../../core/services/company-users.service';
import { PermissionsService }    from '../../../../core/services/permissions.service';
import { AuthService }           from '../../../../core/services/auth.service';
import { NotificationService }   from '../../../../core/services/notification.service';
import { Role }                  from '../../../../core/interfaces/permission.interface';
import { CompanyUser }           from '../../../../core/interfaces/company-user.interface';
import { PersonasService, EmployeeDataInput } from '../../../personas/services/personas.service';
import { Person }                             from '../../../personas/models/person.interface';

export type PersonaMode = 'none' | 'existing' | 'new';

/** Valida que password y passwordConfirm coincidan. */
function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const pw  = group.get('password')?.value;
    const pwc = group.get('passwordConfirm')?.value;
    if (pw && pwc && pw !== pwc) return { passwordMismatch: true };
    return null;
}

@Component({
    selector: 'app-user-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        CardModule, GridModule, ButtonModule, FormModule,
        UtilitiesModule, IconModule, SpinnerModule, AlertModule, BadgeModule
    ],
    templateUrl: './user-form.component.html'
})
export class UserFormComponent implements OnInit, OnDestroy {
    private fb             = inject(FormBuilder);
    private userMgmtSvc    = inject(UserManagementService);
    private companyUsersSvc = inject(CompanyUsersService);
    private permissionsSvc  = inject(PermissionsService);
    private authService    = inject(AuthService);
    private notification   = inject(NotificationService);
    private personasSvc    = inject(PersonasService);
    private router         = inject(Router);
    private route          = inject(ActivatedRoute);

    userForm!: FormGroup;
    isEditMode  = false;
    userId: string | null = null;

    loading      = signal(false);
    loadingData  = signal(true);
    errorMessage = signal('');

    assignableRoles = signal<Role[]>([]);
    employees       = signal<Person[]>([]);
    personaMode     = signal<PersonaMode>('none');
    linkedEmployee  = signal<Person | null>(null);

    private userSub?:      Subscription;
    private employeesSub?: Subscription;

    ngOnInit(): void {
        this.initForm();
        this.loadRoles();
        this.loadEmployees();

        this.route.params.subscribe(params => {
            if (params['id']) {
                this.isEditMode = true;
                this.userId = params['id'];
                this.loadUser(this.userId!);
            } else {
                this.loadingData.set(false);
            }
        });
    }

    ngOnDestroy(): void {
        this.userSub?.unsubscribe();
        this.employeesSub?.unsubscribe();
    }

    private initForm(): void {
        this.userForm = this.fb.group({
            displayName:    ['', [Validators.required, Validators.maxLength(120)]],
            email:          ['', [Validators.required, Validators.email]],
            password:       ['', [Validators.required, Validators.minLength(6)]],
            passwordConfirm:['', [Validators.required]],
            platformRole:   [null, Validators.required],
            isActive:       [true],
            // Empleado asociado
            personaId:      [null],
            empName:        [''],
            empTaxId:       [''],
            empTaxIdType:   ['CI'],
            empPosition:    [''],
            empDepartment:  [''],
        }, { validators: passwordMatchValidator });
    }

    private loadRoles(): void {
        this.permissionsSvc.getAssignableRolesQuery().subscribe({
            next: roles => this.assignableRoles.set(roles),
            error: err => console.error('Error loading roles:', err)
        });
    }

    private loadEmployees(): void {
        this.employeesSub = this.personasSvc.getPersonas('employee').subscribe({
            next: list => {
                this.employees.set(list);
                // Si en modo edición hay un personaId ya seteado en el form,
                // asegurarse de que linkedEmployee esté cargado una vez que employees llegue
                const currentPersonaId = this.userForm.get('personaId')?.value;
                if (currentPersonaId && !this.linkedEmployee()) {
                    const found = list.find(e => e.id === currentPersonaId) ?? null;
                    if (found) this.linkedEmployee.set(found);
                }
            },
            error: err => console.error('Error loading employees:', err)
        });
    }

    private loadUser(uid: string): void {
        this.loadingData.set(true);
        this.userSub = this.companyUsersSvc.getCompanyUser(uid).subscribe({
            next: user => {
                if (!user) {
                    this.errorMessage.set('Usuario no encontrado');
                    this.loadingData.set(false);
                    return;
                }
                // En edición: email no editable, password no requerida
                this.userForm.get('email')?.disable();
                this.userForm.get('password')?.clearValidators();
                this.userForm.get('password')?.updateValueAndValidity();
                this.userForm.get('passwordConfirm')?.clearValidators();
                this.userForm.get('passwordConfirm')?.updateValueAndValidity();

                this.userForm.patchValue({
                    displayName:  user.displayName,
                    email:        user.email,
                    platformRole: user.platformRole,
                    isActive:     user.isActive,
                    personaId:    user.personaId ?? null,
                });

                if (user.personaId) {
                    this.personaMode.set('existing');
                    this.personasSvc.getPerson(user.personaId).then(p => {
                        this.linkedEmployee.set(p);
                    });
                }

                this.loadingData.set(false);
            },
            error: err => {
                this.errorMessage.set('Error al cargar el usuario');
                this.loadingData.set(false);
                console.error(err);
            }
        });
    }

    setPersonaMode(mode: PersonaMode): void {
        this.personaMode.set(mode);
        if (mode !== 'existing') {
            this.userForm.get('personaId')?.setValue(null);
            this.linkedEmployee.set(null);
        }
        if (mode !== 'new') {
            this.userForm.get('empName')?.setValue('');
            this.userForm.get('empTaxId')?.setValue('');
            this.userForm.get('empPosition')?.setValue('');
            this.userForm.get('empDepartment')?.setValue('');
        }
    }

    async onSubmit(): Promise<void> {
        if (this.userForm.invalid) {
            this.userForm.markAllAsTouched();
            this.notification.warning('Por favor complete todos los campos requeridos');
            return;
        }

        // Validar campos del nuevo empleado si aplica
        const mode = this.personaMode();
        if (mode === 'new') {
            const empName  = this.userForm.get('empName')?.value?.trim();
            const empTaxId = this.userForm.get('empTaxId')?.value?.trim();
            if (!empName || !empTaxId) {
                this.notification.warning('Complete el nombre y cédula/RUC del empleado');
                return;
            }
        }

        const companyId = this.authService.user()?.companyId;
        if (!companyId) {
            this.errorMessage.set('No se pudo determinar la empresa activa. Verifica tu sesión.');
            return;
        }

        this.loading.set(true);
        this.errorMessage.set('');
        const v = this.userForm.getRawValue();

        try {
            // ── Resolver personaId ────────────────────────────────────────────
            let resolvedPersonaId: string | undefined;

            if (mode === 'existing' && v.personaId) {
                resolvedPersonaId = v.personaId;
            } else if (mode === 'new') {
                resolvedPersonaId = await this.personasSvc.createPerson({
                    roles:       ['employee'],
                    taxId:       v.empTaxId.trim(),
                    taxIdType:   v.empTaxIdType,
                    isCompany:   false,
                    name:        v.empName.trim(),
                    legalName:   v.empName.trim(),
                    addresses:   [],
                    bankAccounts:[],
                    isActive:    true,
                    employeeData: {
                        position:   v.empPosition?.trim() || undefined,
                        department: v.empDepartment?.trim() || undefined,
                    } as EmployeeDataInput
                });
            }

            // ── Guardar usuario ───────────────────────────────────────────────
            if (this.isEditMode) {
                await this.userMgmtSvc.updateCompanyUser({
                    uid:          this.userId!,
                    companyId,
                    displayName:  v.displayName,
                    platformRole: v.platformRole,
                    isActive:     v.isActive,
                    personaId:    resolvedPersonaId,
                });
                // Escribir personaId directo en Firestore (fuente de verdad garantizada,
                // independiente de si el CF ya fue desplegado con el campo)
                const firestorePersonaUpdate: Partial<CompanyUser> = {};
                if (resolvedPersonaId) {
                    firestorePersonaUpdate.personaId = resolvedPersonaId;
                }
                await this.companyUsersSvc.upsertCompanyUser(this.userId!, firestorePersonaUpdate);
                this.notification.success('Usuario actualizado correctamente');
                this.router.navigate(['/users']);
            } else {
                const result = await this.userMgmtSvc.createCompanyUser({
                    email:        v.email,
                    password:     v.password,
                    displayName:  v.displayName,
                    platformRole: v.platformRole,
                    companyId,
                    personaId:    resolvedPersonaId,
                });
                // Escribir personaId directo en Firestore si aplica
                if (resolvedPersonaId) {
                    await this.companyUsersSvc.upsertCompanyUser(result.uid, { personaId: resolvedPersonaId });
                }
                this.notification.success('Usuario creado correctamente');
                this.router.navigate(['/users', result.uid]);
            }
        } catch (err: any) {
            const code    = err?.code ?? '';
            const message = err?.message ?? 'Error al guardar el usuario';

            if (code.includes('already-exists')) {
                this.errorMessage.set('Ya existe un usuario con ese correo electrónico');
            } else if (code.includes('permission-denied')) {
                this.errorMessage.set('No tienes permisos para realizar esta acción');
            } else {
                this.errorMessage.set(message);
            }
            this.notification.error(this.errorMessage());
            console.error('[UserFormComponent] onSubmit error:', err);
        } finally {
            this.loading.set(false);
        }
    }

    // ── Template helpers ─────────────────────────────────────────────────────

    isFieldInvalid(field: string): boolean {
        const c = this.userForm.get(field);
        return !!(c && c.invalid && c.touched);
    }

    hasFormError(errorKey: string): boolean {
        return !!(this.userForm.errors?.[errorKey] &&
            this.userForm.get('passwordConfirm')?.touched);
    }

    getFieldError(field: string): string {
        const c = this.userForm.get(field);
        if (!c?.errors) return '';
        if (c.errors['required'])  return 'Este campo es requerido';
        if (c.errors['minlength']) return `Mínimo ${c.errors['minlength'].requiredLength} caracteres`;
        if (c.errors['maxlength']) return `Máximo ${c.errors['maxlength'].requiredLength} caracteres`;
        if (c.errors['email'])     return 'Ingresa un correo electrónico válido';
        return 'Campo inválido';
    }

    onEmployeeSelected(personaId: string | null): void {
        if (!personaId) {
            this.linkedEmployee.set(null);
            return;
        }
        const found = this.employees().find(e => e.id === personaId) ?? null;
        this.linkedEmployee.set(found);
        if (!found) {
            this.personasSvc.getPerson(personaId).then(p => this.linkedEmployee.set(p));
        }
    }

    getEmployeeLabel(emp: Person): string {
        return `${emp.name} — ${emp.taxId}`;
    }

    cancel(): void {
        this.router.navigate(this.isEditMode && this.userId
            ? ['/users', this.userId]
            : ['/users']
        );
    }
}
