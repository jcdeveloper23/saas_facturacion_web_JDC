import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import {
  FormControl, FormGroup, Validators, ReactiveFormsModule
} from '@angular/forms';
import { Subject, takeUntil, take } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { ProjectsService }     from '../../services/projects.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  Project, ProjectStatus, ProjectPriority,
  PROJECT_STATUS_LABELS, PROJECT_PRIORITY_LABELS
} from '../../models/project.interface';

@Component({
  selector: 'app-project-form',
  standalone: true,
  templateUrl: './project-form.component.html',
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, FormModule, AlertModule,
    IconModule,
  ],
})
export class ProjectFormComponent implements OnInit, OnDestroy {
  // ── Inject ─────────────────────────────────────────────────────────────────
  private svc           = inject(ProjectsService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private route         = inject(ActivatedRoute);
  private destroy$      = new Subject<void>();

  // ── Constants ──────────────────────────────────────────────────────────────
  readonly STATUS_LABELS   = PROJECT_STATUS_LABELS;
  readonly PRIORITY_LABELS = PROJECT_PRIORITY_LABELS;

  readonly statusOptions: ProjectStatus[]     = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
  readonly priorityOptions: ProjectPriority[] = ['low', 'medium', 'high', 'critical'];

  // ── Signals ────────────────────────────────────────────────────────────────
  projectId = signal<string | null>(null);
  loading   = signal(false);
  saving    = signal(false);

  // ── Computed ───────────────────────────────────────────────────────────────
  isEditing = computed(() => !!this.projectId());
  pageTitle = computed(() => this.isEditing() ? 'Editar Proyecto' : 'Nuevo Proyecto');

  // ── Form ───────────────────────────────────────────────────────────────────
  form = new FormGroup({
    name:           new FormControl('', [Validators.required, Validators.minLength(3)]),
    description:    new FormControl(''),
    clientId:       new FormControl(''),
    clientName:     new FormControl(''),
    priority:       new FormControl<ProjectPriority>('medium', { nonNullable: true, validators: [Validators.required] }),
    status:         new FormControl<ProjectStatus>('planning',  { nonNullable: true, validators: [Validators.required] }),
    startDate:      new FormControl('', Validators.required),
    dueDate:        new FormControl('', Validators.required),
    estimatedHours: new FormControl<number>(0, [Validators.required, Validators.min(0)]),
    memberIds:      new FormControl<string[]>([]),
    leadId:         new FormControl(''),
    tags:           new FormControl(''),  // string separado por comas → convertir a string[] en submit
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
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

  // ── Private ────────────────────────────────────────────────────────────────

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
      description:    p.description ?? '',
      clientId:       p.clientId   ?? '',
      clientName:     p.clientName ?? '',
      priority:       p.priority,
      status:         p.status,
      startDate:      this.tsToDateInput(p.startDate),
      dueDate:        this.tsToDateInput(p.dueDate),
      estimatedHours: p.estimatedHours,
      memberIds:      p.memberIds ?? [],
      leadId:         p.leadId    ?? '',
      tags:           (p.tags ?? []).join(', '),
    });
  }

  private tsToDateInput(ts: Timestamp): string {
    return ts?.toDate ? ts.toDate().toISOString().substring(0, 10) : '';
  }

  private dateToTs(dateStr: string): Timestamp {
    return Timestamp.fromDate(new Date(dateStr + 'T00:00:00'));
  }

  private tagsFromString(raw: string): string[] {
    return raw.split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.notifications.error('Por favor complete los campos requeridos');
      return;
    }

    const v = this.form.getRawValue();

    const payload = {
      name:           v.name!,
      description:    v.description || undefined,
      clientId:       v.clientId   || undefined,
      clientName:     v.clientName || undefined,
      priority:       v.priority,
      status:         v.status,
      startDate:      this.dateToTs(v.startDate!),
      dueDate:        this.dateToTs(v.dueDate!),
      estimatedHours: v.estimatedHours ?? 0,
      memberIds:      v.memberIds ?? [],
      leadId:         v.leadId || undefined,
      tags:           this.tagsFromString(v.tags ?? ''),
      milestones:     [],
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
