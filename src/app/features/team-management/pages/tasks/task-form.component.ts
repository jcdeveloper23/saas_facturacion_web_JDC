import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import {
  FormGroup, FormControl, Validators, ReactiveFormsModule, FormsModule
} from '@angular/forms';
import { Subject, takeUntil, take } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { TasksService }       from '../../services/tasks.service';
import { ProjectsService }    from '../../services/projects.service';
import { TeamMembersService } from '../../services/team-members.service';
import { AuthService }        from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  Task, TaskType, TaskStatus, TaskPriority, TaskCreateInput,
  TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_TYPE_LABELS,
  TASK_STATUS_COLORS,
} from '../../models/task.interface';
import { Project } from '../../models/project.interface';
import { TeamMember } from '../../models/team-member.interface';

@Component({
  selector: 'app-task-form',
  standalone: true,
  templateUrl: './task-form.component.html',
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, FormModule, AlertModule, IconModule,
  ],
})
export class TaskFormComponent implements OnInit, OnDestroy {
  private tasksSvc       = inject(TasksService);
  private projectsSvc    = inject(ProjectsService);
  private membersSvc     = inject(TeamMembersService);
  private authService    = inject(AuthService);
  private notifications  = inject(NotificationService);
  private router         = inject(Router);
  private route          = inject(ActivatedRoute);
  private destroy$       = new Subject<void>();

  readonly STATUS_LABELS   = TASK_STATUS_LABELS;
  readonly STATUS_COLORS   = TASK_STATUS_COLORS;
  readonly PRIORITY_LABELS = TASK_PRIORITY_LABELS;
  readonly TYPE_LABELS     = TASK_TYPE_LABELS;

  // ── State ──────────────────────────────────────────────────────────────────
  taskId    = signal<string | null>(null);
  isEditing = computed(() => !!this.taskId());
  saving    = signal(false);
  loading   = signal(false);
  prefilledRequestId = signal<string | null>(null);

  // ── Reference data ──────────────────────────────────────────────────────────
  projects = signal<Project[]>([]);
  members  = signal<TeamMember[]>([]);
  task     = signal<Task | null>(null);

  // ── Comments ────────────────────────────────────────────────────────────────
  newComment = signal('');
  submittingComment = signal(false);

  // ── Computed ────────────────────────────────────────────────────────────────
  showBlockedReason = computed(() => this.form.get('status')?.value === 'blocked');

