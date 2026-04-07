import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective, AlertComponent,
  CalloutComponent, FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../../../icons/icon-subset';
import { SettingsService } from '../../services/settings.service';
import { PaymentTerm, PaymentTermFormData } from '../../models/settings.interfaces';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-payment-terms',
  templateUrl: './payment-terms.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, AlertComponent, IconDirective,
    CalloutComponent, FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
  ]
})
export class PaymentTermsComponent implements OnInit {
  private svc = inject(SettingsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private iconSet = inject(IconSetService);

  terms = signal<PaymentTerm[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');

  constructor() {
    this.iconSet.icons = { ...iconSubset };
  }

  form = this.fb.group({
    code: ['', Validators.required],
    name: ['', Validators.required],
    days: [0,  [Validators.required, Validators.min(0)]],
    isActive: [true]
  });

  ngOnInit(): void {
    this.svc.getPaymentTerms().subscribe({
      next: (list) => { this.terms.set(list); this.loading.set(false); },
      error: (err) => {
        console.error('Error al cargar condiciones de pago:', JSON.stringify(err, null, 2), err);
        this.notifications.error('Error al cargar condiciones de pago');
        this.loading.set(false);
      }
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ days: 0 });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(t: PaymentTerm): void {
    this.editingId.set(t.id);
    this.form.patchValue({
      code: t.code,
      name: t.name,
      days: t.days,
      isActive: t.isActive
    });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      const data: PaymentTermFormData = {
        code: this.form.value.code!,
        name: this.form.value.name!,
        days: Number(this.form.value.days),
        isActive: !!this.form.value.isActive
      };
      const id = this.editingId();
      if (id) {
        await this.svc.updatePaymentTerm(id, data);
        this.notifications.success('Condición actualizada');
      } else {
        await this.svc.createPaymentTerm(data);
        this.notifications.success('Condición creada');
      }
      this.showModal.set(false);
    } catch (err: unknown) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(t: PaymentTerm): Promise<void> {
    if (!confirm(`¿Eliminar la condición "${t.name}"?`)) return;
    try {
      await this.svc.deletePaymentTerm(t.id);
      this.notifications.success('Condición eliminada');
    } catch {
      this.notifications.error('Error al eliminar');
    }
  }

  async toggleActive(t: PaymentTerm): Promise<void> {
    try {
      await this.svc.updatePaymentTerm(t.id, { isActive: !t.isActive });
      this.notifications.success('Estado actualizado');
    } catch {
      this.notifications.error('Error al actualizar estado');
    }
  }

  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }

  trackById(_: number, item: PaymentTerm): string { return item.id; }
}
