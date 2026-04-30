import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  CardComponent, CardBodyComponent, CardHeaderComponent,
  RowComponent, ColComponent,
  FormLabelDirective, FormControlDirective, FormSelectDirective, FormCheckComponent,
  FormCheckInputDirective, FormCheckLabelDirective,
  InputGroupComponent, InputGroupTextDirective,
  ButtonDirective, SpinnerComponent, AlertComponent, BadgeComponent
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { SuperAdminService } from '../../services/super-admin.service';
import { Plan } from '../../models/plan.interface';
import { NotificationService } from '../../../../core/services/notification.service';
import { ecuadorRucValidator } from '../../../../shared/validators/ruc.validator';

/**
 * Convierte un Timestamp de Firestore a string 'YYYY-MM-DD' de forma segura.
 * Acepta tanto instancias reales de Timestamp (con .toDate()) como objetos
 * planos { seconds, nanoseconds } que llegan cuando el dato fue guardado
 * con serverTimestamp() o serializado sin hidratación completa.
 */
function toDateString(value: any): string {
  if (!value) return '';
  let date: Date;
  if (typeof value.toDate === 'function') {
    date = value.toDate();
  } else if (typeof value.seconds === 'number') {
    date = new Date(value.seconds * 1000);
  } else {
    return '';
  }
  if (isNaN(date.getTime())) return '';
  const y   = date.getFullYear();
  const m   = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parsea 'YYYY-MM-DD' como medianoche LOCAL (evita desfase UTC). */
function localDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-company-form',
  templateUrl: './company-form.component.html',
  styleUrl: './company-form.component.scss',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    CardComponent, CardBodyComponent, CardHeaderComponent,
    RowComponent, ColComponent,
    FormLabelDirective, FormControlDirective, FormSelectDirective,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective,
    InputGroupComponent, InputGroupTextDirective,
    ButtonDirective, SpinnerComponent, AlertComponent, BadgeComponent,
    IconDirective
  ]
})
export class CompanyFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private svc = inject(SuperAdminService);
  private notifications = inject(NotificationService);

  isEdit = signal(false);
  companyId = signal<string | null>(null);
  loading = signal(false);
  saving = signal(false);
  plans = signal<Plan[]>([]);
  errorMessage = signal('');
  showPassword = signal(false);
  selectedPlanPreview = signal<Plan | null>(null);

  form = this.fb.group({
    name:         ['', [Validators.required, Validators.minLength(3)]],
    tradeName:    [''],
    taxId:        ['', [Validators.required, ecuadorRucValidator()]],
    fiscalAddress:['', Validators.required],
    city:         ['', Validators.required],
    phone:        ['', [Validators.required, Validators.pattern(/^\d{7,15}$/)]],
    email:        ['', [Validators.required, Validators.email]],
    adminPassword:[''], // conditional requirements applied in ngOnInit
    planId:       ['', Validators.required],
    planName:     [''],
    status:       ['trial', Validators.required],
    subscriptionEnd: ['', Validators.required],
    sri: this.fb.group({
      environment:         ['testing', Validators.required],
      ruc:                 ['', [Validators.required, Validators.pattern(/^\d{13}$/)]],
      businessName:        ['', Validators.required],
      establishment:       ['001', [Validators.required, Validators.pattern(/^\d{3}$/)]],
      emissionPoint:       ['001', [Validators.required, Validators.pattern(/^\d{3}$/)]],
      contributorType:     ['juridica', Validators.required],
      accountingRequired:  [false]
    })
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!id);
    this.companyId.set(id);

    // Load plans for selector
    this.svc.getPlans().subscribe(plans => {
      const active = plans.filter(p => p.isActive);
      this.plans.set(active);
      // Pre-populate preview when editing — planId may already be patched
      const currentPlanId = this.form.get('planId')?.value;
      if (currentPlanId) {
        const plan = active.find(p => p.id === currentPlanId) ?? null;
        this.selectedPlanPreview.set(plan);
      }
    });

    if (!id) {
      // Require password when creating a new company
      this.form.get('adminPassword')?.setValidators([Validators.required, Validators.minLength(6)]);
      this.form.get('adminPassword')?.updateValueAndValidity();
    }

    if (id) {
      this.loading.set(true);
      this.svc.getCompany(id).subscribe({
        next: (company) => {
          if (company) {
            this.form.patchValue({
              ...company,
              subscriptionEnd: toDateString(company.subscriptionEnd),
              sri: company.sri
            } as any);
          }
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Error al cargar la empresa:', JSON.stringify(err, null, 2), err);
          this.notifications.error('No se pudo cargar la empresa');
          this.loading.set(false);
        }
      });
    }
  }

  onPlanChange(): void {
    const planId = this.form.get('planId')?.value;
    const plan = this.plans().find(p => p.id === planId) ?? null;
    if (plan) {
      this.form.get('planName')?.setValue(plan.name);
    }
    this.selectedPlanPreview.set(plan);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    try {
      const raw = this.form.getRawValue() as any;
      const id = this.companyId();

      if (id) {
        const { adminPassword, planId, planName, subscriptionEnd, subscriptionStart,
                planLimits, planFeatures, enabledPackages, enabledModules, ...generalFields } = raw;
        // 1. Plan + módulos + fechas (recalcula enabledModules desde el plan)
        await this.svc.assignPlanToCompany(id, planId, localDate(subscriptionEnd));
        // 2. Campos generales (nombre, RUC, SRI, status, etc.)
        await this.svc.updateCompany(id, generalFields);
        this.notifications.success('Empresa actualizada correctamente');
        this.router.navigate(['/super-admin/companies']);
      } else {
        await this.svc.createCompany(raw);
        this.notifications.success('Empresa creada. Se configuraron los datos por defecto.');
        this.router.navigate(['/super-admin/companies']);
      }
    } catch (err: unknown) {
      console.error('Error al guardar la empresa:', JSON.stringify(err, null, 2), err);
      const msg = err instanceof Error ? err.message : 'Error al guardar la empresa';
      this.errorMessage.set(msg);
    } finally {
      this.saving.set(false);
    }
  }

  hasError(path: string): boolean {
    const ctrl = this.form.get(path);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  getError(path: string): string {
    const ctrl = this.form.get(path);
    if (!ctrl?.errors) return '';
    if (ctrl.errors['required']) return 'Campo requerido';
    if (ctrl.errors['email']) return 'Email inválido';
    if (ctrl.errors['minlength']) return `Mínimo ${ctrl.errors['minlength'].requiredLength} caracteres`;
    if (ctrl.errors['pattern']) return 'Formato inválido';
    if (ctrl.errors['rucInvalid']) return ctrl.errors['rucInvalid'];
    return 'Campo inválido';
  }

  // ── Password Helpers ──────────────────────────────────────────

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  generateRandomPassword(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$*';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.form.patchValue({ adminPassword: pass });
    this.showPassword.set(true);
    this.form.get('adminPassword')?.markAsTouched();
  }

  copyPassword(): void {
    const pass = this.form.get('adminPassword')?.value;
    if (pass) {
      navigator.clipboard.writeText(pass);
      this.notifications.success('Contraseña copiada al portapapeles');
    } else {
      this.notifications.error('No hay contraseña para copiar');
    }
  }
}
