import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule, GridModule } from '@coreui/angular';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [CommonModule, CardModule, GridModule],
  template: `
    <c-row>
      <c-col>
        <c-card>
          <c-card-header>
            <strong>Centro de Alertas</strong>
          </c-card-header>
          <c-card-body>
            <p>Módulo de alertas en desarrollo...</p>
          </c-card-body>
        </c-card>
      </c-col>
    </c-row>
  `
})
export class AlertsComponent {}
