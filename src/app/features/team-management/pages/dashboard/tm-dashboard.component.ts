import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  CardModule, GridModule, BadgeModule, SpinnerModule, ProgressModule, TableModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { ProjectsService }    from '../../services/projects.service';
import { TasksService }        from '../../services/tasks.service';
import { TeamMembersService }  from '../../services/team-members.service';

import { Project, PROJECT_PRIORITY_LABELS, PROJECT_PRIORITY_COLORS } from '../../models/project.interface';
import { Task, TASK_STATUS_LABELS, TASK_STATUS_COLORS }               from '../../models/task.interface';
import {
  TeamMember, MEMBER_ROLE_LABELS, MEMBER_ROLE_COLORS
} from '../../models/team-member.interface';

@Component({
  selector: 'app-tm-dashboard',
  standalone: true,
  templateUrl: './tm-dashboard.component.html',
  imports: [
    CommonModule,
    CardModule, GridModule, BadgeModule, SpinnerModule, ProgressModule, TableModule,
    IconModule,
  ],
})
export class TmDashboardComponent implements OnInit, OnDestroy {
  private projectsSvc = inject(ProjectsService);
  private tasksSvc    = inject(TasksService);
  private membersSvc  = inject(TeamMembersService);
  private destroy$    = new Subject<void>();

  // ── Labels / Colors ──────────────────────────────────────────────────────────
  readonly PRIORITY_LABELS = PROJECT_PRIORITY_LABELS;
  readonly PRIORITY_COLORS = PROJECT_PRIORITY_COLORS;
  readonly STATUS_LABELS   = TASK_STATUS_LABELS;
  readonly STATUS_COLORS   = TASK_STATUS_COLORS;
  readonly ROLE_LABELS     = MEMBER_ROLE_LABELS;
  readonly ROLE_COLORS     = MEMBER_ROLE_COLORS;

  // ── State ────────────────────────────────────────────────────────────────────
  loading  = signal(true);
  projects = signal<Project[]>([]);
  tasks    = signal<Task[]>([]);
  members  = signal<TeamMember[]>([]);

  // ── Computed KPIs ────────────────────────────────────────────────────────────
  activeProjects = computed(() => this.projects().filter(p => p.status === 'active'));

  overdueTasks = computed(() =>
    this.tasks().filter(t =>
      t.dueDate && t.dueDate.toDate() < new Date() && t.status !== 'done'
    )
  );

  blockedTasks = computed(() => this.tasks().filter(t => t.status === 'blocked'));

  completedThisMonth = computed(() => {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.tasks().filter(t =>
      t.status === 'done' && t.completedAt && t.completedAt.toDate() >= start
    );
  });

  activeMembers = computed(() => this.members().filter(m => m.status === 'active'));

  memberWorkload = computed(() =>
    this.members()
      .filter(m => m.status === 'active')
      .map(m => ({
        ...m,
        pct: Math.min(100, Math.round((m.activeProjectIds.length / Math.max(1, 3)) * 100)),
      }))
  );

  // Tareas problemáticas (bloqueadas + vencidas), sin duplicados
  problemTasks = computed(() => {
    const blocked = this.blockedTasks();
    const overdueIds = new Set(this.overdueTasks().map(t => t.id));
    const extra = this.overdueTasks().filter(t => !blocked.find(b => b.id === t.id));
    return [...blocked, ...extra];
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 3) this.loading.set(false); };

    this.projectsSvc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: list => { this.projects.set(list); checkDone(); }, error: () => checkDone() });

    this.tasksSvc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: list => { this.tasks.set(list); checkDone(); }, error: () => checkDone() });

    this.membersSvc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: list => { this.members.set(list); checkDone(); }, error: () => checkDone() });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  daysOverdue(task: Task): number {
    if (!task.dueDate) return 0;
    const diff = new Date().getTime() - task.dueDate.toDate().getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  assigneeInitials(assigneeIds: string[]): string[] {
    return assigneeIds.slice(0, 3).map(id => id.substring(0, 2).toUpperCase());
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
