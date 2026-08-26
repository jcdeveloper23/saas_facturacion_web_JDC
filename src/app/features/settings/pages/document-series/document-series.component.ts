import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CardComponent, CardBodyComponent,
  TableDirective, BadgeComponent, ButtonDirective, SpinnerComponent,
  RowComponent, ColComponent,
  ModalTitleDirective, ButtonCloseDirective, ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  FormLabelDirective, FormControlDirective, FormSelectDirective, AlertComponent,
  CalloutComponent, FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../../../icons/icon-subset';
import { SettingsService } from '../../services/settings.service';
import { DocumentSeries, DocumentSeriesFormData } from '../../models/settings.interfaces';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-document-series',
  templateUrl: './document-series.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, FormSelectDirective, AlertComponent, IconDirective,
    CalloutComponent, FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
  ]
})
export class DocumentSeriesComponent implements OnInit {
  private svc = inject(SettingsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private iconSet = inject(IconSetService);

  series = signal<DocumentSeries[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');

  constructor() {
    this.iconSet.icons = { ...iconSubset };
  }

  readonly docTypeLabels: Record<string, string> = {
    invoice:    'Factura',
    debitNote:  'Nota de Débito',
    retention:  'Retención',
    creditNote: 'Nota de Crédito',
    quote:      'Presupuesto',
    order:      'Pedido',
    remission:  'Remisión',
  };

  readonly docTypeOptions = Object.entries(this.docTypeLabels).map(([value, label]) => ({ value, label }));

  form = this.fb.group({
    code:           ['001', [Validators.required, Validators.pattern(/^\w{1,10}$/)]],
    name:           ['', Validators.required],
    description:    [''],
    documentType:   ['invoice', Validators.required],
    establishment:  ['001', [Validators.required, Validators.pattern(/^\d{3}$/)]],
    emissionPoint:  ['001', [Validators.required, Validators.pattern(/^\d{3}$/)]],
    isActive:       [true]
  });

  ngOnInit(): void {
    this.svc.getDocumentSeries().subscribe({
      next: (list) => { this.series.set(list); this.loading.set(false); },
      error: (err) => {
        console.error('Error al cargar series:', JSON.stringify(err, null, 2), err);
        this.notifications.error('Error al cargar series');
        this.loading.set(false);
      }
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ code: '001', documentType: 'invoice', establishment: '001', emissionPoint: '001' });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(s: DocumentSeries): void {
    this.editingId.set(s.id);
    this.form.patchValue({
      code: s.code,
      name: s.name,
      description: s.description ?? '',
      documentType: s.documentType,
      establishment: s.establishment,
      emissionPoint: s.emissionPoint,
      isActive: s.isActive
    });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      const data = this.form.getRawValue() as DocumentSeriesFormData;
      const id = this.editingId();
      if (id) {
        await this.svc.updateDocumentSeries(id, data);
        this.notifications.success('Serie actualizada');
      } else {
        await this.svc.createDocumentSeries(data);
        this.notifications.success('Serie creada');
      }
      this.showModal.set(false);
    } catch (err: unknown) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(s: DocumentSeries): Promise<void> {
    const ok = await this.notifications.confirm({
      title: `¿Eliminar la serie "${s.name}"?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    try {
      await this.svc.deleteDocumentSeries(s.id);
      this.notifications.success('Serie eliminada');
    } catch {
      this.notifications.error('Error al eliminar');
    }
  }

  async toggleActive(s: DocumentSeries): Promise<void> {
    try {
      await this.svc.updateDocumentSeries(s.id, { isActive: !s.isActive });
      this.notifications.success('Estado actualizado');
    } catch {
      this.notifications.error('Error al actualizar estado');
    }
  }

  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }

  trackById(_: number, item: DocumentSeries): string { return item.id; }
}
