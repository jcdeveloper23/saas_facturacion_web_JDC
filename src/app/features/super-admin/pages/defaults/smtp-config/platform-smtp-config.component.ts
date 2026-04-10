import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CardModule, ButtonModule, SpinnerComponent,
  RowComponent, ColComponent,
  FormLabelDirective, FormControlDirective, FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective
} from '@coreui/angular';
import { IconDirective } from '@coreui/icons-angular';
import { PlatformDefaultsService } from '../../../services/platform-defaults.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { NotificationService } from '../../../../../core/services/notification.service';

@Component({
  selector: 'app-platform-smtp-config',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    CardModule, ButtonModule, SpinnerComponent,
    RowComponent, ColComponent,
    FormLabelDirective, FormControlDirective,
    FormCheckComponent, FormCheckInputDirective, FormCheckLabelDirective,
    IconDirective,
  ],
  template: `
<c-card>
  <c-card-header class="d-flex align-items-center justify-content-between py-2">
    <span class="fw-semibold">Configuración SMTP — Correo Saliente</span>
    <a routerLink="/super-admin/defaults" cButton color="secondary" variant="outline" size="sm">
      <svg cIcon name="cilArrowLeft" class="me-1"></svg> Volver
    </a>
  </c-card-header>
  <c-card-body>

    @if (loading()) {
      <div class="text-center py-4"><c-spinner color="primary" size="sm"></c-spinner></div>
    } @else {

      <p class="text-secondary mb-3" style="font-size:.85rem">
        Estas credenciales se usan para enviar emails de facturas, retenciones y notas de débito autorizadas por el SRI.
        Si <strong>isActive</strong> está desactivado, el sistema usará las variables de entorno
        <code>SMTP_HOST / SMTP_USER / SMTP_PASS</code> como respaldo.
      </p>

      <form [formGroup]="form" (ngSubmit)="save()">
        <c-row class="g-3">

          <!-- Activo -->
          <c-col [xs]="12">
            <c-form-check>
              <input cFormCheckInput type="checkbox" formControlName="isActive" id="smtpActive">
              <label cFormCheckLabel for="smtpActive">
                Usar esta configuración SMTP (activa)
              </label>
            </c-form-check>
          </c-col>

          <!-- Host -->
          <c-col [sm]="8">
            <label cLabel for="smtpHost">Servidor SMTP <span class="text-danger">*</span></label>
            <input cFormControl type="text" id="smtpHost" formControlName="host"
                   placeholder="smtp.gmail.com">
            @if (hasError('host')) {
              <div class="text-danger" style="font-size:.8rem">Requerido</div>
            }
          </c-col>

          <!-- Puerto -->
          <c-col [sm]="4">
            <label cLabel for="smtpPort">Puerto <span class="text-danger">*</span></label>
            <input cFormControl type="number" id="smtpPort" formControlName="port"
                   placeholder="587">
            @if (hasError('port')) {
              <div class="text-danger" style="font-size:.8rem">Requerido</div>
            }
          </c-col>

          <!-- Secure -->
          <c-col [xs]="12">
            <c-form-check>
              <input cFormCheckInput type="checkbox" formControlName="secure" id="smtpSecure">
              <label cFormCheckLabel for="smtpSecure">
                Conexión segura SSL (puerto 465). Desmarcado = STARTTLS (puerto 587)
              </label>
            </c-form-check>
          </c-col>

          <!-- Usuario -->
          <c-col [sm]="6">
            <label cLabel for="smtpUser">Usuario / Email <span class="text-danger">*</span></label>
            <input cFormControl type="email" id="smtpUser" formControlName="user"
                   placeholder="noreply@empresa.com" autocomplete="off">
            @if (hasError('user')) {
              <div class="text-danger" style="font-size:.8rem">Requerido</div>
            }
          </c-col>

          <!-- Contraseña -->
          <c-col [sm]="6">
            <label cLabel for="smtpPass">Contraseña / App Password <span class="text-danger">*</span></label>
            <input cFormControl [type]="showPass() ? 'text' : 'password'" id="smtpPass"
                   formControlName="pass" autocomplete="new-password"
                   placeholder="Dejar vacío para no cambiar">
            <div class="form-text">
              <button type="button" class="btn btn-link p-0 btn-sm" (click)="showPass.set(!showPass())">
                {{ showPass() ? 'Ocultar' : 'Mostrar' }}
              </button>
              &nbsp;·&nbsp;
              Para Gmail usa una <em>App Password</em>, no la contraseña de la cuenta.
            </div>
          </c-col>

          <!-- From -->
          <c-col [xs]="12">
            <label cLabel for="smtpFrom">Dirección "De" (remitente)</label>
            <input cFormControl type="text" id="smtpFrom" formControlName="from"
                   placeholder='Facturación Electrónica &lt;noreply@empresa.com&gt;'>
            <div class="form-text">Si está vacío se usa el campo Usuario.</div>
          </c-col>

          <!-- Botón guardar -->
          <c-col [xs]="12" class="mt-2">
            <button cButton color="primary" type="submit" [disabled]="saving() || form.invalid">
              @if (saving()) { <c-spinner size="sm" class="me-1"></c-spinner> }
              Guardar configuración SMTP
            </button>
            <button cButton color="secondary" variant="outline" type="button" class="ms-2"
                    [disabled]="saving()" (click)="testConnection()">
              Enviar correo de prueba
            </button>
          </c-col>

        </c-row>
      </form>

      @if (testResult()) {
        <div class="alert mt-3" [class]="testResult()!.ok ? 'alert-success' : 'alert-danger'">
          {{ testResult()!.message }}
        </div>
      }

    }
  </c-card-body>
</c-card>
  `,
})
export class PlatformSmtpConfigComponent implements OnInit, OnDestroy {
  private svc           = inject(PlatformDefaultsService);
  private auth          = inject(AuthService);
  private notifications = inject(NotificationService);
  private fb            = inject(FormBuilder);
  private subs          = new Subscription();

