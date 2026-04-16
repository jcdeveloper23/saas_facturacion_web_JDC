import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import {
  FormControl, FormGroup, Validators, ReactiveFormsModule
} from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, take } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { TeamMembersService }  from '../../services/team-members.service';
import { CatalogsService }     from '../../services/catalogs.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { PersonasService }     from '../../../personas/services/personas.service';
import {
  TeamMember, MemberRole, MemberStatus,
  MEMBER_ROLE_LABELS, MEMBER_ROLE_COLORS, MEMBER_STATUS_LABELS
} from '../../models/team-member.interface';
import { TmSpecialty, TmPosition } from '../../models/catalog.interface';
import { Person } from '../../../personas/models/person.interface';

@Component({
  selector: 'app-member-form',
  standalone: true,
  templateUrl: './member-form.component.html',
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, FormModule, AlertModule,
    IconModule,
  ],
})
export class MemberFormComponent implements OnInit, OnDestroy {
  // ── Inject ───────────────────────────────────────────────────────────────────
  private svc           = inject(TeamMembersService);
  private catalogsSvc   = inject(CatalogsService);
  private personasSvc   = inject(PersonasService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private route         = inject(ActivatedRoute);
  private destroy$      = new Subject<void>();

  // ── Constants ────────────────────────────────────────────────────────────────
  readonly ROLE_LABELS   = MEMBER_ROLE_LABELS;
  readonly ROLE_COLORS   = MEMBER_ROLE_COLORS;
  readonly STATUS_LABELS = MEMBER_STATUS_LABELS;

  readonly roleOptions: MemberRole[]     = ['developer', 'qa', 'support', 'designer', 'devops', 'pm', 'analyst'];
  readonly statusOptions: MemberStatus[] = ['active', 'on_leave', 'inactive'];

  // ── State ────────────────────────────────────────────────────────────────────
  memberId    = signal<string | null>(null);
  loading     = signal(false);
  saving      = signal(false);
  loadingList = signal(true);

  // Catálogos
  catalogSpecialties = signal<TmSpecialty[]>([]);
  catalogPositions   = signal<TmPosition[]>([]);
  selectedSpecialties = signal<string[]>([]);

  // Buscador de empleados (solo en creación)
  step             = signal<'search' | 'form'>('search');
  employees        = signal<Person[]>([]);
  linkedPersonaIds = signal<Set<string>>(new Set());
  searchQuery      = signal('');
  selectedPerson   = signal<Person | null>(null);

  // ── Computed ─────────────────────────────────────────────────────────────────
  isEditing = computed(() => !!this.memberId());
  pageTitle = computed(() => this.isEditing() ? 'Editar Miembro' : 'Agregar al Equipo');

  filteredEmployees = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const list = this.employees();
    if (!q) return list;
    return list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q) ||
      (p.employeeData?.position ?? '').toLowerCase().includes(q) ||
      (p.employeeData?.department ?? '').toLowerCase().includes(q)
    );
  });

  positionNames = computed(() => this.catalogPositions().map(p => p.name));

  // ── Form ─────────────────────────────────────────────────────────────────────
  form = new FormGroup({
    userId:              new FormControl('', Validators.required),
    displayName:         new FormControl('', [Validators.required, Validators.minLength(2)]),
    email:               new FormControl('', [Validators.required, Validators.email]),
    position:            new FormControl(''),
    role:                new FormControl<MemberRole>('developer', { nonNullable: true, validators: [Validators.required] }),
    status:              new FormControl<MemberStatus>('active',  { nonNullable: true, validators: [Validators.required] }),
    weeklyCapacityHours: new FormControl<number>(40, [Validators.required, Validators.min(1), Validators.max(168)]),
    phone:               new FormControl(''),
    avatarUrl:           new FormControl(''),
    hireDate:            new FormControl(''),
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadCatalogs();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.memberId.set(id);
      this.step.set('form');
      this.loadMember(id);
      this.loadingList.set(false);
    } else {
      this.loadEmployeesAndLinked();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Private ───────────────────────────────────────────────────────────────────
  private loadCatalogs(): void {
    this.catalogsSvc.getSpecialties()
      .pipe(takeUntil(this.destroy$))
      .subscribe(list => this.catalogSpecialties.set(list));

    this.catalogsSvc.getPositions()
      .pipe(takeUntil(this.destroy$))
      .subscribe(list => this.catalogPositions.set(list));
  }

  private loadEmployeesAndLinked(): void {
    this.loadingList.set(true);
    let done = 0;
    const check = () => { done++; if (done >= 2) this.loadingList.set(false); };

    this.personasSvc.getPersonas('employee')
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe({
        next:  list => { this.employees.set(list.filter(p => p.isActive)); check(); },
        error: ()   => check(),
      });

    this.svc.getAll()
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe({
        next: members => {
          const ids = new Set(members.map(m => m.personaId).filter((id): id is string => !!id));
          this.linkedPersonaIds.set(ids);
          check();
        },
        error: () => check(),
      });
  }

  private loadMember(id: string): void {
    this.loading.set(true);
    this.svc.getById(id)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe({
        next: member => {
          if (!member) {
            this.notifications.error('Miembro no encontrado');
            this.router.navigate(['/team-management/members']);
            return;
          }
          this.patchForm(member);
          this.loading.set(false);
        },
        error: () => {
          this.notifications.error('Error al cargar el miembro');
          this.loading.set(false);
        },
      });
  }

  private patchForm(m: TeamMember): void {
    this.form.patchValue({
      userId:              m.userId,
      displayName:         m.displayName,
      email:               m.email,
      position:            m.position ?? '',
      role:                m.role,
      status:              m.status,
      weeklyCapacityHours: m.weeklyCapacityHours,
      phone:               m.phone     ?? '',
      avatarUrl:           m.avatarUrl ?? '',
      hireDate:            this.tsToDateInput(m.hireDate),
    });
    this.selectedSpecialties.set(m.specialties ?? []);
    if (this.isEditing()) {
      this.form.get('userId')?.disable();
    }
  }

  private tsToDateInput(ts?: Timestamp): string {
    return ts?.toDate ? ts.toDate().toISOString().substring(0, 10) : '';
  }

  // ── Catálogo: especialidades ──────────────────────────────────────────────────
  isSpecialtySelected(name: string): boolean {
    return this.selectedSpecialties().includes(name);
  }

  toggleSpecialty(name: string): void {
    const current = this.selectedSpecialties();
    if (current.includes(name)) {
      this.selectedSpecialties.set(current.filter(s => s !== name));
    } else {
      this.selectedSpecialties.set([...current, name]);
    }
  }

  // ── Buscador personas ─────────────────────────────────────────────────────────
  selectPerson(p: Person): void {
    this.selectedPerson.set(p);
    this.form.patchValue({
      displayName: p.name,
      email:       p.email ?? '',
      phone:       p.phone1 ?? '',
      hireDate:    p.employeeData?.hireDate ?? '',
      position:    p.employeeData?.position ?? '',
    });
    this.step.set('form');
  }

  clearPerson(): void {
    this.selectedPerson.set(null);
    this.form.reset({ role: 'developer', status: 'active', weeklyCapacityHours: 40 });
    this.selectedSpecialties.set([]);
    this.step.set('search');
  }

  skipSearch(): void {
    this.step.set('form');
  }

  getPersonInitials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
  }

  isAlreadyLinked(personaId: string): boolean {
    return this.linkedPersonaIds().has(personaId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.notifications.error('Por favor complete los campos requeridos');
      return;
    }

    const v = this.form.getRawValue();

    const payload = {
      userId:              v.userId!,
      displayName:         v.displayName!,
      email:               v.email!,
      role:                v.role,
      status:              v.status,
      weeklyCapacityHours: v.weeklyCapacityHours ?? 40,
      specialties:         this.selectedSpecialties(),
      activeProjectIds:    [] as string[],
      position:            v.position || undefined,
      phone:               v.phone    || undefined,
      avatarUrl:           v.avatarUrl || undefined,
      hireDate:            v.hireDate ? Timestamp.fromDate(new Date(v.hireDate + 'T00:00:00')) : undefined,
      personaId:           this.selectedPerson()?.id || undefined,
    };

    this.saving.set(true);
    try {
      if (this.isEditing()) {
        const { userId: _uid, activeProjectIds: _ap, personaId: _pid, ...changes } = payload;
        await this.svc.update(this.memberId()!, changes);
        this.notifications.success('Miembro actualizado correctamente');
      } else {
        await this.svc.create(payload);
        this.notifications.success('Miembro agregado al equipo');
      }
      this.router.navigate(['/team-management/members']);
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    this.router.navigate(['/team-management/members']);
  }
}
