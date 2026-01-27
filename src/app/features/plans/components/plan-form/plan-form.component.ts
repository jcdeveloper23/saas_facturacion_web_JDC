import { Component, Input, Output, EventEmitter, inject, signal, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  CardModule,
  GridModule,
  ButtonModule,
  FormModule,
  NavModule,
  TabsModule,
  BadgeModule,
  AlertModule,
  SpinnerModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { PlansService } from '../../../../core/services/plans.service';
import { Plan, PlanFeatures } from '../../../../core/interfaces';

@Component({
  selector: 'app-plan-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CardModule,
    GridModule,
    ButtonModule,
    FormModule,
    NavModule,
    TabsModule,
    BadgeModule,
    AlertModule,
    SpinnerModule,
    IconModule
  ],
  templateUrl: './plan-form.component.html',
  styleUrl: './plan-form.component.scss'
})
export class PlanFormComponent implements OnInit, OnChanges {
  @Input() plan: Plan | null = null;
  @Input() isEditMode = false;

  @Output() saved = new EventEmitter<Plan>();
  @Output() cancelled = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private plansService = inject(PlansService);

  form!: FormGroup;
  isLoading = signal(false);
  error = signal<string | null>(null);
  activeTab = signal('basic');

  currencies = [
    { value: 'USD', label: 'Dólar (USD)' },
    { value: 'EUR', label: 'Euro (EUR)' },
    { value: 'MXN', label: 'Peso Mexicano (MXN)' },
    { value: 'COP', label: 'Peso Colombiano (COP)' },
    { value: 'PEN', label: 'Sol Peruano (PEN)' },
    { value: 'CLP', label: 'Peso Chileno (CLP)' },
    { value: 'ARS', label: 'Peso Argentino (ARS)' },
    { value: 'BRL', label: 'Real Brasileño (BRL)' }
  ];

  featuresList = [
    { key: 'real_time_tracking', label: 'Rastreo en Tiempo Real', description: 'Seguimiento GPS en vivo' },
    { key: 'geofences', label: 'Geocercas', description: 'Zonas y alertas geográficas' },
    { key: 'alerts', label: 'Alertas', description: 'Notificaciones configurables' },
    { key: 'reports', label: 'Reportes', description: 'Informes y estadísticas' },
    { key: 'api_access', label: 'Acceso API', description: 'Integración programática' },
    { key: 'white_label', label: 'White Label', description: 'Marca personalizada' },
    { key: 'custom_integrations', label: 'Integraciones', description: 'Conectores personalizados' },
    { key: 'priority_support', label: 'Soporte Prioritario', description: 'Atención preferencial' },
    { key: 'dedicated_account_manager', label: 'Account Manager', description: 'Ejecutivo de cuenta dedicado' }
  ];