  loading    = signal(true);
  saving     = signal(false);
  showPass   = signal(false);
  testResult = signal<{ ok: boolean; message: string } | null>(null);

  form = this.fb.group({
    isActive: [true],
    host:     ['', Validators.required],
    port:     [587, [Validators.required, Validators.min(1), Validators.max(65535)]],
    secure:   [false],
    user:     ['', [Validators.required, Validators.email]],
    pass:     [''],
    from:     [''],
  });

  ngOnInit(): void {
    this.subs.add(this.svc.getSmtpConfig().subscribe({
      next: cfg => {
        if (cfg) {
          this.form.patchValue({ ...cfg, pass: '' }); // never show stored pass
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    }));
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  hasError(f: string): boolean {
    const c = this.form.get(f);
    return !!(c?.invalid && c?.touched);
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.testResult.set(null);
    try {
      const v = this.form.getRawValue();
      const uid = this.auth.user()?.uid ?? 'unknown';

      // Only update pass if the field has a value (don't overwrite with empty string)
      const payload: any = {
        isActive: v.isActive ?? true,
        host:     v.host!.trim(),
        port:     Number(v.port),
        secure:   v.secure ?? false,
        user:     v.user!.trim(),
        from:     v.from?.trim() ?? '',
      };
      if (v.pass?.trim()) payload.pass = v.pass.trim();

      await this.svc.saveSmtpConfig(payload, uid);
      this.notifications.success('Configuración SMTP guardada');
      this.form.get('pass')?.setValue('');
    } catch (err: any) {
      this.notifications.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      this.saving.set(false);
    }
  }

  async testConnection(): Promise<void> {
    this.testResult.set(null);
    this.notifications.info('Enviando correo de prueba...');
    // In a real implementation call a CF; for now show a message
    this.testResult.set({
      ok: false,
      message: 'La función de prueba estará disponible después del deploy de la CF "testSmtpConnection".',
    });
  }
}
