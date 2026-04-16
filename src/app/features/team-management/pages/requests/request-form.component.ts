import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import {
  FormControl, FormGroup, Validators, ReactiveFormsModule
} from '@angular/forms';
import { Subject, takeUntil, take } from 'rxjs';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, FormModule, AlertModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { RequestsService }    from '../../services/requests.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  ClientRequest, RequestType, RequestStatus, RequestUrgency,
  REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS,
  REQUEST_TYPE_LABELS, REQUEST_URGENCY_COLORS
} from '../../models/request.interface';

@Component({
  selector: 'app-request-form',
  standalone: true,
  templateUrl: './request-form.component.html',
  imports: [
    CommonModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule,
    SpinnerModule, FormModule, AlertModule,
    IconModule,
  ],
})
export class RequestFormComponent implements OnInit, OnDestroy {
  private svc           = inject(RequestsService);
  private notifications = inject(NotificationService);
  private router        = inject(Router);
  private route         = inject(ActivatedRoute);
  private destroy$      = new Subject<void>();

  readonly STATUS_LABELS  = REQUEST_STATUS_LABELS;
  readonly STATUS_COLORS  = REQUEST_STATUS_COLORS;
  readonly TYPE_LABELS    = REQUEST_TYPE_LABELS;
  readonly URGENCY_COLORS = REQUEST_URGENCY_COLORS;

  readonly urgencyLabels: Record<string, string> = {
    low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica'
  };

  // ── State ───────────────────────────────────────────────────────────────────
  requestId = signal<string | null>(null);
  loading   = signal(false);
  saving    = signal(false);
  request   = signal<ClientRequest | null>(null);

  // ── Computed ────────────────────────────────────────────────────────────────
  isEditing = computed(() => !!this.requestId());

  pageTitle = computed(() =>
    this.isEditing() ? 'Editar Solicitud' : 'Nueva Solicitud'
  );

  showRejectedReason = computed(() => this.form.get('status')?.value === 'rejected');

  // ── Form ────────────────────────────────────────────────────────────────────
  form = new FormGroup({
    title:           new FormControl('', [Validators.required, Validators.minLength(5)]),
    description:     new FormControl('', Validators.required),
    type:            new FormControl<RequestType>('feature', Validators.required),
    urgency:         new FormControl<RequestUrgency>('medium', Validators.required),
    status:          new FormControl<RequestStatus>('new', Validators.required),
    clientId:        new FormControl('', Validators.required),
    clientName:      new FormControl('', Validators.required),
    projectId:       new FormControl(''),
    projectName:     new FormControl(''),
    assignedToId:    new FormControl(''),
    assignedToName:  new FormControl(''),
    estimatedHours:  new FormControl(0),
    agreedDate:      new FormControl(''),
    rejectedReason:  new FormControl(''),
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.requestId.set(id);
      this.loading.set(true);
      this.svc.getById(id)
        .pipe(take(1), takeUntil(this.destroy$))
        .subscribe({
          next: r => {
            this.loading.set(false);
            if (!r) { this.router.navigate(['/team-management/requests']); return; }
            this.request.set(r);
            this.patchForm(r);
          },
          error: () => {
            this.loading.set(false);
            this.notifications.error('No se pudo cargar la solicitud');
          },
        });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Private helpers ──────────────────────────────────────────────────────────
  private patchForm(r: ClientRequest): void {
    this.form.patchValue({
      title:          r.title,
      description:    r.description,
      type:           r.type,
      urgency:        r.urgency,
      status:         r.status,
      clientId:       r.clientId,
      clientName:     r.clientName,
      projectId:      r.projectId ?? '',
      projectName:    r.projectName ?? '',
      assignedToId:   r.assignedToId ?? '',
      assignedToName: r.assignedToName ?? '',
      estimatedHours: r.estimatedHours ?? 0,
      agreedDate:     r.agreedDate ? this.tsToDateInput(r.agreedDate as any) : '',
      rejectedReason: r.rejectedReason ?? '',
    });
  }

  private tsToDateInput(ts: { toDate: () => Date }): string {
    return ts.toDate().toISOString().substring(0, 10);
  }

  // ── Form helpers ──────────────────────────────────────────────────────────────
  hasError(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && c?.touched);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.notifications.error('Por favor complete los campos requeridos');
      return;
    }

    this.saving.set(true);
    const v = this.form.value;

    try {
      if (this.isEditing()) {
        const changes: any = {
          title:          v.title!,
          description:    v.description!,
          type:           v.type!,
          urgency:        v.urgency!,
          clientId:       v.clientId!,
          clientName:     v.clientName!,
          projectId:      v.projectId  || undefined,
          projectName:    v.projectName || undefined,
          assignedToId:   v.assignedToId  || undefined,
          assignedToName: v.assignedToName || undefined,
          estimatedHours: v.estimatedHours ?? 0,
          rejectedReason: v.rejectedReason || undefined,
        };

        // Handle status change separately
        if (v.status !== this.request()?.status) {
          await this.svc.changeStatus(
            this.requestId()!,
            v.status!,
            v.rejectedReason || undefined
          );
        }
        await this.svc.update(this.requestId()!, changes);
        this.notifications.success('Solicitud actualizada correctamente');
      } else {
        const payload: any = {
          title:          v.title!,
          description:    v.description!,
          type:           v.type!,
          urgency:        v.urgency!,
          status:         v.status!,
          clientId:       v.clientId!,
          clientName:     v.clientName!,
          projectId:      v.projectId  || undefined,
          projectName:    v.projectName || undefined,
          assignedToId:   v.assignedToId  || undefined,
          assignedToName: v.assignedToName || undefined,
          estimatedHours: v.estimatedHours ?? 0,
          rejectedReason: v.rejectedReason || undefined,
          attachments:    [],
        };
        await this.svc.create(payload);
        this.notifications.success('Solicitud creada correctamente');
      }
      this.router.navigate(['/team-management/requests']);
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/team-management/requests']);
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
