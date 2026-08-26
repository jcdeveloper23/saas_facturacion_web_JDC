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
import { DefaultWarehouse } from '../../../models/platform-defaults.interface';

@Component({
  selector: 'app-platform-warehouses',
  templateUrl: './platform-warehouses.component.html',
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
export class PlatformWarehousesComponent implements OnInit, OnDestroy {
  private svc = inject(PlatformDefaultsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private subs = new Subscription();

  items = signal<DefaultWarehouse[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');

  form = this.fb.group({
    code:    ['', Validators.required],
    name:    ['', Validators.required],
    isMain:  [false],
    isActive:[true]
  });

  ngOnInit(): void {
    this.subs.add(this.svc.getWarehouses().subscribe({
      next: list => { this.items.set(list); this.loading.set(false); },
      error: err => {
        console.error('[PlatformWarehouses] load error:', err);
        this.notifications.error('Error al cargar bodegas');
        this.loading.set(false);
      }
    }));
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ isMain: false, isActive: true });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(item: DefaultWarehouse): void {
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
      const data = { code: v.code!, name: v.name!, isMain: !!v.isMain, isActive: !!v.isActive };
      const id = this.editingId();
      if (id) {
        await this.svc.updateWarehouse(id, data);
        this.notifications.success('Bodega actualizada');
      } else {
        await this.svc.addWarehouse(data);
        this.notifications.success('Bodega agregada');
      }
      this.showModal.set(false);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(item: DefaultWarehouse): Promise<void> {
    const ok = await this.notifications.confirm({
      title: `¿Eliminar "${item.name}"?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    try {
      await this.svc.deleteWarehouse(item.id);
      this.notifications.success('Bodega eliminada');
    } catch { this.notifications.error('Error al eliminar'); }
  }

  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }
  trackById(_: number, item: { id: string }): string { return item.id; }
}
