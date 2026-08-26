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
import { DefaultDocumentSeries } from '../../../models/platform-defaults.interface';

@Component({
  selector: 'app-platform-document-series',
  templateUrl: './platform-document-series.component.html',
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
export class PlatformDocumentSeriesComponent implements OnInit, OnDestroy {
  private svc = inject(PlatformDefaultsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private subs = new Subscription();

  items = signal<DefaultDocumentSeries[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');

  readonly documentTypes = [
    { value: 'invoice',       label: 'Factura' },
    { value: 'creditNote',    label: 'Nota de Crédito' },
    { value: 'debitNote',     label: 'Nota de Débito' },
    { value: 'retention',     label: 'Retención' },
    { value: 'quote',         label: 'Presupuesto' },
    { value: 'order',         label: 'Pedido' },
    { value: 'remission',     label: 'Remisión' },
  ];

  form = this.fb.group({
    code:         ['', Validators.required],
    name:         ['', Validators.required],
    documentType: ['', Validators.required],
    isActive:     [true]
  });

  ngOnInit(): void {
    this.subs.add(this.svc.getDocumentSeries().subscribe({
      next: list => { this.items.set(list); this.loading.set(false); },
      error: err => {
        console.error('[PlatformDocumentSeries] load error:', err);
        this.notifications.error('Error al cargar series de documentos');
        this.loading.set(false);
      }
    }));
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ isActive: true });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(item: DefaultDocumentSeries): void {
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
      const data = { code: v.code!, name: v.name!, documentType: v.documentType!, isActive: !!v.isActive };
      const id = this.editingId();
      if (id) {
        await this.svc.updateDocumentSeries(id, data);
        this.notifications.success('Serie actualizada');
      } else {
        await this.svc.addDocumentSeries(data);
        this.notifications.success('Serie agregada');
      }
      this.showModal.set(false);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(item: DefaultDocumentSeries): Promise<void> {
    const ok = await this.notifications.confirm({
      title: `¿Eliminar "${item.name}"?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    try {
      await this.svc.deleteDocumentSeries(item.id);
      this.notifications.success('Serie eliminada');
    } catch { this.notifications.error('Error al eliminar'); }
  }

  getDocTypeName(value: string): string {
    return this.documentTypes.find(t => t.value === value)?.label ?? value;
  }

  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }
  trackById(_: number, item: { id: string }): string { return item.id; }
}
