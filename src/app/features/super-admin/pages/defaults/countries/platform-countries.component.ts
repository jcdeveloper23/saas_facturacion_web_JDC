import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective, AlertComponent,
  FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../../../../icons/icon-subset';
import { PlatformDefaultsService } from '../../../services/platform-defaults.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { DefaultCountry } from '../../../models/platform-defaults.interface';

@Component({
  selector: 'app-platform-countries',
  templateUrl: './platform-countries.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, AlertComponent, IconDirective,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
  ]
})
export class PlatformCountriesComponent implements OnInit, OnDestroy {
  private svc = inject(PlatformDefaultsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private iconSet = inject(IconSetService);
  private subs = new Subscription();

  countries = signal<DefaultCountry[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');
  searchTerm = signal('');

  constructor() {
    this.iconSet.icons = { ...iconSubset };
  }

  form = this.fb.group({
    code2: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(3)]],
    code3: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
    name:  ['', Validators.required],
    isActive: [true]
  });

  get filtered(): DefaultCountry[] {
    const q = this.searchTerm().toLowerCase();
    if (!q) return this.countries();
    return this.countries().filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code2.toLowerCase().includes(q) ||
      c.code3.toLowerCase().includes(q)
    );
  }

  ngOnInit(): void {
    this.subs.add(this.svc.getCountries().subscribe({
      next: list => {
        this.countries.set([...list].sort((a, b) => a.name.localeCompare(b.name)));
        this.loading.set(false);
      },
      error: err => {
        console.error('Error al cargar países:', err);
        this.notifications.error('Error al cargar países');
        this.loading.set(false);
      }
    }));
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ isActive: true });
    this.form.get('code2')?.enable();
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(item: DefaultCountry): void {
    this.editingId.set(item.id);
    this.form.patchValue(item);
    this.form.get('code2')?.disable();
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
        code2: v.code2!.toUpperCase(),
        code3: v.code3!.toUpperCase(),
        name: v.name!,
        isActive: !!v.isActive
      };
      const id = this.editingId();
      if (id) {
        await this.svc.updateCountry(id, data);
        this.notifications.success('País actualizado');
      } else {
        await this.svc.addCountry(data);
        this.notifications.success('País agregado');
      }
      this.showModal.set(false);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(item: DefaultCountry): Promise<void> {
    const ok = await this.notifications.confirm({
      title: `¿Eliminar el país "${item.name}"?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    try {
      await this.svc.deleteCountry(item.id);
      this.notifications.success('País eliminado');
    } catch {
      this.notifications.error('Error al eliminar');
    }
  }

  async toggleActive(item: DefaultCountry): Promise<void> {
    try {
      await this.svc.updateCountry(item.id, { isActive: !item.isActive });
    } catch {
      this.notifications.error('Error al actualizar estado');
    }
  }

  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }

  trackById(_: number, item: DefaultCountry): string { return item.id; }
}
