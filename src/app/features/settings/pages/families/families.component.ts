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
  AlertComponent, CalloutComponent
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../../../icons/icon-subset';
import { FamiliesService, FamilyCreateInput } from '../../../products/services/families.service';
import { Family } from '../../../products/models/product.interface';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-families',
  templateUrl: './families.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, FormSelectDirective,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective,
    AlertComponent, IconDirective, CalloutComponent
  ]
})
export class FamiliesComponent implements OnInit {
  private svc = inject(FamiliesService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private iconSet = inject(IconSetService);

  familiesRaw = signal<Family[]>([]);
  familiesTree = signal<(Family & { depth: number })[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');

  constructor() {
    this.iconSet.icons = { ...iconSubset };
  }

  form = this.fb.group({
    code:           ['', [Validators.required, Validators.maxLength(8)]],
    name:           ['', Validators.required],
    parentId:       ['' as string | null],
    accountingCode: [''],
    isActive:       [true]
  });

  /** Root families only — used to populate parentId select */
  get rootFamilies(): Family[] {
    return this.familiesRaw().filter(f => !f.parentId);
  }

  ngOnInit(): void {
    this.svc.getAll().subscribe({
      next: (list) => {
        this.familiesRaw.set(list);
        this.familiesTree.set(this.svc.toTree(list));
        this.loading.set(false);
      },
      error: () => {
        this.notifications.error('Error al cargar familias');
        this.loading.set(false);
      }
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ code: '', name: '', parentId: null, accountingCode: '', isActive: true });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(f: Family): void {
    this.editingId.set(f.id);
    this.form.patchValue({
      code:           f.code,
      name:           f.name,
      parentId:       f.parentId ?? null,
      accountingCode: f.accountingCode ?? '',
      isActive:       f.isActive
    });
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      const parentId = this.form.value.parentId || null;
      const parent   = parentId ? this.familiesRaw().find(f => f.id === parentId) : null;

      const data: FamilyCreateInput = {
        code:     this.form.value.code!.toUpperCase(),
        name:     this.form.value.name!,
        isActive: !!this.form.value.isActive,
        ...(parentId ? { parentId, parentCode: parent?.code ?? '' } : {}),
        ...(this.form.value.accountingCode ? { accountingCode: this.form.value.accountingCode } : {})
      };

      const id = this.editingId();
      if (id) {
        await this.svc.update(id, data);
        this.notifications.success('Familia actualizada');
      } else {
        await this.svc.create(data);
        this.notifications.success('Familia creada');
      }
      this.showModal.set(false);
    } catch (err: unknown) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(f: Family): Promise<void> {
    try {
      await this.svc.update(f.id, { isActive: !f.isActive });
      this.notifications.success('Estado actualizado');
    } catch {
      this.notifications.error('Error al actualizar estado');
    }
  }

  async delete(f: Family): Promise<void> {
    const hasChildren = this.familiesRaw().some(item => item.parentId === f.id);
    if (hasChildren) {
      this.notifications.warning('Primero elimina o reasigna las subfamilias');
      return;
    }
    const ok = await this.notifications.confirm({
      title: `¿Eliminar la familia "${f.name}"?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    try {
      await this.svc.delete(f.id);
      this.notifications.success('Familia eliminada');
    } catch {
      this.notifications.error('Error al eliminar');
    }
  }

  hasError(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && c?.touched);
  }

  trackById(_: number, item: Family): string { return item.id; }
}
