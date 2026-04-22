import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  CardModule,
  GridModule,
  ButtonModule,
  FormModule,
  BadgeModule,
  AlertModule,
  SpinnerModule
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    GridModule,
    ButtonModule,
    FormModule,
    BadgeModule,
    AlertModule,
    SpinnerModule,
    IconModule
  ],
  templateUrl: './profile.component.html'
})
export class ProfileComponent {
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private fb = inject(FormBuilder);

  currentUser = this.authService.user;
  loading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  passwordForm: FormGroup = this.fb.group({
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', Validators.required]
  });

  get roleLabel(): string {
    const labels: Record<string, string> = {
      super_admin: 'Super Administrador',
      admin: 'Administrador',
      seller: 'Vendedor',
      cashier: 'Cajero',
      read_only: 'Solo Lectura'
    };
    return labels[this.currentUser()?.role ?? ''] ?? this.currentUser()?.role ?? '';
  }

  get roleColor(): string {
    const colors: Record<string, string> = {
      super_admin: 'danger',
      admin: 'primary',
      seller: 'success',
      cashier: 'warning',
      read_only: 'secondary'
    };
    return colors[this.currentUser()?.role ?? ''] ?? 'secondary';
  }

  changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { newPassword, confirmPassword } = this.passwordForm.getRawValue();
    if (newPassword !== confirmPassword) {
      this.errorMessage.set('Las contraseñas no coinciden');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.resetPassword(this.currentUser()!.email)
      .then(() => {
        this.loading.set(false);
        this.successMessage.set('Se ha enviado un enlace de restablecimiento a tu correo');
        this.passwordForm.reset();
        this.notification.success('Correo de restablecimiento enviado');
      })
      .catch((err) => {
        this.loading.set(false);
        this.errorMessage.set(err.message || 'Error al enviar el correo');
        this.notification.error('Error al procesar la solicitud');
      });
  }

  isFieldInvalid(field: string): boolean {
    const control = this.passwordForm.get(field);
    return !!(control?.invalid && control.touched);
  }
}
