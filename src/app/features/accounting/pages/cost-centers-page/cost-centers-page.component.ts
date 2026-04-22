import {
  Component, OnInit, OnDestroy, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subject, takeUntil, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  CardModule, ButtonModule, GridModule, BadgeModule,
  SpinnerModule, TableModule, FormModule, ModalModule, TooltipModule,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { CostCentersService }  from '../../services/cost-centers.service';
import { NotificationService } from '../../../../core/services/notification.service';
import {
  CostCenter, CostCenterType,
  COST_CENTER_TYPE_LABELS, COST_CENTER_TYPE_COLORS
} from '../../models/cost-center.interface';

@Component({
  selector: 'app-cost-centers-page',
  standalone: true,
  templateUrl: './cost-centers-page.component.html',
  styleUrl:    './cost-centers-page.component.scss',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    CardModule, ButtonModule, GridModule, BadgeModule, SpinnerModule,
    TableModule, FormModule, ModalModule, TooltipModule, IconModule,
    InputGroupComponent, InputGroupTextDirective
  ]
})
export class CostCentersPageComponent implements OnInit, OnDestroy {
  private svc           = inject(CostCentersService);
  private notifications = inject(NotificationService);
  private fb            = inject(FormBuilder);
  private destroy$      = new Subject<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  centers    = signal<CostCenter[]>([]);
  loading    = signal(true);
  searchTerm = signal('');
  showModal  = signal(false);
  editingId  = signal<string | null>(null);
  saving     = signal(false);

  // ── Form ──────────────────────────────────────────────────────────────────
  form = this.fb.group({
    code:        ['', Validators.required],
    name:        ['', [Validators.required, Validators.minLength(2)]],
    type:        ['centro' as CostCenterType, Validators.required],
    description: [''],
    parentId:    [null as string | null],
    isActive:    [true as boolean]
  });

  readonly TYPE_LABELS = COST_CENTER_TYPE_LABELS;
  readonly TYPE_COLORS = COST_CENTER_TYPE_COLORS;
  readonly centerTypes: CostCenterType[] = ['centro','proyecto','departamento'];

  // ── Computed ──────────────────────────────────────────────────────────────
  filtered = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    let list = this.centers();
    if (term) list = list.filter(c =>
      c.code.toLowerCase().includes(term) ||
      c.name.toLowerCase().includes(term)
    );
    return list;
  });

  parentOptions = computed(() =>
    this.centers().filter(c => c.isActive && c.id !== this.editingId())
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.svc.getCostCenters().pipe(
      catchError(err => {
        this.notifications.error('Error cargando centros de costo: ' + (err?.message ?? err));
        this.loading.set(false);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(list => {
      this.centers.set(list);
      this.loading.set(false);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ code: '', name: '', type: 'centro', description: '', parentId: null, isActive: true });
    this.showModal.set(true);
  }

  openEdit(cc: CostCenter, event: Event): void {
    event.stopPropagation();
    this.editingId.set(cc.id);
    this.form.patchValue({
      code:        cc.code,
      name:        cc.name,
      type:        cc.type,
      description: cc.description ?? '',
      parentId:    cc.parentId,
      isActive:    cc.isActive
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.editingId.set(null);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const v = this.form.value;
    const input = {
      code:        v.code!.trim(),
      name:        v.name!.trim(),
      type:        v.type! as CostCenterType,
      description: v.description ?? '',
      parentId:    v.parentId || null,
      isActive:    v.isActive ?? true
    };

    try {
      const id = this.editingId();
      if (id) {
        await this.svc.updateCostCenter(id, input);
        this.notifications.success('Centro de costo actualizado');
      } else {
        await this.svc.createCostCenter(input);
        this.notifications.success('Centro de costo creado');
      }
      this.closeModal();
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  // ── Toggle / Delete ───────────────────────────────────────────────────────
  async toggleActive(cc: CostCenter, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.svc.toggleActive(cc.id, !cc.isActive);
      this.notifications.success(cc.isActive ? 'Centro inactivado' : 'Centro activado');
    } catch (err: any) {
      this.notifications.error('Error: ' + (err?.message ?? err));
    }
  }

  async delete(cc: CostCenter, event: Event): Promise<void> {
    event.stopPropagation();
    if (!confirm(`¿Eliminar centro de costo "${cc.name}"?`)) return;
    try {
      await this.svc.deleteCostCenter(cc.id);
      this.notifications.success('Centro de costo eliminado');
    } catch (err: any) {
      this.notifications.error('Error al eliminar: ' + (err?.message ?? err));
    }
  }

  getParentName(parentId: string | null): string {
    if (!parentId) return '—';
    return this.centers().find(c => c.id === parentId)?.name ?? '—';
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
