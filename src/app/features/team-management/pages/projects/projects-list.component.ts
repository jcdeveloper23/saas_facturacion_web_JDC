import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
  ProgressModule, TableModule, TooltipModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { ProjectsService }     from '../../services/projects.service';
import { TeamMembersService }  from '../../services/team-members.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  Project, ProjectStatus, ProjectPriority,
  PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS,
  PROJECT_PRIORITY_LABELS, PROJECT_PRIORITY_COLORS
} from '../../models/project.interface';
import { TeamMember } from '../../models/team-member.interface';

@Component({
  selector: 'app-projects-list',
  standalone: true,
  templateUrl: './projects-list.component.html',
  imports: [
    CommonModule, FormsModule, RouterLink,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    ProgressModule, TableModule, TooltipModule,
    IconModule,
  ],
})
export class ProjectsListComponent implements OnInit, OnDestroy {
  // ── Inject ─────────────────────────────────────────────────────────────────
  readonly router       = inject(Router);
  private svc           = inject(ProjectsService);
  private membersSvc    = inject(TeamMembersService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  // ── Constants ──────────────────────────────────────────────────────────────
  readonly STATUS_LABELS   = PROJECT_STATUS_LABELS;
  readonly STATUS_COLORS   = PROJECT_STATUS_COLORS;
  readonly PRIORITY_LABELS = PROJECT_PRIORITY_LABELS;
  readonly PRIORITY_COLORS = PROJECT_PRIORITY_COLORS;

  readonly PROJECT_COLORS: string[] = [
    '#6366f1','#8b5cf6','#ec4899','#ef4444',
    '#f97316','#eab308','#22c55e','#14b8a6',
    '#06b6d4','#3b82f6','#6b7280','#1e293b',
  ];

  // ── Signals ────────────────────────────────────────────────────────────────
  loading      = signal(true);
  all          = signal<Project[]>([]);
  members      = signal<TeamMember[]>([]);
  statusFilter = signal<ProjectStatus | 'all'>('all');
  searchTerm   = signal('');
  viewMode     = signal<'cards' | 'table'>('cards');
  // Track which card's action menu is open
  openMenuId   = signal<string | null>(null);

  // ── Computed ───────────────────────────────────────────────────────────────
  /** Quick lookup: userId → TeamMember */
  membersMap = computed(() => {
    const map = new Map<string, TeamMember>();
    this.members().forEach(m => map.set(m.userId, m));
    return map;
  });

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
    onHold:    this.all().filter(p => p.status === 'on_hold').length,
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

    this.membersSvc.getActive()
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: list => this.members.set(list) });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  setStatusFilter(status: ProjectStatus | 'all'): void {
    this.statusFilter.set(status);
  }

  toggleView(): void {
    this.viewMode.set(this.viewMode() === 'cards' ? 'table' : 'cards');
  }

  toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  async changeProjectStatus(p: Project, status: ProjectStatus): Promise<void> {
    this.closeMenu();
    const label = PROJECT_STATUS_LABELS[status];
    const ok = await this.notifications.confirm({
      title: `¿Cambiar estado del proyecto "${p.name}" a "${label}"?`,
      confirmText: 'Sí, cambiar',
      cancelText: 'Cancelar',
      icon: 'question'
    });
    if (!ok) return;
    try {
      await this.svc.changeStatus(p.id, status);
      this.notifications.success(`Proyecto actualizado a "${label}"`);
    } catch (err: any) {
      this.notifications.error('Error al cambiar estado: ' + (err?.message ?? err));
    }
  }

  async softDelete(p: Project): Promise<void> {
    this.closeMenu();
    const ok = await this.notifications.confirm({
      title: `¿Eliminar el proyecto "${p.name}"?`,
      text: 'Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
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

  daysLeft(p: Project): number {
    if (!p.dueDate) return 0;
    const diff = p.dueDate.toDate().getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /** Return up to maxShow member avatars + overflow count */
  visibleMembers(p: Project, maxShow = 4): { members: TeamMember[], overflow: number } {
    const map = this.membersMap();
    const all = (p.memberIds ?? [])
      .map(uid => map.get(uid))
      .filter((m): m is TeamMember => !!m);
    return {
      members:  all.slice(0, maxShow),
      overflow: Math.max(0, all.length - maxShow),
    };
  }

  /** Get initials for an avatar fallback */
  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  /** Deterministic background color for a member avatar (no avatarUrl) */
  getMemberColor(m: TeamMember): string {
    const hash = (m.userId + m.displayName)
      .split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return this.PROJECT_COLORS[hash % this.PROJECT_COLORS.length];
  }

  /** Progress bar color based on % */
  progressColor(pct: number): string {
    if (pct >= 80) return '#22c55e';
    if (pct >= 40) return '#6366f1';
    return '#94a3b8';
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
