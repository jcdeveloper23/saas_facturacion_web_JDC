import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toObservable } from '@angular/core/rxjs-interop';
import { Subject, takeUntil, switchMap } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { TimesheetsService }   from '../../services/timesheets.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  TimesheetEntry,
  TIMESHEET_TYPE_LABELS, TIMESHEET_TYPE_COLORS
} from '../../models/timesheet.interface';

@Component({
  selector: 'app-timesheets-list',
  standalone: true,
  templateUrl: './timesheets-list.component.html',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule, AlertModule,
    IconModule,
  ],
})
export class TimesheetsListComponent implements OnInit, OnDestroy {
  readonly router        = inject(Router);
  private svc            = inject(TimesheetsService);
  private notifications  = inject(NotificationService);
  private destroy$       = new Subject<void>();

  readonly TYPE_LABELS = TIMESHEET_TYPE_LABELS;
  readonly TYPE_COLORS = TIMESHEET_TYPE_COLORS;

  // ── State ───────────────────────────────────────────────────────────────────
  loading           = signal(true);
  all               = signal<TimesheetEntry[]>([]);
  userFilter        = signal<string>('all');
  projectFilter     = signal<string>('all');
  selectedWeekStart = signal<Date>(this.getMonday(new Date()));

  // ── Computed ────────────────────────────────────────────────────────────────
  filtered = computed(() => {
    let list = this.all();
    if (this.userFilter()    !== 'all') list = list.filter(t => t.userId    === this.userFilter());
    if (this.projectFilter() !== 'all') list = list.filter(t => t.projectId === this.projectFilter());
    return list;
  });

  selectedWeekEnd = computed(() => this.getWeekEnd(this.selectedWeekStart()));

  weekLabel = computed(() => {
    const s = this.selectedWeekStart();
    const e = this.selectedWeekEnd();
    return `${s.getDate()} ${s.toLocaleString('es', { month: 'short' })} – ${e.getDate()} ${e.toLocaleString('es', { month: 'short' })}`;
  });

  weeklyTotal   = computed(() => this.filtered().reduce((s, t) => s + t.hours, 0));
  overtimeHours = computed(() => Math.max(0, this.weeklyTotal() - 40));
  isOvertime    = computed(() => this.overtimeHours() > 0);
  pendingCount  = computed(() => this.filtered().filter(t => !t.approved).length);

  // Listas únicas para los selectores
  uniqueUsers = computed(() => {
    const seen = new Map<string, string>();
    this.all().forEach(t => { if (!seen.has(t.userId)) seen.set(t.userId, t.userName); });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  });

  uniqueProjects = computed(() => {
    const seen = new Map<string, string>();
    this.all().forEach(t => { if (!seen.has(t.projectId)) seen.set(t.projectId, t.projectName); });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    toObservable(this.selectedWeekStart)
      .pipe(
        switchMap(startDate => {
          this.loading.set(true);
          const start = Timestamp.fromDate(startDate);
          const end   = Timestamp.fromDate(this.getWeekEnd(startDate));
          return this.svc.getAllByDateRange(start, end);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next:  list => { this.all.set(list); this.loading.set(false); },
        error: ()   => this.loading.set(false),
      });
  }

  // ── Week navigation helpers ─────────────────────────────────────────────────
  prevWeek(): void {
    this.selectedWeekStart.update(d => {
      const n = new Date(d);
      n.setDate(n.getDate() - 7);
      return n;
    });
  }

  nextWeek(): void {
    this.selectedWeekStart.update(d => {
      const n = new Date(d);
      n.setDate(n.getDate() + 7);
      return n;
    });
  }

  private getMonday(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private getWeekEnd(startDate: Date): Date {
    const end = new Date(startDate);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Interactions ─────────────────────────────────────────────────────────────
  async approve(id: string): Promise<void> {
    try {
      await this.svc.approve(id);
      this.notifications.success('Registro aprobado correctamente');
    } catch (err: any) {
      this.notifications.error('Error al aprobar: ' + (err?.message ?? err));
    }
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
