import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CardComponent, CardBodyComponent, TableDirective,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective, AlertComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SettingsService } from '../../services/settings.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Country, CountryFormData } from '../../models/settings.interfaces';

@Component({
  selector: 'app-countries',
  templateUrl: './countries.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, TableDirective,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, AlertComponent, IconDirective
  ]
})
export class CountriesComponent implements OnInit {
  private svc = inject(SettingsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);

  countries = signal<Country[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');
  searchTerm = signal('');

  form = this.fb.group({
    code2: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(3)]],
    code3: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
    name:  ['', Validators.required]
  });

  get filtered(): Country[] {
    const q = this.searchTerm().toLowerCase();
    if (!q) return this.countries();
    return this.countries().filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code2.toLowerCase().includes(q) ||
      c.code3.toLowerCase().includes(q)
    );
  }

  ngOnInit(): void {
    this.svc.getCountries().subscribe({
      next: (list: Country[]) => {
        this.countries.set([...list].sort((a, b) => a.name.localeCompare(b.name)));
        this.loading.set(false);
      },
      error: (err: any) => {
        console.error('Error al cargar países:', err);
        this.notifications.error('Error al cargar países');
        this.loading.set(false);
      }
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset();
    this.form.get('code2')?.enable();
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(item: Country): void {
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
      const data: CountryFormData = {
        code2: v.code2!.toUpperCase(),
        code3: v.code3!.toUpperCase(),
        name: v.name!
      };
      const id = this.editingId();
      if (id) {
        await this.svc.updateCountry(id, data);
        this.notifications.success('País actualizado');
      } else {
        await this.svc.createCountry(data);
        this.notifications.success('País creado');
      }
      this.showModal.set(false);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(item: Country): Promise<void> {
    if (!confirm(`¿Eliminar el país "${item.name}"?`)) return;
    try {
      await this.svc.deleteCountry(item.id);
      this.notifications.success('País eliminado');
    } catch {
      this.notifications.error('Error al eliminar');
    }
  }

  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }

  trackById(_: number, item: Country): string { return item.id; }
}
