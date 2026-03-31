import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { IconDirective } from '@coreui/icons-angular';
import {
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  CardGroupComponent,
  ColComponent,
  ContainerComponent,
  FormControlDirective,
  FormDirective,
  InputGroupComponent,
  InputGroupTextDirective,
  RowComponent,
  SpinnerComponent,
  TextColorDirective,
  ModalComponent,
  ModalHeaderComponent,
  ModalBodyComponent,
  ModalFooterComponent,
  ModalTitleDirective,
  ButtonCloseDirective,
  AlertComponent
} from '@coreui/angular';
import { AuthService } from '../../../core/services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ContainerComponent,
    RowComponent,
    ColComponent,
    CardGroupComponent,
    CardComponent,
    CardBodyComponent,
    FormDirective,
    InputGroupComponent,
    InputGroupTextDirective,
    IconDirective,
    FormControlDirective,
    ButtonDirective,
    SpinnerComponent,
    TextColorDirective,
    ModalComponent,
    ModalHeaderComponent,
    ModalBodyComponent,
    ModalFooterComponent,
    ModalTitleDirective,
    ButtonCloseDirective,
    AlertComponent
  ]
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly functions = inject(Functions);

  isLoading = signal(false);
  errorMessage = signal<string>('');

  // ── Setup First Admin (provisional) ──────────────────────────────────────
  showSetupModal = signal(false);
  isSettingUp = signal(false);
  setupError = signal('');
  setupSuccess = signal('');

  setupForm: FormGroup = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm:  ['', Validators.required]
  });

  openSetupModal(): void {
    this.setupForm.reset();
    this.setupError.set('');
    this.setupSuccess.set('');
    this.showSetupModal.set(true);
  }

  async createFirstAdmin(): Promise<void> {
    if (this.setupForm.invalid) { this.setupForm.markAllAsTouched(); return; }

    const { email, password, confirm } = this.setupForm.value;
    if (password !== confirm) {
      this.setupError.set('Las contraseñas no coinciden.');
      return;
    }

    this.isSettingUp.set(true);
    this.setupError.set('');
    this.setupSuccess.set('');

    try {
      const fn = httpsCallable<{ email: string; password: string }, { message: string }>(
        this.functions, 'setupFirstAdmin'
      );
      const result = await fn({ email, password });
      this.setupSuccess.set(result.data.message);
      // Auto-fill login form
      this.loginForm.patchValue({ username: email, password });
      setTimeout(() => this.showSetupModal.set(false), 2000);
    } catch (err: unknown) {
      const msg = (err as any)?.message ?? 'Error al crear el administrador.';
      this.setupError.set(msg);
    } finally {
      this.isSettingUp.set(false);
    }
  }

  loginForm: FormGroup = this.fb.group({
    username: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4)]]
  });

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { username, password } = this.loginForm.value;

    try {
      await this.authService.login(username, password);
      const returnUrl = this.route.snapshot.queryParams['returnUrl'] || this.authService.getDefaultRoute();
      this.router.navigateByUrl(returnUrl);
    } catch (err: unknown) {
      console.error('Login failed', err);
      let msg = 'Error al iniciar sesión. Verifique sus credenciales.';

      if (err instanceof Error) {
        const code = (err as { code?: string }).code;
        if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          msg = 'Credenciales incorrectas';
        } else if (err.message) {
          msg = err.message;
        }
      }

      this.errorMessage.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }
}
