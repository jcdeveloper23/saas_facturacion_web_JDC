import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective,
  AlertComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SuperAdminService } from '../../services/super-admin.service';
import { Plan, PlanFormData } from '../../models/plan.interface';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-plans',
  templateUrl: './plans.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective,
    AlertComponent,
    IconDirective
  ]
})
export class PlansComponent implements OnInit {
  private svc = inject(SuperAdminService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);

  plans = signal<Plan[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    price: [0, [Validators.required, Validators.min(0)]],
    isActive: [true],
    limits: this.fb.group({
      users:            [5,   [Validators.required, Validators.min(1)]],
      invoicesPerMonth: [100, [Validators.required, Validators.min(1)]],
      warehouses:       [1,   [Validators.required, Validators.min(1)]],
      storageGb:        [1,   [Validators.required, Validators.min(1)]]
    })
  });

  ngOnInit(): void {
    this.svc.getPlans().subscribe({
      next: (list) => { this.plans.set(list); this.loading.set(false); },
      error: (err) => {
        console.error('Error al cargar planes:', JSON.stringify(err, null, 2), err);
        this.notifications.error('Error al cargar planes');
        this.loading.set(false);
      }
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({
      price: 0, isActive: true,
      limits: { users: 5, invoicesPerMonth: 100, warehouses: 1, storageGb: 1 }
    });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(plan: Plan): void {
    this.editingId.set(plan.id);
    this.form.patchValue({
      name: plan.name, price: plan.price, isActive: plan.isActive,
      limits: {
        users:            plan.limits.users,
        invoicesPerMonth: plan.limits.invoicesPerMonth,
        warehouses:       plan.limits.warehouses,
        storageGb:        plan.limits.storageGb
      }
    });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      const v = this.form.getRawValue();
      const data: PlanFormData = {
        name: v.name!,
        price: Number(v.price),
        isActive: v.isActive!,
        features: [],
        limits: {
          users:            Number(v.limits!.users),
          invoicesPerMonth: Number(v.limits!.invoicesPerMonth),
          warehouses:       Number(v.limits!.warehouses),
          storageGb:        Number(v.limits!.storageGb)
        }
      };
      const id = this.editingId();
      if (id) {
        await this.svc.updatePlan(id, data);
        this.notifications.success('Plan actualizado');
      } else {
        await this.svc.createPlan(data);
        this.notifications.success('Plan creado');
      }
      this.showModal.set(false);
    } catch (err: unknown) {
      console.error('Error al guardar el plan:', JSON.stringify(err, null, 2), err);
      this.errorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async deactivate(plan: Plan): Promise<void> {
    if (!confirm(`¿Desactivar el plan "${plan.name}"?`)) return;
    try {
      await this.svc.deactivatePlan(plan.id);
      this.notifications.success('Plan desactivado');
    } catch (err) {
      console.error('Error al desactivar el plan:', JSON.stringify(err, null, 2), err);
      this.notifications.error('Error al desactivar el plan');
    }
  }

  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  trackById(_: number, item: Plan): string { return item.id; }
}
