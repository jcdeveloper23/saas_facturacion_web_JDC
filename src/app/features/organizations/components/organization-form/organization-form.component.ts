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
  SpinnerModule,
  TableModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';

import { OrganizationsService } from '../../../../core/services/organizations.service';
import { UsersService } from '../../../../core/services/users.service';
import { PlansService } from '../../../../core/services/plans.service';
import {
  Organization,
  OrganizationCreateInput,
  OrganizationUpdateInput,
  Plan,
  User
} from '../../../../core/interfaces';

@Component({
  selector: 'app-organization-form',
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
    IconModule,
    TableModule
  ],
  templateUrl: './organization-form.component.html',
  styleUrl: './organization-form.component.scss'
})
export class OrganizationFormComponent implements OnInit, OnChanges {
  @Input() organization: Organization | null = null;
  @Input() isEditMode = false;

  @Output() saved = new EventEmitter<Organization>();
  @Output() cancelled = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private organizationsService = inject(OrganizationsService);
  private usersService = inject(UsersService);
  private plansService = inject(PlansService);

  form!: FormGroup;
  isLoading = signal(false);
  error = signal<string | null>(null);
  activeTab = signal('basic');

  // Users management in Edit Mode
  usersList = signal<User[]>([]);
  isUsersLoading = signal(false);
  usersLoaded = signal(false);

  // Plans loaded from database
  plans = signal<Plan[]>([]);
  isPlansLoading = signal(false);

  timezones = [
    { value: 'America/Mexico_City', label: 'México (GMT-6)' },
    { value: 'America/Bogota', label: 'Colombia (GMT-5)' },
    { value: 'America/Lima', label: 'Perú (GMT-5)' },
    { value: 'America/Caracas', label: 'Venezuela (GMT-4)' },
    { value: 'America/Santiago', label: 'Chile (GMT-4)' },
    { value: 'America/Buenos_Aires', label: 'Argentina (GMT-3)' },
    { value: 'America/Sao_Paulo', label: 'Brasil (GMT-3)' },
    { value: 'Europe/Madrid', label: 'España (GMT+1)' },
    { value: 'UTC', label: 'UTC (GMT+0)' }
  ];

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

  languages = [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
    { value: 'pt', label: 'Português' }
  ];

  ngOnInit(): void {
    this.initForm();
    this.loadPlans();
    this.resetComponent();
  }

