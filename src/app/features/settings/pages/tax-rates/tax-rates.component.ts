import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective, FormSelectDirective,
  FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective,
  AlertComponent, CalloutComponent, InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../../../icons/icon-subset';
import { SettingsService } from '../../services/settings.service';
import { TaxRate, TaxRateFormData } from '../../models/settings.interfaces';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-tax-rates',
  templateUrl: './tax-rates.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, FormSelectDirective,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective,
    AlertComponent, IconDirective,
    CalloutComponent, InputGroupComponent, InputGroupTextDirective
  ]
})
export class TaxRatesComponent implements OnInit {
  private svc = inject(SettingsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private iconSet = inject(IconSetService);

  taxRates = signal<TaxRate[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');

  constructor() {
    this.iconSet.icons = { ...iconSubset };
  }

  form = this.fb.group({
    code:      ['', Validators.required],
    name:      ['', Validators.required],
    rate:      [15, [Validators.required, Validators.min(0), Validators.max(100)]],
    sriCode:   ['3', Validators.required],
    isDefault: [false],
    isActive:  [true]
  });

  readonly sriCodeOptions = [
    { value: '3', label: '3 — IVA 15%' },
    { value: '5', label: '5 — IVA 5%' },
    { value: '2', label: '2 — IVA 0%' },
    { value: '6', label: '6 — Exento' }
  ];

  ngOnInit(): void {
    this.svc.getTaxRates().subscribe({
      next: (list) => { this.taxRates.set(list); this.loading.set(false); },
      error: (err) => {
        console.error('Error al cargar impuestos:', JSON.stringify(err, null, 2), err);
        this.notifications.error('Error al cargar impuestos');
        this.loading.set(false);
      }
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ rate: 0, sriCode: '2', isDefault: false });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(t: TaxRate): void {
    this.editingId.set(t.id);
    this.form.patchValue({
      code: t.code,
      name: t.name,
      rate: t.rate,
      sriCode: t.sriCode,
      isDefault: t.isDefault,
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
      const data: TaxRateFormData = {
        code: this.form.value.code!,
        name: this.form.value.name!,
        rate: Number(this.form.value.rate),
        sriCode: this.form.value.sriCode!,
        isDefault: !!this.form.value.isDefault,
        isActive: !!this.form.value.isActive
      };
      const id = this.editingId();
      if (id) {
        // If setting as default, unset others first
        if (data.isDefault) {
          const allIds = this.taxRates().map(r => r.id);
          await this.svc.setDefaultTaxRate(id, allIds);
        }
        await this.svc.updateTaxRate(id, data);
        this.notifications.success('Impuesto actualizado');
      } else {
        await this.svc.createTaxRate(data);
        this.notifications.success('Impuesto creado');
      }
      this.showModal.set(false);
    } catch (err: unknown) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(t: TaxRate): Promise<void> {
    if (t.isDefault) { this.notifications.warning('No se puede eliminar el impuesto predeterminado'); return; }
    const ok = await this.notifications.confirm({
      title: `¿Eliminar el impuesto "${t.name}"?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    try {
      await this.svc.deleteTaxRate(t.id);
      this.notifications.success('Impuesto eliminado');
    } catch {
      this.notifications.error('Error al eliminar');
    }
  }

  async toggleActive(t: TaxRate): Promise<void> {
    try {
      await this.svc.updateTaxRate(t.id, { isActive: !t.isActive });
      this.notifications.success('Estado actualizado');
    } catch {
      this.notifications.error('Error al actualizar estado');
    }
  }

  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }

  trackById(_: number, item: TaxRate): string { return item.id; }
}
