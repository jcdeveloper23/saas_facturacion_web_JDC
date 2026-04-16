import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
  ProgressModule, TableModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { ProjectsService }     from '../../services/projects.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  Project, ProjectStatus, ProjectPriority,
  PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS,
  PROJECT_PRIORITY_LABELS, PROJECT_PRIORITY_COLORS
} from '../../models/project.interface';

@Component({
  selector: 'app-projects-list',
  standalone: true,
  templateUrl: './projects-list.component.html',
  imports: [
    CommonModule, FormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    ProgressModule, TableModule,
    IconModule,
  ],
})
export class ProjectsListComponent implements OnInit, OnDestroy {
  // ── Inject ─────────────────────────────────────────────────────────────────
  readonly router       = inject(Router);
  private svc           = inject(ProjectsService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── Constants ──────────────────────────────────────────────────────────────
  readonly STATUS_LABELS   = PROJECT_STATUS_LABELS;
  readonly STATUS_COLORS   = PROJECT_STATUS_COLORS;
  readonly PRIORITY_LABELS = PROJECT_PRIORITY_LABELS;
  readonly PRIORITY_COLORS = PROJECT_PRIORITY_COLORS;

  // ── Signals ────────────────────────────────────────────────────────────────
  loading      = signal(true);
  all          = signal<Project[]>([]);
  statusFilter = signal<ProjectStatus | 'all'>('all');
  searchTerm   = signal('');

  // ── Computed ───────────────────────────────────────────────────────────────
  filtered = computed(() => {
    let list = this.all();
    if (this.statusFilter() !== 'all') {
      list = list.filter(p => p.status === this.statusFilter());
    }
    const q = this.searchTerm().toLowerCase().trim();
    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.clientName?.toLowerCase().includes(q)
      );
    }
    return list;
  });

  stats = computed(() => ({
    total:     this.all().length,
    active:    this.all().filter(p => p.status === 'active').length,
    completed: this.all().filter(p => p.status === 'completed').length,
    overdue:   this.all().filter(p =>
      p.status !== 'completed' && p.status !== 'cancelled' &&
      !!p.dueDate && p.dueDate.toDate() < new Date()
    ).length,
  }));

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.svc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  list => { this.all.set(list); this.loading.set(false); },
        error: ()   => this.loading.set(false),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  setStatusFilter(status: ProjectStatus | 'all'): void {
    this.statusFilter.set(status);
  }

  async changeProjectStatus(p: Project, status: ProjectStatus): Promise<void> {
    const label = PROJECT_STATUS_LABELS[status];
    if (!confirm(`¿Cambiar estado del proyecto "${p.name}" a "${label}"?`)) return;
    try {
      await this.svc.changeStatus(p.id, status);
      this.notifications.success(`Proyecto actualizado a "${label}"`);
    } catch (err: any) {
      this.notifications.error('Error al cambiar estado: ' + (err?.message ?? err));
    }
  }

  async softDelete(p: Project): Promise<void> {
    if (!confirm(`¿Eliminar el proyecto "${p.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await this.svc.softDelete(p.id);
      this.notifications.success('Proyecto eliminado');
    } catch (err: any) {
      this.notifications.error('Error al eliminar: ' + (err?.message ?? err));
    }
  }

  isOverdue(p: Project): boolean {
    return p.status !== 'completed' && p.status !== 'cancelled' &&
           !!p.dueDate && p.dueDate.toDate() < new Date();
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
