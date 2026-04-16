import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
  ProgressModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { TeamMembersService }  from '../../services/team-members.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  TeamMember, MemberRole, MemberStatus,
  MEMBER_ROLE_LABELS, MEMBER_ROLE_COLORS, MEMBER_STATUS_LABELS
} from '../../models/team-member.interface';

@Component({
  selector: 'app-members-list',
  standalone: true,
  templateUrl: './members-list.component.html',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    ProgressModule,
    IconModule,
  ],
})
export class MembersListComponent implements OnInit, OnDestroy {
  readonly router        = inject(Router);
  private svc            = inject(TeamMembersService);
  private notifications  = inject(NotificationService);
  private destroy$       = new Subject<void>();

  readonly ROLE_LABELS   = MEMBER_ROLE_LABELS;
  readonly ROLE_COLORS   = MEMBER_ROLE_COLORS;
  readonly STATUS_LABELS = MEMBER_STATUS_LABELS;

  // ── State ───────────────────────────────────────────────────────────────────
  loading      = signal(true);
  members      = signal<TeamMember[]>([]);
  roleFilter   = signal<MemberRole | 'all'>('all');
  statusFilter = signal<MemberStatus | 'all'>('active');

  // ── Computed ────────────────────────────────────────────────────────────────
  filtered = computed(() => {
    let list = this.members();
    if (this.roleFilter()   !== 'all') list = list.filter(m => m.role   === this.roleFilter());
    if (this.statusFilter() !== 'all') list = list.filter(m => m.status === this.statusFilter());
    return list;
  });

  membersWithLoad = computed(() =>
    this.filtered().map(m => ({
      ...m,
      loadPct:      Math.min(120, Math.round((m.activeProjectIds.length / 3) * 100)),
      isOverloaded: m.activeProjectIds.length > 3,
    }))
  );

  // KPI counts
  activeCount    = computed(() => this.members().filter(m => m.status   === 'active').length);
  devCount       = computed(() => this.members().filter(m => m.role     === 'developer').length);
  qaCount        = computed(() => this.members().filter(m => m.role     === 'qa').length);
  supportCount   = computed(() => this.members().filter(m => m.role     === 'support').length);

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.svc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  list => { this.members.set(list); this.loading.set(false); },
        error: ()   => this.loading.set(false),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map(w => w.charAt(0).toUpperCase())
      .join('');
  }

  getProgressColor(isOverloaded: boolean): string {
    return isOverloaded ? 'danger' : 'primary';
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