  ngOnInit(): void {
    this.initForm();
    this.resetComponent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['plan'] || changes['isEditMode']) {
      this.resetComponent();
    }
  }

  private resetComponent(): void {
    if (this.form) {
      if (this.plan) {
        this.patchForm();
      } else {
        const defaults = this.plansService.getDefaultLimits();
        const defaultFeatures = this.plansService.getDefaultFeatures();

        this.form.reset({
          code: '',
          name: '',
          description: '',
          price_monthly: 0,
          price_yearly: 0,
          currency: 'USD',
          ...defaults,
          trial_days: 14,
          is_public: true,
          is_popular: false,
          sort_order: 0,
          ...this.flattenFeatures(defaultFeatures)
        });
        this.form.markAsPristine();
        this.form.markAsUntouched();
      }
    }

    this.activeTab.set('basic');
    this.error.set(null);
    this.isLoading.set(false);
  }

  private initForm(): void {
    this.form = this.fb.group({
      // Basic Info
      code: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50), Validators.pattern(/^[a-z0-9_]+$/)]],
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      description: ['', [Validators.maxLength(500)]],

      // Pricing
      price_monthly: [0, [Validators.required, Validators.min(0)]],
      price_yearly: [0, [Validators.required, Validators.min(0)]],
      currency: ['USD', Validators.required],

      // Limits
      max_devices: [5, [Validators.required, Validators.min(1)]],
      max_users: [3, [Validators.required, Validators.min(1)]],
      max_geofences: [10, [Validators.required, Validators.min(1)]],
      max_routes: [50, [Validators.required, Validators.min(1)]],
      max_alerts: [100, [Validators.required, Validators.min(1)]],
      max_api_calls_per_month: [10000, [Validators.required, Validators.min(1000)]],
      max_storage_gb: [1, [Validators.required, Validators.min(0.1)]],
      data_retention_days: [30, [Validators.required, Validators.min(7)]],

      // Configuration
      trial_days: [14, [Validators.required, Validators.min(0)]],
      is_public: [true],
      is_popular: [false],
      sort_order: [0, [Validators.required, Validators.min(0)]],

      // Features (flattened)
      feature_real_time_tracking: [true],
      feature_geofences: [true],
      feature_alerts: [true],
      feature_reports: [true],
      feature_api_access: [false],
      feature_white_label: [false],
      feature_custom_integrations: [false],
      feature_priority_support: [false],
      feature_dedicated_account_manager: [false],
      feature_sla_guarantee: ['']
    });
  }

  private patchForm(): void {
    if (this.plan) {
      this.form.patchValue({
        code: this.plan.code,
        name: this.plan.name,
        description: this.plan.description,
        price_monthly: this.plan.price_monthly,
        price_yearly: this.plan.price_yearly,
        currency: this.plan.currency,
        max_devices: this.plan.max_devices,
        max_users: this.plan.max_users,
        max_geofences: this.plan.max_geofences,
        max_routes: this.plan.max_routes,
        max_alerts: this.plan.max_alerts,
        max_api_calls_per_month: this.plan.max_api_calls_per_month,
        max_storage_gb: this.plan.max_storage_gb,
        data_retention_days: this.plan.data_retention_days,
        trial_days: this.plan.trial_days,
        is_public: this.plan.is_public,
        is_popular: this.plan.is_popular,
        sort_order: this.plan.sort_order,
        ...this.flattenFeatures(this.plan.features)
      });

      // Disable code field in edit mode
      this.form.get('code')?.disable();
    }
  }

  private flattenFeatures(features: PlanFeatures | null | undefined): Record<string, boolean | string> {
    if (!features) return {};
    return {
      feature_real_time_tracking: features.real_time_tracking ?? true,
      feature_geofences: features.geofences ?? true,
      feature_alerts: features.alerts ?? true,
      feature_reports: features.reports ?? true,
      feature_api_access: features.api_access ?? false,
      feature_white_label: features.white_label ?? false,
      feature_custom_integrations: features.custom_integrations ?? false,
      feature_priority_support: features.priority_support ?? false,
      feature_dedicated_account_manager: features.dedicated_account_manager ?? false,
      feature_sla_guarantee: features.sla_guarantee ?? ''
    };
  }

  private collectFeatures(): PlanFeatures {
    const formValue = this.form.getRawValue();
    return {
      real_time_tracking: formValue.feature_real_time_tracking,
      geofences: formValue.feature_geofences,
      alerts: formValue.feature_alerts,
      reports: formValue.feature_reports,
      api_access: formValue.feature_api_access,
      white_label: formValue.feature_white_label,
      custom_integrations: formValue.feature_custom_integrations,
      priority_support: formValue.feature_priority_support,
      dedicated_account_manager: formValue.feature_dedicated_account_manager,
      sla_guarantee: formValue.feature_sla_guarantee || undefined
    };
  }

  setTab(tab: string): void {
    this.activeTab.set(tab);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Por favor complete todos los campos requeridos');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    const formValue = this.form.getRawValue();
    const planData: Partial<Plan> = {
      code: formValue.code,
      name: formValue.name,
      description: formValue.description || null,
      price_monthly: formValue.price_monthly,
      price_yearly: formValue.price_yearly,
      currency: formValue.currency,
      max_devices: formValue.max_devices,
      max_users: formValue.max_users,
      max_geofences: formValue.max_geofences,
      max_routes: formValue.max_routes,
      max_alerts: formValue.max_alerts,
      max_api_calls_per_month: formValue.max_api_calls_per_month,
      max_storage_gb: formValue.max_storage_gb,
      data_retention_days: formValue.data_retention_days,
      trial_days: formValue.trial_days,
      is_public: formValue.is_public,
      is_popular: formValue.is_popular,
      sort_order: formValue.sort_order,
      features: this.collectFeatures()
    };

    if (this.isEditMode && this.plan?.id) {
      // Don't send code on update
      delete planData.code;

      this.plansService.updatePlan(this.plan.id, planData).subscribe({
        next: (plan) => {
          this.isLoading.set(false);
          this.saved.emit(plan);
        },
        error: (err) => this.handleError(err)
      });
    } else {
      this.plansService.createPlan(planData).subscribe({
        next: (plan) => {
          this.isLoading.set(false);
          this.saved.emit(plan);
        },
        error: (err) => this.handleError(err)
      });
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return field ? field.invalid && field.touched : false;
  }

  getFieldError(fieldName: string): string {
    const control = this.form.get(fieldName);
    if (!control || !control.errors || !control.touched) return '';

    if (control.errors['required']) return 'Este campo es obligatorio';
    if (control.errors['minlength']) {
      return `Mínimo ${control.errors['minlength'].requiredLength} caracteres`;
    }
    if (control.errors['maxlength']) {
      return `Máximo ${control.errors['maxlength'].requiredLength} caracteres`;
    }
    if (control.errors['min']) {
      return `El valor mínimo es ${control.errors['min'].min}`;
    }
    if (control.errors['pattern']) {
      if (fieldName === 'code') {
        return 'Solo letras minúsculas, números y guiones bajos';
      }
      return 'Formato inválido';
    }

    return 'Campo inválido';
  }

  hasTabError(tab: string): boolean {
    const tabFields: Record<string, string[]> = {
      basic: ['code', 'name'],
      pricing: ['price_monthly', 'price_yearly', 'currency'],
      limits: ['max_devices', 'max_users', 'max_geofences', 'max_routes', 'max_alerts', 'max_api_calls_per_month', 'max_storage_gb', 'data_retention_days'],
      config: ['trial_days', 'sort_order']
    };

    const fields = tabFields[tab] || [];
    return fields.some(field => {
      const control = this.form.get(field);
      return control ? control.invalid && (control.touched || control.dirty) : false;
    });
  }

  private handleError(err: any): void {
    this.isLoading.set(false);
    console.error('Backend Error:', err);

    if (err.message?.includes('code') && err.message?.includes('unique')) {
      this.error.set('Ya existe un plan con ese código. Por favor use otro código único.');
    } else {
      this.error.set(err.message || 'Ocurrió un error al guardar el plan.');
    }
  }

  // Calculate yearly price suggestion (20% discount)
  suggestYearlyPrice(): void {
    const monthly = this.form.get('price_monthly')?.value || 0;
    const yearly = monthly * 12 * 0.8; // 20% discount
    this.form.patchValue({ price_yearly: Math.round(yearly * 100) / 100 });
  }
}
