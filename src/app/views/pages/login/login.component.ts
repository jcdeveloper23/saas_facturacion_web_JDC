import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
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
  TextColorDirective
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
    TextColorDirective
  ]
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  isLoading = signal(false);
  errorMessage = signal<string>('');

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
