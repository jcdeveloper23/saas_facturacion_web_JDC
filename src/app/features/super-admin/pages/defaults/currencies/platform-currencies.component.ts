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
import { DefaultCurrency } from '../../../models/platform-defaults.interface';

@Component({
  selector: 'app-platform-currencies',
  templateUrl: './platform-currencies.component.html',
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
export class PlatformCurrenciesComponent implements OnInit, OnDestroy {
  private svc = inject(PlatformDefaultsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private subs = new Subscription();

  currencies = signal<DefaultCurrency[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  errorMessage = signal('');
  searchTerm = signal('');

  form = this.fb.group({
    code:     ['', [Validators.required, Validators.maxLength(10)]],
    name:     ['', Validators.required],
    symbol:   ['', Validators.required],
    isoCode:  ['', Validators.required],
    buyRate:  [1, [Validators.required, Validators.min(0)]],
    sellRate: [1, [Validators.required, Validators.min(0)]],
    isActive: [true]
  });

  get filtered(): DefaultCurrency[] {
    const q = this.searchTerm().toLowerCase();
    if (!q) return this.currencies();
    return this.currencies().filter(c =>
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.symbol.toLowerCase().includes(q)
    );
  }

  ngOnInit(): void {
    this.subs.add(this.svc.getCurrencies().subscribe({
      next: list => { this.currencies.set(list); this.loading.set(false); },
      error: err => {
        console.error('Error al cargar divisas:', err);
        this.notifications.error('Error al cargar divisas');
        this.loading.set(false);
      }
    }));
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  openNew(): void {
    this.editingId.set(null);
    this.form.reset({ buyRate: 1, sellRate: 1, isActive: true });
    this.form.get('code')?.enable();
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  openEdit(item: DefaultCurrency): void {
    this.editingId.set(item.id);
    this.form.patchValue(item);
    this.form.get('code')?.disable(); // code is the doc ID, don't allow editing
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
        code: v.code!,
        name: v.name!,
        symbol: v.symbol!,
        isoCode: v.isoCode!,
        buyRate: Number(v.buyRate),
        sellRate: Number(v.sellRate),
        isActive: !!v.isActive
      };
      const id = this.editingId();
      if (id) {
        await this.svc.updateCurrency(id, data);
        this.notifications.success('Divisa actualizada');
      } else {
        await this.svc.addCurrency(data);
        this.notifications.success('Divisa agregada');
      }
      this.showModal.set(false);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async delete(item: DefaultCurrency): Promise<void> {
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

  async toggleActive(item: DefaultCurrency): Promise<void> {
    try {
      await this.svc.updateCurrency(item.id, { isActive: !item.isActive });
    } catch {
      this.notifications.error('Error al actualizar estado');
    }
  }

  hasError(f: string): boolean {
    const c = this.form.get(f); return !!(c?.invalid && c?.touched);
  }

  trackById(_: number, item: DefaultCurrency): string { return item.id; }
}