  // ── Form ───────────────────────────────────────────────────────────────────
  form = new FormGroup({
    projectId:      new FormControl('',          Validators.required),
    title:          new FormControl('',          [Validators.required, Validators.minLength(5)]),
    description:    new FormControl(''),
    type:           new FormControl<TaskType>('feature',  Validators.required),
    priority:       new FormControl<TaskPriority>('medium', Validators.required),
    status:         new FormControl<TaskStatus>('backlog', Validators.required),
    assigneeIds:    new FormControl<string[]>([]),
    estimatedHours: new FormControl<number>(0,   [Validators.required, Validators.min(0)]),
    dueDate:        new FormControl(''),
    blockedReason:  new FormControl(''),
    tags:           new FormControl(''),
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadReferenceData();

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.taskId.set(id);
      this.loadTask(id);
    } else {
      const params = this.route.snapshot.queryParamMap;
      const requestId    = params.get('requestId');
      const requestTitle = params.get('requestTitle');
      const projectId    = params.get('projectId');

      if (requestId) {
        this.form.patchValue({
          title:     requestTitle ? `[Solicitud] ${requestTitle}` : '',
          projectId: projectId ?? '',
        });
        this.prefilledRequestId.set(requestId);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Reference data ──────────────────────────────────────────────────────────

  private loadReferenceData(): void {
    this.projectsSvc.getAll()
      .pipe(take(1))
      .subscribe({ next: list => this.projects.set(list.filter(p => p.isActive !== false)) });

    this.membersSvc.getActive()
      .pipe(take(1))
      .subscribe({ next: list => this.members.set(list) });
  }

  // ── Load existing task ──────────────────────────────────────────────────────

  private loadTask(id: string): void {
    this.loading.set(true);
    this.tasksSvc.getById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: t => {
          if (!t) { this.router.navigate(['/team-management/tasks']); return; }
          this.task.set(t);
          this.patchForm(t);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private patchForm(t: Task): void {
    this.form.patchValue({
      projectId:      t.projectId,
      title:          t.title,
      description:    t.description ?? '',
      type:           t.type,
      priority:       t.priority,
      status:         t.status,
      assigneeIds:    t.assigneeIds ?? [],
      estimatedHours: t.estimatedHours,
      dueDate:        t.dueDate ? this.tsToDateInput(t.dueDate) : '',
      blockedReason:  t.blockedReason ?? '',
      tags:           (t.tags ?? []).join(', '),
    });
  }

  // ── Assignees checkbox helpers ──────────────────────────────────────────────

  isAssigned(memberId: string): boolean {
    return (this.form.get('assigneeIds')?.value ?? []).includes(memberId);
  }

  toggleAssignee(memberId: string): void {
    const ctrl    = this.form.get('assigneeIds')!;
    const current = (ctrl.value ?? []) as string[];
    const updated = current.includes(memberId)
      ? current.filter(id => id !== memberId)
      : [...current, memberId];
    ctrl.setValue(updated);
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.notifications.error('Por favor complete los campos requeridos');
      return;
    }

    this.saving.set(true);
    try {
      const payload = this.buildPayload();
      if (this.isEditing()) {
        await this.tasksSvc.update(this.taskId()!, payload as Partial<Task>);
        this.notifications.success('Tarea actualizada correctamente');
      } else {
        const id = await this.tasksSvc.create(payload);
        this.notifications.success('Tarea creada correctamente');
        const back = this.route.snapshot.queryParamMap.get('back');
        if (back === 'kanban') {
          this.router.navigate(['/team-management/kanban']);
        } else {
          this.router.navigate(['/team-management/tasks', id, 'edit']);
        }
        return;
      }
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  private buildPayload(): TaskCreateInput {
    const v = this.form.value;
    const project = this.projects().find(p => p.id === v.projectId);
    const tags = (v.tags ?? '').split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);

    return {
      projectId:      v.projectId ?? '',
      projectName:    project?.name ?? '',
      title:          v.title ?? '',
      description:    v.description ?? undefined,
      type:           (v.type as TaskType)     ?? 'feature',
      status:         (v.status as TaskStatus) ?? 'backlog',
      priority:       (v.priority as TaskPriority) ?? 'medium',
      assigneeIds:    (v.assigneeIds as string[]) ?? [],
      reporterId:     this.authService.user()?.uid ?? '',
      estimatedHours: v.estimatedHours ?? 0,

      dueDate:        v.dueDate ? Timestamp.fromDate(new Date(v.dueDate + 'T00:00:00')) : undefined,
      blockedReason:  v.status === 'blocked' ? (v.blockedReason ?? '') : undefined,
      tags,
      comments:       this.task()?.comments ?? [],
      requestId:      this.prefilledRequestId() ?? this.task()?.requestId ?? undefined,
    };
  }

  // ── Comments ────────────────────────────────────────────────────────────────

  async submitComment(): Promise<void> {
    const content = this.newComment().trim();
    if (!content || !this.taskId()) return;

    this.submittingComment.set(true);
    try {
      await this.tasksSvc.addComment(this.taskId()!, {
        authorId:   this.authService.user()?.uid ?? '',
        authorName: this.authService.user()?.displayName ?? 'Usuario',
        content,
      });
      this.newComment.set('');
    } catch (err: any) {
      this.notifications.error('Error al agregar comentario: ' + (err?.message ?? err));
    } finally {
      this.submittingComment.set(false);
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  hasError(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && c?.touched);
  }

  private tsToDateInput(ts: Timestamp): string {
    return ts?.toDate ? ts.toDate().toISOString().substring(0, 10) : '';
  }

  goBack(): void {
    const back = this.route.snapshot.queryParamMap.get('back');
    if (back === 'kanban') {
      this.router.navigate(['/team-management/kanban']);
    } else {
      this.router.navigate(['/team-management/tasks']);
    }
  }
}
