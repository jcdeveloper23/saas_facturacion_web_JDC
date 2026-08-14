import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import {
  FormBuilder, FormArray, AbstractControl,
  Validators, ReactiveFormsModule
} from '@angular/forms';
import { Subject, takeUntil, take } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule, AlertModule, TooltipModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { ProjectsService }     from '../../services/projects.service';
import { TeamMembersService }  from '../../services/team-members.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { TeamMember }          from '../../models/team-member.interface';
import {
  Project, ProjectStatus, ProjectPriority,
  PROJECT_STATUS_LABELS, PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_COLORS, PROJECT_PRIORITY_COLORS,
} from '../../models/project.interface';

export const PROJECT_COLORS: string[] = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444',
  '#f97316','#eab308','#22c55e','#14b8a6',
  '#06b6d4','#3b82f6','#6b7280','#1e293b',
];

export const DEFAULT_EMOJIS: string[] = [
  '📁','🚀','⚡','🎯','💡','🔧','🌟','🏆',
  '📊','🎨','🔑','📱','💻','🌐','🛠️','📈',
];

@Component({
  selector: 'app-project-form',
  standalone: true,
  templateUrl: './project-form.component.html',
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, FormModule, AlertModule, TooltipModule,
    IconModule,
  ],
})
export class ProjectFormComponent implements OnInit, OnDestroy {
  // ── Inject ─────────────────────────────────────────────────────────────────
  private svc           = inject(ProjectsService);
  private membersSvc    = inject(TeamMembersService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private route         = inject(ActivatedRoute);
  private fb            = inject(FormBuilder);
  private destroy$      = new Subject<void>();

  // ── Constants ──────────────────────────────────────────────────────────────
  readonly STATUS_LABELS   = PROJECT_STATUS_LABELS;
  readonly PRIORITY_LABELS = PROJECT_PRIORITY_LABELS;
  readonly STATUS_COLORS   = PROJECT_STATUS_COLORS;
  readonly PRIORITY_COLORS = PROJECT_PRIORITY_COLORS;
  readonly PROJECT_COLORS  = PROJECT_COLORS;
  readonly DEFAULT_EMOJIS  = DEFAULT_EMOJIS;

  readonly statusOptions: ProjectStatus[]     = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
  readonly priorityOptions: ProjectPriority[] = ['low', 'medium', 'high', 'critical'];

  // ── Signals ────────────────────────────────────────────────────────────────
  projectId         = signal<string | null>(null);
  loading           = signal(false);
  saving            = signal(false);
  members           = signal<TeamMember[]>([]);
  showEmojiPicker   = signal(false);
  /** Set of Firebase Auth UIDs of selected members */
  selectedMemberIds = signal<Set<string>>(new Set());

  // ── Computed ───────────────────────────────────────────────────────────────
  isEditing = computed(() => !!this.projectId());
  pageTitle = computed(() => this.isEditing() ? 'Editar Proyecto' : 'Nuevo Proyecto');

  // ── Form ───────────────────────────────────────────────────────────────────
  form = this.fb.group({
    name:           ['', [Validators.required, Validators.minLength(3)]],
    description:    [''],
    clientId:       [''],
    clientName:     [''],
    priority:       ['medium', Validators.required],
    status:         ['planning', Validators.required],
    startDate:      ['', Validators.required],
    dueDate:        ['', Validators.required],
    estimatedHours: [0, [Validators.required, Validators.min(0)]],
    leadId:         [''],
    tags:           [''],
    color:          ['#6366f1'],
    emoji:          ['📁'],
    milestones:     this.fb.array([]),
  });

  // ── Milestones FormArray ────────────────────────────────────────────────────

  get milestonesArray(): FormArray {
    return this.form.get('milestones') as FormArray;
  }

  /** Cast AbstractControl to typed group for template access */
  asGroup(ctrl: AbstractControl) {
    return ctrl as ReturnType<typeof this.fb.group>;
  }

  addMilestone(): void {
    this.milestonesArray.push(this.fb.group({
      _id:       [crypto.randomUUID()],
      name:      ['', Validators.required],
      dueDate:   [''],
      completed: [false],
    }));
  }

  removeMilestone(i: number): void {
    this.milestonesArray.removeAt(i);
  }

  // ── Member selection ────────────────────────────────────────────────────────

  toggleMember(uid: string): void {
    this.selectedMemberIds.update(set => {
      const next = new Set(set);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  }

  isMemberSelected(uid: string): boolean {
    return this.selectedMemberIds().has(uid);
  }

  /** Current lead TeamMember for avatar display */
  get currentLead(): TeamMember | undefined {
    const id = this.form.get('leadId')?.value;
    return id ? this.members().find(m => m.userId === id) : undefined;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  memberBgColor(m: TeamMember): string {
    const hash = (m.userId + m.displayName)
      .split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return PROJECT_COLORS[hash % PROJECT_COLORS.length];
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.membersSvc.getActive()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: list => this.members.set(list) });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.projectId.set(id);
      this.loadProject(id);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private loadProject(id: string): void {
    this.loading.set(true);
    this.svc.getById(id)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe({
        next: project => {
          if (!project) {
            this.notifications.error('Proyecto no encontrado');
            this.router.navigate(['/team-management/projects']);
            return;
          }
          this.patchForm(project);
          this.loading.set(false);
        },
        error: () => {
          this.notifications.error('Error al cargar el proyecto');
          this.loading.set(false);
        },
      });
  }

  private patchForm(p: Project): void {
    this.form.patchValue({
      name:           p.name,
      description:    p.description   ?? '',
      clientId:       p.clientId      ?? '',
      clientName:     p.clientName    ?? '',
      priority:       p.priority,
      status:         p.status,
      startDate:      this.tsToDateInput(p.startDate),
      dueDate:        this.tsToDateInput(p.dueDate),
      estimatedHours: p.estimatedHours,
      leadId:         p.leadId        ?? '',
      tags:           (p.tags ?? []).join(', '),
      color:          p.color         ?? '#6366f1',
      emoji:          p.emoji         ?? '📁',
    });

    // Restore member selection
    this.selectedMemberIds.set(new Set(p.memberIds ?? []));

    // Restore milestones
    this.milestonesArray.clear();
    for (const ms of p.milestones ?? []) {
      this.milestonesArray.push(this.fb.group({
        _id:       [ms.id],
        name:      [ms.name, Validators.required],
        dueDate:   [this.tsToDateInput(ms.dueDate)],
        completed: [ms.completed],
      }));
    }
  }

  private tsToDateInput(ts: Timestamp): string {
    return ts?.toDate ? ts.toDate().toISOString().substring(0, 10) : '';
  }

  private dateToTs(dateStr: string): Timestamp {
    return Timestamp.fromDate(new Date(dateStr + 'T00:00:00'));
  }

  private tagsFromString(raw: string): string[] {
    return raw.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.milestonesArray.markAllAsTouched();
    if (this.form.invalid) {
      this.notifications.error('Por favor complete los campos requeridos');
      return;
    }

    const v = this.form.getRawValue();

    const milestones = (this.milestonesArray.getRawValue() as any[]).map(ms => ({
      id:        ms._id as string,
      name:      ms.name as string,
      dueDate:   ms.dueDate ? this.dateToTs(ms.dueDate) : Timestamp.now(),
      completed: ms.completed as boolean,
    }));

    const payload = {
      name:           v.name!,
      description:    v.description    || undefined,
      clientId:       v.clientId       || undefined,
      clientName:     v.clientName     || undefined,
      priority:       v.priority       as ProjectPriority,
      status:         v.status         as ProjectStatus,
      startDate:      this.dateToTs(v.startDate!),
      dueDate:        this.dateToTs(v.dueDate!),
      estimatedHours: v.estimatedHours ?? 0,
      memberIds:      Array.from(this.selectedMemberIds()),
      leadId:         v.leadId         || undefined,
      tags:           this.tagsFromString(v.tags ?? ''),
      color:          v.color          || '#6366f1',
      emoji:          v.emoji          || '📁',
      milestones,
    };

    this.saving.set(true);
    try {
      if (this.isEditing()) {
        await this.svc.update(this.projectId()!, payload);
        this.notifications.success('Proyecto actualizado correctamente');
      } else {
        await this.svc.create(payload as any);
        this.notifications.success('Proyecto creado correctamente');
      }
      this.router.navigate(['/team-management/projects']);
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    this.router.navigate(['/team-management/projects']);
  }
}
