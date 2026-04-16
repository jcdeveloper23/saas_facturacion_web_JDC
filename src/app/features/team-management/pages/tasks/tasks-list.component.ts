import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { TasksService }    from '../../services/tasks.service';
import { ProjectsService } from '../../services/projects.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  Task, TaskStatus, TaskPriority,
  TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS,
  TASK_TYPE_LABELS,
} from '../../models/task.interface';
import { Project } from '../../models/project.interface';

@Component({
  selector: 'app-tasks-list',
  standalone: true,
  templateUrl: './tasks-list.component.html',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    IconModule,
  ],
})
export class TasksListComponent implements OnInit, OnDestroy {
  readonly router        = inject(Router);
  private tasksSvc       = inject(TasksService);
  private projectsSvc    = inject(ProjectsService);
  private notifications  = inject(NotificationService);
  private destroy$       = new Subject<void>();

  readonly STATUS_LABELS   = TASK_STATUS_LABELS;
  readonly STATUS_COLORS   = TASK_STATUS_COLORS;
  readonly PRIORITY_LABELS = TASK_PRIORITY_LABELS;
  readonly PRIORITY_COLORS = TASK_PRIORITY_COLORS;
  readonly TYPE_LABELS     = TASK_TYPE_LABELS;

  // ── State ──────────────────────────────────────────────────────────────────
  all            = signal<Task[]>([]);
  projects       = signal<Project[]>([]);
  loading        = signal(true);
  statusFilter   = signal<TaskStatus | 'all'>('all');
  projectFilter  = signal<string>('all');
  priorityFilter = signal<TaskPriority | 'all'>('all');
  searchTerm     = signal('');

  // ── Stats ──────────────────────────────────────────────────────────────────
  stats = computed(() => ({
    total:      this.all().length,
    inProgress: this.all().filter(t => t.status === 'in_progress').length,
    blocked:    this.all().filter(t => t.status === 'blocked').length,
    overdue:    this.all().filter(t =>
      !!t.dueDate && t.dueDate.toDate() < new Date() && t.status !== 'done'
    ).length,
    done:       this.all().filter(t => t.status === 'done').length,
  }));

  // ── Filtered list ───────────────────────────────────────────────────────────
  filtered = computed(() => {
    let list = this.all();
    if (this.statusFilter()   !== 'all') list = list.filter(t => t.status   === this.statusFilter());
    if (this.projectFilter()  !== 'all') list = list.filter(t => t.projectId === this.projectFilter());
    if (this.priorityFilter() !== 'all') list = list.filter(t => t.priority  === this.priorityFilter());
    const q = this.searchTerm().toLowerCase().trim();
    if (q) list = list.filter(t => t.title.toLowerCase().includes(q));
    return list;
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.tasksSvc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  list => { this.all.set(list.filter(t => t.isActive !== false)); this.loading.set(false); },
        error: ()   => this.loading.set(false),
      });

    this.projectsSvc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: list => this.projects.set(list) });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Interactions ────────────────────────────────────────────────────────────

  isOverdue(t: Task): boolean {
    return !!t.dueDate && t.dueDate.toDate() < new Date() && t.status !== 'done';
  }

  async quickChangeStatus(t: Task, status: TaskStatus): Promise<void> {
    try {
      await this.tasksSvc.changeStatus(t.id, status);
      this.notifications.success(`Tarea movida a "${TASK_STATUS_LABELS[status]}"`);
    } catch (err: any) {
      this.notifications.error('Error al cambiar estado: ' + (err?.message ?? err));
    }
  }

  /** Iniciales de un assigneeId: busca en la lista o retorna 2 chars del id. */
  initials(assigneeId: string): string {
    return assigneeId.substring(0, 2).toUpperCase();
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