  private loadPlans(): void {
    this.isPlansLoading.set(true);
    this.plansService.getActivePlans().subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.isPlansLoading.set(false);

        // Set default plan if creating new org and no plan selected
        if (!this.isEditMode && plans.length > 0 && !this.form.get('plan')?.value) {
          const defaultPlan = plans.find(p => p.code === 'free') || plans[0];
          this.form.patchValue({ plan: defaultPlan.code });
          this.applyPlanLimits(defaultPlan);
        }
      },
      error: (err) => {
        console.error('Error loading plans:', err);
        this.isPlansLoading.set(false);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['organization'] || changes['isEditMode']) {
      this.resetComponent();
    }
  }

  private resetComponent(): void {
    // 1. Reset Form
    if (this.form) {
      if (this.organization) {
        this.patchForm();
      } else {
        this.form.reset({
          language: 'es',
          timezone: 'America/Mexico_City',
          currency_code: 'USD',
          plan: 'free',
          max_devices: 5,
          max_users: 3,
          max_api_calls_per_month: 10000,
          primary_color: '#321fdb',
          secondary_color: '#3399ff'
        });
        this.form.markAsPristine();
        this.form.markAsUntouched();
      }
    }

    // 2. Clear Users State
    this.usersList.set([]);
    this.usersLoaded.set(false);
    this.isUsersLoading.set(false);

    // 3. Reset UI State
    this.activeTab.set('basic');
    this.error.set(null);
    this.isLoading.set(false);
  }

  // Custom Validators
  private phoneValidator = Validators.pattern(/^[0-9+\-\s()]+$/);
  private urlValidator = Validators.pattern(/^https?:\/\/.+/);

  private initForm(): void {
    this.form = this.fb.group({
      // Basic Info
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(255)]],
      short_name: ['', [Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      phone: ['', [this.phoneValidator, Validators.minLength(7), Validators.maxLength(50)]],
      website: ['', [this.urlValidator, Validators.maxLength(255)]],
      tax_document: ['', [Validators.maxLength(50)]],

      // Location
      country: ['', [Validators.maxLength(100)]],
      province: ['', [Validators.maxLength(100)]],
      city_id: [null],
      address: [''],
      zip_code: ['', [Validators.maxLength(20)]],

      // Contact
      contact_name: ['', [Validators.maxLength(255)]],
      contact_email: ['', [Validators.email, Validators.maxLength(255)]],
      contact_phone: ['', [this.phoneValidator, Validators.maxLength(50)]],
      contact_position: ['', [Validators.maxLength(100)]],
      general_manager: ['', [Validators.maxLength(255)]],

      // Configuration
      language: ['es', Validators.required],
      timezone: ['America/Mexico_City', Validators.required],
      currency_code: ['USD', Validators.required],
      working_hours: ['', [Validators.maxLength(255)]],

      // Branding
      logo: ['', [this.urlValidator, Validators.maxLength(500)]],
      slogan: ['', [Validators.maxLength(500)]],
      primary_color: ['#321fdb'],
      secondary_color: ['#3399ff'],

      // Plan
      plan: ['free', Validators.required],
      max_devices: [5, [Validators.required, Validators.min(1)]],
      max_users: [3, [Validators.required, Validators.min(1)]],
      max_api_calls_per_month: [10000, [Validators.required, Validators.min(1000)]],

      // Billing
      billing_email: ['', [Validators.email, Validators.maxLength(255)]],
      invoice_footer: [''],

      // API
      webhook_url: ['', [this.urlValidator, Validators.maxLength(500)]],

    });
  }

  private patchForm(): void {
    if (this.organization) {
      this.form.patchValue({
        name: this.organization.name,
        short_name: this.organization.short_name,
        email: this.organization.email,
        phone: this.organization.phone,
        website: this.organization.website,
        tax_document: this.organization.tax_document,
        country: this.organization.country,
        province: this.organization.province,
        city_id: this.organization.city_id,
        address: this.organization.address,
        zip_code: this.organization.zip_code,
        contact_name: this.organization.contact_name,
        contact_email: this.organization.contact_email,
        contact_phone: this.organization.contact_phone,
        contact_position: this.organization.contact_position,
        general_manager: this.organization.general_manager,
        language: this.organization.language,
        timezone: this.organization.timezone,
        currency_code: this.organization.currency_code,
        working_hours: this.organization.working_hours,
        logo: this.organization.logo,
        slogan: this.organization.slogan,
        primary_color: this.organization.primary_color || '#321fdb',
        secondary_color: this.organization.secondary_color || '#3399ff',
        plan: this.organization.plan,
        max_devices: this.organization.max_devices,
        max_users: this.organization.max_users,
        max_api_calls_per_month: this.organization.max_api_calls_per_month,
        billing_email: this.organization.billing_email,
        invoice_footer: this.organization.invoice_footer,
        webhook_url: this.organization.webhook_url
      });
    }
  }

  onPlanChange(planCode: string): void {
    const selectedPlan = this.plans().find(p => p.code === planCode);
    if (selectedPlan) {
      this.applyPlanLimits(selectedPlan);
    }
  }

  private applyPlanLimits(plan: Plan): void {
    this.form.patchValue({
      max_devices: plan.max_devices,
      max_users: plan.max_users,
      max_api_calls_per_month: plan.max_api_calls_per_month
    });
  }

  getPlanDescription(plan: Plan): string {
    return `${plan.max_devices} dispositivos, ${plan.max_users} usuarios`;
  }

  setTab(tab: string): void {
    this.activeTab.set(tab);
  }

  loadUsers(): void {
    if (!this.organization?.id) return;
    this.isUsersLoading.set(true);
    this.usersService.getByOrganization(this.organization.id).subscribe({
      next: (users) => {
        this.usersList.set(users || []);
        this.isUsersLoading.set(false);
        this.usersLoaded.set(true);
      },
      error: () => this.isUsersLoading.set(false)
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();

      // Generate detailed error message grouped by tab
      const invalidFields = this.getInvalidFields();
      if (invalidFields.length > 0) {
        const errorsByTab = this.groupErrorsByTab(invalidFields);
        let errorMessage = `Se encontraron ${invalidFields.length} error(es) en el formulario:\n\n`;

        Object.keys(errorsByTab).forEach(tab => {
          const tabName = this.getTabName(tab);
          errorMessage += `📋 ${tabName}:\n`;
          errorsByTab[tab].forEach(f => {
            errorMessage += `   • ${f.label}: ${f.error}\n`;
          });
          errorMessage += '\n';
        });

        this.error.set(errorMessage.trim());
      } else {
        this.error.set('Por favor complete todos los campos requeridos');
      }

      // Scroll to first error
      setTimeout(() => {
        const firstInvalidControl = document.querySelector('.is-invalid, .ng-invalid');
        if (firstInvalidControl) {
          firstInvalidControl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    const formValue = this.form.value;

    if (this.isEditMode && this.organization?.id) {
      // UPDATE: Send all fields except admin fields
      const updateData: OrganizationUpdateInput = {
        // Basic Info
        name: formValue.name,
        short_name: formValue.short_name,
        email: formValue.email,
        phone: formValue.phone,
        website: formValue.website,
        tax_document: formValue.tax_document,

        // Location
        address: formValue.address,
        country: formValue.country,
        province: formValue.province,
        city_id: formValue.city_id,
        zip_code: formValue.zip_code,

        // Contact
        contact_name: formValue.contact_name,
        contact_email: formValue.contact_email,
        contact_phone: formValue.contact_phone,
        contact_position: formValue.contact_position,
        general_manager: formValue.general_manager,

        // Configuration
        language: formValue.language,
        timezone: formValue.timezone,
        currency_code: formValue.currency_code,
        working_hours: formValue.working_hours,

        // Branding
        logo: formValue.logo,
        slogan: formValue.slogan,
        primary_color: formValue.primary_color,
        secondary_color: formValue.secondary_color,

        // Plan
        max_devices: formValue.max_devices,
        max_users: formValue.max_users,
        max_api_calls_per_month: formValue.max_api_calls_per_month,

        // Billing
        billing_email: formValue.billing_email,
        invoice_footer: formValue.invoice_footer,

        // API
        webhook_url: formValue.webhook_url
      };

      this.organizationsService.updateOrganization(this.organization.id, this.sanitizeData<OrganizationUpdateInput>(updateData)).subscribe({
        next: (org) => {
          this.isLoading.set(false);
          this.saved.emit(org);
        },
        error: (err) => this.handleBackendError(err)
      });
    } else {
      // CREATE: Send ALL fields including admin
      const createData: OrganizationCreateInput = {
        // Basic Info
        name: formValue.name,
        short_name: formValue.short_name,
        email: formValue.email,
        phone: formValue.phone,
        website: formValue.website,
        tax_document: formValue.tax_document,

        // Location
        address: formValue.address,
        country: formValue.country,
        province: formValue.province,
        city_id: formValue.city_id,
        zip_code: formValue.zip_code,

        // Contact
        contact_name: formValue.contact_name,
        contact_email: formValue.contact_email,
        contact_phone: formValue.contact_phone,
        contact_position: formValue.contact_position,
        general_manager: formValue.general_manager,

        // Configuration
        language: formValue.language,
        timezone: formValue.timezone,
        currency_code: formValue.currency_code,
        working_hours: formValue.working_hours,

        // Branding
        logo: formValue.logo,
        slogan: formValue.slogan,
        primary_color: formValue.primary_color,
        secondary_color: formValue.secondary_color,

        // Plan
        plan: formValue.plan,
        max_devices: formValue.max_devices,
        max_users: formValue.max_users,
        max_api_calls_per_month: formValue.max_api_calls_per_month,

        // Billing
        billing_email: formValue.billing_email,
        invoice_footer: formValue.invoice_footer,

        // API
        webhook_url: formValue.webhook_url
      };

      this.organizationsService.createOrganization(this.sanitizeData<OrganizationCreateInput>(createData)).subscribe({
        next: (org) => {
          this.isLoading.set(false);
          this.saved.emit(org);
        },
        error: (err) => this.handleBackendError(err)
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
    if (control.errors['email']) return 'Ingrese un email válido';
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
      // Specific messages for pattern errors
      if (fieldName.includes('phone')) {
        return 'Solo números, espacios y símbolos (+, -, (), ) permitidos';
      }
      if (fieldName.includes('website') || fieldName.includes('logo') || fieldName.includes('webhook')) {
        return 'Debe ser una URL válida (http:// o https://)';
      }
      return 'Formato inválido';
    }

    return 'Campo inválido';
  }

  getInvalidFields(): { field: string; label: string; error: string }[] {
    const invalidFields: { field: string; label: string; error: string }[] = [];

    // Map of field names to human-readable labels
    const fieldLabels: Record<string, string> = {
      // Basic
      name: 'Nombre de la Organización',
      short_name: 'Nombre Corto',
      email: 'Email',
      phone: 'Teléfono',
      website: 'Sitio Web',
      tax_document: 'RIF/NIT/RFC',
      // Location
      country: 'País',
      province: 'Estado/Provincia',
      city_id: 'Ciudad',
      address: 'Dirección',
      zip_code: 'Código Postal',
      // Contact
      contact_name: 'Nombre del Contacto',
      contact_email: 'Email de Contacto',
      contact_phone: 'Teléfono de Contacto',
      contact_position: 'Cargo',
      general_manager: 'Gerente General',
      // Configuration
      language: 'Idioma',
      timezone: 'Zona Horaria',
      currency_code: 'Moneda',
      working_hours: 'Horario de Atención',
      // Branding
      logo: 'Logo',
      slogan: 'Slogan',
      primary_color: 'Color Primario',
      secondary_color: 'Color Secundario',
      // Plan
      plan: 'Plan',
      max_devices: 'Máx. Dispositivos',
      max_users: 'Máx. Usuarios',
      max_api_calls_per_month: 'Máx. Llamadas API/mes',
      // Billing
      billing_email: 'Email de Facturación',
      invoice_footer: 'Pie de Factura',
      // API
      webhook_url: 'URL de Webhook'
    };

    // Iterate through all form controls
    Object.keys(this.form.controls).forEach(fieldName => {
      const control = this.form.get(fieldName);
      if (control && control.invalid && control.touched) {
        const label = fieldLabels[fieldName] || fieldName;
        const error = this.getFieldError(fieldName);
        invalidFields.push({ field: fieldName, label, error });
      }
    });

    return invalidFields;
  }

  groupErrorsByTab(invalidFields: { field: string; label: string; error: string }[]): Record<string, { field: string; label: string; error: string }[]> {
    const tabFieldMap: Record<string, string[]> = {
      basic: ['name', 'short_name', 'email', 'phone', 'website', 'tax_document', 'country', 'province', 'city_id', 'address', 'zip_code'],
      contact: ['contact_name', 'contact_email', 'contact_phone', 'contact_position', 'general_manager', 'billing_email', 'invoice_footer'],
      config: ['language', 'timezone', 'currency_code', 'working_hours', 'logo', 'slogan', 'primary_color', 'secondary_color', 'webhook_url'],
      plan: ['plan', 'max_devices', 'max_users', 'max_api_calls_per_month']
    };

    const grouped: Record<string, { field: string; label: string; error: string }[]> = {};

    invalidFields.forEach(field => {
      let tabFound = false;
      for (const [tab, fields] of Object.entries(tabFieldMap)) {
        if (fields.includes(field.field)) {
          if (!grouped[tab]) {
            grouped[tab] = [];
          }
          grouped[tab].push(field);
          tabFound = true;
          break;
        }
      }
      if (!tabFound) {
        if (!grouped['other']) {
          grouped['other'] = [];
        }
        grouped['other'].push(field);
      }
    });

    return grouped;
  }

  getTabName(tab: string): string {
    const tabNames: Record<string, string> = {
      basic: 'Información Básica',
      contact: 'Contacto y Facturación',
      config: 'Configuración',
      plan: 'Plan y Límites',
      other: 'Otros'
    };
    return tabNames[tab] || tab;
  }

  hasTabError(tab: string): boolean {
    const tabFields: Record<string, string[]> = {
      basic: ['name', 'email'],
      config: ['language', 'timezone', 'currency_code'],
      plan: ['plan', 'max_devices', 'max_users', 'max_api_calls_per_month']
    };

    const fields = tabFields[tab] || [];
    return fields.some(field => {
      const control = this.form.get(field);
      return control ? control.invalid && (control.touched || control.dirty || this.form.touched) : false;
    });
  }

  private sanitizeData<T>(data: any): T {
    const sanitized = { ...data };
    Object.keys(sanitized).forEach(key => {
      // Convert blank strings to null to avoid backend validation errors (like contact_email)
      if (typeof sanitized[key] === 'string' && sanitized[key].trim() === '') {
        sanitized[key] = null;
      }
    });
    return sanitized as T;
  }

  private handleBackendError(err: any): void {
    this.isLoading.set(false);
    console.error('Backend Error:', err);

    if (err.errors && Array.isArray(err.errors)) {
      const messages = err.errors.map((e: any) => `• ${e.path}: ${e.message}`);
      this.error.set(`Error de validación del servidor:\n\n${messages.join('\n')}`);
    } else if (err.message && err.message.includes('Validation error')) {
      // Sometimes errors are in the message but not in the errors array
      this.error.set(`Error del servidor: ${err.message}`);
    } else {
      this.error.set(err.message || 'Ocurrió un error inesperado al procesar la solicitud.');
    }

    // Scroll up to see the error alert
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
