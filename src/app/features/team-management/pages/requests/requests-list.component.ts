import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { RequestsService }    from '../../services/requests.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  ClientRequest, RequestStatus, RequestType,
  REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS,
  REQUEST_TYPE_LABELS, REQUEST_URGENCY_COLORS
} from '../../models/request.interface';

@Component({
  selector: 'app-requests-list',
  standalone: true,
  templateUrl: './requests-list.component.html',
  imports: [
    CommonModule, FormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule, AlertModule,
    IconModule,
  ],
})
export class RequestsListComponent implements OnInit, OnDestroy {
  readonly router       = inject(Router);
  private svc           = inject(RequestsService);
  private notifications = inject(NotificationService);
  private destroy$      = new Subject<void>();

  readonly STATUS_LABELS   = REQUEST_STATUS_LABELS;
  readonly STATUS_COLORS   = REQUEST_STATUS_COLORS;
  readonly TYPE_LABELS     = REQUEST_TYPE_LABELS;
  readonly URGENCY_COLORS  = REQUEST_URGENCY_COLORS;

  readonly urgencyLabels: Record<string, string> = {
    low:      'Baja',
    medium:   'Media',
    high:     'Alta',
    critical: 'Crítica',
  };

  // ── State ───────────────────────────────────────────────────────────────────
  loading      = signal(true);
  all          = signal<ClientRequest[]>([]);
  statusFilter = signal<RequestStatus | 'all'>('all');
  typeFilter   = signal<RequestType | 'all'>('all');
  searchTerm   = signal('');

  // ── Computed ────────────────────────────────────────────────────────────────
  filtered = computed(() => {
    const term   = this.searchTerm().toLowerCase().trim();
    const status = this.statusFilter();
    const type   = this.typeFilter();
    return this.all().filter(r => {
      if (status !== 'all' && r.status !== status) return false;
      if (type   !== 'all' && r.type   !== type)   return false;
      if (!term) return true;
      return (
        r.title.toLowerCase().includes(term) ||
        r.clientName.toLowerCase().includes(term) ||
        (r.assignedToName ?? '').toLowerCase().includes(term)
      );
    });
  });

  newCount    = computed(() => this.all().filter(r => r.status === 'new').length);
  urgentCount = computed(() =>
    this.all().filter(r => r.urgency === 'critical' && r.status !== 'resolved').length
  );
  resolvedCount = computed(() => this.all().filter(r => r.status === 'resolved').length);

  // ── Lifecycle ────────────────────────────────────────────────────────────────
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

  // ── Interactions ─────────────────────────────────────────────────────────────
  setStatusFilter(v: RequestStatus | 'all'): void { this.statusFilter.set(v); }
  setTypeFilter(v: RequestType | 'all'): void     { this.typeFilter.set(v); }
  onSearch(v: string): void                        { this.searchTerm.set(v); }

  async changeStatus(r: ClientRequest, toStatus: RequestStatus): Promise<void> {
    try {
      await this.svc.changeStatus(r.id, toStatus);
      this.notifications.success(`Solicitud actualizada a "${REQUEST_STATUS_LABELS[toStatus]}"`);
    } catch (err: any) {
      this.notifications.error('Error al cambiar estado: ' + (err?.message ?? err));
    }
  }

  async goCreateTask(r: ClientRequest): Promise<void> {
    try {
      await this.svc.changeStatus(r.id, 'in_progress');
    } catch (err: any) {
      this.notifications.error('Error al actualizar estado: ' + (err?.message ?? err));
      return;
    }
    this.router.navigate(['/team-management/tasks/new'], {
      queryParams: { requestId: r.id, requestTitle: r.title, projectId: r.projectId ?? '' }
    });
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
