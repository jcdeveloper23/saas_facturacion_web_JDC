import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil, forkJoin, take } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { TimesheetsService }  from '../../services/timesheets.service';
import { TeamMembersService } from '../../services/team-members.service';
import { TimesheetEntry }     from '../../models/timesheet.interface';
import { TeamMember }         from '../../models/team-member.interface';

interface ReportRow {
  userId:       string;
  userName:     string;
  totalHours:   number;
  regularHours: number;
  overtimeHours: number;
  taskCount:    number;
  isOvertime:   boolean;
  capacityPct:  number;
}

@Component({
  selector: 'app-tm-reports',
  standalone: true,
  templateUrl: './tm-reports.component.html',
  imports: [
    CommonModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    IconModule,
  ],
})
export class TmReportsComponent implements OnInit, OnDestroy {
  private timesheetsSvc  = inject(TimesheetsService);
  private membersSvc     = inject(TeamMembersService);
  private destroy$       = new Subject<void>();

  // ── State ───────────────────────────────────────────────────────────────────
  loading    = signal(true);
  period     = signal<'week' | 'month'>('month');
  timesheets = signal<TimesheetEntry[]>([]);
  members    = signal<TeamMember[]>([]);

  // ── Computed ────────────────────────────────────────────────────────────────
  reportRows = computed((): ReportRow[] => {
    const grouped: Record<string, {
      userName: string;
      hours: number;
      overtime: number;
      taskIds: Set<string>;
    }> = {};

    this.timesheets().forEach(t => {
      if (!grouped[t.userId]) {
        grouped[t.userId] = { userName: t.userName, hours: 0, overtime: 0, taskIds: new Set() };
      }
      grouped[t.userId].hours += t.hours;
      if (t.type === 'overtime') grouped[t.userId].overtime += t.hours;
      grouped[t.userId].taskIds.add(t.taskId);
    });

    const membersMap = new Map(this.members().map(m => [m.userId, m.weeklyCapacityHours]));

    return Object.entries(grouped)
      .map(([userId, s]) => {
        const capacity    = membersMap.get(userId) ?? 40;
        const capacityPct = Math.round((s.hours / capacity) * 100);
        return {
          userId,
          userName:     s.userName,
          totalHours:   s.hours,
          overtimeHours: s.overtime,
          regularHours: s.hours - s.overtime,
          taskCount:    s.taskIds.size,
          isOvertime:   s.hours > 40,
          capacityPct,
        };
      })
      .sort((a, b) => b.totalHours - a.totalHours);
  });

  totalHours         = computed(() => this.reportRows().reduce((s, r) => s + r.totalHours, 0));
  totalOvertime      = computed(() => this.reportRows().reduce((s, r) => s + r.overtimeHours, 0));
  membersWithOvertime = computed(() => this.reportRows().filter(r => r.isOvertime).length);
  totalTasks         = computed(() => {
    const ids = new Set<string>();
    this.timesheets().forEach(t => ids.add(t.taskId));
    return ids.size;
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    forkJoin({
      timesheets: this.timesheetsSvc.getAll().pipe(take(1)),
      members:    this.membersSvc.getAll().pipe(take(1)),
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ({ timesheets, members }) => {
        this.timesheets.set(timesheets);
        this.members.set(members);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Interactions ─────────────────────────────────────────────────────────────
  setPeriod(p: 'week' | 'month'): void {
    this.period.set(p);
  }

  trackByUserId(_: number, row: ReportRow): string { return row.userId; }
}
