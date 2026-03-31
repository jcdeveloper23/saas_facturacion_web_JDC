import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective, AlertComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { PlatformDefaultsService } from '../../../services/platform-defaults.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { DefaultTaxRate } from '../../../models/platform-defaults.interface';

@Component({
  selector: 'app-platform-tax-rates',
  templateUrl: './platform-tax-rates.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, AlertComponent, IconDirective
  ]
})
export class PlatformTaxRatesComponent implements OnInit, OnDestroy {
  private svc = inject(PlatformDefaultsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private subs = new Subscription();

  items = signal<DefaultTaxRate[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');

  form = this.fb.group({
    code:      ['', Validators.required],
    name:      ['', Validators.required],
    rate:      [0,  [Validators.required, Validators.min(0), Validators.max(100)]],
    sriCode:   ['', Validators.required],
    isDefault: [false],
    isActive:  [true]
  });

  ngOnInit(): void {
    this.subs.add(this.svc.getTaxRates().subscribe({
      next: list => { this.items.set(list); this.loading.set(false); },
      error: err => {
        console.error('[PlatformTaxRates] load error:', err);
        this.notifications.error('Error al cargar impuestos');
        this.loading.set(false);
      }
    }));
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ rate: 0, isDefault: false, isActive: true });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(item: DefaultTaxRate): void {
    this.editingId.set(item.id);
    this.form.patchValue(item);
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      const v = this.form.getRawValue();
      const data = {
        code: v.code!, name: v.name!, rate: Number(v.rate),
        sriCode: v.sriCode!, isDefault: !!v.isDefault, isActive: !!v.isActive
      };
      const id = this.editingId();
      if (id) {
        await this.svc.updateTaxRate(id, data);
        this.notifications.success('Impuesto actualizado');
      } else {
        await this.svc.addTaxRate(data);
        this.notifications.success('Impuesto agregado');
      }
      this.showModal.set(false);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(item: DefaultTaxRate): Promise<void> {
    if (!confirm(`¿Eliminar "${item.name}"?`)) return;
    try {
      await this.svc.deleteTaxRate(item.id);
      this.notifications.success('Impuesto eliminado');
    } catch { this.notifications.error('Error al eliminar'); }
  }

  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }
  trackById(_: number, item: { id: string }): string { return item.id; }
}
