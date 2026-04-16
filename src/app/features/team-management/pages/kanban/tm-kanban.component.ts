import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  CdkDragDrop, moveItemInArray, transferArrayItem, DragDropModule
} from '@angular/cdk/drag-drop';
import {
  CardModule, GridModule, BadgeModule, SpinnerModule, ButtonModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { ProjectsService } from '../../services/projects.service';
import { TasksService }     from '../../services/tasks.service';
import { NotificationService } from '../../../../core/services/notification.service';

import {
  Task, TaskStatus,
  TASK_KANBAN_COLUMNS, TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS,
  TASK_TYPE_LABELS
} from '../../models/task.interface';
import { Project } from '../../models/project.interface';

@Component({
  selector: 'app-tm-kanban',
  standalone: true,
  templateUrl: './tm-kanban.component.html',
  imports: [
    CommonModule, FormsModule,
    DragDropModule,
    CardModule, GridModule, BadgeModule, SpinnerModule, ButtonModule,
    IconModule,
  ],
})
export class TmKanbanComponent implements OnInit, OnDestroy {
  private projectsSvc   = inject(ProjectsService);
  private tasksSvc      = inject(TasksService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── Labels / Colors ──────────────────────────────────────────────────────────
  readonly COLUMNS         = TASK_KANBAN_COLUMNS;
  readonly STATUS_LABELS   = TASK_STATUS_LABELS;
  readonly STATUS_COLORS   = TASK_STATUS_COLORS;
  readonly PRIORITY_LABELS = TASK_PRIORITY_LABELS;
  readonly PRIORITY_COLORS = TASK_PRIORITY_COLORS;
  readonly TYPE_LABELS     = TASK_TYPE_LABELS;

  // ── State ────────────────────────────────────────────────────────────────────
  loading           = signal(true);
  projects          = signal<Project[]>([]);
  tasks             = signal<Task[]>([]);
  selectedProjectId = signal<string>('all');

  // ── Computed ─────────────────────────────────────────────────────────────────

  tasksByColumn = computed(() => {
    const pid      = this.selectedProjectId();
    const filtered = pid === 'all'
      ? this.tasks()
      : this.tasks().filter(t => t.projectId === pid);

    return TASK_KANBAN_COLUMNS.reduce((acc, col) => {
      acc[col] = filtered.filter(t => t.status === col);
      return acc;
    }, {} as Record<TaskStatus, Task[]>);
  });

  connectedLists = computed(() => TASK_KANBAN_COLUMNS.map(c => 'list-' + c));

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 2) this.loading.set(false); };

    this.projectsSvc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: list => { this.projects.set(list); checkDone(); }, error: () => checkDone() });

    this.tasksSvc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: list => { this.tasks.set(list); checkDone(); }, error: () => checkDone() });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Interactions ─────────────────────────────────────────────────────────────

  setProject(id: string): void {
    this.selectedProjectId.set(id);
  }

  async onDrop(event: CdkDragDrop<Task[]>, newStatus: TaskStatus): Promise<void> {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );
      const task = event.container.data[event.currentIndex];
      try {
        await this.tasksSvc.changeStatus(task.id, newStatus);
      } catch (err: any) {
        this.notifications.error('Error al mover la tarea: ' + (err?.message ?? err));
        // Revert UI
        transferArrayItem(
          event.container.data,
          event.previousContainer.data,
          event.currentIndex,
          event.previousIndex,
        );
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  assigneeInitials(assigneeIds: string[]): string[] {
    return assigneeIds.slice(0, 3).map(id => id.substring(0, 2).toUpperCase());
  }

  isOverdue(task: Task): boolean {
    return !!(task.dueDate && task.dueDate.toDate() < new Date() && task.status !== 'done');
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
  trackByCol(_: number, col: string): string { return col; }
}
