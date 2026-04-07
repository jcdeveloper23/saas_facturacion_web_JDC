import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  RowComponent, ColComponent,
  FormLabelDirective, FormControlDirective, FormSelectDirective,
  InputGroupComponent, InputGroupTextDirective,
  ButtonDirective, SpinnerComponent, AlertComponent, CalloutComponent
} from '@coreui/angular';
import { IconDirective, IconSetService } from '@coreui/icons-angular';
import { iconSubset } from '../../../../icons/icon-subset';
import { SettingsService } from '../../services/settings.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ecuadorRucValidator } from '../../../../shared/validators/ruc.validator';

@Component({
  selector: 'app-company-settings',
  templateUrl: './company-settings.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    RowComponent, ColComponent,
    FormLabelDirective, FormControlDirective, FormSelectDirective,
    InputGroupComponent, InputGroupTextDirective,
    ButtonDirective, SpinnerComponent, AlertComponent, IconDirective,
    CalloutComponent
  ]
})
export class CompanySettingsComponent implements OnInit {
  private svc = inject(SettingsService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);
  private iconSet = inject(IconSetService);

  loading = signal(true);
  saving = signal(false);
  errorMessage = signal('');

  constructor() {
    this.iconSet.icons = { ...iconSubset };
  }

  form = this.fb.group({
    companyName:     ['', Validators.required],
    taxId:           ['', [Validators.required, ecuadorRucValidator()]],
    fiscalAddress:   ['', Validators.required],
    city:            ['', Validators.required],
    province:        [''],
    country:         ['Ecuador', Validators.required],
    phone:           ['', Validators.required],
    email:           ['', [Validators.required, Validators.email]],
    website:         [''],
    defaultCurrency: ['USD', Validators.required],
    vatRate:         [15, [Validators.required, Validators.min(0), Validators.max(100)]],
    fiscalYear:      [new Date().getFullYear(), Validators.required]
  });

  ngOnInit(): void {
    this.svc.getCompanySettings().subscribe({
      next: (settings) => {
        if (settings) {
          this.form.patchValue(settings as any);
        }
        this.loading.set(false);
      },
      error: () => {
        this.notifications.error('No se pudo cargar la configuración');
        this.loading.set(false);
      }
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.errorMessage.set('');
    try {
      await this.svc.saveCompanySettings(this.form.getRawValue() as any);
      this.notifications.success('Configuración guardada correctamente');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      this.errorMessage.set(msg);
    } finally {
      this.saving.set(false);
    }
  }

  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  getError(field: string): string {
    const ctrl = this.form.get(field);
    if (!ctrl?.errors) return '';
    if (ctrl.errors['required']) return 'Campo requerido';
    if (ctrl.errors['email']) return 'Email inválido';
    if (ctrl.errors['rucInvalid']) return ctrl.errors['rucInvalid'];
    if (ctrl.errors['min']) return `Valor mínimo: ${ctrl.errors['min'].min}`;
    if (ctrl.errors['max']) return `Valor máximo: ${ctrl.errors['max'].max}`;
    return 'Campo inválido';
  }
}
