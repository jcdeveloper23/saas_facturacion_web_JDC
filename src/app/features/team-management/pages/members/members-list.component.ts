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

import { Timestamp }            from '@angular/fire/firestore';
import { TeamMembersService }   from '../../services/team-members.service';
import { TimesheetsService }    from '../../services/timesheets.service';
import { NotificationService }  from '../../../../core/services/notification.service';
import {
  TeamMember, MemberRole, MemberStatus,
  MEMBER_ROLE_LABELS, MEMBER_ROLE_COLORS, MEMBER_STATUS_LABELS
} from '../../models/team-member.interface';
import { TimesheetEntry } from '../../models/timesheet.interface';

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
  readonly router          = inject(Router);
  private svc              = inject(TeamMembersService);
  private timesheetsSvc    = inject(TimesheetsService);
  private notifications    = inject(NotificationService);
  private destroy$         = new Subject<void>();

  readonly ROLE_LABELS   = MEMBER_ROLE_LABELS;
  readonly ROLE_COLORS   = MEMBER_ROLE_COLORS;
  readonly STATUS_LABELS = MEMBER_STATUS_LABELS;

  // ── State ───────────────────────────────────────────────────────────────────
  loading      = signal(true);
  members      = signal<TeamMember[]>([]);
  timesheets   = signal<TimesheetEntry[]>([]);
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
    this.filtered().map(m => {
      const hoursThisWeek = this.timesheets()
        .filter(t => t.userId === m.userId)
        .reduce((sum, t) => sum + t.hours, 0);
      const pct = Math.round((hoursThisWeek / Math.max(1, m.weeklyCapacityHours)) * 100);
      return {
        ...m,
        hoursThisWeek,
        loadPct:      Math.min(120, pct),
        isOverloaded: pct > 100,
      };
    })
  );

  // KPI counts
  activeCount    = computed(() => this.members().filter(m => m.status   === 'active').length);
  devCount       = computed(() => this.members().filter(m => m.role     === 'developer').length);
  qaCount        = computed(() => this.members().filter(m => m.role     === 'qa').length);
  supportCount   = computed(() => this.members().filter(m => m.role     === 'support').length);

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 2) this.loading.set(false); };

    this.svc.getAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  list => { this.members.set(list); checkDone(); },
        error: ()   => checkDone(),
      });

    const weekStart = Timestamp.fromDate(this.getWeekStart());
    const weekEnd   = Timestamp.fromMillis(Date.now());
    this.timesheetsSvc.getAllByDateRange(weekStart, weekEnd)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  list => { this.timesheets.set(list); checkDone(); },
        error: ()   => checkDone(),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  private getWeekStart(): Date {
    const d   = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }

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
