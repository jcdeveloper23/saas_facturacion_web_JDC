import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
  FormLabelDirective, FormControlDirective
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { PlatformDefaultsService } from '../../services/platform-defaults.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { PlatformConfig } from '../../models/platform-defaults.interface';

@Component({
  selector: 'app-platform-defaults',
  templateUrl: './platform-defaults.component.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    RouterLink,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    ButtonDirective, SpinnerComponent, RowComponent, ColComponent,
    FormLabelDirective, FormControlDirective, IconDirective
  ]
})
export class PlatformDefaultsComponent implements OnInit, OnDestroy {
  private svc = inject(PlatformDefaultsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private subs = new Subscription();

  loading = signal(true);
  saving = signal(false);
  seeding = signal(false);

  config = signal<PlatformConfig | null>(null);
  configForm = this.fb.group({
    country:         ['', Validators.required],
    defaultCurrency: ['', Validators.required],
    defaultVatRate:  [15, [Validators.required, Validators.min(0), Validators.max(100)]]
  });

  ngOnInit(): void {
    this.subs.add(this.svc.getConfig().subscribe({
      next: cfg => {
        this.config.set(cfg ?? null);
        if (cfg) this.configForm.patchValue(cfg);
        this.loading.set(false);
      },
      error: err => {
        console.error('[PlatformDefaults] getConfig error:', err);
        this.notifications.error('Error al cargar configuración: ' + (err?.message ?? err?.code ?? 'desconocido'));
        this.loading.set(false);
      }
    }));
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  async saveConfig(): Promise<void> {
    if (this.configForm.invalid) { this.configForm.markAllAsTouched(); return; }
    this.saving.set(true);
    try {
      const v = this.configForm.getRawValue();
      await this.svc.saveConfig({
        country: v.country!,
        defaultCurrency: v.defaultCurrency!,
        defaultVatRate: Number(v.defaultVatRate)
      });
      this.notifications.success('Configuración guardada');
    } catch (err) {
      console.error('Error al guardar config:', err);
      this.notifications.error('Error al guardar configuración');
    } finally {
      this.saving.set(false);
    }
  }

  async seedDefaults(): Promise<void> {
    const ok = await this.notifications.confirm({
      title: '¿Inicializar con los datos de fábrica?',
      text: 'Esto agregará los valores por defecto a cada sección vacía.',
      confirmText: 'Sí, inicializar',
      cancelText: 'Cancelar',
      icon: 'question'
    });
    if (!ok) return;
    this.seeding.set(true);
    try {
      await this.svc.seedDefaults();
      this.notifications.success('Datos de fábrica cargados correctamente');
    } catch (err) {
      console.error('Error al inicializar:', err);
      this.notifications.error('Error al inicializar datos de fábrica');
    } finally {
      this.seeding.set(false);
    }
  }

  hasError(f: string): boolean {
    const c = this.configForm.get(f); return !!(c?.invalid && c?.touched);
  }
}
