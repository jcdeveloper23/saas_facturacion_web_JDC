import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective, FormCheckComponent,
  FormCheckInputDirective, FormCheckLabelDirective,
  AlertComponent, CalloutComponent,
  InputGroupComponent, InputGroupTextDirective
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../../../icons/icon-subset';
import { SettingsService } from '../../services/settings.service';
import { Warehouse, WarehouseFormData } from '../../models/settings.interfaces';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-warehouses',
  templateUrl: './warehouses.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    TableDirective, BadgeComponent, ButtonDirective, SpinnerComponent,
    RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective,
    AlertComponent, IconDirective, CalloutComponent,
    InputGroupComponent, InputGroupTextDirective
  ]
})
export class WarehousesComponent implements OnInit {
  private svc = inject(SettingsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private iconSet = inject(IconSetService);

  warehouses = signal<Warehouse[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  deletingId = signal<string | null>(null);
  editingId = signal<string | null>(null);
  errorMessage = signal('');

  constructor() {
    this.iconSet.icons = { ...iconSubset };
  }

  form = this.fb.group({
    code:    ['', Validators.required],
    name:    ['', Validators.required],
    address: [''],
    city:    [''],
    isMain:  [false],
    isActive: [true]
  });

  ngOnInit(): void {
    this.svc.getWarehouses().subscribe({
      next: (list) => { this.warehouses.set(list); this.loading.set(false); },
      error: (err) => {
        console.error('Error al cargar almacenes:', JSON.stringify(err, null, 2), err);
        this.notifications.error('Error al cargar almacenes');
        this.loading.set(false);
      }
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ isMain: false });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(w: Warehouse): void {
    this.editingId.set(w.id);
    this.form.patchValue({
      code: w.code,
      name: w.name,
      address: w.address ?? '',
      city: w.city ?? '',
      isMain: w.isMain,
      isActive: w.isActive
    });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      const data = this.form.getRawValue() as WarehouseFormData;
      const id = this.editingId();
      if (id) {
        await this.svc.updateWarehouse(id, data);
        this.notifications.success('Almacén actualizado');
      } else {
        await this.svc.createWarehouse(data);
        this.notifications.success('Almacén creado');
      }
      this.showModal.set(false);
    } catch (err: unknown) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(w: Warehouse): Promise<void> {
    if (w.isMain) { this.notifications.warning('No se puede eliminar el almacén principal'); return; }
    const ok = await this.notifications.confirm({
      title: `¿Eliminar el almacén "${w.name}"?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    this.deletingId.set(w.id);
    try {
      await this.svc.deleteWarehouse(w.id);
      this.notifications.success('Almacén eliminado');
    } catch {
      this.notifications.error('Error al eliminar almacén');
    } finally {
      this.deletingId.set(null);
    }
  }

  async toggleActive(w: Warehouse): Promise<void> {
    try {
      await this.svc.updateWarehouse(w.id, { isActive: !w.isActive });
      this.notifications.success('Estado actualizado');
    } catch {
      this.notifications.error('Error al actualizar estado');
    }
  }

  hasError(f: string): boolean {
    const c = this.form.get(f);
    return !!(c?.invalid && c?.touched);
  }

  trackById(_: number, item: Warehouse): string { return item.id; }
}
