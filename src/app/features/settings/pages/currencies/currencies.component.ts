import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
  ModalTitleDirective, ButtonCloseDirective,
  FormLabelDirective, FormControlDirective, AlertComponent,
  CalloutComponent, InputGroupComponent, InputGroupTextDirective,
  FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../../../icons/icon-subset';
import { SettingsService } from '../../services/settings.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { Currency, CurrencyFormData } from '../../models/settings.interfaces';

@Component({
  selector: 'app-currencies',
  templateUrl: './currencies.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    CardComponent, CardBodyComponent, TableDirective, BadgeComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    ModalComponent, ModalHeaderComponent, ModalBodyComponent, ModalFooterComponent,
    ModalTitleDirective, ButtonCloseDirective,
    FormLabelDirective, FormControlDirective, AlertComponent, IconDirective,
    CalloutComponent, InputGroupComponent, InputGroupTextDirective,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
  ]
})
export class CurrenciesComponent implements OnInit {
  private svc = inject(SettingsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private iconSet = inject(IconSetService);

  currencies = signal<Currency[]>([]);
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
    code:     ['', [Validators.required, Validators.maxLength(10)]],
    name:     ['', Validators.required],
    symbol:   ['', Validators.required],
    isoCode:  ['', Validators.required],
    buyRate:  [1, [Validators.required, Validators.min(0)]],
    sellRate: [1, [Validators.required, Validators.min(0)]],
    isDefault: [false],
    isActive:  [true]
  });

  get filtered(): Currency[] {
    const q = this.searchTerm().toLowerCase();
    if (!q) return this.currencies();
    return this.currencies().filter(c =>
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.symbol.toLowerCase().includes(q)
    );
  }

  ngOnInit(): void {
    this.svc.getCurrencies().subscribe({
      next: (list: Currency[]) => { this.currencies.set(list); this.loading.set(false); },
      error: (err: any) => {
        console.error('Error al cargar divisas:', err);
        this.notifications.error('Error al cargar divisas');
        this.loading.set(false);
      }
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ buyRate: 1, sellRate: 1, isDefault: false });
    this.form.get('code')?.enable();
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(item: Currency): void {
    this.editingId.set(item.id);
    this.form.patchValue(item);
    this.form.get('code')?.disable();
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      const v = this.form.getRawValue();
      const data: CurrencyFormData = {
        code: v.code!,
        name: v.name!,
        symbol: v.symbol!,
        isoCode: v.isoCode!,
        buyRate: Number(v.buyRate),
        sellRate: Number(v.sellRate),
        isDefault: !!v.isDefault,
        isActive: !!v.isActive
      };
      const id = this.editingId();
      if (id) {
        await this.svc.updateCurrency(id, data);
        this.notifications.success('Divisa actualizada');
      } else {
        await this.svc.createCurrency(data);
        this.notifications.success('Divisa creada');
      }
      this.showModal.set(false);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(item: Currency): Promise<void> {
    if (item.isDefault) { this.notifications.warning('No se puede eliminar la divisa predeterminada'); return; }
    const ok = await this.notifications.confirm({
      title: `¿Eliminar la divisa "${item.name}" (${item.code})?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'warning',
      danger: true
    });
    if (!ok) return;
    try {
      await this.svc.deleteCurrency(item.id);
      this.notifications.success('Divisa eliminada');
    } catch {
      this.notifications.error('Error al eliminar');
    }
  }

  async toggleActive(item: Currency): Promise<void> {
    try {
      await this.svc.updateCurrency(item.id, { isActive: !item.isActive });
      this.notifications.success('Estado actualizado');
    } catch {
      this.notifications.error('Error al actualizar estado');
    }
  }

  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }

  trackById(_: number, item: Currency): string { return item.id; }
}
