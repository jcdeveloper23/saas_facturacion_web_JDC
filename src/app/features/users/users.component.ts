import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule, GridModule } from '@coreui/angular';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, CardModule, GridModule],
  template: `
    <c-row>
      <c-col>
        <c-card>
          <c-card-header>
            <strong>Gestión de Usuarios</strong>
          </c-card-header>
          <c-card-body>
            <p>Módulo de usuarios en desarrollo...</p>
          </c-card-body>
        </c-card>
      </c-col>
    </c-row>
  `
})
export class UsersComponent {}
