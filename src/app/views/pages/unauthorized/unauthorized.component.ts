import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule, GridModule, CardModule } from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-unauthorized',
  standalone: true,
  imports: [
    CommonModule,
    // RouterLink,
    ButtonModule,
    GridModule,
    CardModule,
    IconModule
  ],
  template: `
    <div class="min-vh-100 d-flex align-items-center justify-content-center bg-body-tertiary">
      <c-row class="justify-content-center">
        <c-col md="6">
          <c-card class="text-center p-5">
            <div class="clearfix">
              <div class="display-1 text-danger mb-4">
                <svg cIcon name="cil-lock-locked" size="4xl"></svg>
              </div>
              <h1 class="h4 mb-3">Acceso No Autorizado</h1>
              <p class="text-muted">
                No tienes los permisos necesarios para acceder a esta sección.
                Contacta al administrador si crees que esto es un error.
              </p>
              <div class="d-flex gap-2 justify-content-center mt-4">
                <button cButton color="primary" (click)="goBack()">
                  <svg cIcon name="cil-arrow-left" size="sm"></svg>
                  Volver
                </button>
                <button cButton color="danger" variant="outline" (click)="logout()">
                  <svg cIcon name="cil-account-logout" size="sm"></svg>
                  Cerrar Sesión
                </button>
              </div>
            </div>
          </c-card>
        </c-col>
      </c-row>
    </div>
  `
})
export class UnauthorizedComponent {
  private router = inject(Router);
  private authService = inject(AuthService);

  goBack(): void {
    window.history.back();
  }

  logout(): void {
    this.authService.logout();
  }
}
